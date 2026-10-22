import { useState } from 'react';
import { AUDIT_ITEM_TEXT, MYSTERY_CHECKS, ROUND_CHECKS, type AuditGroup } from '../config';
import { auditScore, inScope, locName, serviceScore, todayISO, uid, useStore } from '../store';

type Answers = Record<string, 0 | 1 | 2>;
const CHOICES: { v: 0 | 1 | 2; label: string }[] = [
  { v: 2, label: 'Да' },
  { v: 1, label: 'Частично' },
  { v: 0, label: 'Нет' },
];

/** Бланк: у каждого пункта три кнопки. Повторное нажатие снимает оценку (пункт пропущен). */
function AuditSheet({ groups, answers, onChange }: { groups: AuditGroup[]; answers: Answers; onChange: (a: Answers) => void }) {
  const pick = (id: string, v: 0 | 1 | 2) => {
    const next = { ...answers };
    if (next[id] === v) delete next[id];
    else next[id] = v;
    onChange(next);
  };
  return (
    <>
      {groups.map((g) => (
        <div key={g.group} style={{ marginTop: 10 }}>
          <h3>{g.group}</h3>
          {g.items.map((it) => (
            <div className="audit-item" key={it.id}>
              <span>{it.text}</span>
              <div className="seg" role="group" aria-label={it.text}>
                {CHOICES.map((c) => (
                  <button key={c.v} type="button" className={`${answers[it.id] === c.v ? 'on' : ''} v${c.v}`} onClick={() => pick(it.id, c.v)}>{c.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export default function Rounds() {
  const { state, update } = useStore();
  const { visitMinScore } = state.settings;
  const scope = state.settings.activeLocation;
  const defLoc = scope !== 'all' ? scope : state.locations[0]?.id ?? '';

  const visits = state.visits.filter((v) => inScope(v.locationId, scope)).sort((a, b) => b.date.localeCompare(a.date));
  const complaints = state.complaints
    .filter((c) => inScope(c.locationId, scope))
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.date.localeCompare(a.date));
  const praiseCount = complaints.filter((c) => c.kind === 'praise').length;

  const [round, setRound] = useState<{ locationId: string; answers: Answers; note: string }>({ locationId: defLoc, answers: {}, note: '' });
  const [mystery, setMystery] = useState<{ locationId: string; answers: Answers; note: string }>({ locationId: defLoc, answers: {}, note: '' });
  const [cm, setCm] = useState<{ locationId: string; kind: 'complaint' | 'praise'; text: string }>({ locationId: defLoc, kind: 'complaint', text: '' });

  const roundRes = auditScore(round.answers);
  const mysteryRes = auditScore(mystery.answers);
  const roundTotal = ROUND_CHECKS.reduce((a, g) => a + g.items.length, 0);
  const mysteryTotal = MYSTERY_CHECKS.reduce((a, g) => a + g.items.length, 0);

  const saveRound = () => {
    if (roundRes.score === null) return;
    update((s) => ({ ...s, visits: [{ id: uid(), locationId: round.locationId || defLoc, date: todayISO(), kind: 'round', score: roundRes.score as number, note: round.note.trim(), answers: round.answers }, ...s.visits] }));
    setRound({ ...round, answers: {}, note: '' });
  };
  const saveMystery = () => {
    if (mysteryRes.score === null) return;
    update((s) => ({ ...s, visits: [{ id: uid(), locationId: mystery.locationId || defLoc, date: todayISO(), kind: 'mystery', score: mysteryRes.score as number, note: mystery.note.trim(), answers: mystery.answers }, ...s.visits] }));
    setMystery({ ...mystery, answers: {}, note: '' });
  };
  const saveComplaint = () => {
    if (!cm.text.trim()) return;
    update((s) => ({ ...s, complaints: [{ id: uid(), locationId: cm.locationId || defLoc, date: todayISO(), text: cm.text.trim(), resolved: cm.kind === 'praise', kind: cm.kind }, ...s.complaints] }));
    setCm({ ...cm, text: '' });
  };
  const toggleComplaint = (id: string) => update((s) => ({ ...s, complaints: s.complaints.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)) }));
  const removeComplaint = (id: string) => confirm('Удалить жалобу?') && update((s) => ({ ...s, complaints: s.complaints.filter((c) => c.id !== id) }));
  const removeVisit = (id: string) => confirm('Удалить запись?') && update((s) => ({ ...s, visits: s.visits.filter((v) => v.id !== id) }));

  const weakItems = (a?: Answers) => {
    const ids = a ? Object.keys(a).filter((id) => a[id] === 0 && AUDIT_ITEM_TEXT[id]) : [];
    return ids.length ? ids.slice(0, 3).map((id) => AUDIT_ITEM_TEXT[id]).join('; ') + (ids.length > 3 ? ` и ещё ${ids.length - 3}` : '') : '';
  };
  const scoreClass = (v: number) => (v >= visitMinScore ? 'ok' : v >= visitMinScore - 10 ? 'warn' : 'bad');

  return (
    <div className="stack">
      <div className="card">
        <h2>Качество сервиса по точкам</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>Средний балл обходов и тайного гостя за 30 дней. Минимальный балл {visitMinScore}% задаётся в «Настройках».{praiseCount > 0 && ` Похвал в списке: ${praiseCount}.`}</p>
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
          <AuditSheet groups={ROUND_CHECKS} answers={round.answers} onChange={(answers) => setRound({ ...round, answers })} />
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1 }} placeholder="Заметка (необязательно)" value={round.note} onChange={(e) => setRound({ ...round, note: e.target.value })} />
            <button className="btn" onClick={saveRound} disabled={roundRes.score === null}>Сохранить</button>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Оценено {roundRes.answered} из {roundTotal}: {roundRes.score === null ? '—' : <span className={`pill ${scoreClass(roundRes.score)}`}>{roundRes.score}%</span>}
            <span className="muted"> · неприменимый пункт можно не отмечать, он не считается</span>
          </p>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Тайный гость</h2>
            <p className="muted small" style={{ marginBottom: 6 }}>Короткий бланк: только то, что видит и чувствует гость. Заполняет гость или вы со слов гостя.</p>
            <div className="form">
              <div className="f">Точка
                <select value={mystery.locationId} onChange={(e) => setMystery({ ...mystery, locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <AuditSheet groups={MYSTERY_CHECKS} answers={mystery.answers} onChange={(answers) => setMystery({ ...mystery, answers })} />
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ flex: 1 }} placeholder="Что отметил гость" value={mystery.note} onChange={(e) => setMystery({ ...mystery, note: e.target.value })} />
              <button className="btn" onClick={saveMystery} disabled={mysteryRes.score === null}>Записать</button>
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              Оценено {mysteryRes.answered} из {mysteryTotal}: {mysteryRes.score === null ? '—' : <span className={`pill ${scoreClass(mysteryRes.score)}`}>{mysteryRes.score}%</span>}
            </p>
          </div>

          <div className="card">
            <h2>Отзыв гостя</h2>
            <div className="seg" role="group" aria-label="Тип отзыва" style={{ marginBottom: 10 }}>
              <button type="button" className={cm.kind === 'complaint' ? 'on v0' : ''} onClick={() => setCm({ ...cm, kind: 'complaint' })}>Жалоба</button>
              <button type="button" className={cm.kind === 'praise' ? 'on v2' : ''} onClick={() => setCm({ ...cm, kind: 'praise' })}>Похвала</button>
            </div>
            <div className="form">
              <div className="f">Точка
                <select value={cm.locationId} onChange={(e) => setCm({ ...cm, locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ flex: 1 }} placeholder={cm.kind === 'praise' ? 'За что похвалили' : 'Суть жалобы'} value={cm.text} onChange={(e) => setCm({ ...cm, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveComplaint()} />
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
                    <td>{locName(state, v.locationId)}{v.note && <div className="small muted">{v.note}</div>}{weakItems(v.answers) && <div className="small muted">Слабое: {weakItems(v.answers)}</div>}</td>
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
          <div style={{ padding: '14px 16px 0' }}><h2>Отзывы гостей</h2></div>
          <div className="tablewrap">
            <table>
              <tbody>
                {complaints.length === 0 && <tr><td><div className="empty">Отзывов пока нет.</div></td></tr>}
                {complaints.slice(0, 12).map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.text}
                      <div className="small muted">{locName(state, c.locationId)} · {c.date}</div>
                    </td>
                    <td>{c.kind === 'praise' ? <span className="pill ok">похвала</span> : c.resolved ? <span className="pill ok">решена</span> : <span className="pill warn">открыта</span>}</td>
                    <td>
                      <div className="row">
                        {c.kind !== 'praise' && <button className="btn ghost sm" onClick={() => toggleComplaint(c.id)}>{c.resolved ? 'Вернуть' : 'Решена'}</button>}
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
