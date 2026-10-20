import { useRef, useState } from 'react';
import { MODULES } from '../config';
import { migrate, uid, useStore } from '../store';

export default function SettingsPage() {
  const { state, update, replace, resetDemo } = useStore();
  const { settings } = state;
  const [newLoc, setNewLoc] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const setS = (patch: Partial<typeof settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));

  const addLoc = () => {
    if (!newLoc.trim()) return;
    update((s) => ({ ...s, locations: [...s.locations, { id: uid(), name: newLoc.trim() }] }));
    setNewLoc('');
  };
  const renameLoc = (id: string, name: string) => update((s) => ({ ...s, locations: s.locations.map((l) => (l.id === id ? { ...l, name } : l)) }));
  const removeLoc = (id: string) => {
    if (state.locations.length <= 1) return setMsg('Должна остаться хотя бы одна точка.');
    if (!confirm('Удалить точку вместе с её сотрудниками, журналами и показателями?')) return;
    update((s) => {
      const gone = new Set(s.staff.filter((p) => p.locationId === id).map((p) => p.id));
      return {
        ...s,
        locations: s.locations.filter((l) => l.id !== id),
        staff: s.staff.filter((p) => p.locationId !== id),
        attestations: s.attestations.filter((a) => !gone.has(a.staffId)),
        dialIns: s.dialIns.filter((x) => x.locationId !== id),
        cuppings: s.cuppings.filter((x) => x.locationId !== id),
        writeOffs: s.writeOffs.filter((x) => x.locationId !== id),
        metrics: s.metrics.filter((x) => x.locationId !== id),
        equipment: s.equipment.filter((x) => x.locationId !== id),
        repairs: s.repairs.filter((x) => x.locationId !== id),
        visits: s.visits.filter((x) => x.locationId !== id),
        complaints: s.complaints.filter((x) => x.locationId !== id),
        settings: { ...s.settings, activeLocation: s.settings.activeLocation === id ? 'all' : s.settings.activeLocation },
      };
    });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chief-hub-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const data = migrate(JSON.parse(await f.text()));
      if (!data) throw new Error('bad');
      replace(data);
      setMsg('Данные загружены.');
    } catch {
      setMsg('Не получилось прочитать файл. Нужен файл, сохранённый кнопкой «Скачать данные».');
    }
  };

  const clearAll = () => {
    if (!confirm('Стереть все демо-данные и начать с чистого листа? Точки останутся.')) return;
    update((s) => ({
      ...s,
      staff: [],
      attestations: [],
      dialIns: [],
      cuppings: [],
      recipes: [],
      inventory: [],
      writeOffs: [],
      metrics: [],
      equipment: [],
      repairs: [],
      visits: [],
      complaints: [],
      reportNote: '',
      playbook: [],
    }));
  };

  const num = (v: string, d: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

  return (
    <div className="stack">
      <div className="grid two">
        <div className="card">
          <h2>Сеть</h2>
          <div className="form">
            <div className="f">Название сети<input value={settings.networkName} onChange={(e) => setS({ networkName: e.target.value })} /></div>
            <div className="f">Валюта<input style={{ width: 70 }} value={settings.currency} onChange={(e) => setS({ currency: e.target.value })} /></div>
          </div>
          <h3 style={{ margin: '18px 0 8px' }}>Точки</h3>
          <div className="stack" style={{ gap: 8 }}>
            {state.locations.map((l) => (
              <div className="row" key={l.id}>
                <input style={{ flex: 1 }} value={l.name} onChange={(e) => renameLoc(l.id, e.target.value)} aria-label="Название точки" />
                <button className="btn danger sm" onClick={() => removeLoc(l.id)}>Удалить</button>
              </div>
            ))}
            <div className="row">
              <input style={{ flex: 1 }} placeholder="Новая точка" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLoc()} />
              <button className="btn" onClick={addLoc}>Добавить</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Разделы</h2>
          <p className="muted small">Включайте только то, чем пользуетесь. Лишнее скрывается из меню.</p>
          {MODULES.map((m) => (
            <label className="toggle" key={m.id}>
              <span><b>{m.icon} {m.title}</b><div className="small muted">{m.hint}</div></span>
              <input type="checkbox" checked={m.locked ? true : settings.modules[m.id]} disabled={m.locked} onChange={(e) => setS({ modules: { ...settings.modules, [m.id]: e.target.checked } })} />
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Нормы эспрессо</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>По ним раздел «Качество» решает, в норме ли настройка помола. Подберите под ваш рецепт.</p>
        <div className="form">
          <div className="f">Соотношение (выход ÷ доза)<input type="number" step="0.1" min={0.5} value={settings.espresso.ratio} onChange={(e) => setS({ espresso: { ...settings.espresso, ratio: num(e.target.value, 2) } })} /></div>
          <div className="f">Допуск по выходу, г<input type="number" step="0.5" min={0} value={settings.espresso.yieldTol} onChange={(e) => setS({ espresso: { ...settings.espresso, yieldTol: num(e.target.value, 2) } })} /></div>
          <div className="f">Время от, с<input type="number" min={0} value={settings.espresso.timeMin} onChange={(e) => setS({ espresso: { ...settings.espresso, timeMin: num(e.target.value, 25) } })} /></div>
          <div className="f">Время до, с<input type="number" min={0} value={settings.espresso.timeMax} onChange={(e) => setS({ espresso: { ...settings.espresso, timeMax: num(e.target.value, 30) } })} /></div>
        </div>
      </div>

      <div className="card">
        <h2>Нормы сети</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>По ним «Обзор» и «Отчёт» решают, что считать отклонением. Подберите под вашу сеть.</p>
        <div className="form">
          <div className="f">Целевая себестоимость, %<input type="number" step="0.5" min={0} max={100} value={settings.cogsTargetPct} onChange={(e) => setS({ cogsTargetPct: num(e.target.value, 28) })} /></div>
          <div className="f">Аттестация действует, дн.<input type="number" min={1} value={settings.attestDays} onChange={(e) => setS({ attestDays: Math.max(1, num(e.target.value, 180)) })} /></div>
          <div className="f">Минимальный балл обхода, %<input type="number" min={0} max={100} value={settings.visitMinScore} onChange={(e) => setS({ visitMinScore: num(e.target.value, 80) })} /></div>
        </div>
      </div>

      <div className="card">
        <h2>Данные</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>Сейчас всё хранится в этом браузере на этом устройстве. Скачайте копию, чтобы перенести данные или сохранить на всякий случай.</p>
        <div className="row">
          <button className="btn" onClick={exportData}>Скачать данные</button>
          <button className="btn ghost" onClick={() => file.current?.click()}>Загрузить из файла</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
          <button className="btn ghost" onClick={clearAll}>Очистить демо-данные</button>
          <button className="btn danger" onClick={() => confirm('Вернуть исходные демо-данные? Ваши изменения пропадут.') && resetDemo()}>Вернуть демо</button>
        </div>
        {msg && <p className="small" style={{ marginTop: 10 }}>{msg}</p>}
      </div>
    </div>
  );
}
