import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppState, DialIn, EspressoTarget } from './types';
import { makeSeed } from './seed';

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

export const localAdapter: StorageAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AppState) : null;
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
