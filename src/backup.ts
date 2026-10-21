/**
 * Резервная копия на Google Диск.
 *
 * Сайт собирает данные в виде готовых листов таблицы и отправляет их скрипту
 * Google Apps Script, который пользователь один раз разворачивает у себя на Диске.
 * Скрипт сам ничего не считает: он только записывает листы и копию данных.
 * Поэтому при изменении панели скрипт обновлять не нужно — меняется только этот файл.
 */
import { useEffect, useRef, useState } from 'react';
import { EQUIPMENT_KIND, ROLE_LABEL, SKILLS, SKILL_LEVELS } from './config';
import {
  attestStatus,
  attestSummary,
  buildReport,
  buildSignals,
  dialIssues,
  equipmentDue,
  fmt,
  fmtQty,
  fmtStock,
  itemAt,
  lastWeek,
  locName,
  overdueEquipmentCount,
  serviceScore,
  stability,
  stockOf,
  weekSummary,
} from './store';
import type { AppState } from './types';

export type Mark = '' | 'ok' | 'warn' | 'bad';
type Cell = string | number;

/** Один лист таблицы: шапка, строки и подсветка ячеек (та же форма, что у строк). */
export interface SheetData {
  name: string;
  header: string[];
  rows: Cell[][];
  marks?: Mark[][];
  /** Номера строк (от 0), которые выделить жирным, например заголовки блоков. */
  bold?: number[];
  /** Ширина столбцов в пикселях. */
  widths?: number[];
}

/* ---------- Сборка листов ---------- */

/** Текст, похожий на формулу, Таблица не должна выполнять. */
const safe = (v: Cell): Cell => (typeof v === 'string' && /^[=+@]/.test(v) ? `'${v}` : v);
const row = (...cells: Cell[]) => cells.map(safe);
/** Подсветка одной строки: явный тип, чтобы сборка не спорила о типах. */
const mk = (...xs: Mark[]): Mark[] => xs;
const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);

const ATTEST_LABEL = { none: 'не проходил', ok: 'действует', due: 'просрочена', failed: 'не пройдена' } as const;
const ATTEST_MARK: Record<keyof typeof ATTEST_LABEL, Mark> = { none: 'warn', ok: 'ok', due: 'bad', failed: 'bad' };
const DUE_LABEL = { none: 'ТО не отмечали', ok: 'в срок', soon: 'скоро', overdue: 'просрочено' } as const;
const DUE_MARK: Record<keyof typeof DUE_LABEL, Mark> = { none: 'warn', ok: 'ok', soon: 'warn', overdue: 'bad' };

export function buildSheets(state: AppState, now = new Date()): SheetData[] {
  const { settings } = state;
  const cur = settings.currency;
  const ln = (id: string) => locName(state, id);
  const sheets: SheetData[] = [];

  // Обзор: главные цифры и сигналы по всей сети
  {
    const st = stability(state, 'all', 30);
    const week = lastWeek(state);
    const ws = weekSummary(state, week ?? undefined, 'all');
    const att = attestSummary(state, 'all');
    const overdue = overdueEquipmentCount(state, 'all');
    const svc = serviceScore(state, 'all', 30);
    const rows: Cell[][] = [];
    const marks: Mark[][] = [];
    const bold: number[] = [];
    const add = (cells: Cell[], level: Mark = '') => {
      rows.push(row(...cells));
      marks.push(cells.map((_, i): Mark => (i === 1 ? level : '')));
    };
    add(['Сеть', settings.networkName, '']);
    add(['Выгружено', now.toLocaleString('ru-RU'), 'обновляется автоматически']);
    add(['Точек', state.locations.length, state.locations.map((l) => l.name).join(', ')]);
    add(['', '', '']);
    bold.push(rows.length);
    add(['Показатель', 'Значение', 'Норма или пояснение']);
    add(['Стабильность эспрессо, 30 дн.', st.pct === null ? '—' : `${st.pct}%`, `записей: ${st.total}`], st.pct === null ? '' : st.pct >= 80 ? 'ok' : st.pct >= 60 ? 'warn' : 'bad');
    add(['Себестоимость, последняя неделя', ws.count ? `${ws.cogs.toFixed(1)}%` : '—', `цель ${settings.cogsTargetPct}%${week ? `, неделя ${week}` : ''}`], ws.count ? (ws.cogs <= settings.cogsTargetPct ? 'ok' : 'bad') : '');
    add(['Выручка, последняя неделя', ws.count ? `${fmt(ws.revenue)} ${cur}` : '—', ws.count ? `чеков ${fmt(ws.checks)}, средний чек ${fmt(ws.avgCheck)} ${cur}` : '']);
    add(['Аттестации действуют', att.pct === null ? '—' : `${att.pct}%`, `всего ${att.total}, просрочено ${att.due}, не пройдено ${att.failed}`], att.pct === null ? '' : att.due + att.failed === 0 ? 'ok' : 'warn');
    add(['Оборудование с просроченным ТО', overdue, ''], overdue ? 'bad' : 'ok');
    add(['Средний балл обходов, 30 дн.', svc === null ? '—' : `${svc}%`, `минимум ${settings.visitMinScore}%`], svc === null ? '' : svc >= settings.visitMinScore ? 'ok' : 'warn');
    add(['', '', '']);
    bold.push(rows.length);
    add(['Что требует внимания', 'Подробности', '']);
    const signals = buildSignals(state, 'all');
    if (!signals.length) add(['Сигналов нет: всё в норме.', '', ''], 'ok');
    signals.forEach((s) => {
      rows.push(row(s.title, s.detail, ''));
      marks.push(mk(s.level, s.level, ''));
    });
    sheets.push({ name: 'Обзор', header: ['Chief Hub', '', ''], rows, marks, bold, widths: [300, 260, 360] });
  }

  // Качество: журнал настройки помола
  {
    const list = [...state.dialIns].sort(byDateDesc);
    sheets.push({
      name: 'Настройка помола',
      header: ['Дата', 'Точка', 'Доза, г', 'Выход, г', 'Время, с', 'Статус', 'Заметка'],
      rows: list.map((d) => {
        const is = dialIssues(d, settings.espresso);
        return row(d.date, ln(d.locationId), d.doseG, d.yieldG, d.timeS, is.length ? is.join(', ') : 'в норме', d.note);
      }),
      marks: list.map((d) => mk('', '', '', '', '', dialIssues(d, settings.espresso).length ? 'bad' : 'ok', '')),
      widths: [100, 140, 70, 70, 70, 220, 260],
    });
  }

  // Качество: оценки кофе под фильтр
  {
    const list = [...state.cuppings].sort(byDateDesc);
    sheets.push({
      name: 'Оценки фильтр',
      header: ['Дата', 'Точка', 'Кофе', 'Балл', 'Дескрипторы вкуса', 'Заметка'],
      rows: list.map((c) => row(c.date, ln(c.locationId), c.coffee, c.score, c.note, c.comment ?? '')),
      marks: list.map((c) => mk('', '', '', c.score >= 85 ? 'ok' : c.score >= 80 ? 'warn' : 'bad', '', '')),
      widths: [100, 140, 220, 70, 280, 280],
    });
  }

  // Качество: стандарты напитков (ТТК)
  sheets.push({
    name: 'ТТК',
    header: ['Напиток', 'Ингредиенты', 'Способ приготовления', 'Описание для гостя', 'Обновлено'],
    rows: state.recipes.map((r) =>
      row(r.name, r.ingredients.map((i) => `${i.name} — ${i.amount} ${i.unit}`.trim()).join('\n'), r.method, r.guestDescription, r.updated)
    ),
    widths: [180, 260, 360, 320, 100],
  });

  // Команда: должность, аттестация, навыки
  {
    const list = [...state.staff].sort((a, b) => ln(a.locationId).localeCompare(ln(b.locationId)) || a.name.localeCompare(b.name));
    sheets.push({
      name: 'Команда',
      header: ['Сотрудник', 'Точка', 'Должность', 'Аттестация', 'Последняя', 'Заметка', ...SKILLS.map((s) => s.title)],
      rows: list.map((p) => {
        const a = attestStatus(state, p.id);
        return row(p.name, ln(p.locationId), ROLE_LABEL[p.role], ATTEST_LABEL[a.state], a.last?.date ?? '—', a.last?.note || '—', ...SKILLS.map((s) => SKILL_LEVELS[p.skills[s.id] ?? 0]));
      }),
      marks: list.map((p) => mk('', '', '', ATTEST_MARK[attestStatus(state, p.id).state], '', '', ...SKILLS.map(() => '' as Mark))),
      widths: [180, 140, 130, 120, 100, 260],
    });
  }

  // Склад: сток по точкам (кг, л, шт), ниже минимального остатка подсвечено
  sheets.push({
    name: 'Остатки',
    header: ['Позиция', 'Категория', 'Ед. стока', 'Минимальный остаток', 'Где есть', ...state.locations.map((l) => l.name)],
    rows: state.inventory.map((it) =>
      row(
        it.name,
        it.category,
        fmtStock(it.unit, 0).split(' ')[1],
        fmtStock(it.unit, it.par).split(' ')[0],
        it.allLocations ? 'Все точки' : it.locationIds.map(ln).join(', '),
        ...state.locations.map((l) => (itemAt(it, l.id) ? fmtStock(it.unit, stockOf(state, it, l.id)).split(' ')[0] : '—'))
      )
    ),
    marks: state.inventory.map((it) => mk('', '', '', '', '', ...state.locations.map((l) => (!itemAt(it, l.id) ? '' : stockOf(state, it, l.id) < it.par ? 'bad' : 'ok') as Mark))),
    widths: [200, 140, 80, 120, 160],
  });

  sheets.push({
    name: 'Приходы',
    header: ['Дата', 'Точка', 'Позиция', 'Количество'],
    rows: [...state.receipts].sort(byDateDesc).map((x) => {
      const it = state.inventory.find((i) => i.id === x.itemId);
      return row(x.date, ln(x.locationId), it?.name ?? '—', it ? fmtStock(it.unit, x.qty) : x.qty);
    }),
    widths: [100, 140, 200, 100],
  });

  sheets.push({
    name: 'Списания',
    header: ['Дата', 'Точка', 'Позиция', 'Количество', 'Причина'],
    rows: [...state.writeOffs].sort(byDateDesc).map((w) => {
      const it = state.inventory.find((x) => x.id === w.itemId);
      return row(w.date, ln(w.locationId), it?.name ?? '—', it ? fmtQty(it.unit, w.qty) : w.qty, w.reason);
    }),
    widths: [100, 140, 200, 100, 200],
  });

  sheets.push({
    name: 'Расход за день',
    header: ['Дата', 'Точка', 'Позиция', 'Продано, шт'],
    rows: [...state.daySales].sort(byDateDesc).flatMap((d) =>
      d.lines.map((l) => row(d.date, ln(d.locationId), state.recipes.find((r) => r.id === l.recipeId)?.name ?? '—', l.count))
    ),
    widths: [100, 140, 220, 100],
  });

  // Показатели по неделям
  {
    const list = [...state.metrics].sort((a, b) => b.week.localeCompare(a.week) || ln(a.locationId).localeCompare(ln(b.locationId)));
    sheets.push({
      name: 'Показатели',
      header: ['Неделя', 'Точка', `Выручка, ${cur}`, 'Чеки', `Средний чек, ${cur}`, 'Себестоимость, %'],
      rows: list.map((m) => row(m.week, ln(m.locationId), m.revenue, m.checks, m.checks ? Math.round(m.revenue / m.checks) : 0, m.cogsPct)),
      marks: list.map((m) => mk('', '', '', '', '', m.cogsPct > settings.cogsTargetPct ? 'bad' : 'ok')),
      widths: [100, 140, 120, 80, 130, 130],
    });
  }

  // Оборудование и ремонт
  {
    const list = [...state.equipment].sort((a, b) => ln(a.locationId).localeCompare(ln(b.locationId)));
    sheets.push({
      name: 'Оборудование',
      header: ['Точка', 'Оборудование', 'Тип', 'Интервал ТО, дн.', 'Последнее ТО', 'Следующее ТО', 'Статус'],
      rows: list.map((e) => {
        const due = equipmentDue(e);
        return row(ln(e.locationId), e.name, EQUIPMENT_KIND[e.kind], e.intervalDays, e.lastServiceDate ?? '—', due.next ?? '—', DUE_LABEL[due.state]);
      }),
      marks: list.map((e) => mk('', '', '', '', '', '', DUE_MARK[equipmentDue(e).state])),
      widths: [140, 200, 120, 120, 110, 110, 130],
    });
  }

  {
    const list = [...state.repairs].sort(byDateDesc);
    sheets.push({
      name: 'Ремонт',
      header: ['Дата', 'Точка', 'Оборудование', 'Описание', 'Статус'],
      rows: list.map((r) => row(r.date, ln(r.locationId), state.equipment.find((e) => e.id === r.equipmentId)?.name ?? 'другое', r.text, r.done ? 'выполнено' : 'открыта')),
      marks: list.map((r) => mk('', '', '', '', r.done ? 'ok' : 'warn')),
      widths: [100, 140, 180, 320, 110],
    });
  }

  // Обходы, тайный гость и жалобы
  {
    const list = [...state.visits].sort(byDateDesc);
    sheets.push({
      name: 'Обходы',
      header: ['Дата', 'Точка', 'Тип', 'Балл, %', 'Заметка'],
      rows: list.map((v) => row(v.date, ln(v.locationId), v.kind === 'round' ? 'обход' : 'тайный гость', v.score, v.note)),
      marks: list.map((v) => mk('', '', '', v.score >= settings.visitMinScore ? 'ok' : v.score >= settings.visitMinScore - 10 ? 'warn' : 'bad', '')),
      widths: [100, 140, 120, 80, 360],
    });
  }

  {
    const list = [...state.complaints].sort(byDateDesc);
    sheets.push({
      name: 'Жалобы',
      header: ['Дата', 'Точка', 'Текст', 'Статус'],
      rows: list.map((c) => row(c.date, ln(c.locationId), c.text, c.resolved ? 'решена' : 'открыта')),
      marks: list.map((c) => mk('', '', '', c.resolved ? 'ok' : 'warn')),
      widths: [100, 140, 400, 100],
    });
  }

  // Недельный отчёт текстом, как в разделе «Отчёт»
  {
    const rep = buildReport(state, 'all');
    const rows: Cell[][] = [];
    const bold: number[] = [];
    rep.sections.forEach((s) => {
      bold.push(rows.length);
      rows.push(row(s.title));
      s.lines.forEach((l) => rows.push(row(l)));
      rows.push(['']);
    });
    if (state.reportNote.trim()) {
      bold.push(rows.length);
      rows.push(row('Комментарий шефа'));
      rows.push(row(state.reportNote.trim()));
    }
    sheets.push({ name: 'Отчёт недели', header: [rep.heading], rows, bold, widths: [720] });
  }

  return sheets;
}

/* ---------- Настройки копии (хранятся отдельно от данных панели) ---------- */

const CFG_KEY = 'chief-hub-backup';
const EVENT = 'chief-hub-backup';

export interface BackupConfig {
  url: string;
  auto: boolean;
  lastOk: string | null; // ISO-время последней удачной копии
  lastError: string | null;
  sheetUrl: string | null;
  folderUrl: string | null;
}

const defaultCfg: BackupConfig = { url: '', auto: true, lastOk: null, lastError: null, sheetUrl: null, folderUrl: null };

export function loadBackupConfig(): BackupConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? { ...defaultCfg, ...JSON.parse(raw) } : { ...defaultCfg };
  } catch {
    return { ...defaultCfg };
  }
}

export function saveBackupConfig(patch: Partial<BackupConfig>): BackupConfig {
  const next = { ...loadBackupConfig(), ...patch };
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно */
  }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

/** Состояние настроек копии, которое обновляется при каждом сохранении. */
export function useBackupConfig(): BackupConfig {
  const [cfg, setCfg] = useState(loadBackupConfig);
  useEffect(() => {
    const on = () => setCfg(loadBackupConfig());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return cfg;
}

export const isScriptUrl = (u: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u.trim());

/* ---------- Отправка ---------- */

let inFlight = false;

/** Отправляет копию на Диск. Возвращает true при успехе. */
export async function pushBackup(state: AppState): Promise<boolean> {
  const cfg = loadBackupConfig();
  if (!isScriptUrl(cfg.url) || inFlight) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    saveBackupConfig({ lastError: 'Нет интернета, копия отправится позже.' });
    return false;
  }
  inFlight = true;
  const body = JSON.stringify({ app: 'chief-hub', sentAt: new Date().toISOString(), sheets: buildSheets(state), state });
  try {
    // Обычный текстовый запрос: браузер не делает предварительной проверки, Google отвечает с разрешением CORS.
    const res = await fetch(cfg.url.trim(), { method: 'POST', body, redirect: 'follow' });
    const data = (await res.json()) as { ok: boolean; error?: string; sheetUrl?: string; folderUrl?: string };
    if (!data.ok) throw new Error(data.error || 'скрипт вернул ошибку');
    saveBackupConfig({ lastOk: new Date().toISOString(), lastError: null, sheetUrl: data.sheetUrl ?? cfg.sheetUrl, folderUrl: data.folderUrl ?? cfg.folderUrl });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveBackupConfig({ lastError: `Не получилось сохранить: ${msg}. Проверьте адрес скрипта и доступ «Все».` });
    return false;
  } finally {
    inFlight = false;
  }
}

/** Автосохранение: через минуту после последнего изменения и при открытии, если копии не было больше 6 часов. */
export function useAutoBackup(state: AppState) {
  const cfg = useBackupConfig();
  const latest = useRef(state);
  latest.current = state;
  const first = useRef(true);

  useEffect(() => {
    if (!cfg.auto || !isScriptUrl(cfg.url)) return;
    const stale = !cfg.lastOk || Date.now() - new Date(cfg.lastOk).getTime() > 6 * 3600_000;
    const delay = first.current ? (stale ? 5_000 : -1) : 60_000;
    first.current = false;
    if (delay < 0) return;
    const t = window.setTimeout(() => void pushBackup(latest.current), delay);
    return () => window.clearTimeout(t);
    // Запускаем по изменению данных; cfg.lastOk в зависимостях не нужен, иначе копия отправлялась бы по кругу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cfg.auto, cfg.url]);

  // Если пока не было сети, отправить, как только она появится
  useEffect(() => {
    if (!cfg.auto || !isScriptUrl(cfg.url)) return;
    const on = () => void pushBackup(latest.current);
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [cfg.auto, cfg.url]);
}

/* ---------- Код скрипта для Google Диска ---------- */

export const APPS_SCRIPT = `/**
 * Chief Hub — приёмник резервных копий на Google Диске.
 * Вставьте этот код целиком, сохраните и разверните как веб-приложение
 * (Выполнять от имени: я, Доступ: все). Адрес веб-приложения вставьте в настройки Chief Hub.
 * Скрипт создаёт папку «Chief Hub», таблицу с листами и копии данных по дням.
 */
const FOLDER_NAME = 'Chief Hub';
const SHEET_NAME = 'Chief Hub — данные';
const DAILY_FOLDER = 'Копии по дням';
const KEEP_COPIES = 30;
const COLORS = { ok: '#e6f4ea', warn: '#fef7e0', bad: '#fce8e6' };

function doGet() {
  return out_({ ok: true, app: 'chief-hub-backup' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.app !== 'chief-hub' || !p.state) throw new Error('это не данные Chief Hub');
    const folder = folder_(DriveApp, FOLDER_NAME);
    const ss = spreadsheet_(folder);
    writeSheets_(ss, p.sheets || []);
    saveJson_(folder, p.state);
    return out_({ ok: true, sheetUrl: ss.getUrl(), folderUrl: folder.getUrl() });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function spreadsheet_(folder) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return SpreadsheetApp.openById(id);
    } catch (e) {}
  }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function writeSheets_(ss, sheets) {
  const keep = {};
  sheets.forEach(function (s, i) {
    const sh = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
    keep[s.name] = true;
    sh.clear();
    const width = Math.max(s.header.length, 1);
    const fit = function (r) {
      const a = (r || []).slice(0, width);
      while (a.length < width) a.push('');
      return a;
    };
    sh.getRange(1, 1, 1, width).setValues([fit(s.header)])
      .setFontWeight('bold').setBackground('#4a3426').setFontColor('#ffffff').setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    const rows = (s.rows || []).map(fit);
    if (rows.length) {
      const range = sh.getRange(2, 1, rows.length, width);
      range.setValues(rows).setVerticalAlignment('top').setWrap(true);
      if (s.marks) {
        range.setBackgrounds(rows.map(function (r, ri) {
          return r.map(function (_, ci) {
            const m = (s.marks[ri] || [])[ci];
            return (m && COLORS[m]) || '#ffffff';
          });
        }));
      }
      (s.bold || []).forEach(function (ri) {
        if (ri < rows.length) sh.getRange(ri + 2, 1, 1, width).setFontWeight('bold');
      });
    }
    (s.widths || []).forEach(function (w, ci) {
      if (w && ci < width) sh.setColumnWidth(ci + 1, w);
    });
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
  ss.getSheets().forEach(function (sh) {
    if (!keep[sh.getName()] && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  ss.setActiveSheet(ss.getSheets()[0]);
}

function saveJson_(folder, state) {
  const json = JSON.stringify(state, null, 2);
  upsert_(folder, 'chief-hub-backup.json', json);
  const daily = folder_(folder, DAILY_FOLDER);
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  upsert_(daily, 'chief-hub-' + day + '.json', json);
  const files = [];
  const it = daily.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
  files.slice(KEEP_COPIES).forEach(function (f) { f.setTrashed(true); });
}

function upsert_(folder, name, text) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, 'application/json');
}
`;
