import { PLAYBOOK } from '../config';
import { dialIssues, fmt, inScope, lastWeek, locName, useStore } from '../store';

export default function Overview() {
  const { state } = useStore();
  const { settings } = state;
  const scope = settings.activeLocation;
  const cur = settings.currency;

  const week = lastWeek(state);
  const weeks = [...new Set(state.metrics.map((m) => m.week))].sort();
  const prevWeek = week ? weeks[weeks.indexOf(week) - 1] : undefined;
  const sumFor = (w?: string) => {
    const rows = state.metrics.filter((m) => m.week === w && inScope(m.locationId, scope));
    return {
      revenue: rows.reduce((a, r) => a + r.revenue, 0),
      checks: rows.reduce((a, r) => a + r.checks, 0),
      cogs: rows.length ? rows.reduce((a, r) => a + r.cogsPct, 0) / rows.length : 0,
    };
  };
  const now = sumFor(week ?? undefined);
  const prev = prevWeek ? sumFor(prevWeek) : null;
  const avgCheck = now.checks ? now.revenue / now.checks : 0;
  const delta = prev && prev.revenue ? ((now.revenue - prev.revenue) / prev.revenue) * 100 : null;

  const lowStock: { item: string; loc: string; qty: number; par: number; unit: string }[] = [];
  state.inventory.forEach((it) =>
    state.locations.filter((l) => inScope(l.id, scope)).forEach((l) => {
      const q = it.qty[l.id] ?? 0;
      if (q < it.par) lowStock.push({ item: it.name, loc: l.name, qty: q, par: it.par, unit: it.unit });
    })
  );

  const badDial = state.dialIns
    .filter((d) => inScope(d.locationId, scope))
    .map((d) => ({ d, issues: dialIssues(d, settings.espresso) }))
    .filter((x) => x.issues.length)
    .sort((a, b) => b.d.date.localeCompare(a.d.date));

  const staff = state.staff.filter((s) => inScope(s.locationId, scope));
  const totalItems = PLAYBOOK.reduce((a, s) => a + s.items.length, 0);
  const done = state.playbook.length;

  const trainees = staff.filter((s) => s.role === 'trainee').length;

  return (
    <div className="stack">
      <div className="grid kpis">
        <div className="card kpi">
          <div className="label">Выручка за неделю{week ? ` (${week})` : ''}</div>
          <div className="value">{week ? `${fmt(now.revenue)} ${cur}` : '—'}</div>
          <div className="delta">{delta === null ? 'нет данных для сравнения' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% к прошлой неделе`}</div>
        </div>
        <div className="card kpi">
          <div className="label">Средний чек</div>
          <div className="value">{week ? `${fmt(avgCheck)} ${cur}` : '—'}</div>
          <div className="delta">{fmt(now.checks)} чеков за неделю</div>
        </div>
        <div className="card kpi">
          <div className="label">Себестоимость</div>
          <div className="value">{week ? `${now.cogs.toFixed(1)}%` : '—'}</div>
          <div className="delta">средняя по выбранным точкам</div>
        </div>
        <div className="card kpi">
          <div className="label">Команда</div>
          <div className="value">{staff.length}</div>
          <div className="delta">из них стажёров: {trainees}</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Требует внимания</h2>
          <div className="stack" style={{ gap: 8 }}>
            {lowStock.length === 0 && badDial.length === 0 && <div className="alert ok">Всё в норме: остатки выше минимума, настройки в допуске.</div>}
            {badDial.slice(0, 3).map(({ d, issues }) => (
              <div className="alert bad" key={d.id}>
                <div>
                  <b>{locName(state, d.locationId)}</b>, {d.date}: эспрессо вне нормы
                  <div className="small muted">{issues.join(', ')} · {d.doseG} → {d.yieldG} г за {d.timeS} с</div>
                </div>
              </div>
            ))}
            {lowStock.slice(0, 5).map((x, i) => (
              <div className="alert warn" key={i}>
                <div>
                  <b>{x.item}</b> · {x.loc}
                  <div className="small muted">осталось {x.qty} {x.unit}, минимум {x.par} {x.unit}</div>
                </div>
              </div>
            ))}
            {lowStock.length > 5 && <p className="small muted">…и ещё {lowStock.length - 5} позиций в разделе «Склад»</p>}
          </div>
        </div>

        <div className="card">
          <h2>Путь шефа</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Выполнено {done} из {totalItems} шагов</p>
          <div className="progress" aria-label="Прогресс плана"><i style={{ width: `${totalItems ? (done / totalItems) * 100 : 0}%` }} /></div>
          <div className="stack" style={{ marginTop: 14, gap: 10 }}>
            {PLAYBOOK.map((st) => {
              const d = st.items.filter((i) => state.playbook.includes(i.id)).length;
              return (
                <div key={st.id}>
                  <div className="row spread small"><span><b>{st.title}</b> <span className="muted">· {st.period}</span></span><span className="muted">{d}/{st.items.length}</span></div>
                  <div className="progress" style={{ height: 5, marginTop: 4 }}><i style={{ width: `${(d / st.items.length) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
