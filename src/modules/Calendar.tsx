import { useState } from 'react';
import { SCHEDULE_KIND } from '../config';
import { isScriptUrl, saveBackupConfig, useBackupConfig } from '../backup';
import { syncCalendar, useProdCal } from '../calendarSync';
import {
  addDays,
  locName,
  overdueTasks,
  periodEnd,
  periodKey,
  periodLabel,
  periodStart,
  scheduleDay,
  scheduleMonth,
  shiftPeriod,
  taskDirty,
  tasksFor,
  tasksInPeriod,
  todayISO,
  uid,
  useStore,
  type PeriodKind,
} from '../store';
import type { ModuleId, ScheduleDay, ScheduleKind, Task } from '../types';

const KINDS: { id: PeriodKind; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const h1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const when = (t: Task) => (t.time ? (t.endTime ? `${t.time}–${t.endTime}` : t.time) : 'весь день');

export default function Calendar({ go }: { go: (id: ModuleId) => void }) {
  const [tab, setTab] = useState<'tasks' | 'schedule'>('tasks');
  return (
    <div className="stack">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'on accent' : ''} onClick={() => setTab('tasks')}>Задачи</button>
        <button role="tab" aria-selected={tab === 'schedule'} className={tab === 'schedule' ? 'on accent' : ''} onClick={() => setTab('schedule')}>График шефа</button>
      </div>
      {tab === 'tasks' ? <Tasks go={go} /> : <Schedule />}
    </div>
  );
}

/* ---------- Задачи ---------- */

function TaskRow({ t, showDate }: { t: Task; showDate: boolean }) {
  const { state, update } = useStore();
  const today = todayISO();
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState({ title: t.title, date: t.date, time: t.time ?? '', endTime: t.endTime ?? '', note: t.note ?? '', locationId: t.locationId ?? '' });

  const patch = (p: Partial<Task>) => update((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, ...p } : x)) }));
  const toggle = () => patch({ done: !t.done, doneAt: !t.done ? todayISO() : undefined });
  const remove = () => {
    if (!confirm(`Удалить задачу?${t.calId ? ' Она исчезнет и из Google Календаря.' : ''}`)) return;
    // Задача, которая уже была в Google Календаре, помечается удалённой: следующая синхронизация уберёт событие
    update((s) => ({ ...s, tasks: t.calId ? s.tasks.map((x) => (x.id === t.id ? { ...x, deleted: true } : x)) : s.tasks.filter((x) => x.id !== t.id) }));
  };
  const open = () => {
    setD({ title: t.title, date: t.date, time: t.time ?? '', endTime: t.endTime ?? '', note: t.note ?? '', locationId: t.locationId ?? '' });
    setEdit(true);
  };
  const save = () => {
    if (!d.title.trim() || !d.date) return;
    patch({ title: d.title.trim(), date: d.date, time: d.time || undefined, endTime: d.time && d.endTime ? d.endTime : undefined, note: d.note.trim() || undefined, locationId: d.locationId || undefined });
    setEdit(false);
  };

  if (edit) {
    return (
      <div className="task" style={{ display: 'block' }}>
        <div className="form">
          <div className="f" style={{ flex: '1 1 220px' }}>Задача<input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></div>
          <div className="f">День<input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
          <div className="f">С<input type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} /></div>
          <div className="f">До<input type="time" value={d.endTime} disabled={!d.time} onChange={(e) => setD({ ...d, endTime: e.target.value })} /></div>
          <div className="f">Точка
            <select value={d.locationId} onChange={(e) => setD({ ...d, locationId: e.target.value })}>
              <option value="">Вся сеть</option>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <input style={{ width: '100%', marginTop: 8 }} placeholder="Заметка" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={save}>Сохранить</button>
          <button className="btn ghost sm" onClick={() => setEdit(false)}>Отмена</button>
        </div>
      </div>
    );
  }

  const late = !t.done && t.date < today;
  return (
    <div className={`task ${t.done ? 'done' : ''}`}>
      <input type="checkbox" checked={t.done} onChange={toggle} aria-label={`Выполнено: ${t.title}`} />
      <div className="body">
        <div className="title">{t.title} {late && <span className="pill bad">просрочено</span>}</div>
        <div className="small muted">
          {showDate ? `${periodLabel(t.date, 'day')} · ` : ''}{when(t)}{t.locationId ? ` · ${locName(state, t.locationId)}` : ''}
        </div>
        {t.note && <div className="small">{t.note}</div>}
      </div>
      <div className="row" style={{ flex: 'none', gap: 6 }}>
        <button className="btn ghost sm" onClick={open} aria-label={`Изменить: ${t.title}`}>✎</button>
        <button className="btn danger sm" onClick={remove} aria-label={`Удалить: ${t.title}`}>×</button>
      </div>
    </div>
  );
}

function Tasks({ go }: { go: (id: ModuleId) => void }) {
  const { state, update } = useStore();
  const cfg = useBackupConfig();
  const scope = state.settings.activeLocation;
  const today = todayISO();
  const [kind, setKind] = useState<PeriodKind>('day');
  const [shift, setShift] = useState(0);
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState({ title: '', date: '', time: '', endTime: '', note: '', locationId: scope === 'all' ? '' : scope });

  const key = shiftPeriod(periodKey(today, kind), kind, shift);
  const from = periodStart(key, kind);
  const to = periodEnd(key, kind);
  const defDate = today >= from && today <= to ? today : from;

  // Просроченное показываем сверху отдельным блоком, пока смотрим сегодняшний или будущий период
  const late = shift >= 0 ? overdueTasks(state, scope, today) : [];
  const lateIds = new Set(late.map((t) => t.id));
  const list = tasksInPeriod(state, scope, kind, key).filter((t) => !lateIds.has(t.id));
  const groups: { date: string; items: Task[] }[] = [];
  list.forEach((t) => {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  });
  const open = list.filter((t) => !t.done).length;

  const add = () => {
    if (!n.title.trim()) return;
    const task: Task = {
      id: uid(),
      title: n.title.trim(),
      date: n.date || defDate,
      time: n.time || undefined,
      endTime: n.time && n.endTime ? n.endTime : undefined,
      note: n.note.trim() || undefined,
      done: false,
      locationId: n.locationId || undefined,
    };
    update((s) => ({ ...s, tasks: [...s.tasks, task] }));
    setN({ ...n, title: '', note: '', time: '', endTime: '' });
  };

  const ready = isScriptUrl(cfg.url);
  const pending = state.tasks.filter((t) => t.deleted || taskDirty(t)).length;
  const sync = async () => {
    setBusy(true);
    await syncCalendar(() => state, update);
    setBusy(false);
  };
  const stamp = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const status = !ready
    ? 'не подключён: задачи хранятся только в панели'
    : !cfg.calendar
      ? 'синхронизация выключена'
      : cfg.calOk
        ? `синхронизировано ${stamp(cfg.calOk)}${pending ? `, ждут отправки: ${pending}` : ''}`
        : 'ещё не синхронизировался';

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div>
            <b>Google Календарь «Chief Hub»</b>
            <div className="small muted">{status}</div>
          </div>
          <div className="row">
            {!ready && <button className="btn ghost sm" onClick={() => go('settings')}>Подключить в Настройках</button>}
            {ready && cfg.calendar && <button className="btn ghost sm" disabled={busy} onClick={sync}>{busy ? 'Синхронизирую…' : 'Синхронизировать'}</button>}
            {ready && (
              <label className="small row" style={{ gap: 6 }}>
                <input type="checkbox" checked={cfg.calendar} onChange={(e) => saveBackupConfig({ calendar: e.target.checked })} />
                Включена
              </label>
            )}
          </div>
        </div>
        {!ready && <p className="small muted" style={{ marginTop: 8 }}>Чтобы задачи появлялись в Google Календаре и приходили оттуда, подключите копию на Google Диск и обновите код её скрипта. Это делается один раз.</p>}
        {ready && cfg.calendar && cfg.calError && <div className="alert bad" style={{ marginTop: 10 }}><div className="small">{cfg.calError}</div></div>}
        {ready && cfg.calendar && cfg.calSkipped > 0 && (
          <p className="small muted" style={{ marginTop: 8 }}>В календаре есть повторяющиеся или многодневные события ({cfg.calSkipped}): панель их не переносит и не меняет.</p>
        )}
      </div>

      <div className="card">
        <h2>Новая задача</h2>
        <div className="form">
          <div className="f" style={{ flex: '1 1 220px' }}>Задача
            <input value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Например, заказ зерна" />
          </div>
          <div className="f">День<input type="date" value={n.date || defDate} onChange={(e) => setN({ ...n, date: e.target.value })} /></div>
          <div className="f">С<input type="time" value={n.time} onChange={(e) => setN({ ...n, time: e.target.value })} /></div>
          <div className="f">До<input type="time" value={n.endTime} disabled={!n.time} onChange={(e) => setN({ ...n, endTime: e.target.value })} /></div>
          <div className="f">Точка
            <select value={n.locationId} onChange={(e) => setN({ ...n, locationId: e.target.value })}>
              <option value="">Вся сеть</option>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button className="btn" onClick={add}>Добавить</button>
        </div>
        <input style={{ width: '100%', marginTop: 8 }} placeholder="Заметка (по желанию)" value={n.note} onChange={(e) => setN({ ...n, note: e.target.value })} />
        <p className="small muted" style={{ marginTop: 6 }}>Без времени задача ставится на весь день. Со временем в Google Календаре придёт уведомление за 30 минут.</p>
      </div>

      <div className="card">
        <div className="row spread" style={{ marginBottom: 8 }}>
          <div className="seg">
            {KINDS.map((k) => (
              <button key={k.id} className={kind === k.id ? 'on accent' : ''} onClick={() => { setKind(k.id); setShift(0); }}>{k.label}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn ghost sm" aria-label="Раньше" onClick={() => setShift(shift - 1)}>‹</button>
            <b>{periodLabel(key, kind)}</b>
            <button className="btn ghost sm" aria-label="Позже" onClick={() => setShift(shift + 1)}>›</button>
            {shift !== 0 && <button className="btn ghost sm" onClick={() => setShift(0)}>Сегодня</button>}
          </div>
        </div>

        {late.length > 0 && (
          <div className="alert bad" style={{ display: 'block', marginBottom: 10 }}>
            <b>Просрочено: {late.length}</b>
            {late.map((t) => <TaskRow key={t.id} t={t} showDate />)}
          </div>
        )}

        {list.length === 0 && late.length === 0 && <div className="empty">На этот период задач нет.</div>}
        {list.length > 0 && <p className="small muted">Задач: {list.length}, не выполнено: {open}</p>}
        {groups.map((g, i) => (
          <div key={g.date}>
            {kind === 'year' && (i === 0 || groups[i - 1].date.slice(0, 7) !== g.date.slice(0, 7)) && <h3 style={{ marginTop: 14 }}>{periodLabel(g.date.slice(0, 7), 'month')}</h3>}
            {kind !== 'day' && <div className="daygroup">{periodLabel(g.date, 'day')}{g.date === today ? ' · сегодня' : ''}</div>}
            {g.items.map((t) => <TaskRow key={t.id} t={t} showDate={false} />)}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- График шефа ---------- */

function DayEditor({ date, codes, onDone }: { date: string; codes: string | undefined; onDone: () => void }) {
  const { state, update } = useStore();
  const cell = scheduleDay(state, date, codes);
  const [plan, setPlan] = useState<'auto' | ScheduleKind>(cell.entry ? cell.entry.kind : 'auto');
  const [hours, setHours] = useState(cell.entry?.hours !== undefined ? String(cell.entry.hours) : '');
  const [loc, setLoc] = useState(cell.entry?.locationId ?? '');
  const [note, setNote] = useState(cell.entry?.note ?? '');
  const [until, setUntil] = useState('');

  const calText = !cell.known
    ? `${cell.cal === 'off' ? 'выходной' : 'рабочий день'} (праздники не загружены, учтены только суббота и воскресенье)`
    : cell.cal === 'off'
      ? 'выходной или праздничный день'
      : cell.cal === 'short'
        ? `сокращённый предпраздничный день, ${h1(cell.norm)} ч`
        : `рабочий день, ${h1(cell.norm)} ч`;

  const save = () => {
    const last = until && until > date ? until : date;
    const dates: string[] = [];
    for (let d = date; d <= last && dates.length < 62; d = addDays(d, 1)) dates.push(d);
    const hv = hours.trim() === '' ? undefined : Math.max(0, Number(hours.replace(',', '.')) || 0);
    // У отпуска и больничного точки нет (поле скрыто), прежний выбор не сохраняем
    const place = plan === 'vacation' || plan === 'sick' ? '' : loc;
    update((s) => {
      const rest = s.schedule.filter((x) => !dates.includes(x.date));
      if (plan === 'auto') return { ...s, schedule: rest };
      const base = { ...s, schedule: rest };
      const added = dates.flatMap((d): ScheduleDay[] => {
        const c = scheduleDay(base, d, codes);
        // Запись, которая ничего не меняет по сравнению с календарём, не храним
        if (!place && !note.trim()) {
          if (plan === 'work' && c.norm > 0 && (hv === undefined || hv === c.norm)) return [];
          if (plan === 'off' && c.norm === 0) return [];
        }
        return [{ date: d, kind: plan, hours: plan === 'work' ? hv : undefined, locationId: place || undefined, note: note.trim() || undefined }];
      });
      return { ...s, schedule: [...rest, ...added] };
    });
    onDone();
  };

  return (
    <div className="card">
      <div className="row spread">
        <h2>{periodLabel(date, 'day')}</h2>
        <button className="btn ghost sm" onClick={onDone}>Закрыть</button>
      </div>
      <p className="small muted" style={{ marginBottom: 10 }}>По производственному календарю: {calText}.</p>
      <div className="form">
        <div className="f">В графике
          <select value={plan} onChange={(e) => setPlan(e.target.value as 'auto' | ScheduleKind)}>
            <option value="auto">По календарю</option>
            {(Object.keys(SCHEDULE_KIND) as ScheduleKind[]).map((k) => <option key={k} value={k}>{SCHEDULE_KIND[k]}</option>)}
          </select>
        </div>
        {plan === 'work' && (
          <div className="f">Часов<input type="number" step="0.5" min={0} value={hours} placeholder={String(cell.norm || state.settings.workdayHours || 8)} onChange={(e) => setHours(e.target.value)} /></div>
        )}
        {plan !== 'auto' && plan !== 'vacation' && plan !== 'sick' && (
          <div className="f">Точка
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">—</option>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div className="f">По какой день включительно<input type="date" min={date} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
      </div>
      <input style={{ width: '100%', marginTop: 8 }} placeholder="Заметка" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={save}>Сохранить</button>
        <span className="small muted">Чтобы отметить отпуск на несколько дней, выберите «Отпуск» и последний день.</span>
      </div>
    </div>
  );
}

function Schedule() {
  const { state, update } = useStore();
  const scope = state.settings.activeLocation;
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState<string | null>(null);
  // Часы в дне правятся текстом и сохраняются, когда поле отпущено: иначе число нельзя стереть и набрать заново
  const [hoursText, setHoursText] = useState(String(state.settings.workdayHours ?? 8));
  const commitHours = () => {
    const v = Number(hoursText.replace(',', '.'));
    if (v > 0 && v <= 24) update((s) => ({ ...s, settings: { ...s.settings, workdayHours: v } }));
    else setHoursText(String(state.settings.workdayHours ?? 8));
  };
  const pc = useProdCal(Number(month.slice(0, 4)));
  const m = scheduleMonth(state, month, pc.codes);
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const openByDay = new Map<string, number>();
  tasksFor(state, scope).filter((t) => !t.done).forEach((t) => openByDay.set(t.date, (openByDay.get(t.date) ?? 0) + 1));
  const diff = m.hours - m.norm;
  const normDays = m.days.filter((d) => d.norm > 0).length;
  const entries = m.days.filter((d) => d.entry);

  const label = (c: (typeof m.days)[number]) => {
    if (c.plan === 'work') return c.hours > 0 ? `${h1(c.hours)} ч` : '—';
    if (c.plan === 'off') return 'вых';
    if (c.plan === 'vacation') return 'отпуск';
    if (c.plan === 'sick') return 'больн.';
    return 'отгул';
  };
  const cls = (c: (typeof m.days)[number]) => {
    if (c.plan === 'vacation' || c.plan === 'sick' || c.plan === 'timeoff') return 'leave';
    if (c.plan === 'work' && c.norm === 0) return 'extra';
    if (c.plan === 'off') return 'off';
    return c.cal === 'short' ? 'short' : '';
  };

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div className="row">
            <button className="btn ghost sm" aria-label="Предыдущий месяц" onClick={() => { setMonth(shiftPeriod(month, 'month', -1)); setSel(null); }}>‹</button>
            <b style={{ minWidth: 130, textAlign: 'center' }}>{periodLabel(month, 'month')}</b>
            <button className="btn ghost sm" aria-label="Следующий месяц" onClick={() => { setMonth(shiftPeriod(month, 'month', 1)); setSel(null); }}>›</button>
            {month !== today.slice(0, 7) && <button className="btn ghost sm" onClick={() => { setMonth(today.slice(0, 7)); setSel(null); }}>Этот месяц</button>}
          </div>
          <label className="small row" style={{ gap: 6 }}>
            Часов в рабочем дне
            <input type="text" inputMode="decimal" value={hoursText} onChange={(e) => setHoursText(e.target.value)} onBlur={commitHours} onKeyDown={(e) => e.key === 'Enter' && commitHours()} style={{ width: 70 }} aria-label="Часов в рабочем дне" />
          </label>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          {pc.loading ? 'Загружаю производственный календарь РФ…' : m.known ? 'Производственный календарь РФ загружен: выходные, праздники, переносы и сокращённые дни учтены.' : 'Производственный календарь РФ не загружен: пока учтены только суббота и воскресенье.'}
        </p>
        {pc.error && (
          <div className="alert warn" style={{ marginTop: 8 }}>
            <div className="small" style={{ flex: 1 }}>{pc.error}</div>
            <button className="btn ghost sm" onClick={() => void pc.reload()}>Повторить</button>
          </div>
        )}
      </div>

      <div className="grid kpis">
        <div className="card kpi">
          <div className="label">Норма по календарю</div>
          <div className="value">{h1(m.norm)} ч</div>
          <div className="delta">рабочих дней: {normDays}</div>
        </div>
        <div className="card kpi">
          <div className="label">По вашему графику</div>
          <div className="value">{h1(m.hours)} ч</div>
          <div className="delta">{diff === 0 ? 'ровно по норме' : `${diff > 0 ? '+' : '−'}${h1(Math.abs(diff))} ч к норме`}, рабочих дней: {m.workDays}</div>
        </div>
        <div className="card kpi">
          <div className="label">Отпуск, больничный, отгулы</div>
          <div className="value">{m.vacation + m.sick + m.timeoff} дн.</div>
          <div className="delta">отпуск {m.vacation}, больничный {m.sick}, отгул {m.timeoff}</div>
        </div>
      </div>

      <div className="card">
        <div className="cal-grid">
          {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
          {m.days.map((c) => {
            const open = openByDay.get(c.date) ?? 0;
            return (
              <button key={c.date} className={`cal-cell ${cls(c)} ${c.date === today ? 'today' : ''} ${c.date === sel ? 'sel' : ''}`} onClick={() => setSel(c.date === sel ? null : c.date)} aria-label={`${periodLabel(c.date, 'day')}: ${label(c)}${open ? `, задач: ${open}` : ''}`}>
                <span className="cal-num">{Number(c.date.slice(8))}</span>
                <span className="cal-sub">{label(c)}</span>
                <span className="cal-mark">{open ? `● ${open}` : ' '}</span>
              </button>
            );
          })}
        </div>
        <div className="row small muted" style={{ marginTop: 10, gap: 14 }}>
          <span>● — открытых задач</span>
          <span><span className="pill">вых</span> выходной или праздник</span>
          <span><span className="pill warn">7 ч</span> сокращённый</span>
          <span><span className="pill ok">8 ч</span> работа в выходной</span>
        </div>
      </div>

      {sel && <DayEditor key={sel} date={sel} codes={pc.codes} onDone={() => setSel(null)} />}

      {entries.length > 0 && (
        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Отступления от календаря в этом месяце</h2></div>
          <div className="tablewrap">
            <table>
              <tbody>
                {entries.map((c) => (
                  <tr key={c.date}>
                    <td>{periodLabel(c.date, 'day')}</td>
                    <td>{SCHEDULE_KIND[c.plan]}{c.plan === 'work' ? `, ${h1(c.hours)} ч` : ''}{c.entry?.locationId ? ` · ${locName(state, c.entry.locationId)}` : ''}</td>
                    <td className="small muted">{c.entry?.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
