"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Report;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const store_1 = require("../store");
function Report() {
    const { state, update } = (0, store_1.useStore)();
    const scope = state.settings.activeLocation;
    const report = (0, store_1.buildReport)(state, scope);
    const [copied, setCopied] = (0, react_1.useState)(false);
    const copy = () => {
        navigator.clipboard
            ?.writeText(report.text)
            .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        })
            .catch(() => { });
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "stack", children: [(0, jsx_runtime_1.jsx)("div", { className: "card", children: (0, jsx_runtime_1.jsxs)("div", { className: "row spread", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { children: report.heading }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", children: "\u0421\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u0441\u0430\u043C \u0438\u0437 \u0434\u0430\u043D\u043D\u044B\u0445 \u043F\u0430\u043D\u0435\u043B\u0438. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u043E\u0447\u043A\u0443 \u0438\u043B\u0438 \u0432\u0441\u044E \u0441\u0435\u0442\u044C \u0432\u0432\u0435\u0440\u0445\u0443, \u0434\u043E\u043F\u0438\u0448\u0438\u0442\u0435 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0438 \u0441\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435." })] }), (0, jsx_runtime_1.jsx)("button", { className: "btn", onClick: copy, children: copied ? 'Скопировано' : 'Скопировать отчёт' })] }) }), (0, jsx_runtime_1.jsx)("div", { className: "grid two", children: report.sections
                    .filter((s) => s.title !== 'Комментарий шефа')
                    .map((s) => ((0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: s.title }), (0, jsx_runtime_1.jsx)("div", { className: "stack", style: { gap: 6 }, children: s.lines.map((l, i) => ((0, jsx_runtime_1.jsxs)("p", { className: "small", children: ["\u2022 ", l] }, i))) })] }, s.title))) }), (0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0448\u0435\u0444\u0430" }), (0, jsx_runtime_1.jsx)("p", { className: "muted small", style: { marginBottom: 8 }, children: "\u0427\u0442\u043E \u0432\u0430\u0436\u043D\u043E \u0437\u043D\u0430\u0442\u044C \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044E \u0441\u0432\u0435\u0440\u0445 \u0446\u0438\u0444\u0440. \u041F\u043E\u043F\u0430\u0434\u0451\u0442 \u0432 \u043A\u043E\u043D\u0435\u0446 \u043E\u0442\u0447\u0451\u0442\u0430." }), (0, jsx_runtime_1.jsx)("textarea", { style: { width: '100%', minHeight: 90 }, value: state.reportNote, onChange: (e) => update((s) => ({ ...s, reportNote: e.target.value })), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043D\u0430 \u0421\u0435\u0432\u0435\u0440\u0435 \u043D\u0443\u0436\u043D\u0430 \u0437\u0430\u043C\u0435\u043D\u0430 \u043A\u043E\u0444\u0435\u043C\u043E\u043B\u043A\u0438 \u0434\u043E \u043A\u043E\u043D\u0446\u0430 \u043C\u0435\u0441\u044F\u0446\u0430" })] })] }));
}
