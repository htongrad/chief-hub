"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const config_1 = require("./config");
const store_1 = require("./store");
const backup_1 = require("./backup");
const Overview_1 = __importDefault(require("./modules/Overview"));
const Playbook_1 = __importDefault(require("./modules/Playbook"));
const Team_1 = __importDefault(require("./modules/Team"));
const Quality_1 = __importDefault(require("./modules/Quality"));
const Inventory_1 = __importDefault(require("./modules/Inventory"));
const Metrics_1 = __importDefault(require("./modules/Metrics"));
const Equipment_1 = __importDefault(require("./modules/Equipment"));
const Rounds_1 = __importDefault(require("./modules/Rounds"));
const Report_1 = __importDefault(require("./modules/Report"));
const Settings_1 = __importDefault(require("./modules/Settings"));
const VIEWS = {
    overview: Overview_1.default,
    quality: Quality_1.default,
    team: Team_1.default,
    inventory: Inventory_1.default,
    metrics: Metrics_1.default,
    equipment: Equipment_1.default,
    rounds: Rounds_1.default,
    report: Report_1.default,
    playbook: Playbook_1.default,
    settings: Settings_1.default,
};
function App() {
    const { state, update } = (0, store_1.useStore)();
    const [active, setActive] = (0, react_1.useState)('overview');
    (0, backup_1.useAutoBackup)(state);
    const enabled = config_1.MODULES.filter((m) => m.locked || state.settings.modules[m.id]);
    const current = enabled.find((m) => m.id === active) ?? enabled[0];
    const View = VIEWS[current.id];
    (0, react_1.useEffect)(() => {
        document.title = `${state.settings.networkName} · ${current.title}`;
        window.scrollTo(0, 0);
    }, [current.id, state.settings.networkName]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "app", children: [(0, jsx_runtime_1.jsxs)("nav", { className: "nav", "aria-label": "\u0420\u0430\u0437\u0434\u0435\u043B\u044B", children: [(0, jsx_runtime_1.jsxs)("div", { className: "brand", children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: 24 }, children: "\u2615" }), (0, jsx_runtime_1.jsxs)("div", { children: ["Chief Hub", (0, jsx_runtime_1.jsx)("small", { children: state.settings.networkName })] })] }), enabled.map((m) => ((0, jsx_runtime_1.jsxs)("button", { className: m.id === current.id ? 'active' : '', onClick: () => setActive(m.id), "aria-current": m.id === current.id ? 'page' : undefined, children: [(0, jsx_runtime_1.jsx)("span", { className: "ico", "aria-hidden": true, children: m.icon }), m.title] }, m.id)))] }), (0, jsx_runtime_1.jsxs)("main", { className: "main", children: [(0, jsx_runtime_1.jsxs)("div", { className: "topbar", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h1", { children: current.title }), (0, jsx_runtime_1.jsx)("p", { className: "sub", children: current.hint })] }), current.id !== 'settings' && current.id !== 'playbook' && ((0, jsx_runtime_1.jsxs)("div", { className: "scope", children: [(0, jsx_runtime_1.jsx)("label", { htmlFor: "scope", children: "\u0422\u043E\u0447\u043A\u0430" }), (0, jsx_runtime_1.jsxs)("select", { id: "scope", value: state.settings.activeLocation, onChange: (e) => update((s) => ({ ...s, settings: { ...s.settings, activeLocation: e.target.value } })), children: [(0, jsx_runtime_1.jsx)("option", { value: "all", children: "\u0412\u0441\u044F \u0441\u0435\u0442\u044C" }), state.locations.map((l) => ((0, jsx_runtime_1.jsx)("option", { value: l.id, children: l.name }, l.id)))] })] }))] }), (0, jsx_runtime_1.jsx)(View, {})] })] }));
}
