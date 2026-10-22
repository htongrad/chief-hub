import { useState } from 'react';
import type { ComplaintAction } from '../types';
import { AUDIT_ITEM_TEXT, COMPLAINT_ACTIONS, MYSTERY_CHECKS, ROUND_CHECKS, type AuditGroup } from '../config';
import { auditIssues, auditScore, inScope, locName, serviceScore, todayISO, uid, useStore } from '../store';

type Answers = Record<string, 0 | 1 | 2>;
type Notes = Record<string, string>;
const CHOICES: { v: 0 | 1 | 2; label: string }[] = [
  { v: 2, label: 'Да' },
  { v: 1, label: 'Частично' },
  { v: 0, label: 'Нет' },
];

/**
 * Бланк: у каждого пункта три кнопки. Повторное нажатие снимает оценку (пункт пропущен).
 * На «Частично» и «Нет» открывается окно для пояснения: что именно не так.
 */
function AuditSheet({ groups, answers, notes, onChange }: { groups: AuditGroup[]; answers: Answers; notes: Notes; onChange: (a: Answers, n: Notes) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const pick = (id: string, v: 0 | 1 | 2) => {
    const a = { ...answers };
    const n = { ...notes };
    if (a[id] === v) {
      delete a[id];
      delete n[id];
      onChange(a, n);
      return;
    }
    a[id] = v;
    if (v === 2) delete n[id];
    onChange(a, n);
    if (v !== 2) {
      setDraft(n[id] ?? '');
      setEditing(id);
    }
  };
  const openNote = (id: string) => {
    setDraft(notes[id] ?? '');
    setEditing(id);
  };
  const saveNote = () => {
    if (!editing) return;
    const n = { ...notes };
    if (draft.trim()) n[editing] = draft.trim();
    else delete n[editing];
    onChange(answers, n);
    setEditing(null);
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
              {(answers[it.id] === 0 || answers[it.id] === 1) && (
                <button type="button" className="note-link" onClick={() => openNote(it.id)}>
                  {notes[it.id] ? `Заметка: ${notes[it.id]}` : '+ Добавить заметку'}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{answers[editing] === 0 ? 'Нет' : 'Частично'}: что не так?</h3>
            <p className="small muted" style={{ margin: '4px 0 8px' }}>{AUDIT_ITEM_TEXT[editing]}</p>
            <textarea autoFocus rows={4} placeholder="Например: молоко без даты вскрытия, на складе открытая пачка" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>Без заметки</button>
              <button className="btn" onClick={saveNote}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
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

  const [round, setRound] = useState<{ locationId: string; answers: Answers; notes: Notes; note: string }>({ locationId: defLoc, answers: {}, notes: {}, note: '' });
  const [mystery, setMystery] = useState<{ locationId: string; answers: Answers; notes: Notes; note: string }>({ locationId: defLoc, answers: {}, notes: {}, note: '' });
  const [cm, setCm] = useState<{ locationId: string; kind: 'complaint' | 'praise'; text: string }>({ locationId: defLoc, kind: 'complaint', text: '' });

  const roundRes = auditScore(round.answers);
  const mysteryRes = auditScore(mystery.answers);
  const roundTotal = ROUND_CHECKS.reduce((a, g) => a + g.items.length, 0);
  const mysteryTotal = MYSTERY_CHECKS.reduce((a, g) => a + g.items.length, 0);

  const saveRound = () => {
    if (roundRes.score === null) return;
    update((s) => ({ ...s, visits: [{ id: uid(), locationId: round.locationId || defLoc, date: todayISO(), kind: 'round', score: roundRes.score as number, note: round.note.trim(), answers: round.answers, itemNotes: round.notes }, ...s.visits] }));
    setRound({ ...round, answers: {}, notes: {}, note: '' });
  };
  const saveMystery = () => {
    if (mysteryRes.score === null) return;
    update((s) => ({ ...s, visits: [{ id: uid(), locationId: mystery.locationId || defLoc, date: todayISO(), kind: 'mystery', score: mysteryRes.score as number, note: mystery.note.trim(), answers: mystery.answers, itemNotes: mystery.notes }, ...s.visits] }));
    setMystery({ ...mystery, answers: {}, notes: {}, note: '' });
  };
  const saveComplaint = () => {
    if (!cm.text.trim()) return;
    update((s) => ({ ...s, complaints: [{ id: uid(), locationId: cm.locationId || defLoc, date: todayISO(), text: cm.text.trim(), resolved: cm.kind === 'praise', kind: cm.kind }, ...s.complaints] }));
    setCm({ ...cm, text: '' });
  };
  const [closing, setClosing] = useState<{ id: string; action: ComplaintAction | ''; text: string } | null>(null);
  const reopenComplaint = (id: string) => update((s) => ({ ...s, complaints: s.complaints.map((c) => (c.id === id ? { ...c, resolved: false, resolvedDate: undefined, action: undefined, resolution: undefined } : c)) }));
  const closeComplaint = () => {
    if (!closing || !closing.action) return;
    const { id, action, text } = closing;
    update((s) => ({ ...s, complaints: s.complaints.map((c) => (c.id === id ? { ...c, resolved: true, resolvedDate: todayISO(), action, resolution: text.trim() } : c)) }));
    setClosing(null);
  };
  const removeComplaint = (id: string) => confirm('Удалить жалобу?') && update((s) => ({ ...s, complaints: s.complaints.filter((c) => c.id !== id) }));
  const removeVisit = (id: string) => confirm('Удалить запись?') && update((s) => ({ ...s, visits: s.visits.filter((v) => v.id !== id) }));

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
          <AuditSheet groups={ROUND_CHECKS} answers={round.answers} notes={round.notes} onChange={(answers, notes) => setRound({ ...round, answers, notes })} />
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
            <AuditSheet groups={MYSTERY_CHECKS} answers={mystery.answers} notes={mystery.notes} onChange={(answers, notes) => setMystery({ ...mystery, answers, notes })} />
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
                    <td>{locName(state, v.locationId)}{v.note && <div className="small muted">{v.note}</div>}{auditIssues(v.answers, v.itemNotes, AUDIT_ITEM_TEXT).map((t) => <div className="small muted" key={t}>{t}</div>)}</td>
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
                      {c.kind !== 'praise' && c.resolved && (c.action || c.resolution) && (
                        <div className="small muted">Закрыта{c.resolvedDate ? ` ${c.resolvedDate}` : ''}: {COMPLAINT_ACTIONS.find((a) => a.id === c.action)?.label ?? ''}{c.resolution ? ` — ${c.resolution}` : ''}</div>
                      )}
                    </td>
                    <td>{c.kind === 'praise' ? <span className="pill ok">похвала</span> : c.resolved ? <span className="pill ok">решена</span> : <span className="pill warn">открыта</span>}</td>
                    <td>
                      <div className="row">
                        {c.kind !== 'praise' && <button className="btn ghost sm" onClick={() => (c.resolved ? reopenComplaint(c.id) : setClosing({ id: c.id, action: '', text: '' }))}>{c.resolved ? 'Вернуть' : 'Закрыть'}</button>}
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
      {closing && (
        <div className="modal-bg" onClick={() => setClosing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Закрыть жалобу</h3>
            <p className="small muted" style={{ margin: '4px 0 8px' }}>{state.complaints.find((c) => c.id === closing.id)?.text}</p>
            {COMPLAINT_ACTIONS.map((a) => (
              <label className="check" key={a.id}>
                <input type="radio" name="complaint-action" checked={closing.action === a.id} onChange={() => setClosing({ ...closing, action: a.id })} />
                <span>{a.label}</span>
              </label>
            ))}
            <textarea rows={3} style={{ marginTop: 8 }} placeholder="Что сделали (необязательно)" value={closing.text} onChange={(e) => setClosing({ ...closing, text: e.target.value })} />
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setClosing(null)}>Отмена</button>
              <button className="btn" onClick={closeComplaint} disabled={!closing.action}>Закрыть жалобу</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
