import type { AppState, DialIn, InventoryItem, MetricEntry, Staff } from './types';

/** Демо-данные: вымышленная сеть из трёх точек. Заменяются своими в «Настройки → Данные». */
export function makeSeed(): AppState {
  const locations = [
    { id: 'l1', name: 'Центр' },
    { id: 'l2', name: 'Север' },
    { id: 'l3', name: 'Набережная' },
  ];

  const s = (id: string, name: string, role: Staff['role'], locationId: string, e: number, m: number, f: number, d: number, h: number, sv: number): Staff => ({
    id, name, role, locationId,
    skills: { espresso: e, milk: m, filter: f, dialin: d, hygiene: h, service: sv },
  });

  const staff: Staff[] = [
    s('s1', 'Алексей', 'head', 'l1', 3, 3, 3, 3, 3, 2),
    s('s2', 'Мария', 'senior', 'l1', 3, 2, 2, 2, 3, 3),
    s('s3', 'Игорь', 'barista', 'l1', 2, 2, 1, 1, 2, 2),
    s('s4', 'Дарья', 'senior', 'l2', 3, 3, 2, 2, 2, 3),
    s('s5', 'Никита', 'barista', 'l2', 2, 1, 1, 1, 2, 2),
    s('s6', 'Софья', 'trainee', 'l2', 1, 1, 0, 0, 1, 2),
    s('s7', 'Егор', 'senior', 'l3', 3, 2, 3, 3, 2, 2),
    s('s8', 'Анна', 'barista', 'l3', 2, 2, 2, 1, 3, 3),
    s('s9', 'Павел', 'trainee', 'l3', 1, 0, 0, 0, 1, 1),
  ];

  const today = new Date();
  const iso = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  const dialIns: DialIn[] = [
    { id: 'd1', locationId: 'l1', date: iso(0), grinder: 'Кофемолка 1', doseG: 18, yieldG: 36, timeS: 27, note: '' },
    { id: 'd2', locationId: 'l2', date: iso(0), grinder: 'Кофемолка 1', doseG: 18, yieldG: 41, timeS: 21, note: 'Быстро, помол мельче' },
    { id: 'd3', locationId: 'l3', date: iso(1), grinder: 'Кофемолка 1', doseG: 18, yieldG: 35, timeS: 29, note: '' },
    { id: 'd4', locationId: 'l1', date: iso(1), grinder: 'Кофемолка 1', doseG: 18, yieldG: 37, timeS: 26, note: '' },
    { id: 'd5', locationId: 'l2', date: iso(2), grinder: 'Кофемолка 1', doseG: 18, yieldG: 36, timeS: 28, note: '' },
  ];

  const cuppings = [
    { id: 'c1', locationId: 'l1', date: iso(5), coffee: 'Эфиопия, мытая', score: 86.5, note: 'Жасмин, бергамот, чайное тело' },
    { id: 'c2', locationId: 'l2', date: iso(5), coffee: 'Колумбия, натурал', score: 84, note: 'Красные ягоды, лёгкая ферментация' },
    { id: 'c3', locationId: 'l3', date: iso(12), coffee: 'Бразилия, пульпед', score: 83.25, note: 'Орех, шоколад, баланс' },
  ];

  const item = (id: string, name: string, category: string, unit: string, par: number, a: number, b: number, c: number): InventoryItem => ({
    id, name, category, unit, par, qty: { l1: a, l2: b, l3: c },
  });

  const inventory: InventoryItem[] = [
    item('i1', 'Зерно эспрессо', 'Кофе', 'кг', 6, 9, 3, 7),
    item('i2', 'Зерно фильтр', 'Кофе', 'кг', 3, 4, 2, 3),
    item('i3', 'Молоко', 'Молочное', 'л', 40, 55, 28, 44),
    item('i4', 'Растительное молоко', 'Молочное', 'л', 12, 15, 6, 13),
    item('i5', 'Стаканы 250 мл', 'Расходники', 'шт', 300, 420, 150, 380),
    item('i6', 'Крышки', 'Расходники', 'шт', 300, 380, 140, 400),
    item('i7', 'Средство для чистки гидравлики', 'Химия', 'уп', 2, 3, 1, 2),
    item('i8', 'Фильтры V60', 'Расходники', 'уп', 2, 3, 2, 1),
  ];

  // Недельные показатели: пять последних недель по каждой точке, детерминированно.
  const weeks = ['2026-W38', '2026-W39', '2026-W40', '2026-W41', '2026-W42'];
  const base: Record<string, { rev: number; checks: number; cogs: number }> = {
    l1: { rev: 520000, checks: 3900, cogs: 27 },
    l2: { rev: 380000, checks: 3100, cogs: 30 },
    l3: { rev: 450000, checks: 3300, cogs: 28 },
  };
  const metrics: MetricEntry[] = [];
  locations.forEach((loc, li) => {
    weeks.forEach((w, wi) => {
      const b = base[loc.id];
      const wobble = 1 + ((wi * 7 + li * 3) % 9 - 4) / 100;
      const growth = 1 + wi * 0.015;
      const checks = Math.round(b.checks * wobble * growth);
      const revenue = Math.round((b.rev * wobble * growth) / 1000) * 1000;
      metrics.push({ id: `m-${loc.id}-${w}`, locationId: loc.id, week: w, revenue, checks, cogsPct: b.cogs + ((wi + li) % 3) - 1 });
    });
  });

  return {
    version: 1,
    settings: {
      networkName: 'Моя сеть',
      currency: '₽',
      activeLocation: 'all',
      modules: { overview: true, playbook: true, team: true, quality: true, inventory: true, metrics: true, settings: true },
      espresso: { ratio: 2, yieldTol: 2, timeMin: 25, timeMax: 30 },
    },
    locations,
    staff,
    dialIns,
    cuppings,
    inventory,
    metrics,
    playbook: ['d0-1', 'd0-2', 'd0-3'],
  };
}
