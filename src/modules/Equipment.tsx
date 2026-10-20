import { useState } from 'react';
import { DEFAULT_EQUIPMENT, EQUIPMENT_KIND } from '../config';
import { equipmentDue, inScope, locName, todayISO, uid, useStore } from '../store';
import type { Equipment as EquipmentItem, EquipmentKind } from '../types';

export default function Equipment() {
  const { state, update } = useStore();
  const scope = state.settings.activeLocation;
  const defLoc = scope !== 'all' ? scope : state.locations[0]?.id ?? '';

  const items = state.equipment
    .filter((e) => inScope(e.locationId, scope))
    .sort((a, b) => locName(state, a.locationId).localeCompare(locName(state, b.locationId)) || a.name.localeCompare(b.name));
  const repairs = state.repairs
    .filter((r) => inScope(r.locationId, scope))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.date.localeCompare(a.date));

  const [n, setN] = useState<{ locationId: string; name: string; kind: EquipmentKind; intervalDays: number }>({ locationId: defLoc, name: '', kind: 'machine', intervalDays: 90 });
  const [rp, setRp] = useState({ locationId: defLoc, equipmentId: '', text: '' });

  const patch = (id: string, p: Partial<EquipmentItem>) => update((s) => ({ ...s, equipment: s.equipment.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  const remove = (id: string) => {
    if (!confirm('Удалить оборудование из списка?')) return;
    update((s) => ({ ...s, equipment: s.equipment.filter((e) => e.id !== id), repairs: s.repairs.map((r) => (r.equipmentId === id ? { ...r, equipmentId: '' } : r)) }));
  };
  const add = () => {
    if (!n.name.trim()) return;
    update((s) => ({ ...s, equipment: [...s.equipment, { id: uid(), locationId: n.locationId || defLoc, name: n.name.trim(), kind: n.kind, intervalDays: Math.max(1, n.intervalDays), lastServiceDate: null }] }));
    setN({ ...n, name: '' });
  };

  // Стандартный набор для точек, где оборудования ещё нет
  const without = state.locations.filter((l) => inScope(l.id, scope) && !state.equipment.some((e) => e.locationId === l.id));
  const addDefaults = () =>
    update((s) => ({
      ...s,
      equipment: [
        ...s.equipment,
        ...without.flatMap((l) => DEFAULT_EQUIPMENT.map((d) => ({ id: uid(), locationId: l.id, name: d.name, kind: d.kind, intervalDays: d.intervalDays, lastServiceDate: null }))),
      ],
    }));

  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? 'Другое';
  const eqForRepair = state.equipment.filter((e) => e.locationId === (rp.locationId || defLoc));

  const addRepair = () => {
    if (!rp.text.trim()) return;
    update((s) => ({ ...s, repairs: [{ id: uid(), locationId: rp.locationId || defLoc, equipmentId: rp.equipmentId, date: todayISO(), text: rp.text.trim(), done: false }, ...s.repairs] }));
    setRp({ ...rp, text: '' });
  };
  const toggleRepair = (id: string) => update((s) => ({ ...s, repairs: s.repairs.map((r) => (r.id === id ? { ...r, done: !r.done } : r)) }));
  const removeRepair = (id: string) => confirm('Удалить заявку?') && update((s) => ({ ...s, repairs: s.repairs.filter((r) => r.id !== id) }));

  const overdue = items.filter((e) => equipmentDue(e).state === 'overdue').length;

  return (
    <div className="stack">
      {overdue > 0 && (
        <div className="alert bad">
          <div>
            <b>ТО просрочено: {overdue}</b>
            <div className="small muted">Проведите обслуживание и нажмите «ТО сделано» в строке оборудования.</div>
          </div>
        </div>
      )}

      <div className="card flat">
        <div style={{ padding: '14px 16px 0' }} className="row spread">
          <h2>График ТО</h2>
          {without.length > 0 && <button className="btn ghost sm" onClick={addDefaults}>Добавить стандартный набор ({without.map((l) => l.name).join(', ')})</button>}
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Оборудование</th>
                <th className="num">Раз в, дн.</th>
                <th>Последнее ТО</th>
                <th>Следующее ТО</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5}><div className="empty">Оборудование не внесено. Добавьте стандартный набор кнопкой выше или своё ниже.</div></td></tr>
              )}
              {items.map((e) => {
                const due = equipmentDue(e);
                return (
                  <tr key={e.id}>
                    <td>
                      <b>{e.name}</b>
                      <div className="small muted">{EQUIPMENT_KIND[e.kind]} · {locName(state, e.locationId)}</div>
                    </td>
                    <td className="num"><input type="number" min={1} value={e.intervalDays} onChange={(ev) => patch(e.id, { intervalDays: Math.max(1, +ev.target.value) })} style={{ width: 70 }} aria-label={`Интервал ТО: ${e.name}`} /></td>
                    <td><input type="date" value={e.lastServiceDate ?? ''} onChange={(ev) => patch(e.id, { lastServiceDate: ev.target.value || null })} aria-label={`Дата последнего ТО: ${e.name}`} /></td>
                    <td>
                      {due.state === 'none' && <span className="pill warn">нет отметки о ТО</span>}
                      {due.state === 'ok' && <span className="pill ok">{due.next} · через {due.days} дн.</span>}
                      {due.state === 'soon' && <span className="pill warn">{due.next} · через {due.days} дн.</span>}
                      {due.state === 'overdue' && <span className="pill bad">просрочено на {Math.abs(due.days ?? 0)} дн.</span>}
                    </td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => patch(e.id, { lastServiceDate: todayISO() })}>ТО сделано</button>
                        <button className="btn danger sm" onClick={() => remove(e.id)} aria-label={`Удалить: ${e.name}`}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Новое оборудование</h2>
        <div className="form">
          <div className="f">Точка
            <select value={n.locationId} onChange={(e) => setN({ ...n, locationId: e.target.value })}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="f">Название<input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Например, Кофемашина 2" /></div>
          <div className="f">Тип
            <select value={n.kind} onChange={(e) => setN({ ...n, kind: e.target.value as EquipmentKind })}>
              {Object.entries(EQUIPMENT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="f">ТО раз в, дн.<input type="number" min={1} value={n.intervalDays} onChange={(e) => setN({ ...n, intervalDays: +e.target.value })} /></div>
          <button className="btn" onClick={add}>Добавить</button>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Новая заявка на ремонт</h2>
          <div className="form">
            <div className="f">Точка
              <select value={rp.locationId} onChange={(e) => setRp({ ...rp, locationId: e.target.value, equipmentId: '' })}>
                {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="f">Что сломалось
              <select value={rp.equipmentId} onChange={(e) => setRp({ ...rp, equipmentId: e.target.value })}>
                <option value="">Другое</option>
                {eqForRepair.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1 }} placeholder="Опишите проблему" value={rp.text} onChange={(e) => setRp({ ...rp, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addRepair()} />
            <button className="btn" onClick={addRepair}>Создать</button>
          </div>
        </div>

        <div className="card flat">
          <div style={{ padding: '14px 16px 0' }}><h2>Заявки на ремонт</h2></div>
          <div className="tablewrap">
            <table>
              <tbody>
                {repairs.length === 0 && <tr><td><div className="empty">Заявок нет.</div></td></tr>}
                {repairs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{eqName(r.equipmentId)}</b> <span className="small muted">· {locName(state, r.locationId)} · {r.date}</span>
                      <div className="small">{r.text}</div>
                    </td>
                    <td>{r.done ? <span className="pill ok">выполнено</span> : <span className="pill warn">открыта</span>}</td>
                    <td>
                      <div className="row">
                        <button className="btn ghost sm" onClick={() => toggleRepair(r.id)}>{r.done ? 'Вернуть' : 'Выполнено'}</button>
                        <button className="btn danger sm" onClick={() => removeRepair(r.id)} aria-label="Удалить заявку">×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
