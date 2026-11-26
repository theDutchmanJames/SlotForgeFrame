// Wheel inserts: a disc, or a cup with a skirt, that presses into the pocket in the face of an
// aluminium wheel, with a pattern on its face. The pattern is a list of layers; each one repeats
// round the centre by itself and is cut through, sunk into the face or raised from it.
// Or a ready-made model: one of Jivko's designs, scaled across to fit and with the back made deeper
// or shallower, so the face keeps its height and its detail.
// Pure data and 2D shapes (mm, centre at 0,0, y down as drawn): the app draws them, the engine builds them.
import { JIVKO } from './jivko.js';

export const LAYER_TYPES = ['spokes', 'holes', 'ring', 'bolts', 'draw'];
export const LAYER_NAMES = { spokes: 'Spokes', holes: 'Holes', ring: 'Ring', bolts: 'Bolts & nut', draw: 'Draw your own' };
export const MODES = ['cut', 'recess', 'raise'];
export const MODE_NAMES = { cut: 'Cut through', recess: 'Sunk', raise: 'Raised' };

// What each scale's wheels usually are. The pocket is nobody's published size: measure your own.
const WHEELS = {
  '1/32': { wheelD: 15.8, pocketD: 12.0, pocketDepth: 1.6 },
  '1/24': { wheelD: 21.0, pocketD: 16.0, pocketDepth: 2.0 },
};
export function newBase(scale = '1/32') {
  const w = WHEELS[scale] ?? WHEELS['1/32'], clear = 0.1;
  return { form: 'disc', ...w, clear, od: round(w.pocketD - 2 * clear), thick: round(Math.max(0.6, w.pocketDepth - 0.4)), dish: 0, lip: 0.5, sink: 0, hole: 2.6, skirt: 1.5, wall: 0.6, model: '', depth: 0 };
}

// ------------------------------------------------------------ ready-made models
// Each: { id, name, R0, H, zb, zf, faceDepth, hubR, directional, rings } (see tools/jivko-pack.mjs).
export const MODELS = Object.fromEntries(JIVKO.map((m) => [m.id, { ...m, maker: 'Jivko Design', title: `Jivko Design - ${m.name}` }]));
export const MODEL_IDS = Object.keys(MODELS);
export const modelOf = (ins) => (ins?.base?.form === 'model' ? MODELS[ins.base.model] ?? null : null);
// The back is kept at least this thick under the face (and never thinner than its own details at the bed).
export const MIN_BACK = 0.6;
// Where the engine cuts the model to make the back deeper or shallower: just inside the plain back.
export const cutsOf = (m) => ({ lo: m.zb + 0.05, hi: m.zf - 0.05 });
export const minDepth = (m) => { const c = cutsOf(m); return Math.ceil((m.H - c.hi + Math.max(MIN_BACK, c.lo)) * 100) / 100; };
// Across, the model is scaled to the insert's diameter; its height is never scaled.
export const modelScale = (m, base) => base.od / (2 * m.R0);
// A ready-made model for this wheel: the wheel, the size and the centre hole stay; the back starts 1 mm thicker than it must be.
export function modelInsert(id, base) {
  const m = MODELS[id];
  if (!m) throw Error('Not a ready-made insert this app knows.');
  return { base: { ...base, form: 'model', model: id, depth: round(minDepth(m) + 1, 2), dish: 0, sink: 0 }, layers: [], faceDown: false, mirror: true };
}
// A fresh layer of each type, sized for an insert of radius R.
export function newLayer(type, R = 5.9) {
  const k = R / 5.9, r = (v) => round(v * k);
  switch (type) {
    case 'spokes': return { type, mode: 'cut', h: 0.3, count: 5, hub: r(2.3), rim: r(5.3), wHub: r(1.5), wRim: r(1.9), curve: 0, split: 0, crossed: false };
    case 'holes': return { type, mode: 'cut', h: 0.3, count: 8, at: r(4.0), shape: 'round', size: r(1.4), len: r(2.2) };
    case 'ring': return { type, mode: 'raise', h: 0.2, r: r(2.4), w: r(0.6) };
    case 'bolts': return { type, mode: 'raise', h: 0.2, count: 5, pcd: r(3.0), d: r(0.45), nut: 'none', nutD: r(1.6) };
    case 'draw': return { type, mode: 'cut', h: 0.3, count: 6, points: leaf(R) };
    default: throw Error('Not a kind of layer.');
  }
}
// The shape a new "Draw your own" layer starts with: a leaf in the segment that points up.
function leaf(R) {
  const out = [];
  for (let j = 0; j <= 8; j++) { const t = j / 8, rr = R * (0.38 + 0.5 * t), a = -Math.PI / 2 + 0.42 * Math.sin(Math.PI * t) * (1 - 0.3 * t); out.push([round(rr * Math.cos(a)), round(rr * Math.sin(a))]); }
  for (let j = 7; j >= 1; j--) { const t = j / 8, rr = R * (0.38 + 0.5 * t), a = -Math.PI / 2 + 0.08 * Math.sin(Math.PI * t); out.push([round(rr * Math.cos(a)), round(rr * Math.sin(a))]); }
  return out;
}

// Ready-made patterns: each is a base and a set of layers, all of which can be changed.
const P = (base, layers) => ({ base, layers });
export const PRESETS = {
  '5-spoke': P({}, [{ type: 'spokes', count: 5, hub: 2.3, rim: 5.3, wHub: 1.5, wRim: 1.9 }, { type: 'bolts', count: 5, pcd: 3.0, d: 0.45 }]),
  'Split 10': P({}, [{ type: 'spokes', count: 5, hub: 2.0, rim: 5.3, wHub: 0.7, wRim: 0.8, split: 0.9 }, { type: 'bolts', count: 0, nut: 'lock', nutD: 2.2, h: 0.3 }]),
  'Mesh': P({ lip: 0.6 }, [{ type: 'spokes', count: 14, hub: 2.2, rim: 5.3, wHub: 0.45, wRim: 0.45, curve: 40, crossed: true }, { type: 'ring', r: 2.2, w: 0.5 }, { type: 'bolts', count: 0, nut: 'lock', nutD: 2.6, h: 0.3 }]),
  '8-hole': P({ dish: 0.5 }, [{ type: 'holes', count: 8, at: 4.0, size: 1.4 }, { type: 'bolts', count: 4, pcd: 2.6, d: 0.4 }]),
  'Turbine': P({}, [{ type: 'spokes', count: 16, hub: 2.4, rim: 5.3, wHub: 0.55, wRim: 0.75, curve: 55 }, { type: 'ring', r: 2.4, w: 0.6, h: 0.25 }]),
  'Slots': P({ dish: 0.4 }, [{ type: 'holes', count: 6, at: 4.0, shape: 'slot', size: 1.0, len: 2.4 }, { type: 'ring', mode: 'recess', r: 5.1, w: 0.35, h: 0.2 }, { type: 'bolts', count: 6, pcd: 2.4, d: 0.4, nut: 'hex', nutD: 1.5, h: 0.25 }]),
  'Windows': P({}, [{ type: 'holes', count: 7, at: 3.8, shape: 'window', size: 1.6, len: 2.3 }, { type: 'bolts', count: 0, nut: 'hex', nutD: 1.8, h: 0.3 }]),
  'Dish': P({ dish: 0.7, lip: 0.8 }, [{ type: 'ring', mode: 'recess', r: 4.4, w: 0.3, h: 0.15 }, { type: 'bolts', count: 4, pcd: 2.6, d: 0.45 }]),
  'Plain': P({ lip: 0 }, []),
};
// A preset made for this insert: sizes scale with the insert, as the presets are drawn for a Ø11.8 one.
export function presetFor(name, base) {
  const p = PRESETS[name];
  if (!p) throw Error('Not a pattern this app knows.');
  const R = base.od / 2, k = R / 5.9, LEN = ['hub', 'rim', 'wHub', 'wRim', 'split', 'at', 'size', 'len', 'r', 'w', 'pcd', 'd', 'nutD'];
  const layers = p.layers.map((l) => {
    const out = { ...newLayer(l.type, R), ...l };
    for (const key of LEN) if (key in l) out[key] = round(l[key] * k);
    return out;
  });
  const b = { ...base, dish: 0, lip: 0.5, ...p.base };
  if ('lip' in p.base) b.lip = round(p.base.lip * k);
  return { base: b, layers };
}

export function newInsert(scale = '1/32') {
  const base = newBase(scale);
  return { ...presetFor('5-spoke', base), faceDown: false, mirror: true };
}
// The calibration ring: seven discs round a middle size you set (your best guess at the pocket),
// `step` apart. Disc 4 is the middle one.
export const RING_COUNT = 7;
export const newRing = (scale = '1/32') => ({ centre: newBase(scale).od, step: 0.05 });
export const ringSizes = (ring) => Array.from({ length: RING_COUNT }, (_, i) => round(ring.centre + (i - (RING_COUNT - 1) / 2) * ring.step));
export function newInserts(scale = '1/32') {
  return { same: true, rear: newInsert(scale), front: newInsert(scale), ring: newRing(scale) };
}
// The insert for one end of the car: the front copies the rear when both are the same.
export const insertOf = (d, which) => (which === 'front' && !d.inserts.same ? d.inserts.front : d.inserts.rear);

// ------------------------------------------------------------ checking what a file brings
const BASE_RANGE = { wheelD: [4, 60], pocketD: [2, 50], pocketDepth: [0.2, 10], clear: [-0.5, 1], od: [2, 50], thick: [0.3, 10], dish: [0, 5], lip: [0, 10], sink: [0, 10], hole: [0, 20], skirt: [0.3, 15], wall: [0.3, 10], depth: [0, 60] };
const LAYER_RANGE = { h: [0.05, 5], count: [0, 48], hub: [0, 30], rim: [0.2, 30], wHub: [0.05, 20], wRim: [0.05, 20], curve: [-120, 120], split: [0, 10], at: [0, 30], size: [0.1, 20], len: [0.1, 30], r: [0.1, 30], w: [0.05, 20], pcd: [0, 30], d: [0.05, 10], nutD: [0.2, 30] };
const CHOICE = { mode: MODES, shape: ['round', 'slot', 'window'], nut: ['none', 'hex', 'lock'], form: ['disc', 'cup', 'model'], model: ['', ...MODEL_IDS] };
const WHOLE = new Set(['count']);
const clampNum = (v, def, [lo, hi], whole) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const x = Math.min(hi, Math.max(lo, v));
  return whole ? Math.round(x) : x;
};
function cleanObj(def, raw, range) {
  const out = {};
  raw = raw && typeof raw === 'object' ? raw : {};
  for (const [k, dv] of Object.entries(def)) {
    const v = raw[k];
    if (k === 'type') out.type = dv;
    else if (k === 'points') {
      const pts = Array.isArray(v) ? v.slice(0, 300).filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map(([x, y]) => [clampNum(x, 0, [-40, 40]), clampNum(y, 0, [-40, 40])]) : [];
      out.points = pts.length >= 3 ? pts : dv;
    } else if (typeof dv === 'boolean') out[k] = typeof v === 'boolean' ? v : dv;
    else if (typeof dv === 'string') out[k] = CHOICE[k]?.includes(v) ? v : dv;
    else out[k] = clampNum(v, dv, range[k] ?? [-100, 100], WHOLE.has(k));
  }
  return out;
}
export function cleanInsert(raw, scale = '1/32') {
  raw = raw && typeof raw === 'object' ? raw : {};
  const base = cleanObj(newBase(scale), raw.base, BASE_RANGE);
  // A model this copy of the app does not have becomes a plain disc; a model's depth is never less than its face needs.
  if (base.form === 'model' && !MODELS[base.model]) base.form = 'disc';
  if (base.form === 'model') base.depth = Math.max(base.depth, minDepth(MODELS[base.model]));
  const layers = (Array.isArray(raw.layers) ? raw.layers : []).slice(0, 24)
    .filter((l) => l && LAYER_TYPES.includes(l.type))
    .map((l) => cleanObj(newLayer(l.type, base.od / 2), l, LAYER_RANGE));
  return { base, layers, faceDown: base.form !== 'model' && raw.faceDown === true, mirror: raw.mirror !== false };
}
export function cleanInserts(raw, scale = '1/32') {
  if (!raw || typeof raw !== 'object') return newInserts(scale);
  const rear = cleanInsert(raw.rear, scale), ring = cleanObj({ centre: rear.base.od, step: 0.05 }, raw.ring, { centre: [2, 50], step: [0.01, 0.5] });
  return { same: raw.same !== false, rear, front: cleanInsert(raw.front ?? raw.rear, scale), ring };
}

// ------------------------------------------------------------ the pattern as 2D shapes
// Each layer's area is the union of `add` minus the union of `sub`; every ring is a list of [x, y].
const TAU = Math.PI * 2;
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
// Copies go round from straight up (as the face is drawn, y down), so a layer of one shows at the top.
const angleOf = (i, n) => (i / n) * TAU - Math.PI / 2;
export function circle(cx, cy, r, n = 0) {
  n = n || Math.max(16, Math.min(96, Math.ceil(r * 14)));
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
const rotate = (ring, a) => { const c = Math.cos(a), s = Math.sin(a); return ring.map(([x, y]) => [x * c - y * s, x * s + y * c]); };
export const mirrorRing = (ring) => ring.map(([x, y]) => [-x, y]).reverse();

// One spoke from the hub out to the rim: as wide as wHub at the hub and wRim at the rim,
// bent by `curve` degrees on its way out.
function spoke(L, a0, sign = 1) {
  const n = Math.abs(L.curve) > 0.5 ? 16 : 1, left = [], right = [];
  const r0 = Math.max(0.05, L.hub), r1 = Math.max(r0 + 0.05, L.rim);
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = r0 + (r1 - r0) * t, w = L.wHub + (L.wRim - L.wHub) * t;
    const a = a0 + sign * (L.curve * Math.PI / 180) * t, h = Math.min(1.4, w / 2 / r);
    left.push(pol(r, a - h)); right.push(pol(r, a + h));
  }
  return [...left, ...right.reverse()];
}
// What one layer draws on a face of radius R.
export function layerShape(L, R) {
  const add = [], sub = [];
  const n = Math.max(0, Math.round(L.count ?? 0));
  if (L.type === 'spokes') {
    if (!n) return { add, sub };
    add.push(circle(0, 0, Math.min(L.rim, R + 1)));
    sub.push(circle(0, 0, Math.max(0.05, Math.min(L.hub, L.rim - 0.05))));
    for (let i = 0; i < n; i++) {
      const a = angleOf(i, n);
      if (L.split > 0) { const g = L.split / 2 / ((L.hub + L.rim) / 2); sub.push(spoke(L, a - g), spoke(L, a + g)); }
      else sub.push(spoke(L, a));
      if (L.crossed) sub.push(spoke(L, a + Math.PI / n, -1));
    }
  } else if (L.type === 'holes') {
    for (let i = 0; i < n; i++) {
      const a = angleOf(i, n), [x, y] = pol(L.at, a);
      if (L.shape === 'round') add.push(circle(x, y, L.size / 2));
      else if (L.shape === 'slot') {
        // A slot along the radius: two half circles joined.
        const r = L.size / 2, h = Math.max(0, (L.len - L.size) / 2), ring = [];
        for (let j = 0; j <= 12; j++) { const b = a - Math.PI / 2 + (j / 12) * Math.PI; ring.push([x + Math.cos(a) * h + r * Math.cos(b), y + Math.sin(a) * h + r * Math.sin(b)]); }
        for (let j = 0; j <= 12; j++) { const b = a + Math.PI / 2 + (j / 12) * Math.PI; ring.push([x - Math.cos(a) * h + r * Math.cos(b), y - Math.sin(a) * h + r * Math.sin(b)]); }
        add.push(ring);
      } else {
        // A window: four sides between two radii, wider at the rim.
        const r0 = Math.max(0.1, L.at - L.len / 2), r1 = L.at + L.len / 2, h0 = Math.min(1.4, (L.size * 0.6) / 2 / r0), h1 = Math.min(1.4, L.size / 2 / r1);
        add.push([pol(r0, a - h0), pol(r1, a - h1), pol(r1, a + h1), pol(r0, a + h0)]);
      }
    }
  } else if (L.type === 'ring') {
    add.push(circle(0, 0, L.r + L.w / 2));
    if (L.r - L.w / 2 > 0.05) sub.push(circle(0, 0, L.r - L.w / 2));
  } else if (L.type === 'bolts') {
    for (let i = 0; i < n; i++) { const [x, y] = pol(L.pcd, angleOf(i, n)); add.push(circle(x, y, L.d / 2, 20)); }
    const r = L.nutD / 2;
    if (L.nut === 'hex') add.push([0, 1, 2, 3, 4, 5].map((i) => pol(r, i * Math.PI / 3 + Math.PI / 6)));
    if (L.nut === 'lock') { const ring = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU; ring.push(pol(r * (0.8 + 0.2 * Math.max(0, Math.cos(a * 3)) ** 3), a)); } add.push(ring); }
  } else if (L.type === 'draw') {
    // The points are the copy in the segment that points up; the others are turned round from it.
    if (L.points?.length >= 3) for (let i = 0; i < n; i++) add.push(rotate(L.points, (i / n) * TAU));
  }
  return { add, sub };
}

// A pattern that bends one way: the insert on the other side of the car is its mirror image.
export const directional = (ins) => (ins.base?.form === 'model' ? !!modelOf(ins)?.directional : ins.layers.some((l) => (l.type === 'spokes' && Math.abs(l.curve) > 0.5 && !l.crossed) || l.type === 'draw'));
// Whether the set mirrors the left-hand pair: only for a pattern that bends one way, and only if wanted.
export const mirrored = (ins) => directional(ins) && ins.mirror !== false;

// Fits an imported outline (a list of [x, y] in any units, y down) into the segment that points up:
// between the hub (40 % of the radius) and the rim (90 %), as wide as the segment allows.
export function fitToSegment(pts, R, count) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1;
  const r0 = R * 0.4, r1 = R * 0.9, mid = (r0 + r1) / 2, wide = 2 * mid * Math.sin(Math.PI / Math.max(1, count)) * 0.85;
  const k = Math.min((r1 - r0) / h, wide / w), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return pts.map(([x, y]) => [round((x - cx) * k), round((y - cy) * k - mid)]);
}

// ------------------------------------------------------------ checks that need no geometry
export function insertChecks(ins, ctx = {}) {
  const b = ins.base, R = b.od / 2, nozzle = ctx.nozzle ?? 0.4, axleD = ctx.axleD ?? 2.38, out = [];
  const add = (ok, title, text, soft) => out.push({ ok, title, text, ...(soft ? { soft: true } : {}) });
  const fit = round(b.pocketD - 2 * b.clear);
  if (Math.abs(fit - b.od) > 0.011) add(false, 'The insert does not match the pocket', `With a Ø${b.pocketD} pocket and ${b.clear} mm clearance the insert should be Ø${fit}; it is Ø${b.od}.`, true);
  else add(true, `Fits a Ø${b.pocketD} pocket`, `Ø${b.od}, with ${b.clear} mm all round.`);
  if (b.od >= b.wheelD - 0.6) add(false, 'The insert is as big as the wheel', `A Ø${b.wheelD} wheel cannot have a pocket for a Ø${b.od} insert: leave at least 0.3 mm of wheel round it.`);
  const m = modelOf(ins);
  if (m) {
    const min = minDepth(m), k = modelScale(m, b), hub = round(2 * m.hubR * k - 0.6, 2);
    if (b.depth > b.pocketDepth + 0.01) add(false, 'The insert stands out of the pocket', `It is ${round(b.depth, 2)} mm deep; the pocket is ${b.pocketDepth} mm. That is fine if it is meant to.`, true);
    if (b.depth <= min + 0.001) add(true, 'As shallow as the face allows', `The face is ${m.faceDepth} mm deep and keeps its height; under it is ${round(min - m.faceDepth, 2)} mm of back.`);
    if (b.hole > 0 && b.hole < axleD + 0.2) add(false, 'The axle hole is smaller than the axle', `The axle (Ø${axleD}) has to pass, with room: make the hole at least Ø${(axleD + 0.2).toFixed(2)}, or 0 for none.`);
    if (b.hole > 0 && b.hole > hub) add(false, 'The axle hole runs into the openings', `At Ø${b.od} this design's solid hub is Ø${round(2 * m.hubR * k, 2)}: keep the hole at most Ø${Math.max(0, hub)}, so 0.3 mm of hub is left round it.`);
    if (2 * m.hubR * k < 1.2) add(false, 'The hub is very small at this size', 'Fine details shrink with the diameter: check that the spokes still print with your nozzle.', true);
    return out;
  }
  // The face lies `sink` below the outer ring. A raised layer rises from the face, or from the ring where it reaches it.
  const sink = Math.max(0, b.sink), onRing = (l) => sink > 0 && outerOf(l) > R - b.lip;
  const above = Math.max(0, ...ins.layers.filter((l) => l.mode === 'raise').map((l) => (onRing(l) ? l.h : l.h - sink)));
  const tall = b.thick + (b.form === 'cup' ? b.skirt : 0) + above;
  if (tall > b.pocketDepth + 0.01) add(false, 'The insert stands out of the pocket', `It is ${tall.toFixed(2)} mm deep; the pocket is ${b.pocketDepth} mm. That is fine if it is meant to.`, true);
  if (b.hole > 0 && b.hole < axleD + 0.2) add(false, 'The centre hole is smaller than the axle', `The axle (Ø${axleD}) has to pass, with room: make the hole at least Ø${(axleD + 0.2).toFixed(2)}, or 0 for a closed face.`);
  if (sink > b.thick - 0.4 + 1e-6) add(false, 'The face sits too deep', `Leave at least 0.4 mm of face: at most ${(b.thick - 0.4).toFixed(2)} mm deep with this thickness.`);
  if (b.dish > b.thick - sink - 0.4 + 1e-6) add(false, 'The dish is too deep', `Leave at least 0.4 mm under the dish: at most ${Math.max(0, b.thick - sink - 0.4).toFixed(2)} mm with this thickness and face depth.`);
  // Face down, the face lies on the bed: it has to be flat, flush with the outer ring and with nothing raised.
  if (ins.faceDown && (sink > 0 || above > 0 || ins.layers.some((l) => l.mode === 'raise')))
    add(false, 'The face is not flat for printing face down', 'Face down, the face lies on the bed. Set the face depth to 0 and sink or cut the layers instead of raising them, or print it face up.');
  else if (ins.faceDown && b.dish > 0) add(false, 'A dished face does not lie flat', 'Face down, only the outer ring touches the bed and the dish prints in the air. It may print, but a flat face prints cleaner.', true);
  if (b.form === 'cup' && !ins.faceDown) add(false, 'A cup prints best face down', 'Face up, the face is printed in the air over the skirt. Turn on "Print face down" in the panel.', true);
  if (b.form === 'cup' && b.wall > R - b.hole / 2 - 0.3) add(false, 'The skirt fills the insert', 'Make the skirt wall thinner, or the centre hole smaller.');
  ins.layers.forEach((L, i) => {
    const name = `Layer ${i + 1} (${LAYER_NAMES[L.type].toLowerCase()})`;
    if (L.mode !== 'cut' && L.type !== 'draw' && L.h < nozzle / 4) add(false, `${name} is very shallow`, `${L.h} mm is less than one layer of most printers: it will hardly show.`, true);
    if (L.type === 'spokes' && L.count > 0) {
      const thin = Math.min(L.wHub, L.wRim);
      if (thin < nozzle) add(false, `${name}: spokes thinner than the nozzle`, `${round(thin)} mm spokes do not print with a ${nozzle} mm nozzle. Make them at least ${nozzle} mm, or print with a resin printer.`);
      if (L.mode === 'cut' && L.rim > R - 0.4) add(false, `${name} cuts through the rim`, `The spokes reach r ${L.rim}; the insert's edge is at r ${round(R)}. Keep them at least 0.4 mm inside it.`);
      if (L.mode === 'cut' && L.hub < b.hole / 2 + 0.4 && b.hole > 0) add(false, `${name} cuts into the centre hole`, 'Start the spokes further out, so a ring is left round the hole.');
      // The gaps between spokes at the hub must be open, or the cut leaves nothing.
      const gap = (TAU * L.hub) / (L.count * (L.split > 0 ? 2 : 1) * (L.crossed ? 2 : 1)) - L.wHub;
      if (L.mode === 'cut' && !L.crossed && gap < nozzle * 0.75) add(false, `${name}: no room between the spokes at the hub`, 'Use fewer or narrower spokes, or start them further out.', true);
    }
    if (L.type === 'holes' && L.count > 1) {
      const between = 2 * L.at * Math.sin(Math.PI / L.count) - (L.shape === 'round' ? L.size : L.size);
      if (between < nozzle) add(false, `${name}: the holes run into each other`, `Only ${round(Math.max(0, between))} mm is left between them. Use fewer or smaller holes, or put them further out.`);
      const reach = L.at + (L.shape === 'round' ? L.size / 2 : L.len / 2);
      if (L.mode === 'cut' && reach > R - 0.4) add(false, `${name} cuts through the rim`, 'Bring the holes in, or make them smaller.');
    }
    if (L.type === 'bolts' && L.count > 0 && L.d < nozzle) add(false, `${name}: studs smaller than the nozzle`, `Studs of Ø${L.d} do not print with a ${nozzle} mm nozzle.`, true);
  });
  return out;
}

// How far out from the centre a layer reaches.
function outerOf(L) {
  if (L.type === 'spokes') return L.rim;
  if (L.type === 'holes') return L.at + (L.shape === 'round' ? L.size : L.len) / 2;
  if (L.type === 'ring') return L.r + L.w / 2;
  if (L.type === 'bolts') return Math.max(L.count > 0 ? L.pcd + L.d / 2 : 0, L.nut !== 'none' ? L.nutD / 2 : 0);
  return Math.max(0, ...(L.points ?? []).map(([x, y]) => Math.hypot(x, y)));
}

export function round(v, n = 3) {
  const k = 10 ** n;
  return Math.round(v * k) / k;
}
