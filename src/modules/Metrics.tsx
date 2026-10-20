import { useState } from 'react';
import { fmt, inScope, locName, uid, useStore } from '../store';

export default function Metrics() {
  const { state, update } = useStore();
  const { currency: cur } = state.settings;
  const scope = state.settings.activeLocation;

  const rows = state.metrics.filter((m) => inScope(m.locationId, scope));
  const weeks = [...new Set(rows.map((m) => m.week))].sort();
  const byWeek = weeks.map((w) => {
    const r = rows.filter((x) => x.week === w);
    return { w, revenue: r.reduce((a, x) => a + x.revenue, 0), checks: r.reduce((a, x) => a + x.checks, 0) };
  });
  const max = Math.max(1, ...byWeek.map((x) => x.revenue));

  // Сравнение точек за последнюю неделю
  const last = weeks[weeks.length - 1];
  const compare = state.locations
    .filter((l) => inScope(l.id, scope))
    .map((l) => {
      const m = rows.find((x) => x.locationId === l.id && x.week === last);
      return { l, m };
    });

  const [f, setF] = useState({ locationId: state.locations[0]?.id ?? '', week: '', revenue: 0, checks: 0, cogsPct: 28 });
  const add = () => {
    if (!f.week.trim() || !f.locationId) return;
    update((s) => ({
      ...s,
      metrics: [...s.metrics.filter((m) => !(m.locationId === f.locationId && m.week === f.week.trim())), { id: uid(), ...f, week: f.week.trim() }],
    }));
  };

  return (
    <div className="stack">
      <div className="card">
        <h2>Выручка по неделям</h2>
        {byWeek.length === 0 ? (
          <div className="empty">Данных пока нет. Добавьте первую неделю ниже.</div>
        ) : (
          <div className="bars" role="img" aria-label="Столбчатая диаграмма выручки по неделям">
            {byWeek.map((x) => (
              <div className="bar" key={x.w}>
                <b>{fmt(x.revenue / 1000)}к</b>
                <i style={{ height: `${(x.revenue / max) * 130}px` }} />
                <span>{x.w.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {last && (
        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Сравнение точек · {last}</h2></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Точка</th><th className="num">Выручка</th><th className="num">Чеки</th><th className="num">Средний чек</th><th className="num">Себестоимость</th></tr></thead>
              <tbody>
                {compare.map(({ l, m }) => (
                  <tr key={l.id}>
                    <td><b>{l.name}</b></td>
                    <td className="num">{m ? `${fmt(m.revenue)} ${cur}` : '—'}</td>
                    <td className="num">{m ? fmt(m.checks) : '—'}</td>
                    <td className="num">{m && m.checks ? `${fmt(m.revenue / m.checks)} ${cur}` : '—'}</td>
                    <td className="num">{m ? <span className={`pill ${m.cogsPct <= 28 ? 'ok' : m.cogsPct <= 31 ? 'warn' : 'bad'}`}>{m.cogsPct}%</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Добавить неделю</h2>
        <div className="form">
          <div className="f">Точка
            <select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="f">Неделя<input style={{ width: 110 }} placeholder="2026-W43" value={f.week} onChange={(e) => setF({ ...f, week: e.target.value })} /></div>
          <div className="f">Выручка<input type="number" min={0} value={f.revenue} onChange={(e) => setF({ ...f, revenue: +e.target.value })} style={{ width: 120 }} /></div>
          <div className="f">Чеки<input type="number" min={0} value={f.checks} onChange={(e) => setF({ ...f, checks: +e.target.value })} /></div>
          <div className="f">Себест., %<input type="number" min={0} max={100} step="0.1" value={f.cogsPct} onChange={(e) => setF({ ...f, cogsPct: +e.target.value })} /></div>
          <button className="btn" onClick={add}>Сохранить</button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Если запись для этой точки и недели уже есть, она будет заменена.</p>
      </div>

      {rows.length > 0 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Все записи ({rows.length})</summary>
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table>
              <tbody>
                {[...rows].sort((a, b) => b.week.localeCompare(a.week)).map((m) => (
                  <tr key={m.id}>
                    <td>{m.week}</td>
                    <td>{locName(state, m.locationId)}</td>
                    <td className="num">{fmt(m.revenue)} {cur}</td>
                    <td className="num">{fmt(m.checks)} чеков</td>
                    <td className="num">{m.cogsPct}%</td>
                    <td><button className="btn danger sm" onClick={() => update((s) => ({ ...s, metrics: s.metrics.filter((x) => x.id !== m.id) }))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
