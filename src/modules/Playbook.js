"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Playbook;
const jsx_runtime_1 = require("react/jsx-runtime");
const config_1 = require("../config");
const store_1 = require("../store");
function Playbook() {
    const { state, update } = (0, store_1.useStore)();
    const toggle = (id) => update((s) => ({ ...s, playbook: s.playbook.includes(id) ? s.playbook.filter((x) => x !== id) : [...s.playbook, id] }));
    const total = config_1.PLAYBOOK.reduce((a, s) => a + s.items.length, 0);
    const firstOpen = config_1.PLAYBOOK.find((st) => st.items.some((i) => !state.playbook.includes(i.id)));
    return ((0, jsx_runtime_1.jsxs)("div", { className: "stack", children: [(0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("div", { className: "row spread", children: (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u041E\u0431\u0449\u0438\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" }), (0, jsx_runtime_1.jsxs)("p", { className: "muted small", children: [state.playbook.length, " \u0438\u0437 ", total, " \u0448\u0430\u0433\u043E\u0432.", ' ', firstOpen ? `Сейчас этап: «${firstOpen.title}» (${firstOpen.period}).` : 'Все этапы пройдены — пора обновлять план под новые цели сети.'] })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "progress", style: { marginTop: 10 }, children: (0, jsx_runtime_1.jsx)("i", { style: { width: `${(state.playbook.length / total) * 100}%` } }) })] }), (0, jsx_runtime_1.jsx)("div", { className: "grid two", children: config_1.PLAYBOOK.map((st) => {
                    const done = st.items.filter((i) => state.playbook.includes(i.id)).length;
                    return ((0, jsx_runtime_1.jsxs)("div", { className: "card stage", children: [(0, jsx_runtime_1.jsxs)("div", { className: "row spread", children: [(0, jsx_runtime_1.jsx)("h2", { children: st.title }), (0, jsx_runtime_1.jsx)("span", { className: `pill ${done === st.items.length ? 'ok' : ''}`, children: st.period })] }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", children: st.goal }), (0, jsx_runtime_1.jsx)("div", { children: st.items.map((it) => {
                                    const on = state.playbook.includes(it.id);
                                    return ((0, jsx_runtime_1.jsxs)("label", { className: `check ${on ? 'done' : ''}`, children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", checked: on, onChange: () => toggle(it.id) }), (0, jsx_runtime_1.jsx)("span", { children: it.text })] }, it.id));
                                }) }), (0, jsx_runtime_1.jsxs)("p", { className: "small muted", children: [done, " \u0438\u0437 ", st.items.length] })] }, st.id));
                }) }), (0, jsx_runtime_1.jsxs)("p", { className: "small muted", children: ["\u041F\u043B\u0430\u043D \u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439: \u0435\u0433\u043E \u043F\u0443\u043D\u043A\u0442\u044B \u043B\u0435\u0436\u0430\u0442 \u0432 \u0444\u0430\u0439\u043B\u0435 ", (0, jsx_runtime_1.jsx)("code", { children: "src/config.ts" }), " \u0438 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u043F\u043E\u0434 \u043B\u044E\u0431\u0443\u044E \u0441\u0435\u0442\u044C."] })] }));
}
