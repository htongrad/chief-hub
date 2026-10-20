import { PLAYBOOK } from '../config';
import { useStore } from '../store';

export default function Playbook() {
  const { state, update } = useStore();
  const toggle = (id: string) =>
    update((s) => ({ ...s, playbook: s.playbook.includes(id) ? s.playbook.filter((x) => x !== id) : [...s.playbook, id] }));

  const total = PLAYBOOK.reduce((a, s) => a + s.items.length, 0);
  const firstOpen = PLAYBOOK.find((st) => st.items.some((i) => !state.playbook.includes(i.id)));

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <div>
            <h2>Общий прогресс</h2>
            <p className="muted small">
              {state.playbook.length} из {total} шагов.{' '}
              {firstOpen ? `Сейчас этап: «${firstOpen.title}» (${firstOpen.period}).` : 'Все этапы пройдены — пора обновлять план под новые цели сети.'}
            </p>
          </div>
        </div>
        <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${(state.playbook.length / total) * 100}%` }} /></div>
      </div>

      <div className="grid two">
        {PLAYBOOK.map((st) => {
          const done = st.items.filter((i) => state.playbook.includes(i.id)).length;
          return (
            <div className="card stage" key={st.id}>
              <div className="row spread">
                <h2>{st.title}</h2>
                <span className={`pill ${done === st.items.length ? 'ok' : ''}`}>{st.period}</span>
              </div>
              <p className="muted small">{st.goal}</p>
              <div>
                {st.items.map((it) => {
                  const on = state.playbook.includes(it.id);
                  return (
                    <label className={`check ${on ? 'done' : ''}`} key={it.id}>
                      <input type="checkbox" checked={on} onChange={() => toggle(it.id)} />
                      <span>{it.text}</span>
                    </label>
                  );
                })}
              </div>
              <p className="small muted">{done} из {st.items.length}</p>
            </div>
          );
        })}
      </div>
      <p className="small muted">План универсальный: его пункты лежат в файле <code>src/config.ts</code> и редактируются под любую сеть.</p>
    </div>
  );
}
