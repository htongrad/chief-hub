import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppState, Attestation, BaseUnit, DialIn, EspressoTarget, Equipment, InventoryItem, Recipe, Settings, Stocktake, WriteOff } from './types';
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

// ——— Единицы учёта ———
// Внутри всё хранится в базовых единицах (г, мл, шт). Списания и приходы вводятся в удобных
// единицах, остатки показываются в кг, л и шт, как в кассовой системе.

const UNIT_ALIASES: Record<string, { base: BaseUnit; factor: number }> = {
  г: { base: 'g', factor: 1 },
  гр: { base: 'g', factor: 1 },
  кг: { base: 'g', factor: 1000 },
  мл: { base: 'ml', factor: 1 },
  л: { base: 'ml', factor: 1000 },
  шт: { base: 'pcs', factor: 1 },
};

/** Разбирает единицу из текста («г», «кг», «шт.»). Для незнакомой единицы возвращает null. */
export function parseUnit(raw: string): { base: BaseUnit; factor: number } | null {
  return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, '')] ?? null;
}

export const BASE_LABEL: Record<BaseUnit, string> = { g: 'г', ml: 'мл', pcs: 'шт' };
export const STOCK_LABEL: Record<BaseUnit, string> = { g: 'кг', ml: 'л', pcs: 'шт' };
export const STOCK_FACTOR: Record<BaseUnit, number> = { g: 1000, ml: 1000, pcs: 1 };
/** Единицы для ввода прихода: так же, как привозят поставщики. */
export const RECEIPT_UNITS: { label: string; base: BaseUnit; factor: number }[] = [
  { label: 'кг', base: 'g', factor: 1000 },
  { label: 'л', base: 'ml', factor: 1000 },
  { label: 'шт', base: 'pcs', factor: 1 },
];

const trimNum = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');
/** Остаток в единицах стока: кг, л, шт. */
export const fmtStock = (unit: BaseUnit, q: number) => `${trimNum(q / STOCK_FACTOR[unit])} ${STOCK_LABEL[unit]}`;
/** Количество в базовых единицах; крупные значения показываем в кг и л. */
export const fmtQty = (unit: BaseUnit, q: number) => (unit !== 'pcs' && Math.abs(q) >= 1000 ? fmtStock(unit, q) : `${trimNum(q)} ${BASE_LABEL[unit]}`);

const normName = (s: string) => s.trim().toLowerCase();

/** Применима ли позиция на точке (на всех точках или отмечена галочкой). */
export const itemAt = (it: InventoryItem, locationId: string) => it.allLocations || it.locationIds.includes(locationId);

/**
 * Связывает ингредиенты стандартов с банком ингредиентов: если позиции с таким названием нет,
 * она создаётся (на всех точках), и ингредиент получает ссылку на неё. Единицы вне г/кг/мл/л/шт
 * (например, «шот») в сток не попадают. Безопасно вызывать повторно.
 */
export function linkIngredients(inventory: InventoryItem[], recipes: Recipe[]): { inventory: InventoryItem[]; recipes: Recipe[] } {
  const inv = [...inventory];
  const linked = recipes.map((r) => ({
    ...r,
    ingredients: r.ingredients.map((i) => {
      const plain = { name: i.name, amount: i.amount, unit: i.unit };
      const u = parseUnit(i.unit);
      if (!u || !i.name.trim()) return plain;
      const byId = i.itemId ? inv.find((x) => x.id === i.itemId) : undefined;
      let item = byId && byId.unit === u.base ? byId : inv.find((x) => normName(x.name) === normName(i.name) && x.unit === u.base);
      if (!item) {
        if (inv.some((x) => normName(x.name) === normName(i.name))) return plain; // то же название, другая единица
        item = { id: uid(), name: i.name.trim(), category: 'Из стандартов', unit: u.base, par: 0, allLocations: true, locationIds: [], opening: {} };
        inv.push(item);
      }
      return { ...plain, itemId: item.id };
    }),
  }));
  return { inventory: inv, recipes: linked };
}

/** Расход позиции на точке по продажам (за все дни или за период): количество × норма из стандарта. */
export function usageOf(state: AppState, itemId: string, locationId: string, range?: { from: string; to: string }): number {
  let total = 0;
  state.daySales.forEach((d) => {
    if (d.locationId !== locationId) return;
    if (range && !(d.date > range.from && d.date <= range.to)) return; // период: после from и по to включительно
    d.lines.forEach((ln) => {
      const r = state.recipes.find((x) => x.id === ln.recipeId);
      r?.ingredients.forEach((i) => {
        if (i.itemId !== itemId) return;
        const amount = parseFloat(i.amount.replace(',', '.'));
        const u = parseUnit(i.unit);
        if (u && amount > 0) total += ln.count * amount * u.factor;
      });
    });
  });
  return total;
}

/** Остаток на точке = стартовый + приходы − списания − расход по продажам (в базовых единицах). */
export function stockOf(state: AppState, it: InventoryItem, locationId: string): number {
  const inn = state.receipts.filter((x) => x.itemId === it.id && x.locationId === locationId).reduce((a, x) => a + x.qty, 0);
  const out = state.writeOffs.filter((x) => x.itemId === it.id && x.locationId === locationId).reduce((a, x) => a + x.qty, 0);
  return (it.opening[locationId] ?? 0) + inn - out - usageOf(state, it.id, locationId);
}

/**
 * Записи списания из строк формы: каждая позиция становится отдельной записью с общей точкой, причиной и датой.
 * Строки без количества и строки, для которых нет позиции на этой точке в выбранных единицах, пропускаются.
 * Если позиция в строке не выбрана, берётся первая подходящая.
 */
export function makeWriteOffs(
  state: AppState,
  locationId: string,
  reason: string,
  date: string,
  lines: { unit: BaseUnit; itemId: string; qty: string }[]
): WriteOff[] {
  const out: WriteOff[] = [];
  lines.forEach((l) => {
    const items = state.inventory.filter((i) => i.unit === l.unit && itemAt(i, locationId));
    const item = items.find((i) => i.id === l.itemId) ?? items[0];
    const qty = parseFloat(l.qty.replace(/\s/g, '').replace(',', '.'));
    if (item && Number.isFinite(qty) && qty > 0) out.push({ id: uid(), locationId, itemId: item.id, qty, reason, date });
  });
  return out;
}

/** Цена за кг, л или шт с НДС (как в накладной): сумма прихода / количество в единицах стока. null — цены нет. */
export function receiptUnitPrice(it: InventoryItem, r: { qty: number; sum?: number }): number | null {
  if (!r.sum || r.sum <= 0 || r.qty <= 0) return null;
  return r.sum / (r.qty / STOCK_FACTOR[it.unit]);
}

/**
 * Средняя цена позиции за кг, л или шт с НДС по всем приходам с ценой на всех точках:
 * сумма всех накладных / общее количество, поэтому дорогая и дешёвая поставки не дают скачков.
 * Приходы без суммы не учитываются. null — ни одного прихода с ценой.
 */
export function avgPrice(state: AppState, it: InventoryItem): { perUnit: number; count: number } | null {
  let sum = 0;
  let qty = 0;
  let count = 0;
  state.receipts.forEach((r) => {
    if (r.itemId !== it.id || !r.sum || r.sum <= 0 || r.qty <= 0) return;
    sum += r.sum;
    qty += r.qty;
    count++;
  });
  return count ? { perUnit: sum / (qty / STOCK_FACTOR[it.unit]), count } : null;
}

/** Денежная сумма для экрана: крупные суммы без копеек, мелкие (цена за штуку) с копейками. */
export const fmtMoney = (n: number) => (n >= 100 ? fmt(n) : (Math.round(n * 100) / 100).toLocaleString('ru-RU'));

// ——— Себестоимость по инвентаризации ———
// Период — между двумя соседними инвентаризациями точки. Расход в рублях = остаток на начало +
// приходы − остаток на конец. Остатки оцениваются по средней цене позиции (с НДС, по сети),
// приходы — по сумме накладной (без суммы — по средней цене). Позиции без цены не учитываются.

/** Позиция внутри периода: нужна, чтобы сравнивать факт с расходом по стандартам. Количества в базовых единицах, цена за г, мл или шт. */
export interface CogsLine {
  itemId: string;
  name: string;
  unit: BaseUnit;
  price: number;
  openQty: number;
  closeQty: number;
  inQty: number;
  inValue: number;
  offQty: number;
}

export interface CogsPeriod {
  locationId: string;
  /** Дата предыдущей инвентаризации (точка отсчёта) и дата текущей */
  from: string;
  to: string;
  openValue: number;
  receiptsValue: number;
  closeValue: number;
  /** Расход за период: начало + приходы − конец */
  cost: number;
  /** Часть расхода, которая ушла в списания */
  writeOffsValue: number;
  revenue: number;
  barRevenue: number;
  /** За сколько дней периода внесена выручка и сколько всего дней в периоде */
  revenueDays: number;
  periodDays: number;
  /** Сколько позиций учтено, сколько их на точке всего, какие без цены */
  counted: number;
  total: number;
  noPrice: string[];
  lines: CogsLine[];
}

/** Все периоды точки между инвентаризациями, последний первым. Нужны минимум две инвентаризации. */
export function cogsPeriods(state: AppState, locationId: string): CogsPeriod[] {
  // Факт по датам. Новые записи лежат в начале списка, поэтому идём с конца: поздняя запись за ту же дату перекрывает раннюю.
  const byDate = new Map<string, Map<string, number>>();
  [...state.stocktakes].reverse().forEach((t) => {
    if (t.locationId !== locationId) return;
    const m = byDate.get(t.date) ?? new Map<string, number>();
    t.lines.forEach((l) => m.set(l.itemId, l.actual));
    byDate.set(t.date, m);
  });
  const dates = [...byDate.keys()].sort();
  const items = state.inventory.filter((it) => itemAt(it, locationId));
  const out: CogsPeriod[] = [];
  for (let i = 1; i < dates.length; i++) {
    const from = dates[i - 1];
    const to = dates[i];
    const a = byDate.get(from) as Map<string, number>;
    const b = byDate.get(to) as Map<string, number>;
    const inPeriod = (d: string) => d > from && d <= to;
    let open = 0;
    let close = 0;
    let inn = 0;
    let off = 0;
    let counted = 0;
    const noPrice: string[] = [];
    const lines: CogsLine[] = [];
    items.forEach((it) => {
      const s0 = a.get(it.id);
      const s1 = b.get(it.id);
      if (s0 === undefined || s1 === undefined) return;
      const p = avgPrice(state, it);
      if (!p) {
        noPrice.push(it.name);
        return;
      }
      const base = p.perUnit / STOCK_FACTOR[it.unit]; // цена за г, мл или шт
      open += s0 * base;
      close += s1 * base;
      let lineInQty = 0;
      let lineInValue = 0;
      let lineOffQty = 0;
      state.receipts.forEach((r) => {
        if (r.itemId !== it.id || r.locationId !== locationId || !inPeriod(r.date)) return;
        const v = r.sum && r.sum > 0 ? r.sum : r.qty * base;
        inn += v;
        lineInValue += v;
        lineInQty += r.qty;
      });
      state.writeOffs.forEach((w) => {
        if (w.itemId !== it.id || w.locationId !== locationId || !inPeriod(w.date)) return;
        off += w.qty * base;
        lineOffQty += w.qty;
      });
      lines.push({ itemId: it.id, name: it.name, unit: it.unit, price: base, openQty: s0, closeQty: s1, inQty: lineInQty, inValue: lineInValue, offQty: lineOffQty });
      counted++;
    });
    const days = new Set<string>();
    let revenue = 0;
    let barRevenue = 0;
    state.dayMetrics.forEach((d) => {
      if (d.locationId !== locationId || !inPeriod(d.date)) return;
      revenue += d.revenue;
      barRevenue += d.barRevenue;
      days.add(d.date);
    });
    out.push({
      locationId,
      from,
      to,
      openValue: open,
      receiptsValue: inn,
      closeValue: close,
      cost: open + inn - close,
      writeOffsValue: off,
      revenue,
      barRevenue,
      revenueDays: days.size,
      periodDays: daysBetween(from, to),
      counted,
      total: items.length,
      noPrice,
      lines,
    });
  }
  return out.reverse();
}

/** Себестоимость периода в процентах от выручки бара или общей. null — выручки за период нет. */
export function cogsPct(p: CogsPeriod, basis: 'bar' | 'all'): number | null {
  const base = basis === 'bar' ? p.barRevenue : p.revenue;
  return base > 0 ? (p.cost / base) * 100 : null;
}

/** Последний расчёт по каждой точке выбранной области, сведённый в один процент (сумма расходов / сумма выручки). */
export function cogsLatest(state: AppState, scope: string): { pct: number | null; locations: number } {
  const basis = state.settings.cogsBasis;
  let cost = 0;
  let base = 0;
  let n = 0;
  state.locations
    .filter((l) => inScope(l.id, scope))
    .forEach((l) => {
      const p = cogsPeriods(state, l.id)[0];
      const b = p ? (basis === 'bar' ? p.barRevenue : p.revenue) : 0;
      if (!p || b <= 0) return;
      cost += p.cost;
      base += b;
      n++;
    });
  return { pct: n ? (cost / base) * 100 : null, locations: n };
}

// ——— Себестоимость по ТТК ———
// Стоимость порции = норма каждого ингредиента × средняя цена позиции. Продано берётся из «Склад → Расход за день».

/** Стоимость одной порции стандарта. missing — ингредиенты, которые не удалось оценить: нет цены, нет в стоке, единица вроде «шот». */
export function portionCost(state: AppState, r: Recipe): { cost: number; missing: string[] } {
  let cost = 0;
  const missing: string[] = [];
  r.ingredients.forEach((i) => {
    if (!i.name.trim()) return;
    const amount = parseFloat(i.amount.replace(',', '.'));
    const u = parseUnit(i.unit);
    const it = i.itemId ? state.inventory.find((x) => x.id === i.itemId) : undefined;
    const p = it ? avgPrice(state, it) : null;
    if (!(amount > 0) || !u || !it || !p) {
      missing.push(i.name.trim());
      return;
    }
    cost += (amount * u.factor * p.perUnit) / STOCK_FACTOR[it.unit];
  });
  return { cost, missing };
}

export interface DayCost {
  locationId: string;
  date: string;
  /** Себестоимость проданного по ТТК за день */
  cost: number;
  portions: number;
  /** Выручка бара за этот день (0, если не внесена) */
  barRevenue: number;
  pct: number | null;
  /** У части проданных стандартов стоимость порции неполная */
  incomplete: boolean;
}

/** Себестоимость по ТТК за каждый день, по которому внесены продажи: проданное × стоимость порции. Последние дни первыми. */
export function dayCosts(state: AppState, scope: string): DayCost[] {
  const cache = new Map<string, { cost: number; missing: string[] }>();
  const costOf = (r: Recipe) => {
    let v = cache.get(r.id);
    if (!v) {
      v = portionCost(state, r);
      cache.set(r.id, v);
    }
    return v;
  };
  return state.daySales
    .filter((d) => inScope(d.locationId, scope))
    .map((d) => {
      let cost = 0;
      let portions = 0;
      let incomplete = false;
      d.lines.forEach((l) => {
        const r = state.recipes.find((x) => x.id === l.recipeId);
        if (!r || l.count <= 0) return;
        const c = costOf(r);
        cost += c.cost * l.count;
        portions += l.count;
        if (c.missing.length) incomplete = true;
      });
      const barRevenue = state.dayMetrics.filter((m) => m.locationId === d.locationId && m.date === d.date).reduce((a, m) => a + m.barRevenue, 0);
      return { locationId: d.locationId, date: d.date, cost, portions, barRevenue, pct: barRevenue > 0 ? (cost / barRevenue) * 100 : null, incomplete };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.locationId.localeCompare(b.locationId));
}

export interface TheoryRow {
  itemId: string;
  name: string;
  unit: BaseUnit;
  /** Сколько должно было уйти по стандартам и сколько ушло по факту (в базовых единицах) */
  theoryQty: number;
  actualQty: number;
  theoryValue: number;
  actualValue: number;
  /** Факт минус ТТК: плюс — ушло больше, чем по стандартам */
  diffValue: number;
  diffPct: number | null;
  /** Часть фактического расхода, записанная как списания */
  offValue: number;
}

export interface TheoryReport {
  locationId: string;
  from: string;
  to: string;
  /** Позиции из стандартов: больше всего перерасход первым */
  rows: TheoryRow[];
  theoryTotal: number;
  actualTotal: number;
  /** Позиции вне стандартов (чистящее, салфетки и т. п.): фактический расход */
  outsideValue: number;
  outsideCount: number;
  /** За сколько дней периода внесены продажи и сколько всего дней */
  salesDays: number;
  periodDays: number;
}

/** Факт против ТТК за период между инвентаризациями: по каждой позиции из стандартов, сколько должно было уйти и сколько ушло. */
export function theoryVsActual(state: AppState, p: CogsPeriod): TheoryReport {
  const inRecipes = new Set<string>();
  state.recipes.forEach((r) => r.ingredients.forEach((i) => i.itemId && inRecipes.add(i.itemId)));
  const rows: TheoryRow[] = [];
  let outsideValue = 0;
  let outsideCount = 0;
  p.lines.forEach((l) => {
    const actualQty = l.openQty + l.inQty - l.closeQty;
    const actualValue = l.openQty * l.price + l.inValue - l.closeQty * l.price;
    if (!inRecipes.has(l.itemId)) {
      outsideValue += actualValue;
      outsideCount++;
      return;
    }
    const theoryQty = usageOf(state, l.itemId, p.locationId, { from: p.from, to: p.to });
    const theoryValue = theoryQty * l.price;
    const diffValue = actualValue - theoryValue;
    rows.push({
      itemId: l.itemId,
      name: l.name,
      unit: l.unit,
      theoryQty,
      actualQty,
      theoryValue,
      actualValue,
      diffValue,
      diffPct: theoryValue > 0 ? (diffValue / theoryValue) * 100 : null,
      offValue: l.offQty * l.price,
    });
  });
  rows.sort((a, b) => b.diffValue - a.diffValue);
  const salesDays = new Set(state.daySales.filter((d) => d.locationId === p.locationId && d.date > p.from && d.date <= p.to).map((d) => d.date)).size;
  return {
    locationId: p.locationId,
    from: p.from,
    to: p.to,
    rows,
    theoryTotal: rows.reduce((a, r) => a + r.theoryValue, 0),
    actualTotal: rows.reduce((a, r) => a + r.actualValue, 0),
    outsideValue,
    outsideCount,
    salesDays,
    periodDays: p.periodDays,
  };
}

/** Расхождение факта и расчёта в процентах от большей из величин. */
export const countDiffPct = (expected: number, actual: number) => {
  const m = Math.max(Math.abs(expected), Math.abs(actual));
  return m > 0 ? (Math.abs(actual - expected) / m) * 100 : 0;
};

/** Последний пересчёт позиции на точке (по дате; при равных датах — более поздняя запись). */
export function lastCount(state: AppState, itemId: string, locationId: string): { date: string; expected: number; actual: number } | null {
  let best: { date: string; expected: number; actual: number } | null = null;
  state.stocktakes.forEach((t) => {
    if (t.locationId !== locationId) return;
    const l = t.lines.find((x) => x.itemId === itemId);
    if (l && (!best || t.date >= best.date)) best = { date: t.date, expected: l.expected, actual: l.actual };
  });
  return best;
}

/** Проблемные позиции: по итогам последнего пересчёта расхождение выше порога из Настроек. */
export function problemItems(state: AppState, locationIds: string[]): { item: InventoryItem; locationId: string; date: string; expected: number; actual: number; pct: number }[] {
  const out: { item: InventoryItem; locationId: string; date: string; expected: number; actual: number; pct: number }[] = [];
  state.inventory.forEach((item) =>
    locationIds.forEach((locationId) => {
      if (!itemAt(item, locationId)) return;
      const c = lastCount(state, item.id, locationId);
      if (!c) return;
      const pct = countDiffPct(c.expected, c.actual);
      if (pct > state.settings.stocktakeTolPct) out.push({ item, locationId, ...c, pct });
    })
  );
  return out.sort((a, b) => b.pct - a.pct);
}

/** Список закупки: сколько довезти до минимального остатка суммарно по выбранным точкам. */
export function reorderList(state: AppState, locationIds: string[]): { item: InventoryItem; need: number }[] {
  return state.inventory
    .map((item) => ({
      item,
      need: locationIds.reduce((a, id) => (itemAt(item, id) ? a + Math.max(0, item.par - stockOf(state, item, id)) : a), 0),
    }))
    .filter((x) => x.need > 0);
}

/**
 * Приводит сохранённые данные к текущей версии (5).
 * Версия 1 (до разделов «Оборудование», «Обходы», «Отчёт») получает пустые новые списки
 * и значения норм по умолчанию. Версия 3 хранила склад в свободных единицах — переводим
 * в г, мл и шт (кг → г, л → мл, прочее считаем штуками). Ингредиенты стандартов попадают
 * в банк ингредиентов. Возвращает null, если данные не похожи на Chief Hub.
 */
export function migrate(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Omit<AppState, 'version' | 'settings'>> & { version?: number; settings?: Partial<Settings> };
  if (![1, 2, 3, 4, 5].includes(r.version ?? 0) || !Array.isArray(r.locations) || !r.settings) return null;
  const s = r.settings;

  // Склад: старые позиции (до версии 4) переводим в базовые единицы
  type OldItem = { id: string; name: string; category?: string; unit?: string; par?: number; qty?: Record<string, number> };
  const factors = new Map<string, number>();
  const inventory0: InventoryItem[] = (r.inventory ?? []).map((raw) => {
    const x = raw as unknown as OldItem & Partial<InventoryItem>;
    if (x.opening) return { ...(x as InventoryItem), allLocations: x.allLocations ?? true, locationIds: x.locationIds ?? [] };
    const u = parseUnit(x.unit ?? '') ?? { base: 'pcs' as BaseUnit, factor: 1 };
    factors.set(x.id, u.factor);
    const opening: Record<string, number> = {};
    Object.entries(x.qty ?? {}).forEach(([k, v]) => (opening[k] = v * u.factor));
    return { id: x.id, name: x.name, category: x.category ?? 'Прочее', unit: u.base, par: (x.par ?? 0) * u.factor, allLocations: true, locationIds: [], opening };
  });
  const writeOffs0: WriteOff[] = (r.writeOffs ?? []).map((w) => (factors.has(w.itemId) ? { ...w, qty: w.qty * (factors.get(w.itemId) ?? 1) } : w));
  const recipes0: Recipe[] = (r.recipes ?? []).map((x) => {
    // Версия 2 хранила рецептуру одной строкой (spec): переносим её в способ приготовления.
    const old = x as Recipe & { spec?: string };
    return {
      id: x.id,
      name: x.name,
      ingredients: x.ingredients ?? [],
      method: x.method ?? old.spec ?? '',
      guestDescription: x.guestDescription ?? '',
      updated: x.updated,
    };
  });
  const linked = linkIngredients(inventory0, recipes0);

  return {
    version: 5,
    settings: {
      networkName: s.networkName ?? 'Моя сеть',
      currency: s.currency ?? '₽',
      activeLocation: s.activeLocation ?? 'all',
      modules: { ...defaultModules(), ...(s.modules ?? {}) },
      espresso: s.espresso ?? { ratio: 2, yieldTol: 2, timeMin: 25, timeMax: 30 },
      cogsTargetPct: s.cogsTargetPct ?? 28,
      cogsBasis: s.cogsBasis ?? 'bar',
      attestDays: s.attestDays ?? 180,
      visitMinScore: s.visitMinScore ?? 80,
      stocktakeTolPct: s.stocktakeTolPct ?? 5,
    },
    locations: r.locations,
    staff: r.staff ?? [],
    dialIns: r.dialIns ?? [],
    cuppings: (r.cuppings ?? []).map((c) => ({ ...c, comment: c.comment ?? '' })),
    recipes: linked.recipes,
    attestations: r.attestations ?? [],
    inventory: linked.inventory,
    receipts: r.receipts ?? [],
    stocktakes: r.stocktakes ?? [],
    writeOffs: writeOffs0,
    daySales: r.daySales ?? [],
    dayMetrics: r.dayMetrics ?? [],
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

// ——— Показатели: периоды (день, неделя, месяц, год) ———
// Выручка вносится по дням. Неделя, месяц и год складываются из дней: суммируем выручку, чеки
// и гостей, а средние (чек, выручка на гостя, доля бара) считаем заново из сумм, не усредняем.

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Неделя по ISO (с понедельника): YYYY-Www. */
export function isoWeekOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // четверг этой недели
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Понедельник недели YYYY-Www. */
export function weekMonday(week: string): string {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000;
  return new Date(monday1 + (w - 1) * 7 * 86400000).toISOString().slice(0, 10);
}

/** Ключ периода, в который попадает дата: день, YYYY-Www, YYYY-MM или YYYY. */
export function periodKey(date: string, kind: PeriodKind): string {
  if (kind === 'day') return date;
  if (kind === 'week') return isoWeekOf(date);
  return kind === 'month' ? date.slice(0, 7) : date.slice(0, 4);
}

/** Первый день периода (у недели — понедельник). */
export function periodStart(key: string, kind: PeriodKind): string {
  if (kind === 'day') return key;
  if (kind === 'week') return weekMonday(key);
  return kind === 'month' ? `${key}-01` : `${key}-01-01`;
}

/** Сдвиг периода на n шагов назад или вперёд (−1 — предыдущий). */
export function shiftPeriod(key: string, kind: PeriodKind, n: number): string {
  if (kind === 'day') return addDays(key, n);
  if (kind === 'week') return isoWeekOf(addDays(weekMonday(key), n * 7));
  if (kind === 'month') {
    const [y, m] = key.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  return String(Number(key) + n);
}

/** Последний день периода. */
export const periodEnd = (key: string, kind: PeriodKind) => addDays(periodStart(shiftPeriod(key, kind, 1), kind), -1);

/** Тот же период год назад. День и неделя берутся на 364 дня раньше, чтобы совпал день недели. */
export function yearAgoKey(key: string, kind: PeriodKind): string {
  if (kind === 'day') return addDays(key, -364);
  if (kind === 'week') return isoWeekOf(addDays(weekMonday(key), -364));
  return shiftPeriod(key, kind, kind === 'month' ? -12 : -1);
}

/** Полная подпись периода: «пн 19.10.2026», «Неделя 43: 19 окт – 25 окт», «Октябрь 2026», «2026». */
export function periodLabel(key: string, kind: PeriodKind): string {
  if (kind === 'day') {
    const [y, m, d] = key.split('-');
    return `${WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()]} ${d}.${m}.${y}`;
  }
  if (kind === 'week') {
    const from = weekMonday(key);
    const to = addDays(from, 6);
    const f = (iso: string) => `${Number(iso.slice(8))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;
    return `Неделя ${Number(key.slice(6))}: ${f(from)} – ${f(to)}`;
  }
  if (kind === 'month') return `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
  return key;
}

/** Короткая подпись периода под столбцом графика. */
export function periodShort(key: string, kind: PeriodKind): string {
  if (kind === 'day') return `${key.slice(8)}.${key.slice(5, 7)}`;
  if (kind === 'week') return `Н${Number(key.slice(6))}`;
  return kind === 'month' ? MONTHS_SHORT[Number(key.slice(5)) - 1] : key;
}

export interface DayTotals {
  revenue: number;
  barRevenue: number;
  checks: number;
  guests: number;
  /** Сколько разных дней внесено */
  days: number;
}

/** Суммы по дням за период. limitDays — учитывать только первые N+1 дней периода (для честного сравнения неполных периодов). */
export function periodTotals(state: AppState, scope: string, kind: PeriodKind, key: string, limitDays?: number): DayTotals {
  const start = periodStart(key, kind);
  const dates = new Set<string>();
  const t: DayTotals = { revenue: 0, barRevenue: 0, checks: 0, guests: 0, days: 0 };
  state.dayMetrics.forEach((d) => {
    if (!inScope(d.locationId, scope) || periodKey(d.date, kind) !== key) return;
    if (limitDays !== undefined && daysBetween(start, d.date) > limitDays) return;
    t.revenue += d.revenue;
    t.barRevenue += d.barRevenue;
    t.checks += d.checks;
    t.guests += d.guests;
    dates.add(d.date);
  });
  t.days = dates.size;
  return t;
}

export const avgCheckOf = (t: DayTotals) => (t.checks ? t.revenue / t.checks : 0);
export const perGuestOf = (t: DayTotals) => (t.guests ? t.revenue / t.guests : 0);
export const barShareOf = (t: DayTotals) => (t.revenue ? (t.barRevenue / t.revenue) * 100 : 0);
/** Изменение в процентах. Если сравнивать не с чем (до нуля), возвращает null. */
export const changePct = (now: number, before: number): number | null => (before > 0 ? ((now - before) / before) * 100 : null);

/** Последняя дата, по которой внесена выручка (в выбранной области). */
export function lastMetricDate(state: AppState, scope: string): string | null {
  let best: string | null = null;
  state.dayMetrics.forEach((d) => {
    if (inScope(d.locationId, scope) && (!best || d.date > best)) best = d.date;
  });
  return best;
}

/**
 * Сводка периода и сравнения: с прошлым периодом и с тем же периодом год назад.
 * Если период ещё не закончился, прошлые периоды берутся за то же число дней с начала: так
 * середина месяца сравнивается с серединой прошлого месяца, а не с целым.
 */
export function periodCompare(state: AppState, scope: string, kind: PeriodKind, key: string) {
  const last = lastMetricDate(state, scope);
  const end = periodEnd(key, kind);
  const start = periodStart(key, kind);
  const partial = !!last && periodKey(last, kind) === key && last < end;
  const cut = partial && last ? daysBetween(start, last) : undefined;
  return {
    now: periodTotals(state, scope, kind, key, cut),
    prev: periodTotals(state, scope, kind, shiftPeriod(key, kind, -1), cut),
    yearAgo: periodTotals(state, scope, kind, yearAgoKey(key, kind), cut),
    partial,
    /** Сколько дней периода учтено при сравнении (с начала периода) */
    daysCompared: cut === undefined ? null : cut + 1,
  };
}

/** Ряд для графика: count периодов, последний — endKey. */
export function periodSeries(state: AppState, scope: string, kind: PeriodKind, endKey: string, count: number): { key: string; t: DayTotals }[] {
  const keys: string[] = [];
  let k = endKey;
  for (let i = 0; i < count; i++) {
    keys.unshift(k);
    k = shiftPeriod(k, kind, -1);
  }
  return keys.map((key) => ({ key, t: periodTotals(state, scope, kind, key) }));
}

/** Недели для отчёта: недельные записи и завершённые недели из дней (неполная неделя исказила бы сравнение). */
function reportWeeks(state: AppState): string[] {
  const today = todayISO();
  const set = new Set(state.metrics.map((m) => m.week));
  state.dayMetrics.forEach((d) => {
    const w = isoWeekOf(d.date);
    if (addDays(weekMonday(w), 6) < today) set.add(w);
  });
  return [...set].sort();
}

/** Последняя неделя, по которой есть данные. */
export function lastWeek(state: AppState): string | null {
  const weeks = reportWeeks(state);
  return weeks.length ? weeks[weeks.length - 1] : null;
}

/** Неделя, предшествующая данной, среди тех, по которым есть данные. */
export function prevWeekOf(state: AppState, week: string): string | undefined {
  const weeks = reportWeeks(state);
  return weeks[weeks.indexOf(week) - 1];
}

/**
 * Итоги недели по выбранной области: выручка, чеки, средняя себестоимость.
 * Выручка и чеки берутся из дней; если по неделе дней нет, из старой недельной записи.
 */
export function weekSummary(state: AppState, week: string | undefined, scope: string) {
  const rows = state.metrics.filter((m) => m.week === week && inScope(m.locationId, scope));
  const days: DayTotals = week ? periodTotals(state, scope, 'week', week) : { revenue: 0, barRevenue: 0, checks: 0, guests: 0, days: 0 };
  const fromDays = days.days > 0;
  const revenue = fromDays ? days.revenue : rows.reduce((a, r) => a + r.revenue, 0);
  const checks = fromDays ? days.checks : rows.reduce((a, r) => a + r.checks, 0);
  const cogs = rows.length ? rows.reduce((a, r) => a + r.cogsPct, 0) / rows.length : 0;
  return { revenue, checks, cogs, avgCheck: checks ? revenue / checks : 0, count: rows.length, hasRevenue: fromDays || rows.length > 0 };
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

/** Балл бланка в процентах: сумма оценок / максимум по оценённым пунктам. Пропущенные пункты не считаются. */
export function auditScore(answers: Record<string, 0 | 1 | 2>): { score: number | null; answered: number } {
  const vals = Object.values(answers);
  if (!vals.length) return { score: null, answered: 0 };
  return { score: Math.round((vals.reduce<number>((a, v) => a + v, 0) / (vals.length * 2)) * 100), answered: vals.length };
}

/** Проблемные пункты бланка: все «нет» и «частично» с пояснением. Для журнала и копии на Диске. */
export function auditIssues(answers: Record<string, 0 | 1 | 2> | undefined, notes: Record<string, string> | undefined, textOf: Record<string, string>): string[] {
  if (!answers) return [];
  return Object.keys(answers)
    .filter((id) => textOf[id] && (answers[id] === 0 || (answers[id] === 1 && notes?.[id])))
    .sort((a, b) => answers[a] - answers[b])
    .map((id) => `${answers[id] === 0 ? 'Нет' : 'Частично'}: ${textOf[id]}${notes?.[id] ? ` (${notes[id]})` : ''}`);
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
  // Себестоимость по инвентаризации; ручная недельная запись остаётся запасной для точек без расчёта
  const cogsLocs = new Set<string>();
  locs.forEach((l) => {
    const p = cogsPeriods(state, l.id)[0];
    const pct = p ? cogsPct(p, settings.cogsBasis) : null;
    if (!p || pct === null) return;
    cogsLocs.add(l.id);
    if (pct > settings.cogsTargetPct) {
      out.push({ level: 'warn', title: `${l.name}: себестоимость выше цели`, detail: `${pct.toFixed(1)}% при цели ${settings.cogsTargetPct}% (инвентаризации ${p.from} — ${p.to}, от выручки ${settings.cogsBasis === 'bar' ? 'бара' : 'общей'})` });
    }
  });
  state.metrics
    .filter((m) => m.week === week && inScope(m.locationId, scope) && !cogsLocs.has(m.locationId) && m.cogsPct > settings.cogsTargetPct)
    .forEach((m) => out.push({ level: 'warn', title: `${ln(m.locationId)}: себестоимость выше цели`, detail: `${m.cogsPct}% при цели ${settings.cogsTargetPct}% (неделя ${m.week})` }));
  state.inventory.forEach((it) =>
    locs.forEach((l) => {
      if (!itemAt(it, l.id)) return;
      const q = stockOf(state, it, l.id);
      if (q < it.par) out.push({ level: 'warn', title: `${it.name} · ${l.name}`, detail: `осталось ${fmtStock(it.unit, q)}, минимальный остаток ${fmtStock(it.unit, it.par)}` });
    })
  );

  // Инвентаризация: позиции с расхождением выше порога
  problemItems(state, locs.map((l) => l.id)).forEach((p) =>
    out.push({ level: 'warn', title: `Пересчитать: ${p.item.name} · ${ln(p.locationId)}`, detail: `на ${p.date} факт ${fmtStock(p.item.unit, p.actual)}, по расчёту ${fmtStock(p.item.unit, p.expected)} (расхождение ${Math.round(p.pct)}%)` })
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
    .filter((c) => c.kind !== 'praise' && !c.resolved && inScope(c.locationId, scope))
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
  } else {
    nums.push('Данных по неделям пока нет');
  }
  const cl = cogsLatest(state, scope);
  if (cl.pct !== null) {
    nums.push(`Себестоимость по инвентаризации ${cl.pct.toFixed(1)}% от выручки ${settings.cogsBasis === 'bar' ? 'бара' : 'общей'} при цели ${settings.cogsTargetPct}%`);
  } else if (week) {
    const w = weekSummary(state, week, scope);
    nums.push(w.count ? `Себестоимость ${w.cogs.toFixed(1)}% при цели ${settings.cogsTargetPct}%` : 'Себестоимость не внесена');
  }
  const offs = state.writeOffs.filter((o) => inScope(o.locationId, scope) && within(o.date, 7));
  nums.push(`Списаний за 7 дней: ${offs.length}`);
  const byItem = new Map<string, { name: string; unit: BaseUnit; qty: number }>();
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
    .forEach((x) => nums.push(`Больше всего списано: ${x.name}, ${fmtQty(x.unit, x.qty)}`));
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
  guest.push(`Открытых жалоб гостей: ${state.complaints.filter((c) => c.kind !== 'praise' && !c.resolved && inScope(c.locationId, scope)).length}`);
  const praise = state.complaints.filter((c) => c.kind === 'praise' && inScope(c.locationId, scope) && within(c.date, 30));
  if (praise.length) guest.push(`Похвал от гостей за 30 дней: ${praise.length}`);
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
