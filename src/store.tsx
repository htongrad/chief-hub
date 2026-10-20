import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppState, Attestation, DialIn, EspressoTarget, Equipment, Recipe, Settings } from './types';
import { defaultModules, makeSeed } from './seed';

/**
 * Слой хранения. Сейчас данные лежат в браузере (localStorage).
 * Чтобы подключить облако (Supabase, Firebase и т. д.), достаточно написать
 * новый адаптер с теми же двумя методами и подставить его ниже — остальной код менять не нужно.
 */
export interface StorageAdapter {
  load(): AppState | null;
  save(state: AppState): void;
}

const KEY = 'chief-hub:v1';

/**
 * Приводит сохранённые данные к текущей версии (2).
 * Версия 1 (до разделов «Оборудование», «Обходы», «Отчёт») получает пустые новые списки
 * и значения норм по умолчанию. Возвращает null, если данные не похожи на Chief Hub.
 */
export function migrate(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Omit<AppState, 'version' | 'settings'>> & { version?: number; settings?: Partial<Settings> };
  if (![1, 2, 3].includes(r.version ?? 0) || !Array.isArray(r.locations) || !r.settings) return null;
  const s = r.settings;
  return {
    version: 3,
    settings: {
      networkName: s.networkName ?? 'Моя сеть',
      currency: s.currency ?? '₽',
      activeLocation: s.activeLocation ?? 'all',
      modules: { ...defaultModules(), ...(s.modules ?? {}) },
      espresso: s.espresso ?? { ratio: 2, yieldTol: 2, timeMin: 25, timeMax: 30 },
      cogsTargetPct: s.cogsTargetPct ?? 28,
      attestDays: s.attestDays ?? 180,
      visitMinScore: s.visitMinScore ?? 80,
    },
    locations: r.locations,
    staff: r.staff ?? [],
    dialIns: r.dialIns ?? [],
    cuppings: (r.cuppings ?? []).map((c) => ({ ...c, comment: c.comment ?? '' })),
    // Версия 2 хранила рецептуру одной строкой (spec): переносим её в способ приготовления.
    recipes: (r.recipes ?? []).map((x) => {
      const old = x as Recipe & { spec?: string };
      return {
        id: x.id,
        name: x.name,
        ingredients: x.ingredients ?? [],
        method: x.method ?? old.spec ?? '',
        guestDescription: x.guestDescription ?? '',
        updated: x.updated,
      };
    }),
    attestations: r.attestations ?? [],
    inventory: r.inventory ?? [],
    writeOffs: r.writeOffs ?? [],
    metrics: r.metrics ?? [],
    equipment: r.equipment ?? [],
    repairs: r.repairs ?? [],
    visits: r.visits ?? [],
    complaints: r.complaints ?? [],
    reportNote: r.reportNote ?? '',
    playbook: r.playbook ?? [],
  };
}

export const localAdapter: StorageAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* хранилище недоступно — работаем без сохранения */
    }
  },
};

const adapter: StorageAdapter = localAdapter;

interface Store {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => adapter.load() ?? makeSeed());

  useEffect(() => {
    adapter.save(state);
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);
  const replace = useCallback((s: AppState) => setState(s), []);
  const resetDemo = useCallback(() => setState(makeSeed()), []);

  return <Ctx.Provider value={{ state, update, replace, resetDemo }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider отсутствует');
  return v;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Попадает ли точка в выбранную область просмотра («все точки» или одна). */
export const inScope = (locationId: string, active: string) => active === 'all' || active === locationId;

export const locName = (state: AppState, id: string) => state.locations.find((l) => l.id === id)?.name ?? '—';

export const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/** Сегодняшняя дата по местному времени, YYYY-MM-DD. */
export const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Сколько дней от первой даты до второй (может быть отрицательным). */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Оценка одной настройки эспрессо: возвращает список замечаний (пусто = в норме). */
export function dialIssues(d: Pick<DialIn, 'doseG' | 'yieldG' | 'timeS'>, t: EspressoTarget): string[] {
  const issues: string[] = [];
  const target = d.doseG * t.ratio;
  if (d.yieldG > target + t.yieldTol) issues.push('выход выше нормы');
  if (d.yieldG < target - t.yieldTol) issues.push('выход ниже нормы');
  if (d.timeS < t.timeMin) issues.push('экстракция быстрая');
  if (d.timeS > t.timeMax) issues.push('экстракция медленная');
  return issues;
}

/** Последняя неделя, по которой есть данные. */
export function lastWeek(state: AppState): string | null {
  const weeks = state.metrics.map((m) => m.week).sort();
  return weeks.length ? weeks[weeks.length - 1] : null;
}

/** Неделя, предшествующая данной, среди тех, по которым есть данные. */
export function prevWeekOf(state: AppState, week: string): string | undefined {
  const weeks = [...new Set(state.metrics.map((m) => m.week))].sort();
  return weeks[weeks.indexOf(week) - 1];
}

/** Итоги недели по выбранной области: выручка, чеки, средняя себестоимость. */
export function weekSummary(state: AppState, week: string | undefined, scope: string) {
  const rows = state.metrics.filter((m) => m.week === week && inScope(m.locationId, scope));
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const checks = rows.reduce((a, r) => a + r.checks, 0);
  const cogs = rows.length ? rows.reduce((a, r) => a + r.cogsPct, 0) / rows.length : 0;
  return { revenue, checks, cogs, avgCheck: checks ? revenue / checks : 0, count: rows.length };
}

/** Доля записей настройки в допуске. days — окно в днях (без него все записи). */
export function stability(state: AppState, scope: string, days?: number): { pct: number | null; total: number } {
  const today = todayISO();
  const rows = state.dialIns.filter((d) => inScope(d.locationId, scope) && (days === undefined || daysBetween(d.date, today) <= days));
  const ok = rows.filter((d) => dialIssues(d, state.settings.espresso).length === 0).length;
  return { pct: rows.length ? Math.round((ok / rows.length) * 100) : null, total: rows.length };
}

export type AttestState = 'none' | 'ok' | 'due' | 'failed';

/** Статус аттестации сотрудника: не проходил, действует, просрочена, не пройдена. */
export function attestStatus(state: AppState, staffId: string, today = todayISO()): { state: AttestState; last: Attestation | null } {
  const last = state.attestations.filter((a) => a.staffId === staffId).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  if (!last) return { state: 'none', last: null };
  if (!last.passed) return { state: 'failed', last };
  return { state: daysBetween(last.date, today) > state.settings.attestDays ? 'due' : 'ok', last };
}

/** Сколько сотрудников в области по каждому статусу аттестации и доля действующих. */
export function attestSummary(state: AppState, scope: string) {
  const staff = state.staff.filter((p) => inScope(p.locationId, scope));
  const c = { none: 0, ok: 0, due: 0, failed: 0 };
  staff.forEach((p) => {
    c[attestStatus(state, p.id).state] += 1;
  });
  return { total: staff.length, ...c, pct: staff.length ? Math.round((c.ok / staff.length) * 100) : null };
}

export type DueState = 'none' | 'ok' | 'soon' | 'overdue';

/** Когда следующее ТО: none (ещё не отмечали), ok, soon (в ближайшие 7 дней), overdue. */
export function equipmentDue(e: Equipment, today = todayISO()): { next: string | null; days: number | null; state: DueState } {
  if (!e.lastServiceDate) return { next: null, days: null, state: 'none' };
  const next = addDays(e.lastServiceDate, e.intervalDays);
  const days = daysBetween(today, next);
  return { next, days, state: days < 0 ? 'overdue' : days <= 7 ? 'soon' : 'ok' };
}

export function overdueEquipmentCount(state: AppState, scope: string): number {
  return state.equipment.filter((e) => inScope(e.locationId, scope) && equipmentDue(e).state === 'overdue').length;
}

/** Средний балл обходов и тайного гостя за последние days дней. */
export function serviceScore(state: AppState, scope: string, days: number): number | null {
  const today = todayISO();
  const rows = state.visits.filter((v) => inScope(v.locationId, scope) && daysBetween(v.date, today) <= days);
  return rows.length ? Math.round(rows.reduce((a, v) => a + v.score, 0) / rows.length) : null;
}

export interface Signal {
  level: 'bad' | 'warn';
  title: string;
  detail: string;
}

/** Все сигналы «что требует внимания», в порядке важности. Их показывают Обзор и Отчёт. */
export function buildSignals(state: AppState, scope: string): Signal[] {
  const { settings } = state;
  const today = todayISO();
  const locs = state.locations.filter((l) => inScope(l.id, scope));
  const ln = (id: string) => locName(state, id);
  const out: Signal[] = [];

  // Вкус: настройки эспрессо вне нормы за последние 14 дней
  state.dialIns
    .filter((d) => inScope(d.locationId, scope) && daysBetween(d.date, today) <= 14)
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((d) => {
      const issues = dialIssues(d, settings.espresso);
      if (issues.length) out.push({ level: 'bad', title: `${ln(d.locationId)}, ${d.date}: эспрессо вне нормы`, detail: `${issues.join(', ')} · ${d.doseG} → ${d.yieldG} г за ${d.timeS} с` });
    });

  // Люди: аттестации просрочены или не пройдены
  const att = attestSummary(state, scope);
  if (att.due + att.failed > 0) {
    out.push({ level: 'warn', title: `Аттестация: требуют внимания ${att.due + att.failed} чел.`, detail: `просрочена: ${att.due}, не пройдена: ${att.failed}` });
  }

  // Цифры: себестоимость выше цели, остатки ниже минимума
  const week = lastWeek(state);
  state.metrics
    .filter((m) => m.week === week && inScope(m.locationId, scope) && m.cogsPct > settings.cogsTargetPct)
    .forEach((m) => out.push({ level: 'warn', title: `${ln(m.locationId)}: себестоимость выше цели`, detail: `${m.cogsPct}% при цели ${settings.cogsTargetPct}% (неделя ${m.week})` }));
  state.inventory.forEach((it) =>
    locs.forEach((l) => {
      const q = it.qty[l.id] ?? 0;
      if (q < it.par) out.push({ level: 'warn', title: `${it.name} · ${l.name}`, detail: `осталось ${q} ${it.unit}, минимум ${it.par} ${it.unit}` });
    })
  );

  // Оборудование: ТО просрочено или скоро, открытые заявки
  state.equipment
    .filter((e) => inScope(e.locationId, scope))
    .forEach((e) => {
      const due = equipmentDue(e);
      if (due.state === 'overdue') out.push({ level: 'bad', title: `${e.name} · ${ln(e.locationId)}: ТО просрочено`, detail: `на ${Math.abs(due.days ?? 0)} дн., интервал ${e.intervalDays} дн.` });
      if (due.state === 'soon') out.push({ level: 'warn', title: `${e.name} · ${ln(e.locationId)}: скоро ТО`, detail: `через ${due.days} дн. (${due.next})` });
    });
  state.repairs
    .filter((r) => !r.done && inScope(r.locationId, scope))
    .forEach((r) => out.push({ level: 'warn', title: `Заявка на ремонт · ${ln(r.locationId)}`, detail: r.text }));

  // Гость и точки: низкий балл последнего обхода, открытые жалобы
  locs.forEach((l) => {
    const last = state.visits
      .filter((v) => v.locationId === l.id && v.kind === 'round' && daysBetween(v.date, today) <= 30)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last && last.score < settings.visitMinScore) out.push({ level: 'warn', title: `Обход · ${l.name}: ${last.score}%`, detail: `ниже минимума ${settings.visitMinScore}% (${last.date})` });
  });
  state.complaints
    .filter((c) => !c.resolved && inScope(c.locationId, scope))
    .forEach((c) => out.push({ level: 'warn', title: `Жалоба гостя · ${ln(c.locationId)}`, detail: c.text }));

  return [...out.filter((x) => x.level === 'bad'), ...out.filter((x) => x.level === 'warn')];
}

export interface ReportSection {
  title: string;
  lines: string[];
}

export interface ReportData {
  heading: string;
  sections: ReportSection[];
  text: string;
}

/** Недельный отчёт по выбранной области: блоки идут в порядке должностной инструкции. */
export function buildReport(state: AppState, scope: string): ReportData {
  const { settings } = state;
  const cur = settings.currency;
  const today = todayISO();
  const within = (d: string, days: number) => {
    const n = daysBetween(d, today);
    return n >= 0 && n <= days;
  };
  const locs = state.locations.filter((l) => inScope(l.id, scope));
  const scopeName = scope === 'all' ? 'вся сеть' : locName(state, scope);
  const week = lastWeek(state);
  const sections: ReportSection[] = [];

  // Вкус и меню
  const taste: string[] = [];
  locs.forEach((l) => {
    const rows = state.dialIns.filter((d) => d.locationId === l.id && within(d.date, 7));
    if (!rows.length) return taste.push(`${l.name}: за 7 дней записей настройки нет`);
    const ok = rows.filter((r) => dialIssues(r, settings.espresso).length === 0).length;
    taste.push(`${l.name}: настройка в норме в ${Math.round((ok / rows.length) * 100)}% записей (всего ${rows.length})`);
  });
  const cups = state.cuppings.filter((c) => inScope(c.locationId, scope) && within(c.date, 7));
  taste.push(cups.length ? `Оценок кофе под фильтр за неделю: ${cups.length}, средний балл ${(cups.reduce((a, c) => a + c.score, 0) / cups.length).toFixed(1)}` : 'Оценок кофе под фильтр за неделю не было');
  sections.push({ title: 'Вкус и меню', lines: taste });

  // Люди
  const att = attestSummary(state, scope);
  const people = [`Команда: ${att.total} чел., действующая аттестация у ${att.pct ?? 0}%`];
  if (att.due + att.failed + att.none > 0) people.push(`Просрочена: ${att.due}, не пройдена: ${att.failed}, не проходили: ${att.none}`);
  const staffIds = new Set(state.staff.filter((p) => inScope(p.locationId, scope)).map((p) => p.id));
  people.push(`Аттестаций за неделю: ${state.attestations.filter((a) => staffIds.has(a.staffId) && within(a.date, 7)).length}`);
  sections.push({ title: 'Люди', lines: people });

  // Цифры
  const nums: string[] = [];
  if (week) {
    const w = weekSummary(state, week, scope);
    nums.push(`Неделя ${week}: выручка ${fmt(w.revenue)} ${cur}, средний чек ${fmt(w.avgCheck)} ${cur}`);
    nums.push(`Себестоимость ${w.cogs.toFixed(1)}% при цели ${settings.cogsTargetPct}%`);
  } else {
    nums.push('Данных по неделям пока нет');
  }
  const offs = state.writeOffs.filter((o) => inScope(o.locationId, scope) && within(o.date, 7));
  nums.push(`Списаний за 7 дней: ${offs.length}`);
  const byItem = new Map<string, { name: string; unit: string; qty: number }>();
  offs.forEach((o) => {
    const it = state.inventory.find((i) => i.id === o.itemId);
    if (!it) return;
    const cur2 = byItem.get(it.id) ?? { name: it.name, unit: it.unit, qty: 0 };
    cur2.qty += o.qty;
    byItem.set(it.id, cur2);
  });
  [...byItem.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3)
    .forEach((x) => nums.push(`Больше всего списано: ${x.name}, ${x.qty} ${x.unit}`));
  sections.push({ title: 'Цифры', lines: nums });

  // Оборудование и санитария
  const eq = state.equipment.filter((e) => inScope(e.locationId, scope));
  const overdue = eq.filter((e) => equipmentDue(e).state === 'overdue').length;
  const soon = eq.filter((e) => equipmentDue(e).state === 'soon').length;
  const openRepairs = state.repairs.filter((r) => !r.done && inScope(r.locationId, scope)).length;
  sections.push({
    title: 'Оборудование',
    lines: [eq.length ? `Единиц оборудования: ${eq.length}, ТО просрочено: ${overdue}, скоро: ${soon}` : 'Оборудование ещё не внесено', `Открытых заявок на ремонт: ${openRepairs}`],
  });

  // Гость и точки
  const rounds = state.visits.filter((v) => inScope(v.locationId, scope) && v.kind === 'round' && within(v.date, 7));
  const mystery = state.visits.filter((v) => inScope(v.locationId, scope) && v.kind === 'mystery' && within(v.date, 30));
  const guest: string[] = [];
  guest.push(rounds.length ? `Обходов за 7 дней: ${rounds.length}, средний балл ${Math.round(rounds.reduce((a, v) => a + v.score, 0) / rounds.length)}%` : 'Обходов за 7 дней не было');
  if (mystery.length) guest.push(`Тайный гость за 30 дней: средний балл ${Math.round(mystery.reduce((a, v) => a + v.score, 0) / mystery.length)}%`);
  guest.push(`Открытых жалоб гостей: ${state.complaints.filter((c) => !c.resolved && inScope(c.locationId, scope)).length}`);
  sections.push({ title: 'Гость и точки', lines: guest });

  // Риски
  const signals = buildSignals(state, scope);
  sections.push({
    title: 'Риски',
    lines: signals.length ? signals.slice(0, 6).map((s) => `${s.title}: ${s.detail}`) : ['Сигналов нет: всё в норме.'],
  });

  if (state.reportNote.trim()) sections.push({ title: 'Комментарий шефа', lines: [state.reportNote.trim()] });

  const heading = `Отчёт шефа · ${settings.networkName} · ${scopeName}${week ? ` · неделя ${week}` : ''}`;
  const text = [heading, ...sections.map((s) => `\n${s.title}\n${s.lines.map((l) => `• ${l}`).join('\n')}`)].join('\n');
  return { heading, sections, text };
}
