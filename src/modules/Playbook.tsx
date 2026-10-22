import { useState } from 'react';
import { MODULES, PLAYBOOK } from '../config';
import { playbookProgress, playbookStages, playbookToReview, todayISO, uid, useStore, type PlaybookStep } from '../store';
import type { ModuleId, PlaybookNote } from '../types';

const EMPTY: PlaybookNote = { result: '', found: '' };

export default function Playbook({ go }: { go: (id: ModuleId) => void }) {
  const { state, update } = useStore();
  const stages = playbookStages(state);
  const { done: doneCount, total } = playbookProgress(state);
  const firstOpen = stages.find((st) => st.items.some((i) => !state.playbook.includes(i.id)));
  const review = playbookToReview(state);
  const allSteps = stages.flatMap((s) => s.items);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaybookNote>(EMPTY);
  const [target, setTarget] = useState<Record<string, string>>({});

  const moduleOn = (id: ModuleId) => MODULES.find((m) => m.id === id)?.locked || state.settings.modules[id];
  const moduleTitle = (id: ModuleId) => MODULES.find((m) => m.id === id)?.title ?? id;

  const openNote = (id: string) => {
    setDraft({ ...EMPTY, ...state.playbookNotes[id] });
    setEditing(id);
  };

  const toggle = (id: string) => {
    const on = state.playbook.includes(id);
    update((s) => {
      const prev = s.playbookNotes[id] ?? EMPTY;
      return {
        ...s,
        playbook: on ? s.playbook.filter((x) => x !== id) : [...s.playbook, id],
        playbookNotes: { ...s.playbookNotes, [id]: { ...prev, doneAt: on ? undefined : todayISO() } },
      };
    });
    if (!on) openNote(id);
  };

  const saveNote = () => {
    if (!editing) return;
    const id = editing;
    update((s) => {
      const prev = s.playbookNotes[id] ?? EMPTY;
      const found = draft.found.trim();
      return {
        ...s,
        playbookNotes: {
          ...s.playbookNotes,
          [id]: { ...prev, result: draft.result.trim(), found, foundDone: found === prev.found.trim() ? prev.foundDone : false },
        },
      };
    });
    setEditing(null);
  };

  const markReviewed = (stepId: string) =>
    update((s) => ({ ...s, playbookNotes: { ...s.playbookNotes, [stepId]: { ...(s.playbookNotes[stepId] ?? EMPTY), foundDone: true } } }));

  const addToPlan = (stepId: string, text: string) => {
    const stageId = target[stepId] ?? firstOpen?.id ?? PLAYBOOK[0].id;
    update((s) => ({
      ...s,
      playbookCustom: [...s.playbookCustom, { id: `c-${uid()}`, stageId, text, created: todayISO(), fromStep: stepId }],
      playbookNotes: { ...s.playbookNotes, [stepId]: { ...(s.playbookNotes[stepId] ?? EMPTY), foundDone: true } },
    }));
  };

  const removeCustom = (id: string) => {
    if (!confirm('Удалить свой шаг из плана?')) return;
    update((s) => {
      const notes = { ...s.playbookNotes };
      delete notes[id];
      return { ...s, playbookCustom: s.playbookCustom.filter((c) => c.id !== id), playbook: s.playbook.filter((x) => x !== id), playbookNotes: notes };
    });
  };

  const renderStep = (it: PlaybookStep) => {
    const on = state.playbook.includes(it.id);
    const note = state.playbookNotes[it.id];
    return (
      <div key={it.id} style={{ marginBottom: 12 }}>
        <label className={`check ${on ? 'done' : ''}`}>
          <input type="checkbox" checked={on} onChange={() => toggle(it.id)} />
          <span>{it.text}</span>
        </label>
        <div style={{ paddingLeft: 28 }}>
          {it.done && <p className="small muted" style={{ margin: '2px 0 6px' }}>Готово, когда: {it.done}</p>}
          {note && (note.result || note.found || note.doneAt) && (
            <div className="small" style={{ margin: '0 0 6px' }}>
              {note.doneAt && on && <div className="muted">Выполнено {note.doneAt}</div>}
              {note.result && <div><b>Итог:</b> {note.result}</div>}
              {note.found && <div><b>Что всплыло:</b> {note.found}{note.foundDone ? ' (разобрано)' : ''}</div>}
            </div>
          )}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {it.module && moduleOn(it.module) && (
              <button className="btn ghost sm" onClick={() => go(it.module!)}>→ {moduleTitle(it.module)}</button>
            )}
            {!it.module && !it.custom && <span className="pill">вне панели</span>}
            {it.custom && <span className="pill">свой шаг</span>}
            <button className="btn ghost sm" onClick={() => openNote(it.id)}>{note && (note.result || note.found) ? '✎ Заметка' : '+ Заметка'}</button>
            {it.custom && <button className="btn danger sm" onClick={() => removeCustom(it.id)}>Удалить</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="card">
        <h2>Общий прогресс</h2>
        <p className="muted small">
          {doneCount} из {total} шагов.{' '}
          {firstOpen ? `Сейчас этап: «${firstOpen.title}» (${firstOpen.period}).` : 'Все этапы пройдены — пора собрать план на следующий квартал.'}
        </p>
        <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} /></div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Отметили шаг — запишите итог и то, что всплыло по ходу. Всплывшее копится в блоке «Для разбора»: его можно добавить в план своим шагом.
        </p>
      </div>

      {review.length > 0 && (
        <div className="card">
          <h2>Для разбора</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Вопросы и идеи, которых не было в плане.</p>
          {review.map((r) => (
            <div key={r.stepId} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <div>{r.found}</div>
              <div className="small muted" style={{ margin: '4px 0 8px' }}>
                Из шага: {r.text}{r.date ? ` · ${r.date}` : ''}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <select value={target[r.stepId] ?? firstOpen?.id ?? PLAYBOOK[0].id} onChange={(e) => setTarget({ ...target, [r.stepId]: e.target.value })} aria-label="Этап">
                  {PLAYBOOK.map((st) => (
                    <option key={st.id} value={st.id}>{st.title} ({st.period})</option>
                  ))}
                </select>
                <button className="btn sm" onClick={() => addToPlan(r.stepId, r.found)}>В план</button>
                <button className="btn ghost sm" onClick={() => markReviewed(r.stepId)}>Разобрано</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid two">
        {stages.map((st) => {
          const done = st.items.filter((i) => state.playbook.includes(i.id)).length;
          return (
            <div className="card stage" key={st.id}>
              <div className="row spread">
                <h2>{st.title}</h2>
                <span className={`pill ${done === st.items.length ? 'ok' : ''}`}>{st.period}</span>
              </div>
              <p className="muted small" style={{ marginBottom: 10 }}>{st.goal}</p>
              <div>{st.items.map(renderStep)}</div>
              <p className="small muted">{done} из {st.items.length}</p>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Заметка к шагу</h3>
            <p className="small muted" style={{ margin: '4px 0 8px' }}>{allSteps.find((i) => i.id === editing)?.text}</p>
            <label className="small">Итог: что получилось, какие цифры</label>
            <textarea rows={3} value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })} placeholder="Например: баллы аудита 92, 78, 85" />
            <label className="small" style={{ display: 'block', marginTop: 8 }}>Что всплыло: вопрос или идея вне плана</label>
            <textarea rows={3} value={draft.found} onChange={(e) => setDraft({ ...draft, found: e.target.value })} placeholder="Например: в пик на второй точке не хватает рук" />
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>Пропустить</button>
              <button className="btn" onClick={saveNote}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
