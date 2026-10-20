import { useState } from 'react';
import { ROUND_CHECKS, ROUND_CHECK_COUNT } from '../config';
import { inScope, locName, serviceScore, todayISO, uid, useStore } from '../store';

export default function Rounds() {
  const { state, update } = useStore();
  const { visitMinScore } = state.settings;
  const scope = state.settings.activeLocation;
  const defLoc = scope !== 'all' ? scope : state.locations[0]?.id ?? '';

  const visits = state.visits.filter((v) => inScope(v.locationId, scope)).sort((a, b) => b.date.localeCompare(a.date));
  const complaints = state.complaints
    .filter((c) => inScope(c.locationId, scope))
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.date.localeCompare(a.date));

  const [round, setRound] = useState<{ locationId: string; checked: Record<string, boolean>; note: string }>({ locationId: defLoc, checked: {}, note: '' });
  const [mystery, setMystery] = useState({ locationId: defLoc, score: 85, note: '' });
  const [cm, setCm] = useState({ locationId: defLoc, text: '' });

  const checkedCount = Object.values(round.checked).filter(Boolean).length;
  const roundScore = Math.round((checkedCount / ROUND_CHECK_COUNT) * 100);

  const saveRound = () => {
    update((s) => ({ ...s, visits: [{ id: uid(), locationId: round.locationId || defLoc, date: todayISO(), kind: 'round', score: roundScore, note: round.note.trim() }, ...s.visits] }));
    setRound({ ...round, checked: {}, note: '' });
  };
  const saveMystery = () => {
    update((s) => ({ ...s, visits: [{ id: uid(), locationId: mystery.locationId || defLoc, date: todayISO(), kind: 'mystery', score: Math.min(100, Math.max(0, mystery.score)), note: mystery.note.trim() }, ...s.visits] }));
    setMystery({ ...mystery, note: '' });
  };
  const saveComplaint = () => {
    if (!cm.text.trim()) return;
    update((s) => ({ ...s, complaints: [{ id: uid(), locationId: cm.locationId || defLoc, date: todayISO(), text: cm.text.trim(), resolved: false }, ...s.complaints] }));
    setCm({ ...cm, text: '' });
  };
  const toggleComplaint = (id: string) => update((s) => ({ ...s, complaints: s.complaints.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)) }));
  const removeComplaint = (id: string) => confirm('Удалить жалобу?') && update((s) => ({ ...s, complaints: s.complaints.filter((c) => c.id !== id) }));
  const removeVisit = (id: string) => confirm('Удалить запись?') && update((s) => ({ ...s, visits: s.visits.filter((v) => v.id !== id) }));

  const scoreClass = (v: number) => (v >= visitMinScore ? 'ok' : v >= visitMinScore - 10 ? 'warn' : 'bad');

  return (
    <div className="stack">
      <div className="card">
        <h2>Качество сервиса по точкам</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>Средний балл обходов и тайного гостя за 30 дней. Минимальный балл {visitMinScore}% задаётся в «Настройках».</p>
        <div className="grid kpis">
          {state.locations.filter((l) => inScope(l.id, scope)).map((l) => {
            const v = serviceScore(state, l.id, 30);
            return (
              <div className="kpi" key={l.id}>
                <div className="label">{l.name}</div>
                <div className="value">{v === null ? '—' : `${v}%`}</div>
                <div className="delta">{v === null ? 'обходов не было' : v >= visitMinScore ? 'в норме' : 'ниже минимума'}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Новый обход</h2>
          <div className="form">
            <div className="f">Точка
              <select value={round.locationId} onChange={(e) => setRound({ ...round, locationId: e.target.value })}>
                {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          {ROUND_CHECKS.map((g) => (
            <div key={g.group} style={{ marginTop: 10 }}>
              <h3>{g.group}</h3>
              {g.items.map((it) => (
                <label className="check" key={it.id}>
                  <input type="checkbox" checked={!!round.checked[it.id]} onChange={(e) => setRound({ ...round, checked: { ...round.checked, [it.id]: e.target.checked } })} />
                  <span>{it.text}</span>
                </label>
              ))}
            </div>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1 }} placeholder="Заметка (необязательно)" value={round.note} onChange={(e) => setRound({ ...round, note: e.target.value })} />
            <button className="btn" onClick={saveRound}>Сохранить</button>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Выполнено {checkedCount} из {ROUND_CHECK_COUNT}: <span className={`pill ${scoreClass(roundScore)}`}>{roundScore}%</span>
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Тайный гость</h2>
            <div className="form">
              <div className="f">Точка
                <select value={mystery.locationId} onChange={(e) => setMystery({ ...mystery, locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="f">Оценка, %<input type="number" min={0} max={100} value={mystery.score} onChange={(e) => setMystery({ ...mystery, score: +e.target.value })} /></div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ flex: 1 }} placeholder="Что отметил гость" value={mystery.note} onChange={(e) => setMystery({ ...mystery, note: e.target.value })} />
              <button className="btn" onClick={saveMystery}>Записать</button>
            </div>
          </div>

          <div className="card">
            <h2>Жалоба гостя</h2>
            <div className="form">
              <div className="f">Точка
                <select value={cm.locationId} onChange={(e) => setCm({ ...cm, locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ flex: 1 }} placeholder="Суть жалобы" value={cm.text} onChange={(e) => setCm({ ...cm, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveComplaint()} />
              <button className="btn" onClick={saveComplaint}>Записать</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Журнал обходов</h2></div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Дата</th><th>Точка</th><th>Вид</th><th className="num">Балл</th><th /></tr></thead>
              <tbody>
                {visits.length === 0 && <tr><td colSpan={5}><div className="empty">Обходов пока нет.</div></td></tr>}
                {visits.slice(0, 12).map((v) => (
                  <tr key={v.id}>
                    <td>{v.date}</td>
                    <td>{locName(state, v.locationId)}{v.note && <div className="small muted">{v.note}</div>}</td>
                    <td>{v.kind === 'round' ? 'Обход' : 'Тайный гость'}</td>
                    <td className="num"><span className={`pill ${scoreClass(v.score)}`}>{v.score}%</span></td>
                    <td><button className="btn danger sm" onClick={() => removeVisit(v.id)} aria-label="Удалить запись">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Жалобы гостей</h2></div>
          <div className="tablewrap">
            <table>
              <tbody>
                {complaints.length === 0 && <tr><td><div className="empty">Жалоб нет.</div></td></tr>}
                {complaints.slice(0, 12).map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.text}
                      <div className="small muted">{locName(state, c.locationId)} · {c.date}</div>
                    </td>
                    <td>{c.resolved ? <span className="pill ok">решена</span> : <span className="pill warn">открыта</span>}</td>
                    <td>
                      <div className="row">
                        <button className="btn ghost sm" onClick={() => toggleComplaint(c.id)}>{c.resolved ? 'Вернуть' : 'Решена'}</button>
                        <button className="btn danger sm" onClick={() => removeComplaint(c.id)} aria-label="Удалить жалобу">×</button>
                      </div>
                    </td>
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
