import type { AppState, Attestation, Complaint, DialIn, Equipment, BaseUnit, DaySales, InventoryItem, MetricEntry, ModuleId, Receipt, Recipe, Repair, Staff, Visit, WriteOff } from './types';

/** Все разделы включены. Используется для демо и при переносе данных старой версии. */
export const defaultModules = (): Record<ModuleId, boolean> => ({
  overview: true,
  quality: true,
  team: true,
  inventory: true,
  metrics: true,
  equipment: true,
  rounds: true,
  report: true,
  playbook: true,
  settings: true,
});

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
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const dialIns: DialIn[] = [
    { id: 'd1', locationId: 'l1', date: iso(0), grinder: 'Кофемолка 1', doseG: 18, yieldG: 36, timeS: 27, note: '' },
    { id: 'd2', locationId: 'l2', date: iso(0), grinder: 'Кофемолка 1', doseG: 18, yieldG: 41, timeS: 21, note: 'Быстро, помол мельче' },
    { id: 'd3', locationId: 'l3', date: iso(1), grinder: 'Кофемолка 1', doseG: 18, yieldG: 35, timeS: 29, note: '' },
    { id: 'd4', locationId: 'l1', date: iso(1), grinder: 'Кофемолка 1', doseG: 18, yieldG: 37, timeS: 26, note: '' },
    { id: 'd5', locationId: 'l2', date: iso(2), grinder: 'Кофемолка 1', doseG: 18, yieldG: 36, timeS: 28, note: '' },
  ];

  const cuppings = [
    { id: 'c1', locationId: 'l1', date: iso(5), coffee: 'Эфиопия, мытая', score: 86.5, note: 'Жасмин, бергамот, чайное тело', comment: '' },
    { id: 'c2', locationId: 'l2', date: iso(5), coffee: 'Колумбия, натурал', score: 84, note: 'Красные ягоды, лёгкая ферментация', comment: '' },
    { id: 'c3', locationId: 'l3', date: iso(12), coffee: 'Бразилия, пульпед', score: 83.25, note: 'Орех, шоколад, баланс', comment: '' },
  ];

  const recipes: Recipe[] = [
    {
      id: 'rc1',
      name: 'Эспрессо',
      ingredients: [
        { name: 'Зерно эспрессо', amount: '18', unit: 'г', itemId: 'i1' },
      ],
      method: 'Доза 18 г, выход 36 г, время 25–30 с. Подача сразу, в прогретую чашку.',
      guestDescription: 'Насыщенный и плотный глоток: сладость карамели и мягкая горчинка в финише.',
      updated: iso(14),
    },
    {
      id: 'rc2',
      name: 'Капучино 180 мл',
      ingredients: [
        { name: 'Зерно эспрессо', amount: '18', unit: 'г', itemId: 'i1' },
        { name: 'Молоко', amount: '150', unit: 'мл', itemId: 'i3' },
        { name: 'Стаканы 250 мл', amount: '1', unit: 'шт', itemId: 'i5' },
        { name: 'Крышки', amount: '1', unit: 'шт', itemId: 'i6' },
      ],
      method: 'Двойной эспрессо и молоко до 180 мл, пена около 1 см. Температура молока 60–65 °C.',
      guestDescription: 'Нежная бархатистая пена и тёплое молоко вокруг крепкого эспрессо.',
      updated: iso(14),
    },
    {
      id: 'rc3',
      name: 'Фильтр V60',
      ingredients: [
        { name: 'Зерно фильтр', amount: '15', unit: 'г', itemId: 'i2' },
        { name: 'Фильтры V60', amount: '1', unit: 'шт', itemId: 'i8' },
      ],
      method: '15 г кофе на 250 мл воды, общее время 2:45–3:15.',
      guestDescription: 'Чистый и ясный вкус, в котором видно характер зерна.',
      updated: iso(14),
    },
  ];

  const attestations: Attestation[] = [
    { id: 'at1', staffId: 's1', date: iso(30), passed: true, note: 'Все навыки подтверждены' },
    { id: 'at2', staffId: 's2', date: iso(200), passed: true, note: '' },
    { id: 'at3', staffId: 's4', date: iso(10), passed: false, note: 'Переаттестация по молоку через две недели' },
    { id: 'at4', staffId: 's7', date: iso(60), passed: true, note: '' },
  ];

  // Банк ингредиентов: количества в базовых единицах (г, мл, шт), показываются в кг, л, шт
  const item = (id: string, name: string, category: string, unit: BaseUnit, parStock: number, a: number, b: number, c: number): InventoryItem => {
    const k = unit === 'pcs' ? 1 : 1000;
    return { id, name, category, unit, par: parStock * k, allLocations: true, locationIds: [], opening: { l1: a * k, l2: b * k, l3: c * k } };
  };

  const inventory: InventoryItem[] = [
    item('i1', 'Зерно эспрессо', 'Кофе', 'g', 6, 12, 5, 9),
    item('i2', 'Зерно фильтр', 'Кофе', 'g', 3, 5, 3, 4),
    item('i3', 'Молоко', 'Молочное', 'ml', 40, 70, 40, 60),
    item('i4', 'Растительное молоко', 'Молочное', 'ml', 12, 20, 9, 16),
    item('i5', 'Стаканы 250 мл', 'Расходники', 'pcs', 300, 600, 250, 520),
    item('i6', 'Крышки', 'Расходники', 'pcs', 300, 560, 240, 540),
    item('i7', 'Средство для чистки гидравлики', 'Химия', 'pcs', 2, 3, 1, 2),
    item('i8', 'Фильтры V60', 'Расходники', 'pcs', 2, 3, 2, 1),
  ];
  // Позиция, которая есть не на всех точках (пример исключения)
  inventory.push({ id: 'i9', name: 'Сироп ванильный', category: 'Бакалея', unit: 'ml', par: 1000, allLocations: false, locationIds: ['l1', 'l3'], opening: { l1: 3000, l3: 2000 } });

  const receipts: Receipt[] = [
    { id: 'rp1', locationId: 'l2', itemId: 'i1', qty: 3000, date: iso(2) },
    { id: 'rp2', locationId: 'l2', itemId: 'i3', qty: 24000, date: iso(2) },
  ];

  const writeOffs: WriteOff[] = [
    { id: 'w1', locationId: 'l1', itemId: 'i3', qty: 2000, reason: 'Порча', date: iso(1) },
    { id: 'w2', locationId: 'l2', itemId: 'i1', qty: 250, reason: 'Настройка помола', date: iso(3) },
    { id: 'w3', locationId: 'l3', itemId: 'i5', qty: 20, reason: 'Тренировка бариста', date: iso(2) },
  ];

  const daySales: DaySales[] = [
    { id: 'ds1', locationId: 'l1', date: iso(1), lines: [{ recipeId: 'rc1', count: 40 }, { recipeId: 'rc2', count: 55 }, { recipeId: 'rc3', count: 12 }] },
    { id: 'ds2', locationId: 'l2', date: iso(1), lines: [{ recipeId: 'rc1', count: 25 }, { recipeId: 'rc2', count: 38 }, { recipeId: 'rc3', count: 9 }] },
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

  const eq = (id: string, locationId: string, name: string, kind: Equipment['kind'], intervalDays: number, lastServiceDate: string | null): Equipment => ({
    id, locationId, name, kind, intervalDays, lastServiceDate,
  });
  const equipment: Equipment[] = [
    eq('e1', 'l1', 'Кофемашина', 'machine', 90, iso(85)),
    eq('e2', 'l1', 'Кофемолка', 'grinder', 90, iso(30)),
    eq('e3', 'l1', 'Фильтр воды', 'water', 180, iso(60)),
    eq('e4', 'l2', 'Кофемашина', 'machine', 90, iso(40)),
    eq('e5', 'l2', 'Кофемолка', 'grinder', 90, iso(100)),
    eq('e6', 'l2', 'Фильтр воды', 'water', 180, iso(90)),
    eq('e7', 'l3', 'Кофемашина', 'machine', 90, iso(20)),
    eq('e8', 'l3', 'Кофемолка', 'grinder', 90, iso(25)),
    eq('e9', 'l3', 'Фильтр воды', 'water', 180, null),
  ];

  const repairs: Repair[] = [{ id: 'rp1', locationId: 'l3', equipmentId: 'e7', date: iso(2), text: 'Течёт паровой кран', done: false }];

  const visits: Visit[] = [
    { id: 'v1', locationId: 'l1', date: iso(2), kind: 'round', score: 92, note: '' },
    { id: 'v2', locationId: 'l2', date: iso(3), kind: 'round', score: 75, note: 'Грязный зал в пик, долгая подача' },
    { id: 'v3', locationId: 'l3', date: iso(4), kind: 'round', score: 85, note: '' },
    { id: 'v4', locationId: 'l3', date: iso(9), kind: 'mystery', score: 88, note: 'Хороший сервис, напиток тёплый' },
    { id: 'v5', locationId: 'l2', date: iso(10), kind: 'round', score: 70, note: '' },
  ];

  const complaints: Complaint[] = [{ id: 'cm1', locationId: 'l2', date: iso(1), text: 'Долгое ожидание в утренний пик', resolved: false }];

  return {
    version: 4,
    settings: {
      networkName: 'Моя сеть',
      currency: '₽',
      activeLocation: 'all',
      modules: defaultModules(),
      espresso: { ratio: 2, yieldTol: 2, timeMin: 25, timeMax: 30 },
      cogsTargetPct: 28,
      attestDays: 180,
      visitMinScore: 80,
    },
    locations,
    staff,
    dialIns,
    cuppings,
    recipes,
    attestations,
    inventory,
    receipts,
    writeOffs,
    daySales,
    metrics,
    equipment,
    repairs,
    visits,
    complaints,
    reportNote: '',
    playbook: ['d0-1', 'd0-2', 'd0-3'],
  };
}
