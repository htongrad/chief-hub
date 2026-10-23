export type ModuleId =
  | 'overview'
  | 'calendar'
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
  /** Оценки пунктов бланка: 2 да, 1 частично, 0 нет. Нет у старых записей (там только общий балл). */
  answers?: Record<string, 0 | 1 | 2>;
  /** Пояснения к пунктам с оценкой «частично» или «нет». */
  itemNotes?: Record<string, string>;
}

/** Отзыв гостя: жалоба или похвала. У старых записей kind нет, это жалоба. */
export interface Complaint {
  id: string;
  locationId: string;
  date: string;
  text: string;
  resolved: boolean; // для похвалы не используется
  kind?: 'complaint' | 'praise';
  /** Закрытие жалобы: когда, что сделали и пояснение. Нет у жалоб, закрытых раньше. */
  resolvedDate?: string;
  action?: ComplaintAction;
  resolution?: string;
}

/** Как отработана жалоба: исправлено, разобрано с сотрудником или действий не требуется. */
export type ComplaintAction = 'fixed' | 'discussed' | 'noaction';

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
  /** Часов в обычном рабочем дне графика шефа (в предпраздничный день на час меньше) */
  workdayHours?: number;
}

/** Задача в «Календаре». Синхронизируется с отдельным календарём «Chief Hub» в Google Календаре. */
export interface Task {
  id: string;
  title: string;
  /** День, YYYY-MM-DD */
  date: string;
  /** Начало, HH:MM. Пусто — задача на весь день */
  time?: string;
  /** Окончание, HH:MM. Пусто — час от начала */
  endTime?: string;
  note?: string;
  done: boolean;
  doneAt?: string;
  /** Точка; пусто — вся сеть */
  locationId?: string;
  /** Код события в Google Календаре после первой синхронизации */
  calId?: string;
  /** Содержимое задачи на момент последней синхронизации: по нему видно, что её меняли после */
  synced?: string;
  /** Отпечаток, который скрипт вернул при последней синхронизации: по нему скрипт видит, где менялось — в панели или в календаре */
  base?: string;
  /** Удалена в панели, но ещё не убрана из Google Календаря */
  deleted?: boolean;
}

/** Отступление от графика по производственному календарю в один день. */
export type ScheduleKind = 'work' | 'off' | 'vacation' | 'sick' | 'timeoff';

export interface ScheduleDay {
  date: string;
  kind: ScheduleKind;
  /** Часов в этот день; пусто — по производственному календарю */
  hours?: number;
  locationId?: string;
  note?: string;
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
  /** Заметки к шагам «Пути шефа»: ключ — код шага */
  playbookNotes: Record<string, PlaybookNote>;
  /** Свои шаги, добавленные из заметок «Что всплыло» */
  playbookCustom: PlaybookCustomStep[];
  /** Задачи «Календаря» */
  tasks: Task[];
  /** Отступления от графика шефа (дни, где график не совпадает с производственным календарём) */
  schedule: ScheduleDay[];
}

export interface PlaybookNote {
  /** Дата отметки шага выполненным */
  doneAt?: string;
  /** Итог: что получилось */
  result: string;
  /** Что всплыло: вопрос или идея вне плана */
  found: string;
  /** «Что всплыло» разобрано (добавлено в план или закрыто) */
  foundDone?: boolean;
}

export interface PlaybookCustomStep {
  id: string;
  stageId: string;
  text: string;
  created: string;
  /** Код шага, из заметки которого появился этот шаг */
  fromStep?: string;
}
