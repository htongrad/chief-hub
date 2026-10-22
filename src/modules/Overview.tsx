import { attestSummary, playbookProgress, playbookStages, buildSignals, cogsLatest, fmt, inScope, lastWeek, overdueEquipmentCount, prevWeekOf, serviceScore, stability, useStore, weekSummary } from '../store';

export default function Overview() {
  const { state } = useStore();
  const { settings } = state;
  const scope = settings.activeLocation;
  const cur = settings.currency;

  const week = lastWeek(state);
  const prevWeek = week ? prevWeekOf(state, week) : undefined;
  const now = weekSummary(state, week ?? undefined, scope);
  const prev = prevWeek ? weekSummary(state, prevWeek, scope) : null;
  const delta = prev && prev.revenue ? ((now.revenue - prev.revenue) / prev.revenue) * 100 : null;
  const cogsL = cogsLatest(state, scope);

  const taste = stability(state, scope, 30);
  const service = serviceScore(state, scope, 30);
  const att = attestSummary(state, scope);
  const overdue = overdueEquipmentCount(state, scope);
  const equipmentCount = state.equipment.filter((e) => inScope(e.locationId, scope)).length;

  const signals = buildSignals(state, scope);
  const shown = signals.slice(0, 8);

  const { done, total: totalItems } = playbookProgress(state);

  return (
    <div className="stack">
      <div className="grid kpis">
        <div className="card kpi">
          <div className="label">Стабильность вкуса</div>
          <div className="value">{taste.pct === null ? '—' : `${taste.pct}%`}</div>
          <div className="delta">настройка в норме, записей за 30 дней: {taste.total}</div>
        </div>
        <div className="card kpi">
          <div className="label">Качество сервиса</div>
          <div className="value">{service === null ? '—' : `${service}%`}</div>
          <div className="delta">средний балл обходов за 30 дней</div>
        </div>
        <div className="card kpi">
          <div className="label">Себестоимость</div>
          <div className="value">{cogsL.pct !== null ? `${cogsL.pct.toFixed(1)}%` : now.count ? `${now.cogs.toFixed(1)}%` : '—'}</div>
          <div className="delta">
            {cogsL.pct !== null
              ? `цель ${settings.cogsTargetPct}%, по инвентаризации от выручки ${settings.cogsBasis === 'bar' ? 'бара' : 'общей'}`
              : `цель ${settings.cogsTargetPct}%, ручная запись по неделе`}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Команда</div>
          <div className="value">{att.total}</div>
          <div className="delta">{att.pct === null ? 'нет сотрудников' : `аттестовано ${att.pct}%`}</div>
        </div>
        <div className="card kpi">
          <div className="label">Оборудование</div>
          <div className="value">{equipmentCount ? (overdue ? `${overdue} просрочено` : 'в порядке') : '—'}</div>
          <div className="delta">{equipmentCount ? `ТО по графику, единиц: ${equipmentCount}` : 'оборудование не внесено'}</div>
        </div>
        <div className="card kpi">
          <div className="label">Выручка за неделю{week ? ` (${week})` : ''}</div>
          <div className="value">{now.hasRevenue ? `${fmt(now.revenue)} ${cur}` : '—'}</div>
          <div className="delta">{delta === null ? 'нет данных для сравнения' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% к прошлой неделе`}</div>
        </div>
        <div className="card kpi">
          <div className="label">Средний чек</div>
          <div className="value">{now.hasRevenue ? `${fmt(now.avgCheck)} ${cur}` : '—'}</div>
          <div className="delta">{fmt(now.checks)} чеков за неделю</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Требует внимания</h2>
          <div className="stack" style={{ gap: 8 }}>
            {signals.length === 0 && <div className="alert ok">Всё в норме: настройки в допуске, остатки выше минимума, ТО по графику.</div>}
            {shown.map((x, i) => (
              <div className={`alert ${x.level}`} key={i}>
                <div>
                  <b>{x.title}</b>
                  <div className="small muted">{x.detail}</div>
                </div>
              </div>
            ))}
            {signals.length > shown.length && <p className="small muted">…и ещё {signals.length - shown.length}. Полный список в разделе «Отчёт», блок «Риски».</p>}
          </div>
        </div>

        <div className="card">
          <h2>Путь шефа</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Выполнено {done} из {totalItems} шагов</p>
          <div className="progress" aria-label="Прогресс плана"><i style={{ width: `${totalItems ? (done / totalItems) * 100 : 0}%` }} /></div>
          <div className="stack" style={{ marginTop: 14, gap: 10 }}>
            {playbookStages(state).map((st) => {
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
