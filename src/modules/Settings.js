"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SettingsPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const config_1 = require("../config");
const store_1 = require("../store");
const backup_1 = require("../backup");
/** Блок «Резервная копия на Google Диске»: адрес скрипта, автосохранение, статус. */
function DriveBackup() {
    const { state } = (0, store_1.useStore)();
    const cfg = (0, backup_1.useBackupConfig)();
    const [url, setUrl] = (0, react_1.useState)(cfg.url);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [note, setNote] = (0, react_1.useState)('');
    const ready = (0, backup_1.isScriptUrl)(cfg.url);
    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(backup_1.APPS_SCRIPT);
            setNote('Код скопирован. Вставьте его в редактор скрипта.');
        }
        catch {
            setNote('Не получилось скопировать автоматически. Откройте «Показать код» ниже и скопируйте вручную.');
        }
    };
    const saveUrl = () => {
        const u = url.trim();
        if (!(0, backup_1.isScriptUrl)(u))
            return setNote('Адрес должен начинаться с https://script.google.com/macros/s/ и заканчиваться на /exec.');
        (0, backup_1.saveBackupConfig)({ url: u, lastError: null });
        setNote('Адрес сохранён. Сохраняю первую копию…');
        void runNow();
    };
    const runNow = async () => {
        setBusy(true);
        const ok = await (0, backup_1.pushBackup)(state);
        setBusy(false);
        setNote(ok ? 'Готово: копия на Диске.' : '');
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043D\u0430 Google \u0414\u0438\u0441\u043A\u0435" }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", style: { marginBottom: 10 }, children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u0430\u043D\u0435\u043B\u0438 \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u041A\u043E\u043F\u0438\u044F \u043D\u0430 \u0432\u0430\u0448\u0435\u043C Google \u0414\u0438\u0441\u043A\u0435 \u0437\u0430\u0449\u0438\u0449\u0430\u0435\u0442 \u0438\u0445 \u0438 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u0432\u0441\u0451 \u0432 \u0432\u0438\u0434\u0435 \u0442\u0430\u0431\u043B\u0438\u0446\u044B: \u043F\u0430\u043F\u043A\u0430 \u00ABChief Hub\u00BB, \u0442\u0430\u0431\u043B\u0438\u0446\u0430 \u043F\u043E \u0440\u0430\u0437\u0434\u0435\u043B\u0430\u043C \u0438 \u043A\u043E\u043F\u0438\u0438 \u0434\u0430\u043D\u043D\u044B\u0445 \u0437\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 30 \u0434\u043D\u0435\u0439." }), (0, jsx_runtime_1.jsx)("div", { className: "alert", style: { marginBottom: 10 }, children: (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1 }, className: "small", children: [!ready && (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\u041D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043E. \u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0432 \u0448\u0430\u0433\u0430\u0445 \u043D\u0438\u0436\u0435." }), ready && cfg.lastOk && (0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043A\u043E\u043F\u0438\u044F: ", (0, jsx_runtime_1.jsx)("b", { children: new Date(cfg.lastOk).toLocaleString('ru-RU') }), cfg.auto ? ' · автосохранение включено' : ' · только вручную'] }), ready && !cfg.lastOk && !cfg.lastError && (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\u0410\u0434\u0440\u0435\u0441 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D, \u043A\u043E\u043F\u0438\u0439 \u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E." }), cfg.lastError && (0, jsx_runtime_1.jsx)("div", { style: { color: 'var(--bad)', marginTop: 4 }, children: cfg.lastError })] }) }), (0, jsx_runtime_1.jsxs)("ol", { className: "small", style: { paddingLeft: 18, margin: '0 0 10px' }, children: [(0, jsx_runtime_1.jsx)("li", { children: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u0434 \u0441\u043A\u0440\u0438\u043F\u0442\u0430\u00BB." }), (0, jsx_runtime_1.jsx)("li", { children: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 script.google.com, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0432 \u0441\u0432\u043E\u0439 Google, \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442\u00BB, \u0443\u0434\u0430\u043B\u0438\u0442\u0435 \u0432\u0441\u0451 \u0432 \u0440\u0435\u0434\u0430\u043A\u0442\u043E\u0440\u0435 \u0438 \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043A\u043E\u0434." }), (0, jsx_runtime_1.jsx)("li", { children: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C\u00BB, \u0437\u0430\u0442\u0435\u043C \u00AB\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C\u00BB \u2192 \u00AB\u041D\u043E\u0432\u043E\u0435 \u0440\u0430\u0437\u0432\u0435\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u0435\u00BB \u2192 \u0442\u0438\u043F \u00AB\u0412\u0435\u0431-\u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u00BB. \u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0442\u044C \u043E\u0442 \u0438\u043C\u0435\u043D\u0438: \u00AB\u042F\u00BB. \u0414\u043E\u0441\u0442\u0443\u043F: \u00AB\u0412\u0441\u0435\u00BB." }), (0, jsx_runtime_1.jsx)("li", { children: "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u0441\u0432\u043E\u0435\u043C\u0443 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0443. \u0415\u0441\u043B\u0438 Google \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0434\u0438\u0442, \u0447\u0442\u043E \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E: \u00AB\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438\u00BB \u2192 \u00AB\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u00BB." }), (0, jsx_runtime_1.jsx)("li", { children: "\u0421\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435 \u00ABURL \u0432\u0435\u0431-\u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F\u00BB (\u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043D\u0430 /exec), \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0435\u0433\u043E \u043D\u0438\u0436\u0435 \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441\u00BB." })] }), (0, jsx_runtime_1.jsx)("div", { className: "row", style: { flexWrap: 'wrap' }, children: (0, jsx_runtime_1.jsx)("button", { className: "btn ghost", onClick: copyCode, children: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u0434 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }) }), (0, jsx_runtime_1.jsxs)("details", { style: { marginTop: 8 }, children: [(0, jsx_runtime_1.jsx)("summary", { className: "small muted", children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043A\u043E\u0434" }), (0, jsx_runtime_1.jsx)("textarea", { readOnly: true, rows: 8, style: { width: '100%', marginTop: 6, fontFamily: 'monospace', fontSize: 12 }, value: backup_1.APPS_SCRIPT, onFocus: (e) => e.currentTarget.select() })] }), (0, jsx_runtime_1.jsxs)("div", { className: "row", style: { marginTop: 10 }, children: [(0, jsx_runtime_1.jsx)("input", { style: { flex: 1 }, placeholder: "https://script.google.com/macros/s/\u2026/exec", value: url, onChange: (e) => setUrl(e.target.value), "aria-label": "\u0410\u0434\u0440\u0435\u0441 \u0432\u0435\u0431-\u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F" }), (0, jsx_runtime_1.jsx)("button", { className: "btn", onClick: saveUrl, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0430\u0434\u0440\u0435\u0441" })] }), (0, jsx_runtime_1.jsxs)("label", { className: "toggle", style: { marginTop: 10 }, children: [(0, jsx_runtime_1.jsxs)("span", { children: [(0, jsx_runtime_1.jsx)("b", { children: "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" }), (0, jsx_runtime_1.jsx)("div", { className: "small muted", children: "\u0427\u0435\u0440\u0435\u0437 \u043C\u0438\u043D\u0443\u0442\u0443 \u043F\u043E\u0441\u043B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0438 \u043F\u0440\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0438 \u043F\u0430\u043D\u0435\u043B\u0438, \u0435\u0441\u043B\u0438 \u043A\u043E\u043F\u0438\u0438 \u043D\u0435 \u0431\u044B\u043B\u043E \u0431\u043E\u043B\u044C\u0448\u0435 6 \u0447\u0430\u0441\u043E\u0432." })] }), (0, jsx_runtime_1.jsx)("input", { type: "checkbox", checked: cfg.auto, onChange: (e) => (0, backup_1.saveBackupConfig)({ auto: e.target.checked }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "row", style: { marginTop: 10, flexWrap: 'wrap' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn", disabled: !ready || busy, onClick: runNow, children: busy ? 'Сохраняю…' : 'Сохранить сейчас' }), cfg.sheetUrl && (0, jsx_runtime_1.jsx)("a", { className: "btn ghost", href: cfg.sheetUrl, target: "_blank", rel: "noreferrer", children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0430\u0431\u043B\u0438\u0446\u0443" }), cfg.folderUrl && (0, jsx_runtime_1.jsx)("a", { className: "btn ghost", href: cfg.folderUrl, target: "_blank", rel: "noreferrer", children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043F\u043A\u0443" })] }), note && (0, jsx_runtime_1.jsx)("p", { className: "small", style: { marginTop: 10 }, children: note }), (0, jsx_runtime_1.jsx)("p", { className: "small muted", style: { marginTop: 10 }, children: "\u0410\u0434\u0440\u0435\u0441 \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u043D\u0438\u043A\u043E\u043C\u0443 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0439\u0442\u0435: \u043F\u043E \u043D\u0435\u043C\u0443 \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0432 \u0432\u0430\u0448\u0443 \u0442\u0430\u0431\u043B\u0438\u0446\u0443. \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435: \u0441\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0441 \u0414\u0438\u0441\u043A\u0430 \u0444\u0430\u0439\u043B chief-hub-backup.json \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0437 \u0444\u0430\u0439\u043B\u0430\u00BB \u0432 \u0431\u043B\u043E\u043A\u0435 \u00AB\u0414\u0430\u043D\u043D\u044B\u0435\u00BB." })] }));
}
function SettingsPage() {
    const { state, update, replace, resetDemo } = (0, store_1.useStore)();
    const { settings } = state;
    const [newLoc, setNewLoc] = (0, react_1.useState)('');
    const file = (0, react_1.useRef)(null);
    const [msg, setMsg] = (0, react_1.useState)('');
    const setS = (patch) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    const addLoc = () => {
        if (!newLoc.trim())
            return;
        update((s) => ({ ...s, locations: [...s.locations, { id: (0, store_1.uid)(), name: newLoc.trim() }] }));
        setNewLoc('');
    };
    const renameLoc = (id, name) => update((s) => ({ ...s, locations: s.locations.map((l) => (l.id === id ? { ...l, name } : l)) }));
    const removeLoc = (id) => {
        if (state.locations.length <= 1)
            return setMsg('Должна остаться хотя бы одна точка.');
        if (!confirm('Удалить точку вместе с её сотрудниками, журналами и показателями?'))
            return;
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
                receipts: s.receipts.filter((x) => x.locationId !== id),
                daySales: s.daySales.filter((x) => x.locationId !== id),
                inventory: s.inventory.map((it) => {
                    const opening = { ...it.opening };
                    delete opening[id];
                    return { ...it, opening, locationIds: it.locationIds.filter((x) => x !== id) };
                }),
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
    const importData = async (f) => {
        try {
            const data = (0, store_1.migrate)(JSON.parse(await f.text()));
            if (!data)
                throw new Error('bad');
            replace(data);
            setMsg('Данные загружены.');
        }
        catch {
            setMsg('Не получилось прочитать файл. Нужен файл, сохранённый кнопкой «Скачать данные».');
        }
    };
    const clearAll = () => {
        if (!confirm('Стереть все демо-данные и начать с чистого листа? Точки останутся.'))
            return;
        update((s) => ({
            ...s,
            staff: [],
            attestations: [],
            dialIns: [],
            cuppings: [],
            recipes: [],
            inventory: [],
            receipts: [],
            writeOffs: [],
            daySales: [],
            metrics: [],
            equipment: [],
            repairs: [],
            visits: [],
            complaints: [],
            reportNote: '',
            playbook: [],
        }));
    };
    const num = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "stack", children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid two", children: [(0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u0421\u0435\u0442\u044C" }), (0, jsx_runtime_1.jsxs)("div", { className: "form", children: [(0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u0435\u0442\u0438", (0, jsx_runtime_1.jsx)("input", { value: settings.networkName, onChange: (e) => setS({ networkName: e.target.value }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0412\u0430\u043B\u044E\u0442\u0430", (0, jsx_runtime_1.jsx)("input", { style: { width: 70 }, value: settings.currency, onChange: (e) => setS({ currency: e.target.value }) })] })] }), (0, jsx_runtime_1.jsx)("h3", { style: { margin: '18px 0 8px' }, children: "\u0422\u043E\u0447\u043A\u0438" }), (0, jsx_runtime_1.jsxs)("div", { className: "stack", style: { gap: 8 }, children: [state.locations.map((l) => ((0, jsx_runtime_1.jsxs)("div", { className: "row", children: [(0, jsx_runtime_1.jsx)("input", { style: { flex: 1 }, value: l.name, onChange: (e) => renameLoc(l.id, e.target.value), "aria-label": "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0447\u043A\u0438" }), (0, jsx_runtime_1.jsx)("button", { className: "btn danger sm", onClick: () => removeLoc(l.id), children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] }, l.id))), (0, jsx_runtime_1.jsxs)("div", { className: "row", children: [(0, jsx_runtime_1.jsx)("input", { style: { flex: 1 }, placeholder: "\u041D\u043E\u0432\u0430\u044F \u0442\u043E\u0447\u043A\u0430", value: newLoc, onChange: (e) => setNewLoc(e.target.value), onKeyDown: (e) => e.key === 'Enter' && addLoc() }), (0, jsx_runtime_1.jsx)("button", { className: "btn", onClick: addLoc, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u0420\u0430\u0437\u0434\u0435\u043B\u044B" }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", children: "\u0412\u043A\u043B\u044E\u0447\u0430\u0439\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u043E, \u0447\u0435\u043C \u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0435\u0441\u044C. \u041B\u0438\u0448\u043D\u0435\u0435 \u0441\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0438\u0437 \u043C\u0435\u043D\u044E." }), config_1.MODULES.map((m) => ((0, jsx_runtime_1.jsxs)("label", { className: "toggle", children: [(0, jsx_runtime_1.jsxs)("span", { children: [(0, jsx_runtime_1.jsxs)("b", { children: [m.icon, " ", m.title] }), (0, jsx_runtime_1.jsx)("div", { className: "small muted", children: m.hint })] }), (0, jsx_runtime_1.jsx)("input", { type: "checkbox", checked: m.locked ? true : settings.modules[m.id], disabled: m.locked, onChange: (e) => setS({ modules: { ...settings.modules, [m.id]: e.target.checked } }) })] }, m.id)))] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u041D\u043E\u0440\u043C\u044B \u044D\u0441\u043F\u0440\u0435\u0441\u0441\u043E" }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", style: { marginBottom: 10 }, children: "\u041F\u043E \u043D\u0438\u043C \u0440\u0430\u0437\u0434\u0435\u043B \u00AB\u041A\u0430\u0447\u0435\u0441\u0442\u0432\u043E\u00BB \u0440\u0435\u0448\u0430\u0435\u0442, \u0432 \u043D\u043E\u0440\u043C\u0435 \u043B\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u043F\u043E\u043C\u043E\u043B\u0430. \u041F\u043E\u0434\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434 \u0432\u0430\u0448 \u0440\u0435\u0446\u0435\u043F\u0442." }), (0, jsx_runtime_1.jsxs)("div", { className: "form", children: [(0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0421\u043E\u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 (\u0432\u044B\u0445\u043E\u0434 \u00F7 \u0434\u043E\u0437\u0430)", (0, jsx_runtime_1.jsx)("input", { type: "number", step: "0.1", min: 0.5, value: settings.espresso.ratio, onChange: (e) => setS({ espresso: { ...settings.espresso, ratio: num(e.target.value, 2) } }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0414\u043E\u043F\u0443\u0441\u043A \u043F\u043E \u0432\u044B\u0445\u043E\u0434\u0443, \u0433", (0, jsx_runtime_1.jsx)("input", { type: "number", step: "0.5", min: 0, value: settings.espresso.yieldTol, onChange: (e) => setS({ espresso: { ...settings.espresso, yieldTol: num(e.target.value, 2) } }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0412\u0440\u0435\u043C\u044F \u043E\u0442, \u0441", (0, jsx_runtime_1.jsx)("input", { type: "number", min: 0, value: settings.espresso.timeMin, onChange: (e) => setS({ espresso: { ...settings.espresso, timeMin: num(e.target.value, 25) } }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0412\u0440\u0435\u043C\u044F \u0434\u043E, \u0441", (0, jsx_runtime_1.jsx)("input", { type: "number", min: 0, value: settings.espresso.timeMax, onChange: (e) => setS({ espresso: { ...settings.espresso, timeMax: num(e.target.value, 30) } }) })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u041D\u043E\u0440\u043C\u044B \u0441\u0435\u0442\u0438" }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", style: { marginBottom: 10 }, children: "\u041F\u043E \u043D\u0438\u043C \u00AB\u041E\u0431\u0437\u043E\u0440\u00BB \u0438 \u00AB\u041E\u0442\u0447\u0451\u0442\u00BB \u0440\u0435\u0448\u0430\u044E\u0442, \u0447\u0442\u043E \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435\u043C. \u041F\u043E\u0434\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434 \u0432\u0430\u0448\u0443 \u0441\u0435\u0442\u044C." }), (0, jsx_runtime_1.jsxs)("div", { className: "form", children: [(0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0426\u0435\u043B\u0435\u0432\u0430\u044F \u0441\u0435\u0431\u0435\u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C, %", (0, jsx_runtime_1.jsx)("input", { type: "number", step: "0.5", min: 0, max: 100, value: settings.cogsTargetPct, onChange: (e) => setS({ cogsTargetPct: num(e.target.value, 28) }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u0410\u0442\u0442\u0435\u0441\u0442\u0430\u0446\u0438\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442, \u0434\u043D.", (0, jsx_runtime_1.jsx)("input", { type: "number", min: 1, value: settings.attestDays, onChange: (e) => setS({ attestDays: Math.max(1, num(e.target.value, 180)) }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "f", children: ["\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0431\u0430\u043B\u043B \u043E\u0431\u0445\u043E\u0434\u0430, %", (0, jsx_runtime_1.jsx)("input", { type: "number", min: 0, max: 100, value: settings.visitMinScore, onChange: (e) => setS({ visitMinScore: num(e.target.value, 80) }) })] })] })] }), (0, jsx_runtime_1.jsx)(DriveBackup, {}), (0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u0414\u0430\u043D\u043D\u044B\u0435" }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", style: { marginBottom: 10 }, children: "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432\u0441\u0451 \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u043D\u0430 \u044D\u0442\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435. \u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u043A\u043E\u043F\u0438\u044E, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u043B\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430 \u0432\u0441\u044F\u043A\u0438\u0439 \u0441\u043B\u0443\u0447\u0430\u0439." }), (0, jsx_runtime_1.jsxs)("div", { className: "row", children: [(0, jsx_runtime_1.jsx)("button", { className: "btn", onClick: exportData, children: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435" }), (0, jsx_runtime_1.jsx)("button", { className: "btn ghost", onClick: () => file.current?.click(), children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0437 \u0444\u0430\u0439\u043B\u0430" }), (0, jsx_runtime_1.jsx)("input", { ref: file, type: "file", accept: "application/json", hidden: true, onChange: (e) => { const f = e.target.files?.[0]; if (f)
                                    importData(f); e.target.value = ''; } }), (0, jsx_runtime_1.jsx)("button", { className: "btn ghost", onClick: clearAll, children: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0434\u0435\u043C\u043E-\u0434\u0430\u043D\u043D\u044B\u0435" }), (0, jsx_runtime_1.jsx)("button", { className: "btn danger", onClick: () => confirm('Вернуть исходные демо-данные? Ваши изменения пропадут.') && resetDemo(), children: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0434\u0435\u043C\u043E" })] }), msg && (0, jsx_runtime_1.jsx)("p", { className: "small", style: { marginTop: 10 }, children: msg })] })] }));
}
