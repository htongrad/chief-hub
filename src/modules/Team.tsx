import { useState } from 'react';
import { ROLE_LABEL, SKILLS, SKILL_LEVELS } from '../config';
import { attestStatus, inScope, locName, todayISO, uid, useStore } from '../store';
import type { StaffRole } from '../types';

export default function Team() {
  const { state, update } = useStore();
  const scope = state.settings.activeLocation;
  const staff = state.staff.filter((s) => inScope(s.locationId, scope));

  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('barista');
  const [loc, setLoc] = useState(state.locations[0]?.id ?? '');

  const cycle = (id: string, skill: string) =>
    update((s) => ({
      ...s,
      staff: s.staff.map((p) => (p.id === id ? { ...p, skills: { ...p.skills, [skill]: ((p.skills[skill] ?? 0) + 1) % 4 } } : p)),
    }));

  const add = () => {
    if (!name.trim() || !loc) return;
    update((s) => ({ ...s, staff: [...s.staff, { id: uid(), name: name.trim(), role, locationId: loc, skills: {} }] }));
    setName('');
  };

  const remove = (id: string) => {
    if (confirm('Удалить сотрудника?')) update((s) => ({ ...s, staff: s.staff.filter((p) => p.id !== id), attestations: s.attestations.filter((a) => a.staffId !== id) }));
  };

  const [att, setAtt] = useState({ staffId: '', passed: true, note: '' });
  const addAttestation = () => {
    const staffId = att.staffId || staff[0]?.id;
    if (!staffId) return;
    update((s) => ({ ...s, attestations: [{ id: uid(), staffId, date: todayISO(), passed: att.passed, note: att.note.trim() }, ...s.attestations] }));
    setAtt({ ...att, note: '' });
  };

  const avg = (p: { skills: Record<string, number> }) => SKILLS.reduce((a, k) => a + (p.skills[k.id] ?? 0), 0) / SKILLS.length;

  // «Слабое место»: навык с самым низким средним уровнем по выбранной области
  const weakest = SKILLS.map((k) => ({ k, v: staff.length ? staff.reduce((a, p) => a + (p.skills[k.id] ?? 0), 0) / staff.length : 0 })).sort((a, b) => a.v - b.v)[0];

  return (
    <div className="stack">
      {staff.length > 0 && weakest && (
        <div className="alert warn">
          <div>
            <b>Слабое место команды: {weakest.k.title.toLowerCase()}</b>
            <div className="small muted">средний уровень {weakest.v.toFixed(1)} из 3 — хороший кандидат на следующее обучение</div>
          </div>
        </div>
      )}

      <div className="card flat">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                {SKILLS.map((k) => <th key={k.id}>{k.title}</th>)}
                <th className="num">Средний</th>
                <th>Аттестация</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr><td colSpan={SKILLS.length + 4}><div className="empty">Пока никого нет. Добавьте первого сотрудника ниже.</div></td></tr>
              )}
              {staff.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <div className="small muted">{ROLE_LABEL[p.role]} · {locName(state, p.locationId)}</div>
                  </td>
                  {SKILLS.map((k) => {
                    const lvl = p.skills[k.id] ?? 0;
                    return (
                      <td key={k.id}>
                        <button className="skillbtn" onClick={() => cycle(p.id, k.id)} title={`${k.title}: ${SKILL_LEVELS[lvl]}. Нажмите, чтобы изменить`} aria-label={`${p.name}, ${k.title}: ${SKILL_LEVELS[lvl]}`}>
                          <span className="dots">{[1, 2, 3].map((i) => <span key={i} className={`dot ${lvl >= i ? 'on' : ''}`} />)}</span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="num">{avg(p).toFixed(1)}</td>
                  <td>
                    {(() => {
                      const a = attestStatus(state, p.id);
                      if (a.state === 'none') return <span className="pill">не проходил</span>;
                      const label = a.state === 'ok' ? 'действует' : a.state === 'due' ? 'просрочена' : 'не пройдена';
                      return (
                        <>
                          <span className={`pill ${a.state === 'ok' ? 'ok' : a.state === 'due' ? 'warn' : 'bad'}`}>{label}</span>
                          <div className="small muted">{a.last?.date}</div>
                        </>
                      );
                    })()}
                  </td>
                  <td><button className="btn danger sm" onClick={() => remove(p.id)}>Удалить</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small muted">Нажмите на точки, чтобы изменить уровень навыка: — → учится → уверенно → может учить.</p>

      <div className="card">
        <h2>Добавить сотрудника</h2>
        <div className="form">
          <div className="f">Имя<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
          <div className="f">Должность
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="f">Точка
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button className="btn" onClick={add}>Добавить</button>
        </div>
      </div>

      <div className="card">
        <h2>Записать аттестацию</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>Аттестация действует {state.settings.attestDays} дн., потом считается просроченной. Срок меняется в «Настройках».</p>
        <div className="form">
          <div className="f">Сотрудник
            <select value={att.staffId || staff[0]?.id || ''} onChange={(e) => setAtt({ ...att, staffId: e.target.value })}>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.name} · {locName(state, p.locationId)}</option>)}
            </select>
          </div>
          <div className="f">Результат
            <select value={att.passed ? 'yes' : 'no'} onChange={(e) => setAtt({ ...att, passed: e.target.value === 'yes' })}>
              <option value="yes">Пройдена</option>
              <option value="no">Не пройдена</option>
            </select>
          </div>
          <div className="f" style={{ flex: 1, minWidth: 180 }}>Заметка<input value={att.note} onChange={(e) => setAtt({ ...att, note: e.target.value })} placeholder="Что подтвердил, что подтянуть" /></div>
          <button className="btn" onClick={addAttestation} disabled={staff.length === 0}>Записать</button>
        </div>
      </div>
    </div>
  );
}
