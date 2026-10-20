import { useState } from 'react';
import { dialIssues, inScope, locName, uid, useStore } from '../store';

const today = () => new Date().toISOString().slice(0, 10);

export default function Quality() {
  const { state, update } = useStore();
  const { espresso } = state.settings;
  const scope = state.settings.activeLocation;

  const dials = state.dialIns.filter((d) => inScope(d.locationId, scope)).sort((a, b) => b.date.localeCompare(a.date));
  const cups = state.cuppings.filter((c) => inScope(c.locationId, scope)).sort((a, b) => b.date.localeCompare(a.date));

  const defLoc = scope !== 'all' ? scope : state.locations[0]?.id ?? '';
  const [d, setD] = useState({ locationId: defLoc, doseG: 18, yieldG: 36, timeS: 27, note: '' });
  const [c, setC] = useState({ locationId: defLoc, coffee: '', score: 84, note: '' });

  const liveIssues = dialIssues(d, espresso);
  const targetYield = d.doseG * espresso.ratio;

  const addDial = () =>
    update((s) => ({ ...s, dialIns: [{ id: uid(), date: today(), grinder: 'Кофемолка 1', ...d, locationId: d.locationId || defLoc }, ...s.dialIns] }));
  const addCup = () => {
    if (!c.coffee.trim()) return;
    update((s) => ({ ...s, cuppings: [{ id: uid(), date: today(), ...c, coffee: c.coffee.trim(), locationId: c.locationId || defLoc }, ...s.cuppings] }));
    setC({ ...c, coffee: '', note: '' });
  };

  // Стабильность: доля записей в допуске по каждой точке
  const stability = state.locations
    .filter((l) => inScope(l.id, scope))
    .map((l) => {
      const rows = state.dialIns.filter((x) => x.locationId === l.id);
      const ok = rows.filter((x) => dialIssues(x, espresso).length === 0).length;
      return { l, total: rows.length, pct: rows.length ? Math.round((ok / rows.length) * 100) : null };
    });

  return (
    <div className="stack">
      <div className="card">
        <h2>Стабильность настройки эспрессо</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>
          Норма: выход ≈ доза × {espresso.ratio} (±{espresso.yieldTol} г), время {espresso.timeMin}–{espresso.timeMax} с. Нормы меняются в «Настройках».
        </p>
        <div className="grid kpis">
          {stability.map(({ l, total, pct }) => (
            <div className="kpi" key={l.id}>
              <div className="label">{l.name}</div>
              <div className="value">{pct === null ? '—' : `${pct}%`}</div>
              <div className="delta">{total} записей в журнале</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Новая настройка помола</h2>
          <div className="form">
            <div className="f">Точка
              <select value={d.locationId} onChange={(e) => setD({ ...d, locationId: e.target.value })}>
                {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="f">Доза, г<input type="number" step="0.1" value={d.doseG} onChange={(e) => setD({ ...d, doseG: +e.target.value })} /></div>
            <div className="f">Выход, г<input type="number" step="0.1" value={d.yieldG} onChange={(e) => setD({ ...d, yieldG: +e.target.value })} /></div>
            <div className="f">Время, с<input type="number" step="1" value={d.timeS} onChange={(e) => setD({ ...d, timeS: +e.target.value })} /></div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1 }} placeholder="Заметка (необязательно)" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
            <button className="btn" onClick={addDial}>Записать</button>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Цель по выходу: <b>{targetYield.toFixed(1)} г</b>.{' '}
            {liveIssues.length === 0 ? <span className="pill ok">в норме</span> : <span className="pill bad">{liveIssues.join(', ')}</span>}
          </p>
        </div>

        <div className="card">
          <h2>Новый каппинг</h2>
          <div className="form">
            <div className="f">Точка
              <select value={c.locationId} onChange={(e) => setC({ ...c, locationId: e.target.value })}>
                {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="f">Кофе<input value={c.coffee} onChange={(e) => setC({ ...c, coffee: e.target.value })} placeholder="Происхождение, обработка" /></div>
            <div className="f">Балл<input type="number" step="0.25" min={0} max={100} value={c.score} onChange={(e) => setC({ ...c, score: +e.target.value })} /></div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1 }} placeholder="Дескрипторы вкуса" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} />
            <button className="btn" onClick={addCup}>Сохранить</button>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Журнал настройки</h2></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Дата</th><th>Точка</th><th className="num">Доза → выход</th><th className="num">Время</th><th>Статус</th></tr></thead>
              <tbody>
                {dials.length === 0 && <tr><td colSpan={5}><div className="empty">Записей пока нет.</div></td></tr>}
                {dials.slice(0, 12).map((x) => {
                  const is = dialIssues(x, espresso);
                  return (
                    <tr key={x.id}>
                      <td>{x.date}</td>
                      <td>{locName(state, x.locationId)}</td>
                      <td className="num">{x.doseG} → {x.yieldG} г</td>
                      <td className="num">{x.timeS} с</td>
                      <td>{is.length === 0 ? <span className="pill ok">норма</span> : <span className="pill bad" title={is.join(', ')}>{is[0]}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Каппинги</h2></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Дата</th><th>Кофе</th><th>Точка</th><th className="num">Балл</th></tr></thead>
              <tbody>
                {cups.length === 0 && <tr><td colSpan={4}><div className="empty">Каппингов пока нет.</div></td></tr>}
                {cups.slice(0, 12).map((x) => (
                  <tr key={x.id}>
                    <td>{x.date}</td>
                    <td><b>{x.coffee}</b><div className="small muted">{x.note}</div></td>
                    <td>{locName(state, x.locationId)}</td>
                    <td className="num"><span className={`pill ${x.score >= 85 ? 'ok' : x.score >= 80 ? 'warn' : 'bad'}`}>{x.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
