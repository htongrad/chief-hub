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
  note: string;
}

/** Стандарт напитка (ТТК): название и описание рецептуры. */
export interface Recipe {
  id: string;
  name: string;
  spec: string;
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

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  /** Минимальный остаток на одну точку */
  par: number;
  /** Остатки: id точки -> количество */
  qty: Record<string, number>;
}

/** Списание: уменьшает остаток позиции на точке. */
export interface WriteOff {
  id: string;
  locationId: string;
  itemId: string;
  qty: number;
  reason: string;
  date: string;
}

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
  /** Через сколько дней аттестация считается просроченной */
  attestDays: number;
  /** Минимальный балл обхода, % */
  visitMinScore: number;
}

export interface AppState {
  version: 2;
  settings: Settings;
  locations: Location[];
  staff: Staff[];
  dialIns: DialIn[];
  cuppings: Cupping[];
  recipes: Recipe[];
  attestations: Attestation[];
  inventory: InventoryItem[];
  writeOffs: WriteOff[];
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
