import { useState } from 'react';
import { buildReport, useStore } from '../store';

export default function Report() {
  const { state, update } = useStore();
  const scope = state.settings.activeLocation;
  const report = buildReport(state, scope);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      ?.writeText(report.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <div>
            <h2>{report.heading}</h2>
            <p className="muted small">Собирается сам из данных панели. Выберите точку или всю сеть вверху, допишите комментарий и скопируйте.</p>
          </div>
          <button className="btn" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать отчёт'}</button>
        </div>
      </div>

      <div className="grid two">
        {report.sections
          .filter((s) => s.title !== 'Комментарий шефа')
          .map((s) => (
            <div className="card" key={s.title}>
              <h2>{s.title}</h2>
              <div className="stack" style={{ gap: 6 }}>
                {s.lines.map((l, i) => (
                  <p className="small" key={i}>• {l}</p>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className="card">
        <h2>Комментарий шефа</h2>
        <p className="muted small" style={{ marginBottom: 8 }}>Что важно знать руководителю сверх цифр. Попадёт в конец отчёта.</p>
        <textarea
          style={{ width: '100%', minHeight: 90 }}
          value={state.reportNote}
          onChange={(e) => update((s) => ({ ...s, reportNote: e.target.value }))}
          placeholder="Например: на Севере нужна замена кофемолки до конца месяца"
        />
      </div>
    </div>
  );
}
