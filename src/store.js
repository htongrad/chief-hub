"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.todayISO = exports.fmt = exports.locName = exports.inScope = exports.uid = exports.localAdapter = exports.itemAt = exports.fmtQty = exports.fmtStock = exports.RECEIPT_UNITS = exports.STOCK_FACTOR = exports.STOCK_LABEL = exports.BASE_LABEL = void 0;
exports.parseUnit = parseUnit;
exports.linkIngredients = linkIngredients;
exports.usageOf = usageOf;
exports.stockOf = stockOf;
exports.reorderList = reorderList;
exports.migrate = migrate;
exports.StoreProvider = StoreProvider;
exports.useStore = useStore;
exports.daysBetween = daysBetween;
exports.addDays = addDays;
exports.dialIssues = dialIssues;
exports.lastWeek = lastWeek;
exports.prevWeekOf = prevWeekOf;
exports.weekSummary = weekSummary;
exports.stability = stability;
exports.attestStatus = attestStatus;
exports.attestSummary = attestSummary;
exports.equipmentDue = equipmentDue;
exports.overdueEquipmentCount = overdueEquipmentCount;
exports.serviceScore = serviceScore;
exports.buildSignals = buildSignals;
exports.buildReport = buildReport;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const seed_1 = require("./seed");
const KEY = 'chief-hub:v1';
// ——— Единицы учёта ———
// Внутри всё хранится в базовых единицах (г, мл, шт). Списания и приходы вводятся в удобных
// единицах, остатки показываются в кг, л и шт, как в кассовой системе.
const UNIT_ALIASES = {
    г: { base: 'g', factor: 1 },
    гр: { base: 'g', factor: 1 },
    кг: { base: 'g', factor: 1000 },
    мл: { base: 'ml', factor: 1 },
    л: { base: 'ml', factor: 1000 },
    шт: { base: 'pcs', factor: 1 },
};
/** Разбирает единицу из текста («г», «кг», «шт.»). Для незнакомой единицы возвращает null. */
function parseUnit(raw) {
    return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, '')] ?? null;
}
exports.BASE_LABEL = { g: 'г', ml: 'мл', pcs: 'шт' };
exports.STOCK_LABEL = { g: 'кг', ml: 'л', pcs: 'шт' };
exports.STOCK_FACTOR = { g: 1000, ml: 1000, pcs: 1 };
/** Единицы для ввода прихода: так же, как привозят поставщики. */
exports.RECEIPT_UNITS = [
    { label: 'кг', base: 'g', factor: 1000 },
    { label: 'л', base: 'ml', factor: 1000 },
    { label: 'шт', base: 'pcs', factor: 1 },
];
const trimNum = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
/** Остаток в единицах стока: кг, л, шт. */
const fmtStock = (unit, q) => `${trimNum(q / exports.STOCK_FACTOR[unit])} ${exports.STOCK_LABEL[unit]}`;
exports.fmtStock = fmtStock;
/** Количество в базовых единицах; крупные значения показываем в кг и л. */
const fmtQty = (unit, q) => (unit !== 'pcs' && Math.abs(q) >= 1000 ? (0, exports.fmtStock)(unit, q) : `${trimNum(q)} ${exports.BASE_LABEL[unit]}`);
exports.fmtQty = fmtQty;
const normName = (s) => s.trim().toLowerCase();
/** Применима ли позиция на точке (на всех точках или отмечена галочкой). */
const itemAt = (it, locationId) => it.allLocations || it.locationIds.includes(locationId);
exports.itemAt = itemAt;
/**
 * Связывает ингредиенты стандартов с банком ингредиентов: если позиции с таким названием нет,
 * она создаётся (на всех точках), и ингредиент получает ссылку на неё. Единицы вне г/кг/мл/л/шт
 * (например, «шот») в сток не попадают. Безопасно вызывать повторно.
 */
function linkIngredients(inventory, recipes) {
    const inv = [...inventory];
    const linked = recipes.map((r) => ({
        ...r,
        ingredients: r.ingredients.map((i) => {
            const plain = { name: i.name, amount: i.amount, unit: i.unit };
            const u = parseUnit(i.unit);
            if (!u || !i.name.trim())
                return plain;
            const byId = i.itemId ? inv.find((x) => x.id === i.itemId) : undefined;
            let item = byId && byId.unit === u.base ? byId : inv.find((x) => normName(x.name) === normName(i.name) && x.unit === u.base);
            if (!item) {
                if (inv.some((x) => normName(x.name) === normName(i.name)))
                    return plain; // то же название, другая единица
                item = { id: (0, exports.uid)(), name: i.name.trim(), category: 'Из стандартов', unit: u.base, par: 0, allLocations: true, locationIds: [], opening: {} };
                inv.push(item);
            }
            return { ...plain, itemId: item.id };
        }),
    }));
    return { inventory: inv, recipes: linked };
}
/** Расход позиции на точке по продажам за все дни: количество × норма из стандарта. */
function usageOf(state, itemId, locationId) {
    let total = 0;
    state.daySales.forEach((d) => {
        if (d.locationId !== locationId)
            return;
        d.lines.forEach((ln) => {
            const r = state.recipes.find((x) => x.id === ln.recipeId);
            r?.ingredients.forEach((i) => {
                if (i.itemId !== itemId)
                    return;
                const amount = parseFloat(i.amount.replace(',', '.'));
                const u = parseUnit(i.unit);
                if (u && amount > 0)
                    total += ln.count * amount * u.factor;
            });
        });
    });
    return total;
}
/** Остаток на точке = стартовый + приходы − списания − расход по продажам (в базовых единицах). */
function stockOf(state, it, locationId) {
    const inn = state.receipts.filter((x) => x.itemId === it.id && x.locationId === locationId).reduce((a, x) => a + x.qty, 0);
    const out = state.writeOffs.filter((x) => x.itemId === it.id && x.locationId === locationId).reduce((a, x) => a + x.qty, 0);
    return (it.opening[locationId] ?? 0) + inn - out - usageOf(state, it.id, locationId);
}
/** Список закупки: сколько довезти до минимального остатка суммарно по выбранным точкам. */
function reorderList(state, locationIds) {
    return state.inventory
        .map((item) => ({
        item,
        need: locationIds.reduce((a, id) => ((0, exports.itemAt)(item, id) ? a + Math.max(0, item.par - stockOf(state, item, id)) : a), 0),
    }))
        .filter((x) => x.need > 0);
}
/**
 * Приводит сохранённые данные к текущей версии (4).
 * Версия 1 (до разделов «Оборудование», «Обходы», «Отчёт») получает пустые новые списки
 * и значения норм по умолчанию. Версия 3 хранила склад в свободных единицах — переводим
 * в г, мл и шт (кг → г, л → мл, прочее считаем штуками). Ингредиенты стандартов попадают
 * в банк ингредиентов. Возвращает null, если данные не похожи на Chief Hub.
 */
function migrate(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const r = raw;
    if (![1, 2, 3, 4].includes(r.version ?? 0) || !Array.isArray(r.locations) || !r.settings)
        return null;
    const s = r.settings;
    const factors = new Map();
    const inventory0 = (r.inventory ?? []).map((raw) => {
        const x = raw;
        if (x.opening)
            return { ...x, allLocations: x.allLocations ?? true, locationIds: x.locationIds ?? [] };
        const u = parseUnit(x.unit ?? '') ?? { base: 'pcs', factor: 1 };
        factors.set(x.id, u.factor);
        const opening = {};
        Object.entries(x.qty ?? {}).forEach(([k, v]) => (opening[k] = v * u.factor));
        return { id: x.id, name: x.name, category: x.category ?? 'Прочее', unit: u.base, par: (x.par ?? 0) * u.factor, allLocations: true, locationIds: [], opening };
    });
    const writeOffs0 = (r.writeOffs ?? []).map((w) => (factors.has(w.itemId) ? { ...w, qty: w.qty * (factors.get(w.itemId) ?? 1) } : w));
    const recipes0 = (r.recipes ?? []).map((x) => {
        // Версия 2 хранила рецептуру одной строкой (spec): переносим её в способ приготовления.
        const old = x;
        return {
            id: x.id,
            name: x.name,
            ingredients: x.ingredients ?? [],
            method: x.method ?? old.spec ?? '',
            guestDescription: x.guestDescription ?? '',
            updated: x.updated,
        };
    });
    const linked = linkIngredients(inventory0, recipes0);
    return {
        version: 4,
        settings: {
            networkName: s.networkName ?? 'Моя сеть',
            currency: s.currency ?? '₽',
            activeLocation: s.activeLocation ?? 'all',
            modules: { ...(0, seed_1.defaultModules)(), ...(s.modules ?? {}) },
            espresso: s.espresso ?? { ratio: 2, yieldTol: 2, timeMin: 25, timeMax: 30 },
            cogsTargetPct: s.cogsTargetPct ?? 28,
            attestDays: s.attestDays ?? 180,
            visitMinScore: s.visitMinScore ?? 80,
        },
        locations: r.locations,
        staff: r.staff ?? [],
        dialIns: r.dialIns ?? [],
        cuppings: (r.cuppings ?? []).map((c) => ({ ...c, comment: c.comment ?? '' })),
        recipes: linked.recipes,
        attestations: r.attestations ?? [],
        inventory: linked.inventory,
        receipts: r.receipts ?? [],
        writeOffs: writeOffs0,
        daySales: r.daySales ?? [],
        metrics: r.metrics ?? [],
        equipment: r.equipment ?? [],
        repairs: r.repairs ?? [],
        visits: r.visits ?? [],
        complaints: r.complaints ?? [],
        reportNote: r.reportNote ?? '',
        playbook: r.playbook ?? [],
    };
}
exports.localAdapter = {
    load() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? migrate(JSON.parse(raw)) : null;
        }
        catch {
            return null;
        }
    },
    save(state) {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        }
        catch {
            /* хранилище недоступно — работаем без сохранения */
        }
    },
};
const adapter = exports.localAdapter;
const Ctx = (0, react_1.createContext)(null);
function StoreProvider({ children }) {
    const [state, setState] = (0, react_1.useState)(() => adapter.load() ?? (0, seed_1.makeSeed)());
    (0, react_1.useEffect)(() => {
        adapter.save(state);
    }, [state]);
    const update = (0, react_1.useCallback)((fn) => setState((s) => fn(s)), []);
    const replace = (0, react_1.useCallback)((s) => setState(s), []);
    const resetDemo = (0, react_1.useCallback)(() => setState((0, seed_1.makeSeed)()), []);
    return (0, jsx_runtime_1.jsx)(Ctx.Provider, { value: { state, update, replace, resetDemo }, children: children });
}
function useStore() {
    const v = (0, react_1.useContext)(Ctx);
    if (!v)
        throw new Error('StoreProvider отсутствует');
    return v;
}
const uid = () => Math.random().toString(36).slice(2, 9);
exports.uid = uid;
/** Попадает ли точка в выбранную область просмотра («все точки» или одна). */
const inScope = (locationId, active) => active === 'all' || active === locationId;
exports.inScope = inScope;
const locName = (state, id) => state.locations.find((l) => l.id === id)?.name ?? '—';
exports.locName = locName;
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
exports.fmt = fmt;
/** Сегодняшняя дата по местному времени, YYYY-MM-DD. */
const todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
exports.todayISO = todayISO;
/** Сколько дней от первой даты до второй (может быть отрицательным). */
function daysBetween(fromISO, toISO) {
    return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}
function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
/** Оценка одной настройки эспрессо: возвращает список замечаний (пусто = в норме). */
function dialIssues(d, t) {
    const issues = [];
    const target = d.doseG * t.ratio;
    if (d.yieldG > target + t.yieldTol)
        issues.push('выход выше нормы');
    if (d.yieldG < target - t.yieldTol)
        issues.push('выход ниже нормы');
    if (d.timeS < t.timeMin)
        issues.push('экстракция быстрая');
    if (d.timeS > t.timeMax)
        issues.push('экстракция медленная');
    return issues;
}
/** Последняя неделя, по которой есть данные. */
function lastWeek(state) {
    const weeks = state.metrics.map((m) => m.week).sort();
    return weeks.length ? weeks[weeks.length - 1] : null;
}
/** Неделя, предшествующая данной, среди тех, по которым есть данные. */
function prevWeekOf(state, week) {
    const weeks = [...new Set(state.metrics.map((m) => m.week))].sort();
    return weeks[weeks.indexOf(week) - 1];
}
/** Итоги недели по выбранной области: выручка, чеки, средняя себестоимость. */
function weekSummary(state, week, scope) {
    const rows = state.metrics.filter((m) => m.week === week && (0, exports.inScope)(m.locationId, scope));
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const checks = rows.reduce((a, r) => a + r.checks, 0);
    const cogs = rows.length ? rows.reduce((a, r) => a + r.cogsPct, 0) / rows.length : 0;
    return { revenue, checks, cogs, avgCheck: checks ? revenue / checks : 0, count: rows.length };
}
/** Доля записей настройки в допуске. days — окно в днях (без него все записи). */
function stability(state, scope, days) {
    const today = (0, exports.todayISO)();
    const rows = state.dialIns.filter((d) => (0, exports.inScope)(d.locationId, scope) && (days === undefined || daysBetween(d.date, today) <= days));
    const ok = rows.filter((d) => dialIssues(d, state.settings.espresso).length === 0).length;
    return { pct: rows.length ? Math.round((ok / rows.length) * 100) : null, total: rows.length };
}
/** Статус аттестации сотрудника: не проходил, действует, просрочена, не пройдена. */
function attestStatus(state, staffId, today = (0, exports.todayISO)()) {
    const last = state.attestations.filter((a) => a.staffId === staffId).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    if (!last)
        return { state: 'none', last: null };
    if (!last.passed)
        return { state: 'failed', last };
    return { state: daysBetween(last.date, today) > state.settings.attestDays ? 'due' : 'ok', last };
}
/** Сколько сотрудников в области по каждому статусу аттестации и доля действующих. */
function attestSummary(state, scope) {
    const staff = state.staff.filter((p) => (0, exports.inScope)(p.locationId, scope));
    const c = { none: 0, ok: 0, due: 0, failed: 0 };
    staff.forEach((p) => {
        c[attestStatus(state, p.id).state] += 1;
    });
    return { total: staff.length, ...c, pct: staff.length ? Math.round((c.ok / staff.length) * 100) : null };
}
/** Когда следующее ТО: none (ещё не отмечали), ok, soon (в ближайшие 7 дней), overdue. */
function equipmentDue(e, today = (0, exports.todayISO)()) {
    if (!e.lastServiceDate)
        return { next: null, days: null, state: 'none' };
    const next = addDays(e.lastServiceDate, e.intervalDays);
    const days = daysBetween(today, next);
    return { next, days, state: days < 0 ? 'overdue' : days <= 7 ? 'soon' : 'ok' };
}
function overdueEquipmentCount(state, scope) {
    return state.equipment.filter((e) => (0, exports.inScope)(e.locationId, scope) && equipmentDue(e).state === 'overdue').length;
}
/** Средний балл обходов и тайного гостя за последние days дней. */
function serviceScore(state, scope, days) {
    const today = (0, exports.todayISO)();
    const rows = state.visits.filter((v) => (0, exports.inScope)(v.locationId, scope) && daysBetween(v.date, today) <= days);
    return rows.length ? Math.round(rows.reduce((a, v) => a + v.score, 0) / rows.length) : null;
}
/** Все сигналы «что требует внимания», в порядке важности. Их показывают Обзор и Отчёт. */
function buildSignals(state, scope) {
    const { settings } = state;
    const today = (0, exports.todayISO)();
    const locs = state.locations.filter((l) => (0, exports.inScope)(l.id, scope));
    const ln = (id) => (0, exports.locName)(state, id);
    const out = [];
    // Вкус: настройки эспрессо вне нормы за последние 14 дней
    state.dialIns
        .filter((d) => (0, exports.inScope)(d.locationId, scope) && daysBetween(d.date, today) <= 14)
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach((d) => {
        const issues = dialIssues(d, settings.espresso);
        if (issues.length)
            out.push({ level: 'bad', title: `${ln(d.locationId)}, ${d.date}: эспрессо вне нормы`, detail: `${issues.join(', ')} · ${d.doseG} → ${d.yieldG} г за ${d.timeS} с` });
    });
    // Люди: аттестации просрочены или не пройдены
    const att = attestSummary(state, scope);
    if (att.due + att.failed > 0) {
        out.push({ level: 'warn', title: `Аттестация: требуют внимания ${att.due + att.failed} чел.`, detail: `просрочена: ${att.due}, не пройдена: ${att.failed}` });
    }
    // Цифры: себестоимость выше цели, остатки ниже минимума
    const week = lastWeek(state);
    state.metrics
        .filter((m) => m.week === week && (0, exports.inScope)(m.locationId, scope) && m.cogsPct > settings.cogsTargetPct)
        .forEach((m) => out.push({ level: 'warn', title: `${ln(m.locationId)}: себестоимость выше цели`, detail: `${m.cogsPct}% при цели ${settings.cogsTargetPct}% (неделя ${m.week})` }));
    state.inventory.forEach((it) => locs.forEach((l) => {
        if (!(0, exports.itemAt)(it, l.id))
            return;
        const q = stockOf(state, it, l.id);
        if (q < it.par)
            out.push({ level: 'warn', title: `${it.name} · ${l.name}`, detail: `осталось ${(0, exports.fmtStock)(it.unit, q)}, минимальный остаток ${(0, exports.fmtStock)(it.unit, it.par)}` });
    }));
    // Оборудование: ТО просрочено или скоро, открытые заявки
    state.equipment
        .filter((e) => (0, exports.inScope)(e.locationId, scope))
        .forEach((e) => {
        const due = equipmentDue(e);
        if (due.state === 'overdue')
            out.push({ level: 'bad', title: `${e.name} · ${ln(e.locationId)}: ТО просрочено`, detail: `на ${Math.abs(due.days ?? 0)} дн., интервал ${e.intervalDays} дн.` });
        if (due.state === 'soon')
            out.push({ level: 'warn', title: `${e.name} · ${ln(e.locationId)}: скоро ТО`, detail: `через ${due.days} дн. (${due.next})` });
    });
    state.repairs
        .filter((r) => !r.done && (0, exports.inScope)(r.locationId, scope))
        .forEach((r) => out.push({ level: 'warn', title: `Заявка на ремонт · ${ln(r.locationId)}`, detail: r.text }));
    // Гость и точки: низкий балл последнего обхода, открытые жалобы
    locs.forEach((l) => {
        const last = state.visits
            .filter((v) => v.locationId === l.id && v.kind === 'round' && daysBetween(v.date, today) <= 30)
            .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (last && last.score < settings.visitMinScore)
            out.push({ level: 'warn', title: `Обход · ${l.name}: ${last.score}%`, detail: `ниже минимума ${settings.visitMinScore}% (${last.date})` });
    });
    state.complaints
        .filter((c) => !c.resolved && (0, exports.inScope)(c.locationId, scope))
        .forEach((c) => out.push({ level: 'warn', title: `Жалоба гостя · ${ln(c.locationId)}`, detail: c.text }));
    return [...out.filter((x) => x.level === 'bad'), ...out.filter((x) => x.level === 'warn')];
}
/** Недельный отчёт по выбранной области: блоки идут в порядке должностной инструкции. */
function buildReport(state, scope) {
    const { settings } = state;
    const cur = settings.currency;
    const today = (0, exports.todayISO)();
    const within = (d, days) => {
        const n = daysBetween(d, today);
        return n >= 0 && n <= days;
    };
    const locs = state.locations.filter((l) => (0, exports.inScope)(l.id, scope));
    const scopeName = scope === 'all' ? 'вся сеть' : (0, exports.locName)(state, scope);
    const week = lastWeek(state);
    const sections = [];
    // Вкус и меню
    const taste = [];
    locs.forEach((l) => {
        const rows = state.dialIns.filter((d) => d.locationId === l.id && within(d.date, 7));
        if (!rows.length)
            return taste.push(`${l.name}: за 7 дней записей настройки нет`);
        const ok = rows.filter((r) => dialIssues(r, settings.espresso).length === 0).length;
        taste.push(`${l.name}: настройка в норме в ${Math.round((ok / rows.length) * 100)}% записей (всего ${rows.length})`);
    });
    const cups = state.cuppings.filter((c) => (0, exports.inScope)(c.locationId, scope) && within(c.date, 7));
    taste.push(cups.length ? `Оценок кофе под фильтр за неделю: ${cups.length}, средний балл ${(cups.reduce((a, c) => a + c.score, 0) / cups.length).toFixed(1)}` : 'Оценок кофе под фильтр за неделю не было');
    sections.push({ title: 'Вкус и меню', lines: taste });
    // Люди
    const att = attestSummary(state, scope);
    const people = [`Команда: ${att.total} чел., действующая аттестация у ${att.pct ?? 0}%`];
    if (att.due + att.failed + att.none > 0)
        people.push(`Просрочена: ${att.due}, не пройдена: ${att.failed}, не проходили: ${att.none}`);
    const staffIds = new Set(state.staff.filter((p) => (0, exports.inScope)(p.locationId, scope)).map((p) => p.id));
    people.push(`Аттестаций за неделю: ${state.attestations.filter((a) => staffIds.has(a.staffId) && within(a.date, 7)).length}`);
    sections.push({ title: 'Люди', lines: people });
    // Цифры
    const nums = [];
    if (week) {
        const w = weekSummary(state, week, scope);
        nums.push(`Неделя ${week}: выручка ${(0, exports.fmt)(w.revenue)} ${cur}, средний чек ${(0, exports.fmt)(w.avgCheck)} ${cur}`);
        nums.push(`Себестоимость ${w.cogs.toFixed(1)}% при цели ${settings.cogsTargetPct}%`);
    }
    else {
        nums.push('Данных по неделям пока нет');
    }
    const offs = state.writeOffs.filter((o) => (0, exports.inScope)(o.locationId, scope) && within(o.date, 7));
    nums.push(`Списаний за 7 дней: ${offs.length}`);
    const byItem = new Map();
    offs.forEach((o) => {
        const it = state.inventory.find((i) => i.id === o.itemId);
        if (!it)
            return;
        const cur2 = byItem.get(it.id) ?? { name: it.name, unit: it.unit, qty: 0 };
        cur2.qty += o.qty;
        byItem.set(it.id, cur2);
    });
    [...byItem.values()]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3)
        .forEach((x) => nums.push(`Больше всего списано: ${x.name}, ${(0, exports.fmtQty)(x.unit, x.qty)}`));
    sections.push({ title: 'Цифры', lines: nums });
    // Оборудование и санитария
    const eq = state.equipment.filter((e) => (0, exports.inScope)(e.locationId, scope));
    const overdue = eq.filter((e) => equipmentDue(e).state === 'overdue').length;
    const soon = eq.filter((e) => equipmentDue(e).state === 'soon').length;
    const openRepairs = state.repairs.filter((r) => !r.done && (0, exports.inScope)(r.locationId, scope)).length;
    sections.push({
        title: 'Оборудование',
        lines: [eq.length ? `Единиц оборудования: ${eq.length}, ТО просрочено: ${overdue}, скоро: ${soon}` : 'Оборудование ещё не внесено', `Открытых заявок на ремонт: ${openRepairs}`],
    });
    // Гость и точки
    const rounds = state.visits.filter((v) => (0, exports.inScope)(v.locationId, scope) && v.kind === 'round' && within(v.date, 7));
    const mystery = state.visits.filter((v) => (0, exports.inScope)(v.locationId, scope) && v.kind === 'mystery' && within(v.date, 30));
    const guest = [];
    guest.push(rounds.length ? `Обходов за 7 дней: ${rounds.length}, средний балл ${Math.round(rounds.reduce((a, v) => a + v.score, 0) / rounds.length)}%` : 'Обходов за 7 дней не было');
    if (mystery.length)
        guest.push(`Тайный гость за 30 дней: средний балл ${Math.round(mystery.reduce((a, v) => a + v.score, 0) / mystery.length)}%`);
    guest.push(`Открытых жалоб гостей: ${state.complaints.filter((c) => !c.resolved && (0, exports.inScope)(c.locationId, scope)).length}`);
    sections.push({ title: 'Гость и точки', lines: guest });
    // Риски
    const signals = buildSignals(state, scope);
    sections.push({
        title: 'Риски',
        lines: signals.length ? signals.slice(0, 6).map((s) => `${s.title}: ${s.detail}`) : ['Сигналов нет: всё в норме.'],
    });
    if (state.reportNote.trim())
        sections.push({ title: 'Комментарий шефа', lines: [state.reportNote.trim()] });
    const heading = `Отчёт шефа · ${settings.networkName} · ${scopeName}${week ? ` · неделя ${week}` : ''}`;
    const text = [heading, ...sections.map((s) => `\n${s.title}\n${s.lines.map((l) => `• ${l}`).join('\n')}`)].join('\n');
    return { heading, sections, text };
}
