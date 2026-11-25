// Components: the bought parts and settings a design is built around.
// Motors, gear sets, bearings and guides; printer profiles, rule sets and car presets.
//
// Each kind has built-in entries (from research.md and parts-data.md) and can have your own,
// kept in the library. `confirmed: false` marks a value nobody has published or measured yet.
// A design that uses one of your own components carries a copy of it, so the design still
// builds on a computer that does not have your library.

export const MOTORS = {
  fc130: { name: 'Short can (FC-130)', length: 25.0, width: 20.1, height: 15.1, bossD: 6.15, bossL: 1.7, endD: 10.0, endL: 2.3, shaftD: 2.0, shaftOut: 9.4, pitch: 12.4, confirmed: true },
  fk130: { name: 'Short can, FK-130 type', length: 25.1, width: 20.4, height: 15.4, bossD: 6.15, bossL: 1.6, endD: 6.15, endL: 1.6, shaftD: 2.0, shaftOut: 9.6, pitch: 12.4, confirmed: true },
  fk180: { name: 'Long can (FK-180)', length: 32.1, width: 20.4, height: 15.4, bossD: 6.15, bossL: 1.6, endD: 6.15, endL: 2.1, shaftD: 2.0, shaftOut: 8.55, pitch: 12.4, confirmed: true },
  ff050: { name: 'Slimline (FF-050)', length: 26.9, width: 15.5, height: 12.0, bossD: 4.7, bossL: 1.4, endD: 4.7, endL: 1.9, shaftD: 1.5, shaftOut: 11.0, pitch: 10.0, confirmed: true },
  ff030: { name: 'Short slimline (FF-030)', length: 18.6, width: 15.5, height: 12.0, bossD: 4.7, bossL: 1.5, endD: 5.0, endL: 0.7, shaftD: 1.5, shaftOut: 7.0, pitch: 10.0, confirmed: true },
};

// Gear sets per layout. Pinion Ø + gear Ø is the figure a pod is built for.
export const GEARS = {
  inline: [
    { id: 'si-in-27-9', name: 'Slot.it inline · crown 27 / pinion 9', gearD: 15.8, gearT: 27, pinionD: 5.5, pinionT: 9, confirmed: true },
    { id: 'si-in-28-9', name: 'Slot.it inline · crown 28 / pinion 9', gearD: 16.3, gearT: 28, pinionD: 5.5, pinionT: 9, confirmed: true },
    { id: 'si-in-24-9', name: 'Slot.it inline · crown 24 / pinion 9', gearD: 14.4, gearT: 24, pinionD: 5.5, pinionT: 9, confirmed: true },
    { id: 'nsr-in-27-10', name: 'NSR inline · crown 27 / pinion 10', gearD: 15.8, gearT: 27, pinionD: 5.5, pinionT: 10, confirmed: false },
    { id: 'sc-in-26-10', name: 'Scaleauto inline · crown 26 / pinion 10', gearD: 14.1, gearT: 26, pinionD: 5.5, pinionT: 10, confirmed: true },
  ],
  sidewinder: [
    { id: 'si-sw-34-11', name: 'Slot.it sidewinder · spur 34 / pinion 11', gearD: 18.0, gearT: 34, pinionD: 6.5, pinionT: 11, confirmed: true },
    { id: 'si-sw-36-11', name: 'Slot.it sidewinder · spur 36 / pinion 11', gearD: 18.0, gearT: 36, pinionD: 6.5, pinionT: 11, confirmed: true },
    { id: 'nsr-sw-32-11', name: 'NSR sidewinder · spur 32 / pinion 11', gearD: 17.5, gearT: 32, pinionD: 6.75, pinionT: 11, confirmed: true },
    { id: 'nsr-sw-31-13', name: 'NSR Hypercar sidewinder · spur 31 / pinion 13', gearD: 16.8, gearT: 31, pinionD: 7.5, pinionT: 13, confirmed: true },
    { id: 'sp-sw-32-12', name: 'Sloting Plus sidewinder · spur 32 / pinion 12', gearD: 18.0, gearT: 32, pinionD: 7.0, pinionT: 12, confirmed: true },
    { id: 'sc-sw-30-11', name: 'Scaleauto sidewinder · spur 30 / pinion 11', gearD: 16.5, gearT: 30, pinionD: 6.5, pinionT: 11, confirmed: true },
  ],
  anglewinder: [
    { id: 'si-aw-28-11', name: 'Slot.it anglewinder 25° · crown 28 / pinion 11', gearD: 16.0, gearT: 28, pinionD: 6.5, pinionT: 11, angle: 25, confirmed: true },
    { id: 'si-aw-32-11', name: 'Slot.it anglewinder 25° · crown 32 / pinion 11', gearD: 18.0, gearT: 32, pinionD: 6.5, pinionT: 11, angle: 25, confirmed: true },
    { id: 'nsr-aw-31-13', name: 'NSR anglewinder 15° · crown 31 / pinion 13', gearD: 16.8, gearT: 31, pinionD: 7.5, pinionT: 13, angle: 15, confirmed: true },
    { id: 'sp-aw-29-12', name: 'Sloting Plus anglewinder 11° · crown 29 / pinion 12', gearD: 16.8, gearT: 29, pinionD: 7.0, pinionT: 12, angle: 11, confirmed: true },
    { id: 'sc24-aw-44-14', name: 'Scaleauto 1/24 anglewinder · spur 44 / pinion 14', gearD: 23.0, gearT: 44, pinionD: 7.5, pinionT: 14, angle: 12, confirmed: false },
    { id: 'brm24-aw-41-11', name: 'BRM 1/24 anglewinder · spur 41 / pinion 11', gearD: 21.6, gearT: 41, pinionD: 6.4, pinionT: 11, angle: 15, confirmed: false },
  ],
};

export const BEARINGS = {
  ball: { name: 'Ball bearing 3/32" · seat Ø4.75', seat: 4.75, width: 2.4, flangeD: 0, flangeT: 0, confirmed: true },
  bushing: { name: 'Flanged bronze bushing · seat Ø4.9', seat: 4.9, width: 2.5, flangeD: 6.0, flangeT: 0.6, confirmed: false },
  universal: { name: 'Sloting Plus universal bushing · seat Ø4.8', seat: 4.8, width: 2.5, flangeD: 0, flangeT: 0, confirmed: true },
  ball3: { name: 'Ball bearing 3 mm axle · seat Ø6', seat: 6.0, width: 2.5, flangeD: 0, flangeT: 0, confirmed: true },
};

export const GUIDES = {
  slotit: { name: 'Slot.it CH85 (screw-in)', hole: 3.7, bladeL: 21, confirmed: false },
  nsr: { name: 'NSR 4844', hole: 3.5, bladeL: 21, confirmed: false },
  sloting: { name: 'Sloting Plus SP101003', hole: 3.7, bladeL: 24, confirmed: true },
  scaleauto: { name: 'Scaleauto universal (3.7 post)', hole: 3.8, bladeL: 24, confirmed: false },
  scalextric: { name: 'Scalextric (3.75 post)', hole: 3.85, bladeL: 27.6, confirmed: false },
  carrera: { name: 'Carrera 1/32 (3.9 post)', hole: 4.0, bladeL: 25.4, confirmed: false },
  g24: { name: '1/24 guide, 3/16" post', hole: 4.9, bladeL: 24, confirmed: false },
  custom: { name: 'Custom', hole: 3.7, bladeL: 21, confirmed: false },
};

export const MATERIALS = {
  petg: { name: 'PETG', density: 1.27 },
  pla: { name: 'PLA+', density: 1.24 },
  abs: { name: 'ABS / ASA', density: 1.05 },
  nylon: { name: 'SLS / MJF nylon', density: 1.01 },
};

export const PRINTERS = {
  petg04: { name: 'PETG · 0.4 nozzle', material: 'petg', nozzle: 0.4, holeFix: 0.2, boreFix: 0.2, minWall: 0.8, bridge: 8, overhang: 50 },
  pla04: { name: 'PLA+ · 0.4 nozzle', material: 'pla', nozzle: 0.4, holeFix: 0.2, boreFix: 0.2, minWall: 0.8, bridge: 10, overhang: 55 },
  abs04: { name: 'ABS / ASA · 0.4 nozzle', material: 'abs', nozzle: 0.4, holeFix: 0.25, boreFix: 0.25, minWall: 0.8, bridge: 6, overhang: 45 },
  petg025: { name: 'PETG · 0.25 nozzle', material: 'petg', nozzle: 0.25, holeFix: 0.15, boreFix: 0.15, minWall: 0.5, bridge: 6, overhang: 50 },
  nylon: { name: 'SLS / MJF nylon (print service)', material: 'nylon', nozzle: 0.4, holeFix: 0.1, boreFix: 0.1, minWall: 1.0, bridge: 200, overhang: 89 },
};

// Limits a club or series sets. The Final check compares the design with the chosen set.
export const RULESETS = {
  bscra32gt: { name: 'BSCRA 1/32 Sports / GT', maxWidth: 64, guideLeadMax: 105, minClearance: 0.5, confirmed: true },
  bscra32saloon: { name: 'BSCRA 1/32 Saloon', maxWidth: 64, guideLeadMax: 107, minClearance: 0.5, confirmed: true },
  bscra32f1: { name: 'BSCRA 1/32 F1', maxWidth: 68, guideLeadMax: 110, minClearance: 0.5, confirmed: true },
  club075: { name: 'Club 1/32, 0.75 mm clearance', maxWidth: 64, guideLeadMax: 105, minClearance: 0.75, confirmed: true },
  club1: { name: 'Club 1/32, 1 mm clearance', maxWidth: 64, guideLeadMax: 105, minClearance: 1.0, confirmed: true },
  endurance025: { name: 'Endurance 1/32, 0.25 mm clearance', maxWidth: 64, guideLeadMax: 105, minClearance: 0.25, confirmed: true },
  hypercar: { name: 'NSR Hypercar (66 mm track)', maxWidth: 66, guideLeadMax: 110, minClearance: 0.5, confirmed: false },
  sc24lmp: { name: 'Scaleauto 1/24 LMP', maxWidth: 83, guideLeadMax: 130, minClearance: 1.0, confirmed: true },
  bscra24: { name: 'BSCRA 1/24', maxWidth: 83, guideLeadMax: 130, minClearance: 0.5, confirmed: true },
};

// Wheelbases of well-known cars, to start a chassis from. Designer's and retailer's figures (parts-data.md).
export const CARS = {
  'sx-mini': { name: 'Scalextric Mini', scale: '1/32', wheelbase: 63, confirmed: false },
  'sx-capri': { name: 'Scalextric Capri / Escort Mexico', scale: '1/32', wheelbase: 75, confirmed: false },
  'sx-f40': { name: 'Scalextric Ferrari F40', scale: '1/32', wheelbase: 76, confirmed: false },
  'sx-sierra': { name: 'Scalextric Sierra', scale: '1/32', wheelbase: 81, confirmed: false },
  'sx-962': { name: 'Scalextric Group C Porsche 962', scale: '1/32', wheelbase: 83.2, confirmed: false },
  'sx-btcc': { name: 'Scalextric Audi / Laguna BTCC', scale: '1/32', wheelbase: 84, confirmed: false },
  'sx-camaro': { name: 'Scalextric Camaro / Boss 302', scale: '1/32', wheelbase: 86.5, confirmed: false },
  'cr-m3': { name: 'Carrera BMW M3 DTM', scale: '1/32', wheelbase: 85.5, confirmed: false },
  'cr-m4': { name: 'Carrera BMW M4 DTM', scale: '1/32', wheelbase: 87, confirmed: false },
  'cr-charger': { name: 'Carrera Dodge Charger', scale: '1/32', wheelbase: 92.5, confirmed: false },
  'fly-917': { name: 'Fly Porsche 917', scale: '1/32', wheelbase: 74, confirmed: false },
  'fly-gt1': { name: 'Fly Porsche 911 GT1', scale: '1/32', wheelbase: 77.5, confirmed: false },
  'fly-lola': { name: 'Fly Lola', scale: '1/32', wheelbase: 83.5, confirmed: false },
  'nc-cobra': { name: 'Ninco Cobra', scale: '1/32', wheelbase: 71.5, confirmed: false },
  'nc-mclaren': { name: 'Ninco McLaren F1 / Mercedes', scale: '1/32', wheelbase: 84, confirmed: false },
  'gt-mp412c': { name: 'McLaren MP4-12C (example chassis)', scale: '1/32', wheelbase: 83.4, confirmed: false },
  'brm-simca': { name: 'BRM Simca 1000', scale: '1/24', wheelbase: 93, confirmed: false },
  'brm-escort': { name: 'BRM Ford Escort Mk1', scale: '1/24', wheelbase: 100, confirmed: false },
  'brm-2002': { name: 'BRM BMW 2002ti', scale: '1/24', wheelbase: 104, confirmed: false },
  'brm-camaro': { name: 'BRM Camaro Z28', scale: '1/24', wheelbase: 114, confirmed: false },
  'brm-917': { name: 'BRM Porsche 917K', scale: '1/24', wheelbase: 90, confirmed: false },
  'brm-f1gtr': { name: 'BRM McLaren F1 GTR', scale: '1/24', wheelbase: 115, confirmed: false },
  'sc-lmp': { name: 'Scaleauto 1/24 LMP', scale: '1/24', wheelbase: 124, confirmed: true },
};

// ------------------------------------------------------------ what each kind holds
// field: [key, label, [lowest, highest], unit, whole number?]

const LAYOUTS = { inline: 'Inline', sidewinder: 'Sidewinder', anglewinder: 'Anglewinder' };
export const KINDS = {
  motor: {
    one: 'Motor', many: 'Motors', group: 'Components', inDesign: true,
    fields: [['length', 'Can length', [5, 80], 'mm'], ['width', 'Across the round sides', [5, 60], 'mm'], ['height', 'Across the flats', [5, 60], 'mm'], ['bossD', 'Front boss diameter', [1, 20], 'mm'], ['bossL', 'Front boss length', [0, 10], 'mm'],
      ['endD', 'Rear boss diameter', [1, 30], 'mm'], ['endL', 'Rear boss length', [0, 10], 'mm'], ['shaftD', 'Shaft diameter', [0.5, 6], 'mm'], ['shaftOut', 'Shaft beyond the can', [1, 30], 'mm'], ['pitch', 'Screw spacing', [2, 40], 'mm']],
    fresh: { ...MOTORS.fc130, name: 'My motor', confirmed: false },
    line: (c) => `${c.length} × ${c.width} × ${c.height}`,
  },
  gear: {
    one: 'Gear set', many: 'Gear sets', group: 'Components', inDesign: true,
    choices: { layout: LAYOUTS, boss: { in: 'Boss towards the bearing', out: 'Boss towards the wheel' } },
    fields: [['gearD', 'Gear diameter', [4, 60], 'mm'], ['gearT', 'Gear teeth', [6, 120], '', true], ['pinionD', 'Pinion diameter', [2, 30], 'mm'], ['pinionT', 'Pinion teeth', [5, 40], '', true], ['angle', 'Motor angle to the axle (anglewinder)', [0, 45], '°'],
      ['discT', 'Thickness of the toothed disc', [0.5, 10], 'mm'], ['bossL', 'Boss length (0 for none)', [0, 10], 'mm'], ['bossD', 'Boss diameter', [1, 20], 'mm']],
    fresh: { name: 'My gear set', layout: 'sidewinder', boss: 'in', gearD: 18, gearT: 34, pinionD: 6.5, pinionT: 11, angle: 25, discT: 2, bossL: 2, bossD: 6.5, confirmed: false },
    line: (c) => `${LAYOUTS[c.layout]} · ${c.gearT} / ${c.pinionT} · Ø${c.gearD} + Ø${c.pinionD}`,
  },
  bearing: {
    one: 'Bearing', many: 'Bearings', group: 'Components', inDesign: true,
    fields: [['seat', 'Seat diameter', [1, 20], 'mm'], ['width', 'Width', [0.5, 10], 'mm'], ['flangeD', 'Flange diameter (0 for none)', [0, 30], 'mm'], ['flangeT', 'Flange thickness', [0, 5], 'mm']],
    fresh: { name: 'My bearing', seat: 4.75, width: 2.4, flangeD: 0, flangeT: 0, confirmed: false },
    line: (c) => `seat Ø${c.seat}${c.flangeD > 0 ? ` · flange Ø${c.flangeD} × ${c.flangeT}` : ''}`,
  },
  guide: {
    one: 'Guide', many: 'Guides', group: 'Components', inDesign: true,
    fields: [['hole', 'Hole in the chassis', [1, 12], 'mm'], ['bladeL', 'Blade length', [5, 60], 'mm']],
    fresh: { name: 'My guide', hole: 3.7, bladeL: 21, confirmed: false },
    line: (c) => `hole Ø${c.hole} · blade ${c.bladeL}`,
  },
  printer: {
    one: 'Printer', many: 'Printers', group: 'Setup',
    choices: { material: Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, m.name])) },
    fields: [['nozzle', 'Nozzle', [0.1, 2], 'mm'], ['holeFix', 'Fix for upright holes', [-0.5, 1], 'mm'], ['boreFix', 'Fix for sideways holes', [-0.5, 1], 'mm'], ['minWall', 'Minimum wall', [0.2, 5], 'mm'], ['bridge', 'Longest bridge', [0, 200], 'mm'], ['overhang', 'Steepest overhang', [0, 89], '°']],
    fresh: { ...PRINTERS.petg04, name: 'My printer' },
    line: (c) => `${MATERIALS[c.material]?.name ?? ''} · ${c.nozzle} nozzle · hole fix ${c.holeFix} / ${c.boreFix}`,
    noConfirm: true,
  },
  rules: {
    one: 'Rule set', many: 'Rule sets', group: 'Setup',
    fields: [['maxWidth', 'Widest allowed', [1, 500], 'mm'], ['guideLeadMax', 'Longest guide lead', [1, 1000], 'mm'], ['minClearance', 'Least clearance', [0, 50], 'mm']],
    fresh: { name: 'My club', maxWidth: 64, guideLeadMax: 105, minClearance: 0.75, confirmed: false },
    line: (c) => `width ${c.maxWidth} · lead ${c.guideLeadMax} · clearance ${c.minClearance}`,
  },
  car: {
    one: 'Car preset', many: 'Car presets', group: 'Setup',
    choices: { scale: { '1/32': '1/32', '1/24': '1/24' } },
    fields: [['wheelbase', 'Wheelbase', [20, 300], 'mm']],
    fresh: { name: 'My car', scale: '1/32', wheelbase: 80, confirmed: false },
    line: (c) => `${c.scale} · wheelbase ${c.wheelbase}`,
  },
};
export const COMPONENT_KINDS = Object.keys(KINDS);
// Kinds a design can carry its own copy of.
export const DESIGN_KINDS = COMPONENT_KINDS.filter((k) => KINDS[k].inDesign);

const TABLES = { motor: MOTORS, bearing: BEARINGS, guide: GUIDES, printer: PRINTERS, rules: RULESETS, car: CARS };
// The built-in entries of a kind: [{ id, ...values }].
export function builtins(kind) {
  // Shown with the shape such gears usually have (see gearShape in model.js): a spur gear is a 2 mm disc with a 2 mm boss, a crown 3 mm with none.
  if (kind === 'gear') return Object.entries(GEARS).flatMap(([layout, list]) => list.map((g) => ({ angle: 0, boss: 'in', discT: layout === 'sidewinder' ? 2 : 3, bossL: layout === 'sidewinder' ? 2 : 0, bossD: Math.min(6.5, Math.round(g.gearD * 4.5) / 10), ...g, layout })));
  return Object.entries(TABLES[kind] ?? {}).filter(([id]) => !(kind === 'guide' && id === 'custom')).map(([id, c]) => ({ id, ...c }));
}

// One component, checked: known fields only, numbers within their limits, a plain name.
export function cleanComponent(kind, raw) {
  const k = KINDS[kind];
  if (!k) throw Error('This is not a known kind of component.');
  raw = raw && typeof raw === 'object' ? raw : {};
  const out = { name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : k.fresh.name };
  for (const [key, options] of Object.entries(k.choices ?? {})) out[key] = Object.hasOwn(options, raw[key]) ? raw[key] : k.fresh[key];
  for (const [key, , [lo, hi], , whole] of k.fields) {
    const v = typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? Math.min(hi, Math.max(lo, raw[key])) : k.fresh[key];
    out[key] = whole ? Math.round(v) : v;
  }
  if (!k.noConfirm) out.confirmed = raw.confirmed === true;
  return out;
}
