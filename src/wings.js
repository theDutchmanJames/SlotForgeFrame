// Rear wings: a wing with endplates on one or two legs, printed apart from the body and fixed to it with
// pins through the body's wall (melted over from inside, or glued). Pure data and 2D shapes: the app draws
// them, the engine builds them. Side view: x along the car (0 at the wing's leading edge, + towards the tail),
// z up from the body's surface under the wing's leading edge. From behind: y across the car, z up.

export const ENDPLATES = { gt3: 'GT3', rect: 'Square', round: 'Rounded', tall: 'LMP, tall', own: 'Your own' };
const CHOICE = { plate: Object.keys(ENDPLATES), legs: ['swan', 'posts'], fix: ['melt', 'glue'], printAs: ['one', 'kit', 'parts'], flat: ['none', 'under', 'top'] };
export const FLAT_SIDES = { none: 'Curved all round', under: 'Flat underside', top: 'Flat top' };

// A GT3 wing in 1/32: about 1.8 m wide with a 300 mm chord on the real car.
const BASE = {
  span: 56, chord: 9.5, thick: 12, camber: 6, angle: 8, gurney: 0.5, edge: 0.5, flat: 'none',
  element2: false, chord2: 4, angle2: 25, gap: 0.6,
  plate: 'gt3', plateT: 0.8, above: 3, below: 2.5, fwd: 1, aft: 1.5, plateOwn: null,
  legs: 'swan', count: 2, spacing: 26, height: 9, legW: 1.2, legD: 3, lean: 0, attach: 45,
  fix: 'melt', pinD: 1.2, pins: 1, wall: 1.0, collar: true, deck: 6,
  printAs: 'one',
};
export const WING_PRESETS = {
  'GT3 swan neck': {},
  'GT3 on posts': { legs: 'posts', attach: 40, height: 8, gurney: 0.4 },
  'LMP': { span: 58, chord: 8, thick: 10, angle: 6, plate: 'tall', below: 6, above: 2, aft: 2.5, count: 1, height: 10, legD: 5, legW: 1.6 },
  'DTM two element': { span: 54, chord: 7, element2: true, chord2: 4, angle2: 28, plate: 'rect', above: 4, below: 3, legs: 'posts', height: 7, attach: 35 },
  'Group C': { span: 60, chord: 10, thick: 11, element2: true, chord2: 4.5, angle2: 22, plate: 'round', above: 4, below: 4, legs: 'posts', spacing: 18, height: 7.5 },
  'Classic flat': { chord: 8, thick: 11, camber: 0, angle: 4, gurney: 0, plate: 'rect', above: 1.5, below: 1.5, fwd: 0, aft: 0, legs: 'posts', height: 6, legD: 2.4, fix: 'glue', pins: 0 },
};
// Sizes that grow with the scale; angles, percentages and the body's wall do not.
const LENGTHS = ['span', 'chord', 'chord2', 'gap', 'gurney', 'plateT', 'above', 'below', 'fwd', 'aft', 'spacing', 'height', 'legW', 'legD', 'pinD'];
const scaleOf = (scale) => (scale === '1/24' ? 32 / 24 : 1);
export function wingPreset(name, scale = '1/32') {
  const p = WING_PRESETS[name];
  if (!p) throw Error('Not a wing this app knows.');
  const w = { ...BASE, ...p }, k = scaleOf(scale);
  for (const key of LENGTHS) w[key] = round(w[key] * k, 2);
  if (scale === '1/24') w.wall = 1.2;
  return w;
}
export const newWing = (scale = '1/32') => wingPreset('GT3 swan neck', scale);

// ------------------------------------------------------------ checking what a file brings
const RANGE = {
  span: [5, 150], chord: [1, 40], thick: [2, 30], camber: [0, 15], angle: [-10, 45], gurney: [0, 5], edge: [0.1, 2],
  chord2: [0.5, 30], angle2: [-10, 70], gap: [0, 5], plateT: [0.2, 5], above: [0, 40], below: [0, 40], fwd: [0, 30], aft: [0, 30],
  count: [1, 2], spacing: [0, 140], height: [0.5, 60], legW: [0.2, 10], legD: [0.5, 30], lean: [-45, 45], attach: [5, 95],
  pinD: [0.3, 5], pins: [0, 2], wall: [0.1, 5], deck: [-30, 30],
};
const WHOLE = new Set(['count', 'pins']);
const num = (v, def, [lo, hi], whole) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const x = Math.min(hi, Math.max(lo, v));
  return whole ? Math.round(x) : x;
};
export function cleanWing(raw, scale = '1/32') {
  const def = newWing(scale), out = {};
  raw = raw && typeof raw === 'object' ? raw : {};
  for (const [k, dv] of Object.entries(def)) {
    const v = raw[k];
    if (k === 'plateOwn') {
      const pts = Array.isArray(v) ? v.slice(0, 300).filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map(([x, z]) => [num(x, 0, [-100, 100]), num(z, 0, [-100, 100])]) : [];
      out.plateOwn = pts.length >= 3 ? pts : null;
    } else if (typeof dv === 'boolean') out[k] = typeof v === 'boolean' ? v : dv;
    else if (typeof dv === 'string') out[k] = CHOICE[k]?.includes(v) ? v : dv;
    else out[k] = num(v, dv, RANGE[k] ?? [-100, 100], WHOLE.has(k));
  }
  if (out.plate === 'own' && !out.plateOwn) out.plate = 'gt3';
  return out;
}

// ------------------------------------------------------------ the shapes, seen from the side (x, z)
const rad = (deg) => (deg * Math.PI) / 180;
// The body's surface under the wing: it slopes down towards the tail by `deck` degrees.
export const deckZ = (w, x) => -Math.tan(rad(w.deck)) * x;

// A wing section: an upside-down NACA 4-digit profile (the camber bulges downward, as on every wing that
// presses a car down), never thinner than `edge` so that the trailing edge prints, turned by `angle`
// (trailing edge up) about its leading edge at `lead`. Returns the outline and a few points on it.
// `flat`: 'under' or 'top' makes that side straight (the chord line), so that the wing can print lying
// on it; the other side then takes the whole thickness, and the camber.
export function section(chord, thickPct, camberPct, angle, lead, edge, flat = 'none') {
  const n = 36, t = thickPct / 100, m = camberPct / 100, p = 0.4, up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    let yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) * chord;
    if (i > 0) yt = Math.max(yt, edge / 2);
    const yc = (m ? (x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x)) : 0) * chord;
    if (flat === 'under') { up.push([x * chord, 2 * yt + yc]); lo.push([x * chord, 0]); }
    else if (flat === 'top') { up.push([x * chord, 0]); lo.push([x * chord, -2 * yt - yc]); }
    else { up.push([x * chord, -yc + yt]); lo.push([x * chord, -yc - yt]); }
  }
  const a = rad(angle), c = Math.cos(a), s = Math.sin(a);
  // Turned so that the trailing edge rises: x' = x cos a, z' = x sin a + z cos a, about the leading edge.
  const rot = ([x, z]) => [lead[0] + x * c - z * s, lead[1] + x * s + z * c];
  const pts = [...up.map(rot), ...lo.slice(1, -1).reverse().map(rot)];
  // The top surface at a share of the chord, and the trailing edge.
  const at = (f) => { const i = Math.round(Math.acos(1 - 2 * f) / Math.PI * n); return rot(up[Math.min(n, Math.max(0, i))]); };
  const under = (f) => { const i = Math.round(Math.acos(1 - 2 * f) / Math.PI * n); return rot(lo[Math.min(n, Math.max(0, i))]); };
  return { pts, te: rot([chord, 0]), top: at, bottom: under };
}
// Everything seen from the side: the wing, its flap, the Gurney flap, the endplate and one leg with its pins.
export function wingSide(w) {
  const lead = [0, w.height];
  const main = section(w.chord, w.thick, w.camber, w.angle, lead, w.edge, w.flat);
  const flap = w.element2 ? section(w.chord2, w.thick * 0.9, w.camber, w.angle2, [main.te[0] - 0.15 * w.chord2, main.te[1] + w.gap], w.edge, w.flat) : null;
  const te = flap ? flap.te : main.te;
  const gurney = w.gurney > 0 ? [[te[0] - 0.35, te[1] - 0.1], [te[0], te[1] - 0.1], [te[0], te[1] + w.gurney], [te[0] - 0.35, te[1] + w.gurney]] : null;
  // The endplate's box: round the wing and its flap, with what you set above, below, ahead and behind.
  const all = [...main.pts, ...(flap?.pts ?? []), ...(gurney ?? [])];
  const zLo = Math.min(...all.map((p) => p[1])) - w.below, zHi = Math.max(...all.map((p) => p[1])) + w.above;
  const xLo = Math.min(...all.map((p) => p[0])) - w.fwd, xHi = Math.max(...all.map((p) => p[0])) + w.aft;
  const box = { x0: xLo, x1: xHi, z0: zLo, z1: zHi };
  return { main, flap, gurney, te, box, plate: plateShape(w, box), leg: legShape(w, main, flap) };
}
function plateShape(w, { x0, x1, z0, z1 }) {
  const L = x1 - x0, H = z1 - z0;
  if (w.plate === 'own' && w.plateOwn) {
    // Your own outline is kept in a box of 0..1 each way and fitted to the endplate's box.
    return w.plateOwn.map(([u, v]) => [x0 + u * L, z0 + v * H]);
  }
  if (w.plate === 'rect') return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  if (w.plate === 'round') {
    const r = Math.min(3, H / 2, L / 2), out = [];
    const arc = (cx, cz, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
    arc(x1 - r, z0 + r, -Math.PI / 2); arc(x1 - r, z1 - r, 0); arc(x0 + r, z1 - r, Math.PI / 2); arc(x0 + r, z0 + r, Math.PI);
    return out;
  }
  if (w.plate === 'tall') return [[x0, z0], [x1, z0 + Math.min(1, H * 0.1)], [x1, z1], [x0 + L * 0.35, z1], [x0, z1 - Math.min(2, H * 0.2)]];
  // GT3: the front's lower corner cut back, the top's front corner swept.
  return [[x0, z0 + Math.min(0.8, H * 0.15)], [x0 + L * 0.3, z0], [x1, z0], [x1, z1], [x0 + L * 0.15, z1], [x0, z1 - Math.min(1.2, H * 0.2)]];
}
// One leg from the side, as an outline, with where its foot meets the body. A swan neck comes up behind the
// wing and over its top, and holds it from above; a post stands under the wing and holds it from below.
function legShape(w, main, flap) {
  const d = w.legD, half = d / 2, into = 0.4;
  const behind = Math.max(main.te[0], flap?.te[0] ?? -Infinity);
  if (w.legs === 'swan') {
    const att = main.top(w.attach / 100), topZ = Math.max(...main.pts.map((p) => p[1]), ...(flap?.pts.map((p) => p[1]) ?? [])) + 1.6;
    const neck = Math.max(0.6, Math.min(d * 0.45, 2)), foot = behind + 0.8 + half;
    const r = Math.max(0.2, Math.min(2, (topZ - neck - deckZ(w, foot)) / 3)), R = r + Math.min(d, neck);
    const arc = (cx, cz, rr, a0, a1) => Array.from({ length: 7 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / 6; return [cx + rr * Math.cos(a), cz + rr * Math.sin(a)]; });
    const out = [
      [foot - half, deckZ(w, foot - half)],
      // Up the back of the leg to the inside of the bend, round it, and forward under the neck.
      ...arc(foot - half - r, topZ - neck - r, r, 0, Math.PI / 2),
      [att[0] + neck, topZ - neck],
      // Down into the top of the wing, back up, and over the top of the neck.
      [att[0] + neck, att[1] - into], [att[0], att[1] - into], [att[0], topZ],
      ...arc(foot + half - R, topZ - R, R, Math.PI / 2, 0),
      [foot + half, deckZ(w, foot + half)],
    ];
    return { outline: out, foot: [foot, deckZ(w, foot)], top: topZ, att };
  }
  const att = main.bottom(w.attach / 100), foot = att[0] + Math.tan(rad(w.lean)) * att[1];
  return {
    outline: [[att[0] - half, att[1] + into], [att[0] + half, att[1] + into], [foot + half, deckZ(w, foot + half)], [foot - half, deckZ(w, foot - half)]],
    foot: [foot, deckZ(w, foot)], top: att[1], att,
  };
}
// Where the legs stand across the car.
export const legYs = (w) => (w.count === 1 ? [0] : [-w.spacing / 2, w.spacing / 2]);
// Where the pins of one leg go along the car, and how long they are below the body's surface.
export function pinsOf(w, side = wingSide(w)) {
  const f = side.leg.foot[0], xs = w.pins === 2 ? [f - w.legD * 0.28, f + w.legD * 0.28] : w.pins === 1 ? [f] : [];
  // Melted: the wall and the pin's own diameter more, to melt into a head. Glued: they only locate the wing.
  const below = w.fix === 'melt' ? w.wall + w.pinD : Math.max(0.3, w.wall * 0.7);
  return xs.map((x) => ({ x, z: deckZ(w, x), below }));
}

// ------------------------------------------------------------ checks that need no geometry
export function wingChecks(w, ctx = {}) {
  const nozzle = ctx.nozzle ?? 0.4, out = [];
  const add = (ok, title, text, soft) => out.push({ ok, title, text, ...(soft ? { soft: true } : {}) });
  const thick = (w.thick / 100) * w.chord;
  if (thick < 2 * nozzle) add(false, 'The wing is thinner than two lines', `At its thickest the wing is ${thick.toFixed(2)} mm; two lines of a ${nozzle} mm nozzle need ${(2 * nozzle).toFixed(1)} mm. Make it thicker, or longer front to back.`);
  if (w.edge < nozzle) add(false, 'The trailing edge is thinner than the nozzle', `${w.edge} mm does not print with a ${nozzle} mm nozzle. Make the thinnest edge at least ${nozzle} mm.`, true);
  if (w.plateT < nozzle * 1.5) add(false, 'The endplates are very thin', `${w.plateT} mm endplates are one or two lines thick: they will be weak.`, true);
  if (w.legW < 2 * nozzle) add(false, 'The legs are thinner than two lines', `Legs of ${w.legW} mm need at least ${(2 * nozzle).toFixed(1)} mm with this nozzle.`);
  else if (w.height / w.legW > 12) add(false, 'The legs are slender for their height', `${w.height} mm tall on ${w.legW} mm legs: they will flex. Make them wider, or the wing lower.`, true);
  if (w.count === 2 && w.spacing / 2 + w.legW / 2 > w.span / 2) add(false, 'The legs stand outside the wing', `Legs ${w.spacing} mm apart do not fit under a wing ${w.span} mm wide.`);
  if (w.count === 2 && w.spacing < w.legW + 1) add(false, 'The legs are too close together', 'Put them further apart, or use one leg.');
  if (w.fix === 'melt' && w.pins === 0) add(false, 'Melted fixing needs pins', 'With no pins there is nothing to melt over. Give each leg a pin, or glue the wing on.');
  if (w.flat === 'top' && w.gurney > 0 && w.printAs === 'parts') add(false, 'The Gurney flap stands on the flat top', 'Printed lying on its flat top, the wing rests on the Gurney flap. Print it with a flat underside, or without the flap.', true);
  if (w.pins > 0 && w.pinD > w.legW + 0.01) add(false, 'The pins are wider than the legs', `A Ø${w.pinD} pin on a ${w.legW} mm leg: make the pins thinner or the legs wider.`);
  if (w.fix === 'melt' && w.pinD < 0.8) add(false, 'The pins are too thin to melt over', `Ø${w.pinD} pins melt away rather than into a head: use at least Ø0.8.`, true);
  if (w.pinD < 2 * nozzle) add(false, 'The pins are thinner than two lines', `Ø${w.pinD} pins do not print well with a ${nozzle} mm nozzle.`, true);
  if (w.pins === 2 && w.legD < 2 * w.pinD + 0.4) add(false, 'Two pins do not fit on the leg', `A leg ${w.legD} mm deep has room for one Ø${w.pinD} pin. Use one pin, or a deeper leg.`);
  if (w.element2 && w.gap < nozzle) add(false, 'The flap is too close to the wing', `A gap of ${w.gap} mm prints closed with a ${nozzle} mm nozzle: the two elements will be one. That is fine if it is meant to.`, true);
  // The endplates and the wing stay above the body.
  const side = wingSide(w), low = side.plate.reduce((m, [x, z]) => Math.min(m, z - deckZ(w, x)), Infinity);
  if (low < 0.3) add(false, 'The endplates reach into the body', `Their lowest point is ${low < 0 ? (-low).toFixed(1) + ' mm below' : low.toFixed(1) + ' mm above'} the body's surface. Raise the wing, or make the endplates shorter below it.`);
  const wide = w.span + 2 * w.plateT;
  if (ctx.maxWidth && wide > ctx.maxWidth) add(false, 'The wing is wider than the rules allow', `${wide.toFixed(1)} mm over the endplates; the rules allow ${ctx.maxWidth} mm for the car.`);
  else add(true, `${wide.toFixed(1)} mm over the endplates`, ctx.maxWidth ? `The rules allow ${ctx.maxWidth} mm.` : '');
  if (w.fix === 'melt') add(true, `Pins ${(w.wall + w.pinD).toFixed(1)} mm through the body`, `The wall is ${w.wall} mm; the last ${w.pinD} mm of each pin is melted into a head from inside.`);
  return out;
}

export function round(v, n = 3) {
  const k = 10 ** n;
  return Math.round(v * k) / k;
}
