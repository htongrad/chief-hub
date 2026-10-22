import { useEffect, useState } from 'react';
import {
  addDays,
  avgCheckOf,
  barShareOf,
  changePct,
  cogsPct,
  cogsPeriods,
  fmt,
  inScope,
  lastMetricDate,
  locName,
  perGuestOf,
  periodCompare,
  periodKey,
  periodLabel,
  periodSeries,
  periodShort,
  periodTotals,
  shiftPeriod,
  todayISO,
  uid,
  useStore,
  type DayTotals,
  type PeriodKind,
} from '../store';

const KINDS: { id: PeriodKind; label: string; chart: number }[] = [
  { id: 'day', label: 'День', chart: 14 },
  { id: 'week', label: 'Неделя', chart: 12 },
  { id: 'month', label: 'Месяц', chart: 12 },
  { id: 'year', label: 'Год', chart: 5 },
];

const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
const tone = (v: number | null) => (v === null ? 'muted' : v >= 0 ? 'ok' : 'bad');

/** Число из поля ввода: пусто или неверно = 0. */
const num = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export default function Metrics() {
  const { state, update } = useStore();
  const { currency: cur } = state.settings;
  const scope = state.settings.activeLocation;

  // ——— Сводка за период ———
  const [kind, setKind] = useState<PeriodKind>('week');
  const [shift, setShift] = useState(0); // 0 = последний период с данными, −1 = на шаг раньше
  const last = lastMetricDate(state, scope);
  const baseKey = periodKey(last ?? todayISO(), kind);
  const key = shiftPeriod(baseKey, kind, shift);
  const cmp = periodCompare(state, scope, kind, key);
  const { now, prev, yearAgo } = cmp;
  const chartCount = KINDS.find((k) => k.id === kind)?.chart ?? 12;
  const series = periodSeries(state, scope, kind, baseKey, chartCount);
  const max = Math.max(1, ...series.map((x) => x.t.revenue));

  const tiles: { label: string; value: string; now: number; prev: number; yearAgo: number; note?: string }[] = [
    { label: 'Выручка', value: `${fmt(now.revenue)} ${cur}`, now: now.revenue, prev: prev.revenue, yearAgo: yearAgo.revenue },
    {
      label: 'Выручка бара',
      value: `${fmt(now.barRevenue)} ${cur}`,
      now: now.barRevenue,
      prev: prev.barRevenue,
      yearAgo: yearAgo.barRevenue,
      note: now.revenue ? `${barShareOf(now).toFixed(1)}% выручки` : undefined,
    },
    { label: 'Чеки', value: fmt(now.checks), now: now.checks, prev: prev.checks, yearAgo: yearAgo.checks },
    { label: 'Гости', value: fmt(now.guests), now: now.guests, prev: prev.guests, yearAgo: yearAgo.guests },
    { label: 'Средний чек', value: `${fmt(avgCheckOf(now))} ${cur}`, now: avgCheckOf(now), prev: avgCheckOf(prev), yearAgo: avgCheckOf(yearAgo) },
    { label: 'Выручка на гостя', value: `${fmt(perGuestOf(now))} ${cur}`, now: perGuestOf(now), prev: perGuestOf(prev), yearAgo: perGuestOf(yearAgo) },
  ];

  // ——— Сравнение точек за период ———
  const locs = state.locations.filter((l) => inScope(l.id, scope));
  const byLoc = locs.map((l) => ({ l, t: periodTotals(state, l.id, kind, key, cmp.daysCompared === null ? undefined : cmp.daysCompared - 1) }));

  // ——— Себестоимость по инвентаризации ———
  const basis = state.settings.cogsBasis;
  const target = state.settings.cogsTargetPct;
  const basisName = basis === 'bar' ? 'бара' : 'общей';
  const cogsByLoc = locs.map((l) => ({ l, list: cogsPeriods(state, l.id) }));
  const cogsTone = (v: number | null) => (v === null ? '' : v <= target ? 'ok' : v <= target + 3 ? 'warn' : 'bad');
  const setBasis = (b: 'bar' | 'all') => update((s) => ({ ...s, settings: { ...s.settings, cogsBasis: b } }));

  // ——— Ввод дня ———
  const yesterday = addDays(todayISO(), -1);
  const [f, setF] = useState({ locationId: state.locations[0]?.id ?? '', date: yesterday, revenue: '', barRevenue: '', checks: '', guests: '' });
  const existing = state.dayMetrics.find((d) => d.locationId === f.locationId && d.date === f.date);
  // При выборе точки и даты, по которым день уже внесён, подставляем его цифры: так день можно поправить.
  useEffect(() => {
    const e = state.dayMetrics.find((d) => d.locationId === f.locationId && d.date === f.date);
    setF((p) => ({
      ...p,
      revenue: e ? String(e.revenue) : '',
      barRevenue: e ? String(e.barRevenue) : '',
      checks: e ? String(e.checks) : '',
      guests: e ? String(e.guests) : '',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.locationId, f.date]);

  const revenue = num(f.revenue);
  const barRevenue = num(f.barRevenue);
  const problem = !f.locationId
    ? 'Сначала добавьте точку в «Настройках».'
    : !f.date
      ? 'Укажите дату.'
      : f.date > todayISO()
        ? 'Дата в будущем.'
        : revenue <= 0
          ? 'Введите выручку за день.'
          : barRevenue > revenue
            ? 'Выручка бара не может быть больше общей выручки.'
            : '';
  const [saved, setSaved] = useState('');
  const add = () => {
    if (problem) return;
    const entry = { locationId: f.locationId, date: f.date, revenue, barRevenue, checks: Math.round(num(f.checks)), guests: Math.round(num(f.guests)) };
    update((s) => ({
      ...s,
      dayMetrics: [...s.dayMetrics.filter((m) => !(m.locationId === entry.locationId && m.date === entry.date)), { id: existing?.id ?? uid(), ...entry }],
    }));
    setSaved(`${existing ? 'Обновлено' : 'Сохранено'}: ${locName(state, entry.locationId)}, ${entry.date}`);
    // после сохранения готовим форму к следующему дню
    setF((p) => ({ ...p, date: addDays(p.date, 1) > yesterday ? p.date : addDays(p.date, 1) }));
  };

  // ——— Себестоимость по неделям (до месячного расчёта) ———
  const [cf, setCf] = useState({ locationId: state.locations[0]?.id ?? '', week: '', cogsPct: 28 });
  const addCogs = () => {
    if (!cf.week.trim() || !cf.locationId) return;
    update((s) => ({
      ...s,
      metrics: [
        ...s.metrics.filter((m) => !(m.locationId === cf.locationId && m.week === cf.week.trim())),
        { id: uid(), locationId: cf.locationId, week: cf.week.trim(), revenue: 0, checks: 0, cogsPct: cf.cogsPct },
      ],
    }));
  };
  const cogsRows = state.metrics.filter((m) => inScope(m.locationId, scope)).sort((a, b) => b.week.localeCompare(a.week));
  const dayRows = state.dayMetrics
    .filter((m) => inScope(m.locationId, scope))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60);

  const line = (label: string, t: DayTotals, now0: number, before: number) => (
    <div className="small muted">
      {label}: <span className={`pill ${tone(changePct(now0, before))}`}>{pct(changePct(now0, before))}</span>
      {t.days === 0 ? ' нет данных' : ''}
    </div>
  );

  return (
    <div className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Показатели</h2>
          <div className="row" style={{ gap: 6 }}>
            {KINDS.map((k) => (
              <button
                key={k.id}
                className={`btn sm ${kind === k.id ? '' : 'ghost'}`}
                onClick={() => {
                  setKind(k.id);
                  setShift(0);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'space-between', margin: '12px 0' }}>
          <button className="btn ghost sm" aria-label="Раньше" onClick={() => setShift(shift - 1)}>‹</button>
          <b style={{ textAlign: 'center' }}>{periodLabel(key, kind)}</b>
          <button className="btn ghost sm" aria-label="Позже" disabled={shift >= 0} onClick={() => setShift(shift + 1)}>›</button>
        </div>

        {now.days === 0 ? (
          <div className="empty">За этот период данных нет. Внесите день ниже.</div>
        ) : (
          <>
            {cmp.partial && (
              <p className="small muted" style={{ margin: '0 0 8px' }}>
                Период ещё не закончился: внесено дней {now.days}. Сравнение идёт с тем же числом дней ({cmp.daysCompared}) прошлых периодов.
              </p>
            )}
            <div className="grid kpis">
              {tiles.map((t) => (
                <div className="card kpi" key={t.label}>
                  <div className="label">{t.label}</div>
                  <div className="value">{t.value}</div>
                  {t.note && <div className="delta">{t.note}</div>}
                  {line('к прошлому', prev, t.now, t.prev)}
                  {line('к году назад', yearAgo, t.now, t.yearAgo)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Выручка по периодам</h2>
        {series.every((x) => x.t.days === 0) ? (
          <div className="empty">Данных пока нет.</div>
        ) : (
          <div className="bars" role="img" aria-label="Столбчатая диаграмма выручки по периодам">
            {series.map((x) => (
              <div className="bar" key={x.key}>
                <b>{x.t.days ? (x.t.revenue >= 1000 ? `${fmt(x.t.revenue / 1000)}к` : fmt(x.t.revenue)) : ''}</b>
                <i style={{ height: `${(x.t.revenue / max) * 130}px`, opacity: x.key === key ? 1 : 0.55 }} />
                <span>{periodShort(x.key, kind)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {locs.length > 1 && now.days > 0 && (
        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>По точкам · {periodLabel(key, kind)}</h2></div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Точка</th><th className="num">Выручка</th><th className="num">Бар</th><th className="num">Чеки</th><th className="num">Гости</th><th className="num">Средний чек</th></tr>
              </thead>
              <tbody>
                {byLoc.map(({ l, t }) => (
                  <tr key={l.id}>
                    <td><b>{l.name}</b></td>
                    <td className="num">{t.days ? `${fmt(t.revenue)} ${cur}` : '—'}</td>
                    <td className="num">{t.days ? `${fmt(t.barRevenue)} ${cur}` : '—'}</td>
                    <td className="num">{t.days ? fmt(t.checks) : '—'}</td>
                    <td className="num">{t.days ? fmt(t.guests) : '—'}</td>
                    <td className="num">{t.checks ? `${fmt(avgCheckOf(t))} ${cur}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Себестоимость по инвентаризации</h2>
          <div className="row" style={{ gap: 6 }}>
            <button className={`btn sm ${basis === 'bar' ? '' : 'ghost'}`} onClick={() => setBasis('bar')}>От бара</button>
            <button className={`btn sm ${basis === 'all' ? '' : 'ghost'}`} onClick={() => setBasis('all')}>От общей</button>
          </div>
        </div>
        <p className="small muted" style={{ margin: '8px 0' }}>
          Расход = остаток на начало + приходы − остаток на конец, в {cur} по средней цене позиций. Период идёт между двумя инвентаризациями точки. Процент считается от выручки {basisName}, цель {target}%.
        </p>
        {cogsByLoc.every((x) => x.list.length === 0) ? (
          <div className="empty">Нужны две инвентаризации на точке, приходы с суммами и выручка по дням. Первая инвентаризация — точка отсчёта.</div>
        ) : (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>Точка</th><th>Период</th><th className="num">Расход</th><th className="num">Из них списания</th><th className="num">Себестоимость</th><th className="num">Позиций</th></tr>
                </thead>
                <tbody>
                  {cogsByLoc.map(({ l, list }) => {
                    const p = list[0];
                    if (!p) return <tr key={l.id}><td><b>{l.name}</b></td><td colSpan={5} className="muted">нужна ещё одна инвентаризация</td></tr>;
                    const v = cogsPct(p, basis);
                    return (
                      <tr key={l.id}>
                        <td><b>{l.name}</b></td>
                        <td>{p.from} — {p.to}</td>
                        <td className="num">{fmt(p.cost)} {cur}</td>
                        <td className="num">{fmt(p.writeOffsValue)} {cur}</td>
                        <td className="num">{v === null ? '—' : <span className={`pill ${cogsTone(v)}`}>{v.toFixed(1)}%</span>}</td>
                        <td className="num">{p.counted} из {p.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {cogsByLoc.flatMap(({ l, list }) => {
              const p = list[0];
              if (!p) return [];
              const notes: string[] = [];
              if (cogsPct(p, basis) === null) notes.push('за этот период не внесена выручка, процент не посчитан');
              else if (p.revenueDays < p.periodDays) notes.push(`выручка внесена за ${p.revenueDays} из ${p.periodDays} дней, процент завышен`);
              if (p.noPrice.length) notes.push(`нет цены у позиций, они не учтены: ${p.noPrice.join(', ')}`);
              const skipped = p.total - p.counted - p.noPrice.length;
              if (skipped > 0) notes.push(`не пересчитано позиций: ${skipped}`);
              return notes.map((n) => <p className="small muted" style={{ margin: '6px 0 0' }} key={`${l.id}-${n}`}>{l.name}: {n}.</p>);
            })}
            {cogsByLoc.some((x) => x.list.length > 1) && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Прошлые периоды</summary>
                <div className="tablewrap" style={{ marginTop: 8 }}>
                  <table>
                    <tbody>
                      {cogsByLoc.flatMap(({ l, list }) =>
                        list.slice(1).map((p) => {
                          const v = cogsPct(p, basis);
                          return (
                            <tr key={`${l.id}-${p.to}`}>
                              <td>{l.name}</td>
                              <td>{p.from} — {p.to}</td>
                              <td className="num">{fmt(p.cost)} {cur}</td>
                              <td className="num">{v === null ? '—' : <span className={`pill ${cogsTone(v)}`}>{v.toFixed(1)}%</span>}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <div className="card" id="day-form">
        <h2>Внести день</h2>
        <div className="form">
          <div className="f">Точка
            <select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="f">Дата<input type="date" max={todayISO()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="f">Выручка, {cur}<input inputMode="decimal" value={f.revenue} onChange={(e) => setF({ ...f, revenue: e.target.value })} style={{ width: 120 }} /></div>
          <div className="f">Из них бар, {cur}<input inputMode="decimal" value={f.barRevenue} onChange={(e) => setF({ ...f, barRevenue: e.target.value })} style={{ width: 120 }} /></div>
          <div className="f">Чеки<input inputMode="numeric" value={f.checks} onChange={(e) => setF({ ...f, checks: e.target.value })} style={{ width: 90 }} /></div>
          <div className="f">Гости<input inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} style={{ width: 90 }} /></div>
          <button className="btn" onClick={add} disabled={!!problem}>{existing ? 'Обновить' : 'Сохранить'}</button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          {existing ? 'За этот день запись уже есть: цифры подставлены, после правки нажмите «Обновить». ' : ''}
          {problem && (f.revenue || f.barRevenue) ? problem : ''}
          {saved && !problem ? saved : ''}
        </p>
      </div>

      {dayRows.length > 0 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Внесённые дни (последние {dayRows.length})</summary>
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table>
              <tbody>
                {dayRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.date}</td>
                    <td>{locName(state, m.locationId)}</td>
                    <td className="num">{fmt(m.revenue)} {cur}</td>
                    <td className="num">бар {fmt(m.barRevenue)}</td>
                    <td className="num">{fmt(m.checks)} чек.</td>
                    <td className="num">{fmt(m.guests)} гост.</td>
                    <td>
                      <button
                        className="btn ghost sm"
                        onClick={() => {
                          setF({ ...f, locationId: m.locationId, date: m.date });
                          document.getElementById('day-form')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        Править
                      </button>{' '}
                      <button className="btn danger sm" onClick={() => update((s) => ({ ...s, dayMetrics: s.dayMetrics.filter((x) => x.id !== m.id) }))}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Себестоимость по неделям ({cogsRows.length})</summary>
        <p className="small muted" style={{ marginTop: 8 }}>Пока вносится вручную. Дальше её заменит расчёт по приходам и инвентаризации.</p>
        <div className="form">
          <div className="f">Точка
            <select value={cf.locationId} onChange={(e) => setCf({ ...cf, locationId: e.target.value })}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="f">Неделя<input style={{ width: 110 }} placeholder="2026-W43" value={cf.week} onChange={(e) => setCf({ ...cf, week: e.target.value })} /></div>
          <div className="f">Себест., %<input type="number" min={0} max={100} step="0.1" value={cf.cogsPct} onChange={(e) => setCf({ ...cf, cogsPct: +e.target.value })} /></div>
          <button className="btn" onClick={addCogs}>Сохранить</button>
        </div>
        {cogsRows.length > 0 && (
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table>
              <tbody>
                {cogsRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.week}</td>
                    <td>{locName(state, m.locationId)}</td>
                    <td className="num">{m.cogsPct}%</td>
                    <td><button className="btn danger sm" onClick={() => update((s) => ({ ...s, metrics: s.metrics.filter((x) => x.id !== m.id) }))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
