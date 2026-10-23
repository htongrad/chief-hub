/**
 * Календарь: связь с Google Календарём и производственный календарь РФ.
 *
 * Панель главная. Задачи живут в ней, а календарь «Chief Hub» в Google — зеркало для уведомлений на телефоне.
 * Сайт сам в Google не заходит: всё идёт через тот же скрипт Google Apps Script, что и резервная копия
 * (его код — в calendarScript.ts). Скрипт создаёт календарь, сверяет события с задачами и отдаёт панели,
 * что изменилось в календаре. Задача, добавленная в календарь с телефона, появляется в панели, и наоборот.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isScriptUrl, loadBackupConfig, saveBackupConfig, useBackupConfig } from './backup';
import { addDays, taskDirty, taskSig, todayISO, uid } from './store';
import type { AppState, Task } from './types';

/** Окно, внутри которого скрипт сверяет события: 90 дней назад и 400 вперёд. Что вне окна, не сверяется, пока задачу не изменят. */
export const SYNC_BACK_DAYS = 90;
export const SYNC_AHEAD_DAYS = 400;

interface Wire {
  id: string;
  calId?: string;
  base?: string;
  dirty: boolean;
  title: string;
  date: string;
  time: string;
  endTime: string;
  note: string;
  done: boolean;
  deleted: boolean;
}

interface Fields {
  title: string;
  date: string;
  time: string;
  endTime: string;
  note: string;
  done: boolean;
}

export interface SyncResponse {
  ok: boolean;
  error?: string;
  skipped?: number;
  synced?: { id: string; calId: string; base: string }[];
  changed?: (Fields & { id: string; calId: string; base: string })[];
  removed?: string[];
  purged?: string[];
  created?: (Fields & { calId: string; base: string })[];
}

const toWire = (t: Task): Wire => ({
  id: t.id,
  calId: t.calId,
  base: t.base,
  dirty: taskDirty(t),
  title: t.title,
  date: t.date,
  time: t.time ?? '',
  endTime: t.endTime ?? '',
  note: t.note ?? '',
  done: t.done,
  deleted: !!t.deleted,
});

/**
 * Применяет ответ скрипта к задачам. sent — «отпечатки» задач на момент отправки:
 * если задачу успели изменить, пока шёл запрос, ответ к ней не применяется, её сверит следующая синхронизация.
 */
export function applySync(state: AppState, res: SyncResponse, sent: Map<string, string>): AppState {
  const unchanged = (t: Task) => sent.get(t.id) === taskSig(t);
  const synced = new Map((res.synced ?? []).map((x) => [x.id, x]));
  const changed = new Map((res.changed ?? []).map((x) => [x.id, x]));
  const removed = new Set(res.removed ?? []);
  const purged = new Set(res.purged ?? []);
  const haveCal = new Set(state.tasks.map((t) => t.calId).filter(Boolean));

  const tasks = state.tasks.flatMap<Task>((t) => {
    if (t.deleted && (!t.calId || purged.has(t.id))) return []; // удалена и в календаре тоже
    if (removed.has(t.id) && unchanged(t)) return []; // событие удалили в календаре
    const ch = changed.get(t.id);
    if (ch && unchanged(t)) {
      const next: Task = {
        ...t,
        title: ch.title,
        date: ch.date,
        time: ch.time || undefined,
        endTime: ch.endTime || undefined,
        note: ch.note || undefined,
        done: ch.done,
        doneAt: ch.done ? t.doneAt ?? todayISO() : undefined,
        calId: ch.calId,
        base: ch.base,
      };
      return [{ ...next, synced: taskSig(next) }];
    }
    const s = synced.get(t.id);
    if (s) {
      const next: Task = { ...t, calId: s.calId, base: s.base };
      return [unchanged(t) ? { ...next, synced: taskSig(next) } : next];
    }
    return [t];
  });

  (res.created ?? []).forEach((c) => {
    if (haveCal.has(c.calId)) return;
    haveCal.add(c.calId);
    const t: Task = {
      id: uid(),
      title: c.title,
      date: c.date,
      time: c.time || undefined,
      endTime: c.endTime || undefined,
      note: c.note || undefined,
      done: c.done,
      doneAt: c.done ? todayISO() : undefined,
      calId: c.calId,
      base: c.base,
    };
    tasks.push({ ...t, synced: taskSig(t) });
  });

  return { ...state, tasks };
}

/** Понятное сообщение вместо технической ошибки. */
function friendly(msg: string): string {
  if (/не данные Chief Hub/i.test(msg)) return 'Скрипт на Диске старый и не знает про календарь. Обновите его: Настройки → Резервная копия → «Скопировать код».';
  if (/разрешени|permission|authori[sz]|авториз|Unexpected token|JSON/i.test(msg)) return 'Скрипт не ответил как надо. Проверьте, что вы разрешили ему доступ к Календарю (функция authorize) и выпустили новую версию.';
  return `Не получилось синхронизировать: ${msg}`;
}

let busy = false;
let again = false;

type Update = (fn: (s: AppState) => AppState) => void;

/** Один круг синхронизации. Возвращает true, если скрипт ответил без ошибки. */
export async function syncCalendar(getState: () => AppState, update: Update): Promise<boolean> {
  const cfg = loadBackupConfig();
  if (!cfg.calendar || !isScriptUrl(cfg.url)) return false;
  if (busy) {
    again = true;
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    saveBackupConfig({ calError: 'Нет интернета, задачи синхронизируются позже.' });
    return false;
  }
  busy = true;
  let ok = false;
  try {
    const state = getState();
    const today = todayISO();
    const from = addDays(today, -SYNC_BACK_DAYS);
    const to = addDays(today, SYNC_AHEAD_DAYS);
    const send = state.tasks.filter((t) => !(t.deleted && !t.calId) && ((t.date >= from && t.date <= to) || t.deleted || taskDirty(t)));
    const sent = new Map(send.map((t) => [t.id, taskSig(t)]));
    const body = JSON.stringify({
      app: 'chief-hub',
      action: 'calendar',
      from,
      to,
      known: state.tasks.map((t) => t.calId).filter(Boolean),
      tasks: send.map(toWire),
    });
    const res = await fetch(cfg.url.trim(), { method: 'POST', body, redirect: 'follow' });
    const data = (await res.json()) as SyncResponse;
    if (!data.ok) throw new Error(data.error || 'скрипт вернул ошибку');
    update((s) => applySync(s, data, sent));
    saveBackupConfig({ calOk: new Date().toISOString(), calError: null, calSkipped: data.skipped ?? 0 });
    ok = true;
  } catch (e) {
    saveBackupConfig({ calError: friendly(e instanceof Error ? e.message : String(e)) });
  } finally {
    busy = false;
    if (again) {
      again = false;
      void syncCalendar(getState, update);
    }
  }
  return ok;
}

/** Фоновая синхронизация: при открытии, через несколько секунд после изменения задач, при возвращении в приложение и раз в 5 минут. */
export function useCalendarSync(state: AppState, update: Update) {
  const cfg = useBackupConfig();
  const enabled = cfg.calendar && isScriptUrl(cfg.url);
  const latest = useRef(state);
  latest.current = state;
  const lastRun = useRef(0);
  const run = useCallback(() => {
    lastRun.current = Date.now();
    return syncCalendar(() => latest.current, update);
  }, [update]);

  // Что ждёт отправки: по этому ключу таймер сбрасывается, пока задачи правят
  const pending = state.tasks.filter((t) => t.deleted || taskDirty(t)).map((t) => `${t.id}:${taskSig(t)}`).join('|');

  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => void run(), 3_000);
    return () => window.clearTimeout(t);
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || !pending) return;
    const t = window.setTimeout(() => void run(), 5_000);
    return () => window.clearTimeout(t);
  }, [enabled, pending, run]);

  useEffect(() => {
    if (!enabled) return;
    const on = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 120_000) void run();
    };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('online', on);
    const iv = window.setInterval(on, 300_000);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('online', on);
      window.clearInterval(iv);
    };
  }, [enabled, run]);
}

/* ---------- Производственный календарь РФ ---------- */

const PC_KEY = 'chief-hub-prodcal';
const PC_FRESH_DAYS = 30;

type ProdStore = Record<string, { codes: string; at: string }>;

export const daysInYear = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
const validCodes = (year: number, text: string) => /^[0124]+$/.test(text) && text.length === daysInYear(year);

function loadProd(): ProdStore {
  try {
    const raw = localStorage.getItem(PC_KEY);
    return raw ? (JSON.parse(raw) as ProdStore) : {};
  } catch {
    return {};
  }
}

function saveProd(s: ProdStore) {
  try {
    localStorage.setItem(PC_KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно: календарь загрузится заново при следующем открытии */
  }
}

/**
 * Строка по дням года: 0 рабочий, 1 выходной или праздник, 2 сокращённый (источник isdayoff.ru).
 * Сначала через скрипт на Диске (он ходит в интернет со стороны Google), если скрипта нет или он старый,
 * то напрямую из браузера. Данные проверяются: длина должна совпасть с числом дней в году.
 */
export async function fetchProdYear(year: number): Promise<string> {
  const problems: string[] = [];
  const cfg = loadBackupConfig();
  if (isScriptUrl(cfg.url)) {
    try {
      const res = await fetch(cfg.url.trim(), { method: 'POST', body: JSON.stringify({ app: 'chief-hub', action: 'prodcal', year }), redirect: 'follow' });
      const data = (await res.json()) as { ok: boolean; error?: string; codes?: string };
      if (data.ok && data.codes && validCodes(year, data.codes)) return data.codes;
      problems.push(data.error ?? 'скрипт не вернул календарь');
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  try {
    const res = await fetch(`https://isdayoff.ru/api/getdata?year=${year}&pre=1&cc=ru`);
    const text = (await res.text()).trim();
    if (res.ok && validCodes(year, text)) return text;
    problems.push(`источник ответил кодом ${res.status}`);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }
  throw new Error(problems.join('; '));
}

/** Производственный календарь на год: берёт сохранённый, обновляет не чаще раза в 30 дней. */
export function useProdCal(year: number) {
  const [store, setStore] = useState<ProdStore>(loadProd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(new Set<string>());
  const cfg = useBackupConfig();

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const codes = await fetchProdYear(y);
      const next = { ...loadProd(), [y]: { codes, at: new Date().toISOString() } };
      saveProd(next);
      setStore(next);
    } catch (e) {
      const kept = loadProd()[y] ? 'Показан сохранённый ранее календарь.' : 'Показаны только субботы и воскресенья.';
      setError(`Календарь РФ на ${y} год не загрузился (${e instanceof Error ? e.message : String(e)}). ${kept}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const e = store[year];
    const stale = !e || Date.now() - Date.parse(e.at) > PC_FRESH_DAYS * 86400000;
    // Один заход на год и адрес скрипта: после подключения скрипта пробуем ещё раз уже через него
    const key = `${year}|${cfg.url}`;
    if (!stale || tried.current.has(key)) return;
    tried.current.add(key);
    void load(year);
  }, [year, store, load, cfg.url]);

  return { codes: store[year]?.codes, loading, error, reload: () => load(year) };
}
