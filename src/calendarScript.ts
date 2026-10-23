/**
 * Часть скрипта Google Apps Script, которая отвечает за календарь:
 * синхронизация задач с отдельным календарём «Chief Hub» и загрузка производственного календаря РФ.
 * Её код добавляется к основному скрипту резервной копии (см. APPS_SCRIPT в backup.ts).
 *
 * Скрипт ничего не хранит: всё, что нужно для сверки, приходит в запросе из панели.
 * Для каждой задачи панель присылает «отпечаток» (base) — каким содержимое было при прошлой синхронизации.
 * Сравнивая его с задачей в панели и с событием в календаре, скрипт решает, что кого обновляет:
 *   • изменилось только в календаре → меняем задачу в панели;
 *   • изменилось в панели (или в обоих местах) → меняем событие в календаре, панель главнее.
 *
 * Внутри кода нет обратных кавычек, «${» и обратных слэшей: код лежит в шаблонной строке.
 */
export const CALENDAR_SCRIPT = `
/* ---------- Календарь ---------- */

const CALENDAR_NAME = 'Chief Hub';
const DONE_MARK = '✓ ';
const REMINDER_MIN = 30;

/** Запустите один раз из редактора (▶): Google попросит разрешить доступ к Календарю и к интернету. */
function authorize() {
  CalendarApp.getDefaultCalendar();
  UrlFetchApp.fetch('https://isdayoff.ru/api/getdata?year=2026&cc=ru');
  DriveApp.getRootFolder();
  Logger.log('Доступ выдан. Теперь разверните новую версию скрипта.');
}

function tz_() {
  return Session.getScriptTimeZone();
}

function calendar_() {
  const found = CalendarApp.getCalendarsByName(CALENDAR_NAME);
  return found.length ? found[0] : CalendarApp.createCalendar(CALENDAR_NAME);
}

function pad_(n) {
  return (n < 10 ? '0' : '') + n;
}

function minutes_(t) {
  const a = String(t).split(':');
  return Number(a[0]) * 60 + Number(a[1]);
}

function hhmm_(m) {
  const x = Math.max(0, Math.min(m, 1439));
  return pad_(Math.floor(x / 60)) + ':' + pad_(x % 60);
}

function hash_(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Единый вид задачи и события, чтобы их можно было сравнивать. Без времени — событие на весь день, без конца — час. */
function canon_(c) {
  const time = c.time || '';
  let end = '';
  if (time) {
    end = c.end || '';
    if (!end || minutes_(end) <= minutes_(time)) end = hhmm_(minutes_(time) + 60);
  }
  return { title: String(c.title || '').trim(), done: !!c.done, date: c.date, time: time, end: end, note: String(c.note || '').trim() };
}

function sig_(c) {
  return hash_(JSON.stringify([c.title, c.done, c.date, c.time, c.end, c.note]));
}

function canonOfTask_(t) {
  return canon_({ title: t.title, done: t.done, date: t.date, time: t.time, end: t.endTime, note: t.note });
}

function canonOfEvent_(ev) {
  const z = tz_();
  const raw = ev.getTitle() || '';
  const done = raw.indexOf(DONE_MARK) === 0;
  const title = done ? raw.slice(DONE_MARK.length) : raw;
  if (ev.isAllDayEvent()) {
    return canon_({ title: title, done: done, date: Utilities.formatDate(ev.getAllDayStartDate(), z, 'yyyy-MM-dd'), time: '', end: '', note: ev.getDescription() });
  }
  return canon_({
    title: title,
    done: done,
    date: Utilities.formatDate(ev.getStartTime(), z, 'yyyy-MM-dd'),
    time: Utilities.formatDate(ev.getStartTime(), z, 'HH:mm'),
    end: Utilities.formatDate(ev.getEndTime(), z, 'HH:mm'),
    note: ev.getDescription(),
  });
}

/** Переносим только одиночные события на один день. Повторяющиеся и многодневные не трогаем. */
function supported_(ev) {
  if (ev.isRecurringEvent()) return false;
  if (ev.isAllDayEvent()) return ev.getEndTime().getTime() - ev.getStartTime().getTime() <= 25 * 3600 * 1000;
  const z = tz_();
  return Utilities.formatDate(ev.getStartTime(), z, 'yyyy-MM-dd') === Utilities.formatDate(ev.getEndTime(), z, 'yyyy-MM-dd');
}

function createEvent_(cal, t) {
  const z = tz_();
  const c = canonOfTask_(t);
  const title = (c.done ? DONE_MARK : '') + c.title;
  if (c.time) {
    const ev = cal.createEvent(
      title,
      Utilities.parseDate(c.date + ' ' + c.time, z, 'yyyy-MM-dd HH:mm'),
      Utilities.parseDate(c.date + ' ' + c.end, z, 'yyyy-MM-dd HH:mm'),
      { description: c.note }
    );
    ev.removeAllReminders();
    ev.addPopupReminder(REMINDER_MIN);
    return ev;
  }
  return cal.createAllDayEvent(title, Utilities.parseDate(c.date + ' 12:00', z, 'yyyy-MM-dd HH:mm'), { description: c.note });
}

function updateEvent_(ev, t) {
  const z = tz_();
  const c = canonOfTask_(t);
  ev.setTitle((c.done ? DONE_MARK : '') + c.title);
  ev.setDescription(c.note);
  if (c.time) {
    ev.setTime(Utilities.parseDate(c.date + ' ' + c.time, z, 'yyyy-MM-dd HH:mm'), Utilities.parseDate(c.date + ' ' + c.end, z, 'yyyy-MM-dd HH:mm'));
  } else {
    ev.setAllDayDate(Utilities.parseDate(c.date + ' 12:00', z, 'yyyy-MM-dd HH:mm'));
  }
}

function safeGet_(cal, id) {
  try {
    return cal.getEventById(id);
  } catch (e) {
    return null;
  }
}

function fields_(c) {
  return { title: c.title, date: c.date, time: c.time, endTime: c.end, note: c.note, done: c.done };
}

/** Сверка задач панели с календарём. Возвращает, что панели применить у себя. */
function syncCalendar_(p) {
  const cal = calendar_();
  const z = tz_();
  const events = cal.getEvents(
    Utilities.parseDate(p.from + ' 00:00', z, 'yyyy-MM-dd HH:mm'),
    Utilities.parseDate(p.to + ' 23:59', z, 'yyyy-MM-dd HH:mm')
  );
  const known = {};
  (p.known || []).forEach(function (id) { known[id] = true; });
  const byCal = {};
  const live = [];
  let skipped = 0;
  events.forEach(function (ev) {
    byCal[ev.getId()] = ev;
    // Повторяющиеся и многодневные события знаем, но не переносим и не трогаем
    if (!supported_(ev)) { skipped++; return; }
    live.push(ev);
  });

  const claimed = {};
  const out = { ok: true, skipped: skipped, synced: [], changed: [], removed: [], purged: [], created: [] };

  (p.tasks || []).forEach(function (t) {
    // Удалена в панели: убираем событие и подтверждаем
    if (t.deleted) {
      if (t.calId) {
        claimed[t.calId] = true;
        const gone = byCal[t.calId] || safeGet_(cal, t.calId);
        try {
          if (gone) gone.deleteEvent();
        } catch (e) {
          return;
        }
      }
      out.purged.push(t.id);
      return;
    }

    const sT = sig_(canonOfTask_(t));
    let ev = t.calId ? byCal[t.calId] : null;
    if (t.calId && !ev && (t.date < p.from || t.date > p.to)) ev = safeGet_(cal, t.calId);
    if (ev) claimed[t.calId] = true;

    // Нового события нет: задача новая, либо событие удалили в календаре
    if (!ev) {
      if (t.calId && t.base && sT === t.base) {
        out.removed.push(t.id);
        return;
      }
      let twin = null;
      for (let i = 0; i < live.length && !twin; i++) {
        const id = live[i].getId();
        if (!claimed[id] && !known[id] && sig_(canonOfEvent_(live[i])) === sT) twin = live[i];
      }
      const made = twin || createEvent_(cal, t);
      claimed[made.getId()] = true;
      out.synced.push({ id: t.id, calId: made.getId(), base: sig_(canonOfEvent_(made)) });
      return;
    }

    if (!supported_(ev)) return;
    const eCanon = canonOfEvent_(ev);
    const sE = sig_(eCanon);
    if (sE === sT) {
      if (t.base !== sE || t.dirty) out.synced.push({ id: t.id, calId: t.calId, base: sE });
    } else if (sT === t.base) {
      // Менялось только в календаре
      const f = fields_(eCanon);
      f.id = t.id;
      f.calId = t.calId;
      f.base = sE;
      out.changed.push(f);
    } else {
      // Менялось в панели (или в обоих местах): панель главнее
      updateEvent_(ev, t);
      out.synced.push({ id: t.id, calId: t.calId, base: sig_(canonOfEvent_(ev)) });
    }
  });

  // События, которых в панели ещё нет
  live.forEach(function (ev) {
    const id = ev.getId();
    if (claimed[id] || known[id]) return;
    const c = canonOfEvent_(ev);
    const f = fields_(c);
    f.calId = id;
    f.base = sig_(c);
    out.created.push(f);
  });

  return out;
}

/** Производственный календарь РФ на год: строка по дням, 0 рабочий, 1 выходной или праздник, 2 сокращённый. */
function prodCalendar_(p) {
  const year = Number(p.year);
  if (!(year >= 2000 && year <= 2100)) throw new Error('неверный год');
  const res = UrlFetchApp.fetch('https://isdayoff.ru/api/getdata?year=' + year + '&pre=1&cc=ru', { muteHttpExceptions: true });
  const text = String(res.getContentText()).trim();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (res.getResponseCode() !== 200 || !/^[0124]+$/.test(text) || text.length !== (leap ? 366 : 365)) {
    throw new Error('источник календаря не отдал данные на ' + year + ' год (ответ ' + res.getResponseCode() + ')');
  }
  return { ok: true, year: year, codes: text };
}
`;
