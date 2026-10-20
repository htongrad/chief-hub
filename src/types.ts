export type ModuleId = 'overview' | 'playbook' | 'team' | 'quality' | 'inventory' | 'metrics' | 'settings';

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

export interface MetricEntry {
  id: string;
  locationId: string;
  week: string; // YYYY-Www
  revenue: number;
  checks: number;
  cogsPct: number;
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
}

export interface AppState {
  version: 1;
  settings: Settings;
  locations: Location[];
  staff: Staff[];
  dialIns: DialIn[];
  cuppings: Cupping[];
  inventory: InventoryItem[];
  metrics: MetricEntry[];
  /** Отмеченные пункты «Пути шефа» */
  playbook: string[];
}
