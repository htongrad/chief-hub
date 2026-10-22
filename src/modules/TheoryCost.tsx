import { cogsPeriods, dayCosts, fmt, fmtStock, inScope, theoryVsActual, useStore, type TheoryRow } from '../store';

/**
 * Две карточки раздела «Показатели»: себестоимость по ТТК по дням и факт против ТТК за период
 * между инвентаризациями. Это не отдельный раздел меню: компонент подключается в Metrics.tsx.
 */
export default function TheoryCost() {
  const { state } = useStore();
  const { currency: cur, cogsTargetPct: target, stocktakeTolPct: tol } = state.settings;
  const scope = state.settings.activeLocation;
  const locs = state.locations.filter((l) => inScope(l.id, scope));
  const locName = (id: string) => state.locations.find((l) => l.id === id)?.name ?? '—';

  const days = dayCosts(state, scope).slice(0, 14);
  const dayTone = (v: number | null) => (v === null ? '' : v <= target ? 'ok' : v <= target + 3 ? 'warn' : 'bad');
  const diffTone = (v: number | null) => (v === null ? '' : Math.abs(v) <= tol ? 'ok' : Math.abs(v) <= tol * 2 ? 'warn' : 'bad');
  const sign = (n: number) => (n > 0 ? '+' : '');
  const pctText = (v: number | null) => (v === null ? '—' : `${sign(v)}${v.toFixed(1)}%`);

  const reports = locs.map((l) => {
    const p = cogsPeriods(state, l.id)[0];
    return { l, rep: p ? theoryVsActual(state, p) : null };
  });

  const rowLine = (r: TheoryRow) => (
    <tr key={r.itemId}>
      <td>
        <b>{r.name}</b>
        <div className="small muted">
          {fmtStock(r.unit, r.theoryQty)} по ТТК · {fmtStock(r.unit, r.actualQty)} факт
          {r.offValue > 0 ? ` · списано ${fmt(r.offValue)} ${cur}` : ''}
        </div>
      </td>
      <td className="num">{fmt(r.theoryValue)}</td>
      <td className="num">{fmt(r.actualValue)}</td>
      <td className="num">{sign(r.diffValue)}{fmt(r.diffValue)}</td>
      <td className="num">{r.diffPct === null ? '—' : <span className={`pill ${diffTone(r.diffPct)}`}>{pctText(r.diffPct)}</span>}</td>
    </tr>
  );
  const head = (
    <thead>
      <tr><th>Позиция</th><th className="num">По ТТК, {cur}</th><th className="num">Факт, {cur}</th><th className="num">Разница, {cur}</th><th className="num">%</th></tr>
    </thead>
  );

  return (
    <>
      <div className="card">
        <h2>Себестоимость по ТТК по дням</h2>
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          Проданное из «Склад → Расход за день» × стоимость порции по стандартам. Процент от выручки бара того же дня, цель {target}%.
        </p>
        {days.length === 0 ? (
          <div className="empty">Продаж по стандартам пока нет. Внесите их в «Склад → Расход за день».</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>День</th>
                  {scope === 'all' && <th>Точка</th>}
                  <th className="num">Порций</th>
                  <th className="num">Себестоимость</th>
                  <th className="num">%</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={`${d.locationId}-${d.date}`}>
                    <td>{d.date}</td>
                    {scope === 'all' && <td>{locName(d.locationId)}</td>}
                    <td className="num">{fmt(d.portions)}</td>
                    <td className="num">{fmt(d.cost)} {cur}</td>
                    <td className="num">{d.pct === null ? '—' : <span className={`pill ${dayTone(d.pct)}`}>{d.pct.toFixed(1)}%</span>}</td>
                    <td className="small muted">
                      {d.pct === null ? 'нет выручки бара' : ''}
                      {d.incomplete ? `${d.pct === null ? ', ' : ''}стоимость неполная` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ margin: '8px 0 0' }}>«Стоимость неполная» — у части ингредиентов нет цены в приходах или единицы г, мл, шт. Какие именно, видно в «Качестве» у стандарта.</p>
      </div>

      <div className="card">
        <h2>Факт против ТТК</h2>
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          За последний период между инвентаризациями: сколько позиций из стандартов должно было уйти по продажам и сколько ушло по факту. Плюс в разнице — ушло больше, чем по стандартам (потери, перелив, списания). Минус — ушло меньше (продажи внесены не все, нормы завышены, ошибки счёта).
        </p>
        {reports.every((x) => !x.rep) ? (
          <div className="empty">Нужны две инвентаризации на точке, приходы с ценой и продажи в «Расходе за день».</div>
        ) : (
          reports.map(({ l, rep }) => {
            if (!rep) return <p className="small muted" key={l.id}><b>{l.name}</b>: нужна ещё одна инвентаризация.</p>;
            const diff = rep.actualTotal - rep.theoryTotal;
            const diffPct = rep.theoryTotal > 0 ? (diff / rep.theoryTotal) * 100 : null;
            const top = rep.rows.slice(0, 5);
            return (
              <div key={l.id} style={{ marginTop: 12 }}>
                <div><b>{l.name}</b> <span className="small muted">· {rep.from} — {rep.to}</span></div>
                {rep.rows.length === 0 ? (
                  <p className="small muted" style={{ margin: '6px 0 0' }}>В этом периоде нет позиций из стандартов с известной ценой.</p>
                ) : (
                  <>
                    <div className="row" style={{ margin: '6px 0' }}>
                      <span>По ТТК {fmt(rep.theoryTotal)} {cur}</span>
                      <span>· по факту {fmt(rep.actualTotal)} {cur}</span>
                      <span>· разница {sign(diff)}{fmt(diff)} {cur}</span>
                      {diffPct !== null && <span className={`pill ${diffTone(diffPct)}`}>{pctText(diffPct)}</span>}
                    </div>
                    {rep.salesDays < rep.periodDays && (
                      <p className="small muted" style={{ margin: '0 0 6px' }}>
                        Продажи внесены за {rep.salesDays} из {rep.periodDays} дней, поэтому по ТТК получилось меньше, чем должно, а разница завышена.
                      </p>
                    )}
                    <div className="tablewrap">
                      <table>{head}<tbody>{top.map(rowLine)}</tbody></table>
                    </div>
                    {rep.rows.length > top.length && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Все позиции ({rep.rows.length})</summary>
                        <div className="tablewrap" style={{ marginTop: 6 }}>
                          <table>{head}<tbody>{rep.rows.map(rowLine)}</tbody></table>
                        </div>
                      </details>
                    )}
                  </>
                )}
                {rep.outsideCount > 0 && (
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    Вне стандартов (чистящее, расходники и т. п.): {fmt(rep.outsideValue)} {cur}, позиций {rep.outsideCount}.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
