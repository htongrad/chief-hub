import { useRef, useState } from 'react';
import { MODULES } from '../config';
import { migrate, uid, useStore } from '../store';
import { APPS_SCRIPT, isScriptUrl, pushBackup, saveBackupConfig, useBackupConfig } from '../backup';

/** Блок «Резервная копия на Google Диске»: адрес скрипта, автосохранение, статус. */
function DriveBackup() {
  const { state } = useStore();
  const cfg = useBackupConfig();
  const [url, setUrl] = useState(cfg.url);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const ready = isScriptUrl(cfg.url);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT);
      setNote('Код скопирован. Вставьте его в редактор скрипта.');
    } catch {
      setNote('Не получилось скопировать автоматически. Откройте «Показать код» ниже и скопируйте вручную.');
    }
  };
  const saveUrl = () => {
    const u = url.trim();
    if (!isScriptUrl(u)) return setNote('Адрес должен начинаться с https://script.google.com/macros/s/ и заканчиваться на /exec.');
    saveBackupConfig({ url: u, lastError: null });
    setNote('Адрес сохранён. Сохраняю первую копию…');
    void runNow();
  };
  const runNow = async () => {
    setBusy(true);
    const ok = await pushBackup(state);
    setBusy(false);
    setNote(ok ? 'Готово: копия на Диске.' : '');
  };

  return (
    <div className="card">
      <h2>Резервная копия на Google Диске</h2>
      <p className="muted small" style={{ marginBottom: 10 }}>
        Данные панели хранятся только в этом браузере. Копия на вашем Google Диске защищает их и показывает всё в виде таблицы: папка «Chief Hub», таблица по разделам и копии данных за последние 30 дней.
      </p>

      <div className="alert" style={{ marginBottom: 10 }}>
        <div style={{ flex: 1 }} className="small">
          {!ready && <>Не настроено. Инструкция в шагах ниже.</>}
          {ready && cfg.lastOk && <>Последняя копия: <b>{new Date(cfg.lastOk).toLocaleString('ru-RU')}</b>{cfg.auto ? ' · автосохранение включено' : ' · только вручную'}</>}
          {ready && !cfg.lastOk && !cfg.lastError && <>Адрес сохранён, копий ещё не было.</>}
          {cfg.lastError && <div style={{ color: 'var(--bad)', marginTop: 4 }}>{cfg.lastError}</div>}
        </div>
      </div>

      <ol className="small" style={{ paddingLeft: 18, margin: '0 0 10px' }}>
        <li>Нажмите «Скопировать код скрипта».</li>
        <li>Откройте script.google.com, войдите в свой Google, нажмите «Новый проект», удалите всё в редакторе и вставьте код.</li>
        <li>Нажмите «Сохранить», затем «Развернуть» → «Новое развертывание» → тип «Веб-приложение». Выполнять от имени: «Я». Доступ: «Все».</li>
        <li>Разрешите доступ к своему аккаунту. Если Google предупредит, что приложение не проверено: «Дополнительные настройки» → «Перейти на страницу проекта».</li>
        <li>Скопируйте «URL веб-приложения» (заканчивается на /exec), вставьте его ниже и нажмите «Сохранить адрес».</li>
      </ol>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={copyCode}>Скопировать код скрипта</button>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="small muted">Показать код</summary>
        <textarea readOnly rows={8} style={{ width: '100%', marginTop: 6, fontFamily: 'monospace', fontSize: 12 }} value={APPS_SCRIPT} onFocus={(e) => e.currentTarget.select()} />
      </details>

      <div className="row" style={{ marginTop: 10 }}>
        <input style={{ flex: 1 }} placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Адрес веб-приложения" />
        <button className="btn" onClick={saveUrl}>Сохранить адрес</button>
      </div>

      <label className="toggle" style={{ marginTop: 10 }}>
        <span><b>Сохранять автоматически</b><div className="small muted">Через минуту после изменений и при открытии панели, если копии не было больше 6 часов.</div></span>
        <input type="checkbox" checked={cfg.auto} onChange={(e) => saveBackupConfig({ auto: e.target.checked })} />
      </label>

      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn" disabled={!ready || busy} onClick={runNow}>{busy ? 'Сохраняю…' : 'Сохранить сейчас'}</button>
        {cfg.sheetUrl && <a className="btn ghost" href={cfg.sheetUrl} target="_blank" rel="noreferrer">Открыть таблицу</a>}
        {cfg.folderUrl && <a className="btn ghost" href={cfg.folderUrl} target="_blank" rel="noreferrer">Открыть папку</a>}
      </div>
      {note && <p className="small" style={{ marginTop: 10 }}>{note}</p>}
      <p className="small muted" style={{ marginTop: 10 }}>
        Адрес скрипта никому не передавайте: по нему можно записать данные в вашу таблицу. Восстановить данные: скачайте с Диска файл chief-hub-backup.json и нажмите «Загрузить из файла» в блоке «Данные».
      </p>
    </div>
  );
}

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

      <DriveBackup />

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
