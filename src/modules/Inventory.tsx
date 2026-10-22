import { useState } from 'react';
import { WRITE_OFF_REASONS } from '../config';
import {
  BASE_LABEL,
  RECEIPT_UNITS,
  countDiffPct,
  problemItems,
  STOCK_FACTOR,
  STOCK_LABEL,
  avgPrice,
  daysBetween,
  fmtMoney,
  fmtQty,
  inScope,
  itemAt,
  locName,
  receiptUnitPrice,
  reorderList,
  stockOf,
  todayISO,
  uid,
  useStore,
} from '../store';
import type { BaseUnit, InventoryItem } from '../types';

type Tab = 'stock' | 'count' | 'receipt' | 'writeoff' | 'sales';
const TABS: { id: Tab; label: string }[] = [
  { id: 'stock', label: 'Сток' },
  { id: 'count', label: 'Инвентаризация' },
  { id: 'receipt', label: 'Приход' },
  { id: 'writeoff', label: 'Списание' },
  { id: 'sales', label: 'Расход за день' },
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Числовое поле: значение применяется, когда закончили ввод (уход из поля или Enter). */
function NumField({ value, onCommit, label, width = 76, bad = false }: { value: number; onCommit: (n: number) => void; label: string; width?: number; bad?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  const commit = () => {
    if (txt !== null) {
      const n = parseFloat(txt.replace(',', '.'));
      if (Number.isFinite(n)) onCommit(n);
      setTxt(null);
    }
  };
  return (
    <input
      type="number"
      step="any"
      value={txt ?? String(round3(value))}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      style={{ width, borderColor: bad ? 'var(--bad)' : undefined }}
      aria-label={label}
    />
  );
}

const UNIT_OPTIONS: BaseUnit[] = ['g', 'ml', 'pcs'];

export default function Inventory() {
  const { state, update } = useStore();
  const scope = state.settings.activeLocation;
  const locs = state.locations.filter((l) => inScope(l.id, scope));
  const defLoc = scope !== 'all' ? scope : state.locations[0]?.id ?? '';
  const today = todayISO();

  const [tab, setTab] = useState<Tab>('stock');
  const [msg, setMsg] = useState('');

  // ——— Новая позиция ———
  const [n, setN] = useState({ name: '', category: 'Кофе', unit: 'g' as BaseUnit, par: 0, all: true, locs: [] as string[] });
  const add = () => {
    const name = n.name.trim();
    if (!name) return;
    if (state.inventory.some((i) => i.name.trim().toLowerCase() === name.toLowerCase())) return setMsg('Позиция с таким названием уже есть в банке.');
    update((s) => ({
      ...s,
      inventory: [
        ...s.inventory,
        { id: uid(), name, category: n.category.trim() || 'Прочее', unit: n.unit, par: n.par * STOCK_FACTOR[n.unit], allLocations: n.all, locationIds: n.all ? [] : n.locs, opening: {} },
      ],
    }));
    setMsg('');
    setN({ ...n, name: '' });
  };
  const remove = (id: string) => confirm('Удалить позицию из банка ингредиентов? Приходы и списания по ней тоже пропадут.') && update((s) => ({
    ...s,
    inventory: s.inventory.filter((i) => i.id !== id),
    receipts: s.receipts.filter((x) => x.itemId !== id),
    writeOffs: s.writeOffs.filter((x) => x.itemId !== id),
    stocktakes: s.stocktakes.map((t) => ({ ...t, lines: t.lines.filter((l) => l.itemId !== id) })).filter((t) => t.lines.length > 0),
    recipes: s.recipes.map((r) => ({ ...r, ingredients: r.ingredients.map((i) => (i.itemId === id ? { name: i.name, amount: i.amount, unit: i.unit } : i)) })),
  }));

  // ——— Инвентаризация: фактический остаток выравнивает сток, пересчёт остаётся в истории ———
  const [ct, setCt] = useState({ locationId: defLoc, date: today, onlyProblem: false, facts: {} as Record<string, string> });
  const problems = problemItems(state, locs.map((l) => l.id));
  const ctProblemIds = new Set(problemItems(state, [ct.locationId]).map((p) => p.item.id));
  const ctItems = state.inventory.filter((i) => itemAt(i, ct.locationId) && (!ct.onlyProblem || ctProblemIds.has(i.id)));
  const saveCount = () => {
    const entered = ctItems
      .map((it) => ({ it, v: parseFloat((ct.facts[it.id] ?? '').replace(',', '.')) }))
      .filter((x) => Number.isFinite(x.v) && x.v >= 0);
    if (!ct.locationId || !ct.date || entered.length === 0) return;
    update((s) => {
      const lines = entered.map(({ it, v }) => ({ itemId: it.id, expected: round3(stockOf(s, it, ct.locationId)), actual: round3(v * STOCK_FACTOR[it.unit]) }));
      const delta = new Map(lines.map((l) => [l.itemId, l.actual - l.expected]));
      return {
        ...s,
        stocktakes: [{ id: uid(), locationId: ct.locationId, date: ct.date, lines }, ...s.stocktakes],
        inventory: s.inventory.map((i) => (delta.has(i.id) ? { ...i, opening: { ...i.opening, [ct.locationId]: round3((i.opening[ct.locationId] ?? 0) + (delta.get(i.id) ?? 0)) } } : i)),
      };
    });
    setCt({ ...ct, facts: {} });
  };
  const recentCounts = state.stocktakes.filter((t) => inScope(t.locationId, scope)).sort((a, b) => b.date.localeCompare(a.date));

  const setPar = (itemId: string, v: number) =>
    update((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === itemId ? { ...i, par: Math.max(0, v) * STOCK_FACTOR[i.unit] } : i)) }));
  const setAll = (itemId: string, all: boolean) => update((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === itemId ? { ...i, allLocations: all, locationIds: all ? [] : s.locations.map((l) => l.id) } : i)) }));
  const toggleLoc = (itemId: string, locId: string) =>
    update((s) => ({
      ...s,
      inventory: s.inventory.map((i) => (i.id === itemId ? { ...i, locationIds: i.locationIds.includes(locId) ? i.locationIds.filter((x) => x !== locId) : [...i.locationIds, locId] } : i)),
    }));

  // ——— Приход ———
  const cur = state.settings.currency;
  /** Сумма из поля ввода: пусто или неверно = цены нет. */
  const parseSum = (s: string) => {
    const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const [rc, setRc] = useState({ locationId: defLoc, itemId: '', qty: 1, unit: 'кг', date: today, sum: '' });
  const rcUnit = RECEIPT_UNITS.find((u) => u.label === rc.unit) ?? RECEIPT_UNITS[0];
  const rcItems = state.inventory.filter((i) => i.unit === rcUnit.base && itemAt(i, rc.locationId));
  const rcItem = rcItems.find((i) => i.id === rc.itemId) ?? rcItems[0];
  const rcSum = parseSum(rc.sum);
  const rcPrice = rcItem && rcSum ? receiptUnitPrice(rcItem, { qty: rc.qty * rcUnit.factor, sum: rcSum }) : null;
  const addReceipt = () => {
    if (!rcItem || !rc.locationId || !(rc.qty > 0)) return;
    update((s) => ({
      ...s,
      receipts: [{ id: uid(), locationId: rc.locationId, itemId: rcItem.id, qty: rc.qty * rcUnit.factor, date: rc.date || todayISO(), ...(rcSum ? { sum: rcSum } : {}) }, ...s.receipts],
    }));
    setRc({ ...rc, qty: 1, sum: '' });
  };
  /** Дописать, исправить или убрать сумму по накладной у уже записанного прихода. */
  const editSum = (id: string, current?: number) => {
    const raw = prompt(`Сумма по накладной с НДС за весь объём, ${cur}. Пусто — убрать цену.`, current ? String(current) : '');
    if (raw === null) return;
    const sum = parseSum(raw);
    update((s) => ({ ...s, receipts: s.receipts.map((x) => (x.id === id ? { ...x, sum } : x)) }));
  };

  // ——— Списание ———
  const [w, setW] = useState({ locationId: defLoc, itemId: '', qty: 1, unit: 'g' as BaseUnit, reason: WRITE_OFF_REASONS[0] });
  const wItems = state.inventory.filter((i) => i.unit === w.unit && itemAt(i, w.locationId));
  const wItem = wItems.find((i) => i.id === w.itemId) ?? wItems[0];
  const writeOff = () => {
    if (!wItem || !w.locationId || !(w.qty > 0)) return;
    update((s) => ({ ...s, writeOffs: [{ id: uid(), locationId: w.locationId, itemId: wItem.id, qty: w.qty, reason: w.reason, date: todayISO() }, ...s.writeOffs] }));
    setW({ ...w, qty: 1 });
  };

  // ——— Расход за день (продажи из кассы) ———
  const findSales = (locationId: string, date: string) => state.daySales.find((d) => d.locationId === locationId && d.date === date);
  const countsOf = (locationId: string, date: string) => {
    const out: Record<string, string> = {};
    findSales(locationId, date)?.lines.forEach((l) => (out[l.recipeId] = String(l.count)));
    return out;
  };
  const [sl, setSl] = useState({ locationId: defLoc, date: today, counts: countsOf(defLoc, today) });
  const pickSales = (patch: Partial<{ locationId: string; date: string }>) => {
    const locationId = patch.locationId ?? sl.locationId;
    const date = patch.date ?? sl.date;
    setSl({ locationId, date, counts: countsOf(locationId, date) });
  };
  const saveSales = () => {
    const lines = state.recipes
      .map((r) => ({ recipeId: r.id, count: Math.floor(parseFloat((sl.counts[r.id] ?? '').replace(',', '.')) || 0) }))
      .filter((l) => l.count > 0);
    if (!sl.locationId || !sl.date || lines.length === 0) return;
    update((s) => ({
      ...s,
      daySales: [{ id: uid(), locationId: sl.locationId, date: sl.date, lines }, ...s.daySales.filter((d) => !(d.locationId === sl.locationId && d.date === sl.date))],
    }));
  };
  const existing = findSales(sl.locationId, sl.date);

  const recentOffs = state.writeOffs.filter((o) => inScope(o.locationId, scope) && daysBetween(o.date, today) <= 30).sort((a, b) => b.date.localeCompare(a.date));
  const recentIn = state.receipts.filter((o) => inScope(o.locationId, scope) && daysBetween(o.date, today) <= 30).sort((a, b) => b.date.localeCompare(a.date));
  const recentSales = state.daySales.filter((o) => inScope(o.locationId, scope) && daysBetween(o.date, today) <= 30).sort((a, b) => b.date.localeCompare(a.date));
  const itemOf = (id: string) => state.inventory.find((i) => i.id === id);

  // ——— Список закупки ———
  const reorder = reorderList(state, locs.map((l) => l.id));
  const copyList = () => {
    const text = reorder.map((x) => `${x.item.name}: ${fmtQty(x.item.unit, x.need)}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };
  const stockText = (it: InventoryItem, q: number) => `${round3(q / STOCK_FACTOR[it.unit])} ${STOCK_LABEL[it.unit]}`;

  const ctProblems = new Set(problems.map((p) => `${p.item.id}|${p.locationId}`));
  const categories = [...new Set(state.inventory.map((i) => i.category))];

  const LocationChecks = ({ all, ids, onAll, onToggle }: { all: boolean; ids: string[]; onAll: (v: boolean) => void; onToggle: (id: string) => void }) => (
    <div className="small">
      <label><input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} /> Все точки</label>
      {!all && state.locations.map((l) => (
        <label key={l.id} style={{ display: 'block' }}><input type="checkbox" checked={ids.includes(l.id)} onChange={() => onToggle(l.id)} /> {l.name}</label>
      ))}
    </div>
  );

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <h2>Список закупки</h2>
          {reorder.length > 0 && <button className="btn ghost sm" onClick={copyList}>Скопировать</button>}
        </div>
        {reorder.length === 0 ? (
          <p className="muted">Всё выше минимального остатка — закупать ничего не нужно.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <tbody>
                {reorder.map((x) => (
                  <tr key={x.item.id}>
                    <td><b>{x.item.name}</b> <span className="small muted">· {x.item.category}</span></td>
                    <td className="num">довезти {fmtQty(x.item.unit, x.need)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'btn sm' : 'btn ghost sm'} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <p className="muted small">
            Сток считается сам: стартовый остаток + приходы − списания − расход по продажам (стандарты из «Качества»). Показан в кг, л и шт. Если по факту цифра другая, внесите её на вкладке «Инвентаризация». ⚠ — расхождение при последнем пересчёте выше допустимого.
            «Минимальный остаток» — уровень, ниже которого позиция на точке попадёт в список закупки.
          </p>
          {state.inventory.length === 0 && <div className="card"><div className="empty">Банк ингредиентов пуст. Добавьте стандарт в «Качестве» — ингредиенты появятся здесь сами, или добавьте позицию ниже.</div></div>}
          {categories.map((cat) => (
            <div className="card flat" key={cat}>
              <div style={{ padding: '14px 16px 0' }}><h2>{cat}</h2></div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Позиция</th>
                      {locs.map((l) => <th key={l.id} className="num">{l.name}</th>)}
                      <th className="num" title="Средняя цена за кг, л или шт с НДС по приходам с суммой">Цена, {cur}</th>
                      <th className="num">Минимальный остаток</th>
                      <th>Где есть</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.inventory.filter((i) => i.category === cat).map((i) => (
                      <tr key={i.id}>
                        <td><b>{i.name}</b> <span className="small muted">{STOCK_LABEL[i.unit]}</span></td>
                        {locs.map((l) => {
                          if (!itemAt(i, l.id)) return <td className="num muted" key={l.id}>—</td>;
                          const q = stockOf(state, i, l.id);
                          return (
                            <td className="num" key={l.id} style={{ color: q < i.par ? 'var(--bad)' : undefined, fontWeight: q < i.par ? 600 : undefined }}>
                              {round3(q / STOCK_FACTOR[i.unit])}
                              {ctProblems.has(`${i.id}|${l.id}`) && <span title="Расхождение при последней инвентаризации"> ⚠</span>}
                            </td>
                          );
                        })}
                        <td className="num">
                          {(() => {
                            const p = avgPrice(state, i);
                            return p ? <span title={`Средняя по приходам с суммой: ${p.count}`}>{fmtMoney(p.perUnit)}</span> : <span className="muted">—</span>;
                          })()}
                        </td>
                        <td className="num"><NumField value={i.par / STOCK_FACTOR[i.unit]} onCommit={(v) => setPar(i.id, v)} label={`Минимальный остаток: ${i.name}`} /></td>
                        <td><LocationChecks all={i.allLocations} ids={i.locationIds} onAll={(v) => setAll(i.id, v)} onToggle={(id) => toggleLoc(i.id, id)} /></td>
                        <td><button className="btn danger sm" onClick={() => remove(i.id)} aria-label={`Удалить ${i.name}`}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="card">
            <h2>Новая позиция</h2>
            <div className="form">
              <div className="f">Название<input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
              <div className="f">Категория<input value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })} list="cats" />
                <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="f">Учёт в
                <select value={n.unit} onChange={(e) => setN({ ...n, unit: e.target.value as BaseUnit })}>
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{STOCK_LABEL[u]}{u !== 'pcs' ? ` (расход в ${BASE_LABEL[u]})` : ''}</option>)}
                </select>
              </div>
              <div className="f">Минимальный остаток, {STOCK_LABEL[n.unit]}<input type="number" min={0} step="any" value={n.par} onChange={(e) => setN({ ...n, par: +e.target.value })} /></div>
              <div className="f">Где есть
                <LocationChecks all={n.all} ids={n.locs} onAll={(v) => setN({ ...n, all: v, locs: v ? [] : state.locations.map((l) => l.id) })} onToggle={(id) => setN({ ...n, locs: n.locs.includes(id) ? n.locs.filter((x) => x !== id) : [...n.locs, id] })} />
              </div>
              <button className="btn" onClick={add}>Добавить</button>
            </div>
            {msg && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>{msg}</p>}
          </div>
        </>
      )}

      {tab === 'count' && (
        <div className="grid two">
          <div className="card">
            <h2>Инвентаризация</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              Внесите фактический остаток в {'кг, л и шт'}. Пустые позиции пропускаются. После сохранения сток на точке станет равен факту, а расхождение с расчётом останется в истории.
              Позиции с расхождением выше {state.settings.stocktakeTolPct}% (порог в «Настройках») помечаются как проблемные и попадают в «Пересчитать выборочно».
            </p>
            <div className="form">
              <div className="f">Точка
                <select value={ct.locationId} onChange={(e) => setCt({ ...ct, locationId: e.target.value, facts: {} })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="f">Дата<input type="date" value={ct.date} onChange={(e) => setCt({ ...ct, date: e.target.value })} /></div>
              <div className="f">Какие позиции
                <select value={ct.onlyProblem ? 'p' : 'a'} onChange={(e) => setCt({ ...ct, onlyProblem: e.target.value === 'p' })}>
                  <option value="a">Все</option>
                  <option value="p">Только проблемные ({ctProblemIds.size})</option>
                </select>
              </div>
            </div>
            {ctItems.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>{ct.onlyProblem ? 'Проблемных позиций на этой точке нет.' : 'На этой точке нет позиций.'}</p>
            ) : (
              <div className="tablewrap" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>Позиция</th><th className="num">По расчёту</th><th className="num">Факт</th></tr></thead>
                  <tbody>
                    {ctItems.map((i) => {
                      const exp = stockOf(state, i, ct.locationId);
                      const raw = ct.facts[i.id] ?? '';
                      const v = parseFloat(raw.replace(',', '.'));
                      const pct = Number.isFinite(v) ? countDiffPct(exp, v * STOCK_FACTOR[i.unit]) : null;
                      return (
                        <tr key={i.id}>
                          <td>
                            <b>{i.name}</b> {ctProblemIds.has(i.id) && <span title="Проблемная позиция">⚠</span>}
                            {pct !== null && pct > state.settings.stocktakeTolPct && <div className="small" style={{ color: 'var(--bad)' }}>расхождение {Math.round(pct)}%</div>}
                          </td>
                          <td className="num">{round3(exp / STOCK_FACTOR[i.unit])} {STOCK_LABEL[i.unit]}</td>
                          <td className="num"><input type="number" min={0} step="any" style={{ width: 90 }} value={raw} placeholder="—" onChange={(e) => setCt({ ...ct, facts: { ...ct.facts, [i.id]: e.target.value } })} aria-label={`Факт: ${i.name}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveCount} disabled={ctItems.length === 0}>Сохранить пересчёт</button>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <h2>Пересчитать выборочно</h2>
              {problems.length === 0 ? (
                <p className="muted">Проблемных позиций нет: расхождения в пределах {state.settings.stocktakeTolPct}%.</p>
              ) : (
                <div className="tablewrap">
                  <table>
                    <tbody>
                      {problems.map((p) => (
                        <tr key={p.item.id + p.locationId}>
                          <td>
                            <b>{p.item.name}</b>
                            <div className="small muted">{locName(state, p.locationId)} · {p.date}</div>
                          </td>
                          <td className="num">факт {stockText(p.item, p.actual)}<div className="small muted">расчёт {stockText(p.item, p.expected)} · {Math.round(p.pct)}%</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card flat">
              <div style={{ padding: '14px 16px 0' }}><h2>История пересчётов</h2></div>
              <div className="tablewrap">
                <table>
                  <tbody>
                    {recentCounts.length === 0 && <tr><td><div className="empty">Пересчётов не было.</div></td></tr>}
                    {recentCounts.slice(0, 8).map((t) => {
                      const off = t.lines.filter((l) => countDiffPct(l.expected, l.actual) > state.settings.stocktakeTolPct).length;
                      return (
                        <tr key={t.id}>
                          <td>
                            <b>{locName(state, t.locationId)} · {t.date}</b>
                            <div className="small muted">{t.lines.length} поз., с расхождением: {off}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'receipt' && (
        <div className="grid two">
          <div className="card">
            <h2>Новый приход</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>Остаток позиции на выбранной точке увеличится на привезённое количество.</p>
            <div className="form">
              <div className="f">Точка
                <select value={rc.locationId} onChange={(e) => setRc({ ...rc, locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="f">Единица
                <select value={rc.unit} onChange={(e) => setRc({ ...rc, unit: e.target.value })}>
                  {RECEIPT_UNITS.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}
                </select>
              </div>
              <div className="f">Позиция
                <select value={rcItem?.id ?? ''} onChange={(e) => setRc({ ...rc, itemId: e.target.value })}>
                  {rcItems.length === 0 && <option value="">Нет позиций в этих единицах</option>}
                  {rcItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="f">Количество<input type="number" min={0} step="any" value={rc.qty} onChange={(e) => setRc({ ...rc, qty: +e.target.value })} /></div>
              <div className="f">Сумма по накладной, {cur}<input inputMode="decimal" placeholder="с НДС" value={rc.sum} onChange={(e) => setRc({ ...rc, sum: e.target.value })} style={{ width: 130 }} /></div>
              <div className="f">Дата<input type="date" value={rc.date} onChange={(e) => setRc({ ...rc, date: e.target.value })} /></div>
              <button className="btn" onClick={addReceipt} disabled={!rcItem}>Записать приход</button>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Сумма за весь привезённый объём, как в накладной, с НДС. Можно оставить пустой: такой приход не попадёт в среднюю цену.
              {rcPrice !== null && <b> Цена: {fmtMoney(rcPrice)} {cur} за {rc.unit}.</b>}
            </p>
          </div>
          <div className="card flat">
            <div style={{ padding: '14px 16px 0' }}><h2>Приходы за 30 дней</h2></div>
            <div className="tablewrap">
              <table>
                <tbody>
                  {recentIn.length === 0 && <tr><td><div className="empty">Приходов нет.</div></td></tr>}
                  {recentIn.slice(0, 10).map((o) => {
                    const it = itemOf(o.itemId);
                    const price = it ? receiptUnitPrice(it, o) : null;
                    return (
                      <tr key={o.id}>
                        <td>
                          <b>{it?.name ?? 'Удалённая позиция'}</b>
                          <div className="small muted">{locName(state, o.locationId)} · {o.date}</div>
                        </td>
                        <td className="num">
                          {it ? stockText(it, o.qty) : o.qty}
                          <div className="small muted">
                            {o.sum ? `${fmtMoney(o.sum)} ${cur}${it && price !== null ? ` · ${fmtMoney(price)} ${cur}/${STOCK_LABEL[it.unit]}` : ''}` : 'без цены'}{' '}
                            <button className="btn ghost sm" onClick={() => editSum(o.id, o.sum)}>{o.sum ? 'Изм.' : 'Цена'}</button>
                          </div>
                        </td>
                        <td><button className="btn danger sm" onClick={() => confirm('Удалить приход? Остаток уменьшится.') && update((s) => ({ ...s, receipts: s.receipts.filter((x) => x.id !== o.id) }))} aria-label="Удалить запись">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'writeoff' && (
        <div className="grid two">
          <div className="card">
            <h2>Новое списание</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>Остаток позиции на выбранной точке уменьшится на списанное количество. Списание идёт в г, мл или шт, остаток показывается в кг, л и шт.</p>
            <div className="form">
              <div className="f">Точка
                <select value={w.locationId} onChange={(e) => setW({ ...w, locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="f">Единица
                <select value={w.unit} onChange={(e) => setW({ ...w, unit: e.target.value as BaseUnit })}>
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{BASE_LABEL[u]}</option>)}
                </select>
              </div>
              <div className="f">Позиция
                <select value={wItem?.id ?? ''} onChange={(e) => setW({ ...w, itemId: e.target.value })}>
                  {wItems.length === 0 && <option value="">Нет позиций в этих единицах</option>}
                  {wItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="f">Количество, {BASE_LABEL[w.unit]}<input type="number" min={0} step="any" value={w.qty} onChange={(e) => setW({ ...w, qty: +e.target.value })} /></div>
              <div className="f">Причина
                <select value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })}>
                  {WRITE_OFF_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button className="btn" onClick={writeOff} disabled={!wItem}>Списать</button>
            </div>
          </div>
          <div className="card flat">
            <div style={{ padding: '14px 16px 0' }}><h2>Списания за 30 дней</h2></div>
            <div className="tablewrap">
              <table>
                <tbody>
                  {recentOffs.length === 0 && <tr><td><div className="empty">Списаний нет.</div></td></tr>}
                  {recentOffs.slice(0, 10).map((o) => {
                    const it = itemOf(o.itemId);
                    return (
                      <tr key={o.id}>
                        <td>
                          <b>{it?.name ?? 'Удалённая позиция'}</b>
                          <div className="small muted">{locName(state, o.locationId)} · {o.date} · {o.reason}</div>
                        </td>
                        <td className="num">{it ? fmtQty(it.unit, o.qty) : o.qty}</td>
                        <td><button className="btn danger sm" onClick={() => confirm('Удалить запись о списании? Остаток вернётся.') && update((s) => ({ ...s, writeOffs: s.writeOffs.filter((x) => x.id !== o.id) }))} aria-label="Удалить запись">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'sales' && (
        <div className="grid two">
          <div className="card">
            <h2>Расход за день</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>Внесите из кассы, сколько позиций продано за день. Ингредиенты спишутся со стока по нормам из стандартов. Повторная запись за тот же день и точку заменяет прежнюю.</p>
            <div className="form">
              <div className="f">Точка
                <select value={sl.locationId} onChange={(e) => pickSales({ locationId: e.target.value })}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="f">Дата<input type="date" value={sl.date} onChange={(e) => pickSales({ date: e.target.value })} /></div>
            </div>
            {state.recipes.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>Сначала добавьте стандарты напитков в «Качестве».</p>
            ) : (
              <div style={{ marginTop: 10 }}>
                {state.recipes.map((r) => (
                  <div className="row spread" key={r.id} style={{ marginTop: 6 }}>
                    <span>{r.name}</span>
                    <input type="number" min={0} step={1} style={{ width: 90 }} value={sl.counts[r.id] ?? ''} placeholder="0" onChange={(e) => setSl({ ...sl, counts: { ...sl.counts, [r.id]: e.target.value } })} aria-label={`Продано: ${r.name}`} />
                  </div>
                ))}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={saveSales}>{existing ? 'Обновить запись за день' : 'Записать день'}</button>
                </div>
              </div>
            )}
          </div>
          <div className="card flat">
            <div style={{ padding: '14px 16px 0' }}><h2>Расход за 30 дней</h2></div>
            <div className="tablewrap">
              <table>
                <tbody>
                  {recentSales.length === 0 && <tr><td><div className="empty">Записей нет.</div></td></tr>}
                  {recentSales.slice(0, 10).map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{locName(state, d.locationId)} · {d.date}</b>
                        <div className="small muted">{d.lines.map((l) => `${state.recipes.find((r) => r.id === l.recipeId)?.name ?? 'Удалённый стандарт'} × ${l.count}`).join(', ')}</div>
                      </td>
                      <td className="num">{d.lines.reduce((a, l) => a + l.count, 0)} шт</td>
                      <td><button className="btn danger sm" onClick={() => confirm('Удалить запись? Остаток вернётся.') && update((s) => ({ ...s, daySales: s.daySales.filter((x) => x.id !== d.id) }))} aria-label="Удалить запись">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
