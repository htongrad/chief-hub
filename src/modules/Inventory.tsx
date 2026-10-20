import { useState } from 'react';
import { WRITE_OFF_REASONS } from '../config';
import { daysBetween, inScope, locName, todayISO, uid, useStore } from '../store';

export default function Inventory() {
  const { state, update } = useStore();
  const scope = state.settings.activeLocation;
  const locs = state.locations.filter((l) => inScope(l.id, scope));

  const [n, setN] = useState({ name: '', category: 'Кофе', unit: 'шт', par: 1 });

  const defLoc = scope !== 'all' ? scope : state.locations[0]?.id ?? '';
  const [w, setW] = useState({ locationId: defLoc, itemId: '', qty: 1, reason: WRITE_OFF_REASONS[0] });
  const today = todayISO();
  const offs = state.writeOffs
    .filter((o) => inScope(o.locationId, scope) && daysBetween(o.date, today) <= 30)
    .sort((a, b) => b.date.localeCompare(a.date));
  const itemName = (id: string) => state.inventory.find((i) => i.id === id);

  // Списание уменьшает остаток позиции на выбранной точке
  const writeOff = () => {
    const itemId = w.itemId || state.inventory[0]?.id;
    const locationId = w.locationId || defLoc;
    if (!itemId || !locationId || !(w.qty > 0)) return;
    update((s) => ({
      ...s,
      writeOffs: [{ id: uid(), locationId, itemId, qty: w.qty, reason: w.reason, date: todayISO() }, ...s.writeOffs],
      inventory: s.inventory.map((i) => (i.id === itemId ? { ...i, qty: { ...i.qty, [locationId]: Math.max(0, (i.qty[locationId] ?? 0) - w.qty) } } : i)),
    }));
    setW({ ...w, qty: 1 });
  };
  const removeOff = (id: string) => confirm('Удалить запись о списании? Остаток не изменится.') && update((s) => ({ ...s, writeOffs: s.writeOffs.filter((o) => o.id !== id) }));

  const setQty = (itemId: string, locId: string, v: number) =>
    update((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === itemId ? { ...i, qty: { ...i.qty, [locId]: v } } : i)) }));
  const setPar = (itemId: string, v: number) => update((s) => ({ ...s, inventory: s.inventory.map((i) => (i.id === itemId ? { ...i, par: v } : i)) }));
  const remove = (id: string) => confirm('Удалить позицию?') && update((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== id) }));
  const add = () => {
    if (!n.name.trim()) return;
    update((s) => ({ ...s, inventory: [...s.inventory, { id: uid(), name: n.name.trim(), category: n.category.trim() || 'Прочее', unit: n.unit.trim() || 'шт', par: n.par, qty: {} }] }));
    setN({ ...n, name: '' });
  };

  // Список закупки: сколько нужно довезти до минимума суммарно по выбранным точкам
  const reorder = state.inventory
    .map((i) => ({ i, need: locs.reduce((a, l) => a + Math.max(0, i.par - (i.qty[l.id] ?? 0)), 0) }))
    .filter((x) => x.need > 0);

  const copyList = () => {
    const text = reorder.map((x) => `${x.i.name}: ${x.need} ${x.i.unit}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const categories = [...new Set(state.inventory.map((i) => i.category))];

  return (
    <div className="stack">
      <div className="card">
        <div className="row spread">
          <h2>Список закупки</h2>
          {reorder.length > 0 && <button className="btn ghost sm" onClick={copyList}>Скопировать</button>}
        </div>
        {reorder.length === 0 ? (
          <p className="muted">Всё выше минимума — закупать ничего не нужно.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <tbody>
                {reorder.map((x) => (
                  <tr key={x.i.id}>
                    <td><b>{x.i.name}</b> <span className="small muted">· {x.i.category}</span></td>
                    <td className="num">довезти {x.need} {x.i.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Новое списание</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Остаток позиции на выбранной точке уменьшится на списанное количество.</p>
          <div className="form">
            <div className="f">Точка
              <select value={w.locationId} onChange={(e) => setW({ ...w, locationId: e.target.value })}>
                {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="f">Позиция
              <select value={w.itemId || state.inventory[0]?.id || ''} onChange={(e) => setW({ ...w, itemId: e.target.value })}>
                {state.inventory.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="f">Количество<input type="number" min={0} step="any" value={w.qty} onChange={(e) => setW({ ...w, qty: +e.target.value })} /></div>
            <div className="f">Причина
              <select value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })}>
                {WRITE_OFF_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn" onClick={writeOff} disabled={state.inventory.length === 0}>Списать</button>
          </div>
        </div>

        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Списания за 30 дней</h2></div>
          <div className="tablewrap">
            <table>
              <tbody>
                {offs.length === 0 && <tr><td><div className="empty">Списаний нет.</div></td></tr>}
                {offs.slice(0, 8).map((o) => {
                  const it = itemName(o.itemId);
                  return (
                    <tr key={o.id}>
                      <td>
                        <b>{it?.name ?? 'Удалённая позиция'}</b>
                        <div className="small muted">{locName(state, o.locationId)} · {o.date} · {o.reason}</div>
                      </td>
                      <td className="num">{o.qty} {it?.unit ?? ''}</td>
                      <td><button className="btn danger sm" onClick={() => removeOff(o.id)} aria-label="Удалить запись">×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {categories.map((cat) => (
        <div className="card flat" key={cat}>
          <div style={{ padding: '14px 16px 0' }}><h2>{cat}</h2></div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Позиция</th>
                  {locs.map((l) => <th key={l.id} className="num">{l.name}</th>)}
                  <th className="num">Минимум</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.inventory.filter((i) => i.category === cat).map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.name}</b> <span className="small muted">{i.unit}</span></td>
                    {locs.map((l) => {
                      const q = i.qty[l.id] ?? 0;
                      const low = q < i.par;
                      return (
                        <td className="num" key={l.id}>
                          <input type="number" min={0} value={q} onChange={(e) => setQty(i.id, l.id, Math.max(0, +e.target.value))} style={{ width: 76, borderColor: low ? 'var(--bad)' : undefined }} aria-label={`${i.name}, ${l.name}`} />
                        </td>
                      );
                    })}
                    <td className="num"><input type="number" min={0} value={i.par} onChange={(e) => setPar(i.id, Math.max(0, +e.target.value))} style={{ width: 76 }} aria-label={`Минимум: ${i.name}`} /></td>
                    <td><button className="btn danger sm" onClick={() => remove(i.id)}>×</button></td>
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
          <div className="f">Единица<input style={{ width: 80 }} value={n.unit} onChange={(e) => setN({ ...n, unit: e.target.value })} /></div>
          <div className="f">Минимум<input type="number" min={0} value={n.par} onChange={(e) => setN({ ...n, par: +e.target.value })} /></div>
          <button className="btn" onClick={add}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
