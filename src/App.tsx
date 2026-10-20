import { useEffect, useState } from 'react';
import { MODULES } from './config';
import { useStore } from './store';
import { useAutoBackup } from './backup';
import type { ModuleId } from './types';
import Overview from './modules/Overview';
import Playbook from './modules/Playbook';
import Team from './modules/Team';
import Quality from './modules/Quality';
import Inventory from './modules/Inventory';
import Metrics from './modules/Metrics';
import Equipment from './modules/Equipment';
import Rounds from './modules/Rounds';
import Report from './modules/Report';
import SettingsPage from './modules/Settings';

const VIEWS: Record<ModuleId, () => JSX.Element> = {
  overview: Overview,
  quality: Quality,
  team: Team,
  inventory: Inventory,
  metrics: Metrics,
  equipment: Equipment,
  rounds: Rounds,
  report: Report,
  playbook: Playbook,
  settings: SettingsPage,
};

export default function App() {
  const { state, update } = useStore();
  const [active, setActive] = useState<ModuleId>('overview');
  useAutoBackup(state);

  const enabled = MODULES.filter((m) => m.locked || state.settings.modules[m.id]);
  const current = enabled.find((m) => m.id === active) ?? enabled[0];
  const View = VIEWS[current.id];

  useEffect(() => {
    document.title = `${state.settings.networkName} · ${current.title}`;
    window.scrollTo(0, 0);
  }, [current.id, state.settings.networkName]);

  return (
    <div className="app">
      <nav className="nav" aria-label="Разделы">
        <div className="brand">
          <span style={{ fontSize: 24 }}>☕</span>
          <div>
            Chief Hub
            <small>{state.settings.networkName}</small>
          </div>
        </div>
        {enabled.map((m) => (
          <button key={m.id} className={m.id === current.id ? 'active' : ''} onClick={() => setActive(m.id)} aria-current={m.id === current.id ? 'page' : undefined}>
            <span className="ico" aria-hidden>{m.icon}</span>
            {m.title}
          </button>
        ))}
      </nav>
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{current.title}</h1>
            <p className="sub">{current.hint}</p>
          </div>
          {current.id !== 'settings' && current.id !== 'playbook' && (
            <div className="scope">
              <label htmlFor="scope">Точка</label>
              <select id="scope" value={state.settings.activeLocation} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, activeLocation: e.target.value } }))}>
                <option value="all">Вся сеть</option>
                {state.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <View />
      </main>
    </div>
  );
}
