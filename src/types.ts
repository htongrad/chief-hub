export type ModuleId =
  | 'overview'
  | 'quality'
  | 'team'
  | 'inventory'
  | 'metrics'
  | 'equipment'
  | 'rounds'
  | 'report'
  | 'playbook'
  | 'settings';

export interface Location {
  id: string;
  name: string;
}

export type StaffRole = 'trainee' | 'barista' | 'senior' | 'head';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  locationId: string;
  /** Навыки: id навыка -> уровень 0..3 */
  skills: Record<string, number>;
}

export interface DialIn {
  id: string;
  locationId: string;
  date: string; // YYYY-MM-DD
  grinder: string;
  doseG: number;
  yieldG: number;
  timeS: number;
  note: string;
}

export interface Cupping {
  id: string;
  locationId: string;
  date: string;
  coffee: string;
  score: number; // 0..100 по шкале SCA
  note: string; // дескрипторы вкуса
  comment: string; // заметка к оценке
}

/** Ингредиент стандарта: название, количество и единица (г, мл, шт. и т.п.). */
export interface RecipeIngredient {
  name: string;
  amount: string;
  unit: string;
  /** Позиция банка ингредиентов (склад). Проставляется автоматически при сохранении стандарта. */
  itemId?: string;
}

/** Стандарт напитка (ТТК): состав, приготовление и описание для гостя. */
export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  method: string; // способ приготовления
  guestDescription: string; // продающее описание для гостя
  updated: string; // YYYY-MM-DD
}

/** Аттестация бариста: результат и дата. */
export interface Attestation {
  id: string;
  staffId: string;
  date: string;
  passed: boolean;
  note: string;
}

/** Базовая единица учёта: граммы, миллилитры или штуки. Показывается в кг, л и шт. */
export type BaseUnit = 'g' | 'ml' | 'pcs';

/**
 * Позиция банка ингредиентов. Все количества хранятся в базовых единицах (г, мл, шт).
 * Остаток на точке = стартовый остаток + приходы − списания − расход по стандартам (по продажам).
 */
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: BaseUnit;
  /** Минимальный остаток на одну точку (в базовых единицах): ниже него позиция попадает в закупку */
  par: number;
  /** Позиция есть на всех точках (в том числе на новых) */
  allLocations: boolean;
  /** Точки, где позиция есть, если allLocations = false */
  locationIds: string[];
  /** Стартовый остаток (по пересчёту): id точки -> количество */
  opening: Record<string, number>;
}

/** Инвентаризация: фактический остаток по позициям точки на дату. Количества в базовых единицах. */
export interface Stocktake {
  id: string;
  locationId: string;
  date: string;
  lines: { itemId: string; expected: number; actual: number }[];
}

/** Приход: поставка позиции на точку. */
export interface Receipt {
  id: string;
  locationId: string;
  itemId: string;
  qty: number; // в базовых единицах
  date: string;
  /** Сумма по накладной с НДС за весь объём этого прихода. Не задана у приходов без цены. */
  sum?: number;
}

/** Списание: уменьшает остаток позиции на точке. Количество в базовых единицах. */
export interface WriteOff {
  id: string;
  locationId: string;
  itemId: string;
  qty: number;
  reason: string;
  date: string;
}

/** Продажи за день по данным кассы: сколько чего продано. По стандартам считается расход ингредиентов. */
export interface DaySales {
  id: string;
  locationId: string;
  date: string;
  lines: { recipeId: string; count: number }[];
}

/** Выручка за день по точке. Вносится вручную; неделя, месяц и год собираются из дней. */
export interface DayMetric {
  id: string;
  locationId: string;
  date: string; // YYYY-MM-DD
  /** Общая выручка за день (включает бар) */
  revenue: number;
  /** Выручка бара: часть общей выручки */
  barRevenue: number;
  checks: number;
  guests: number;
}

/** Недельная запись. Выручка и чеки теперь берутся из дней; запись нужна для себестоимости (до месячного расчёта). */
export interface MetricEntry {
  id: string;
  locationId: string;
  week: string; // YYYY-Www
  revenue: number;
  checks: number;
  cogsPct: number;
}

export type EquipmentKind = 'machine' | 'grinder' | 'water' | 'other';

export interface Equipment {
  id: string;
  locationId: string;
  name: string;
  kind: EquipmentKind;
  /** Как часто нужно ТО, дней */
  intervalDays: number;
  /** Дата последнего ТО или null, если ещё не отмечали */
  lastServiceDate: string | null;
}

export interface Repair {
  id: string;
  locationId: string;
  /** id оборудования или пустая строка, если «другое» */
  equipmentId: string;
  date: string;
  text: string;
  done: boolean;
}

/** Обход точки (по чек-листу) или оценка тайного гостя. */
export interface Visit {
  id: string;
  locationId: string;
  date: string;
  kind: 'round' | 'mystery';
  score: number; // 0..100
  note: string;
}

export interface Complaint {
  id: string;
  locationId: string;
  date: string;
  text: string;
  resolved: boolean;
}

export interface EspressoTarget {
  ratio: number; // выход / доза
  yieldTol: number; // допуск по выходу, г
  timeMin: number;
  timeMax: number;
}

export interface Settings {
  networkName: string;
  currency: string;
  activeLocation: string; // 'all' или id точки
  modules: Record<ModuleId, boolean>;
  espresso: EspressoTarget;
  /** Целевая себестоимость, % */
  cogsTargetPct: number;
  /** От какой выручки считать себестоимость по инвентаризации: бара или общей */
  cogsBasis: 'bar' | 'all';
  /** Через сколько дней аттестация считается просроченной */
  attestDays: number;
  /** Минимальный балл обхода, % */
  visitMinScore: number;
  /** Допустимое расхождение факта и расчётного остатка при инвентаризации, % */
  stocktakeTolPct: number;
}

export interface AppState {
  version: 5;
  settings: Settings;
  locations: Location[];
  staff: Staff[];
  dialIns: DialIn[];
  cuppings: Cupping[];
  recipes: Recipe[];
  attestations: Attestation[];
  inventory: InventoryItem[];
  receipts: Receipt[];
  stocktakes: Stocktake[];
  writeOffs: WriteOff[];
  daySales: DaySales[];
  dayMetrics: DayMetric[];
  metrics: MetricEntry[];
  equipment: Equipment[];
  repairs: Repair[];
  visits: Visit[];
  complaints: Complaint[];
  /** Комментарий шефа к недельному отчёту */
  reportNote: string;
  /** Отмеченные пункты «Пути шефа» */
  playbook: string[];
}
