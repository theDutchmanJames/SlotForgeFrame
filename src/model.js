// The design: one chassis, one pod, and the numbers they share.
// Everything you see is rebuilt from this (src/geometry/engine.js).
//
// Car frame, as in SlotForge Anvil: millimetres, Z up, track at Z = 0,
// centre line at Y = 0, X runs from the front to the back.
// X = 0 is the front axle ("along" is measured from it).

export const FORMAT = 'slotforge-frame-project';
export const VERSION = 1;

let counter = 0;
export const newId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

// ------------------------------------------------------------ reference data
// The tables of motors, gears, bearings, guides and materials live in components.js.
import { MOTORS, GEARS, BEARINGS, GUIDES, MATERIALS, DESIGN_KINDS, COMPONENT_KINDS, cleanComponent } from './components.js';
import { newInserts, cleanInserts, cleanInsert } from './inserts.js';
import { newWing, cleanWing } from './wings.js';
import { newOnePiece, cleanOnePiece, PETER, rideHeight, layout as onePieceLayout } from './onepiece.js';
export { MOTORS, GEARS, BEARINGS, GUIDES, MATERIALS };

// What a scale sets as a starting point. Every value stays editable.
export const PROFILES = {
  '1/32': { axleD: 2.38, bearing: 'ball', guide: 'slotit', maxWidth: 64, guideLeadMax: 105, minClearance: 0.75, plate: 1.5 },
  '1/24': { axleD: 3.0, bearing: 'ball3', guide: 'g24', maxWidth: 83, guideLeadMax: 130, minClearance: 1.0, plate: 2.0 },
  // 1/43: nobody's published rules; sized down from 1/32 (32/43) and to Peter's 1:43 chassis. Measure your own car.
  '1/43': { axleD: 2.0, bearing: 'ball', guide: 'slotit', maxWidth: 46, guideLeadMax: 75, minClearance: 0.5, plate: 1.2 },
};
export const SCALES = Object.keys(PROFILES);

export const FEATURE_NAMES = {
  outline: 'Outline',
  podOpening: 'Pod opening',
  fill: 'Fill',
  guide: 'Guide holder',
  frontAxle: 'Front axle bracket',
  podMounts: 'Pod mounts',
  bodyMounts: 'Body mounts',
  kickup: 'Kick-up',
  profile: 'Side profile',
  kickfront: 'Front kick-up',
  split: 'Split part',
  base: 'Base plate',
  motorSeat: 'Motor seat',
  uprights: 'Axle uprights',
  lugs: 'Mount lugs',
  rib: 'Rib / strake',
  wall: 'Edge wall',
  tunnel: 'Tunnel',
  panel: 'Upright panel',
  level: 'Level / pocket',
  window: 'Window',
  rail: 'Rail',
  holder: 'Magnet / ballast holder',
  wire: 'Wire guide',
  chip: 'Chip mount',
  tab: 'Body support',
  cutout: 'Cut-out',
};

// Shaping features: a design can hold any number of each.
export const MULTI = ['rib', 'wall', 'tunnel', 'panel', 'level', 'window', 'rail', 'holder', 'wire', 'chip', 'tab', 'cutout'];

// A new shaping feature, placed where it is easy to see and move.
export function newShape(type, d) {
  const wb = d.car.wheelbase, pts = find(d.chassis, 'outline').params.points;
  const end = Math.max(...pts.map((p) => p[0])), mid = round(wb / 2);
  const params = {
    rib: { points: [[mid - 12, 22], [mid + 12, 22]], width: 1.2, h0: 3, h1: 3, side: 'top', root: 0, mirror: true },
    wall: { from: Math.max(0, pts.length - 3), to: pts.length - 2, height: 6, thick: 1.2, lean: 0, root: 0, mirror: true },
    tunnel: { x0: round(end - 14), x1: round(end), side: 12, width: 12, height: 7, wall: 1.0, openFloor: false, mirror: true },
    panel: { along: round(end - 1.5), width: 40, height: 9, thick: 1.2, windows: 4, bar: 1.4, lean: 0 },
    level: { x0: mid - 8, x1: mid + 8, y0: 18, y1: 26, offset: 1.5, mirror: true },
    window: { x0: mid - 8, x1: mid + 8, y0: 17, y1: 27, round: 1, mirror: true },
    rail: { points: [[mid - 14, 16], [mid + 14, 28]], width: 1.6, mirror: true },
    // A walled pocket for a magnet or a weight. deep: how tall the magnet is; floor: plate left under it (0 = open underneath); mass: what you put in, in grams.
    holder: { along: mid, side: d.scale === '1/24' ? 31 : 23.5, shape: 'round', d: 6.2, length: 12, width: 5, deep: 3, wall: 1.2, floor: 0.4, mass: 0, mirror: true },
    // Two small posts that hold a lead wire between them.
    wire: { along: 8, side: 11, gap: 1.4, height: 3, length: 3, wall: 1, mirror: true },
    // A low tray that a digital chip lies in.
    chip: { along: 15, side: 0, length: 20, width: 13, height: 2.5, wall: 1, clear: 0.3 },
    // A tab that reaches out from the edge of the plate for the body to rest on; rise: a block on it, up to the body.
    tab: { along: mid, length: 10, reach: 3, rise: 0, mirror: true },
    // A free shape cut out of the plate, or sunk into it. sink: 0 cuts through.
    cutout: { points: [[mid + 9, 19], [mid + 23, 19], [mid + 21, 27], [mid + 11, 27]], sink: 0, round: 0.5, mirror: true },
  }[type];
  return { id: newId(), type, enabled: true, params };
}
export const shapesOf = (d, type) => d.chassis.features.filter((f) => f.type === type);

// ------------------------------------------------------------ a new design

const feature = (type, params, extra = {}) => ({ id: newId(), type, enabled: true, params, ...extra });

// The half outline: points from the nose to the tail on the +Y side.
// The other side is its mirror image.
function defaultOutline(wb, scale) {
  const k = scale === '1/24' ? 1.3 : scale === '1/43' ? 32 / 43 : 1;
  const w = 30.5 * k;
  return [
    [-30 * k, 0],
    [-29 * k, 14 * k],
    [-25 * k, 22 * k],
    [-20 * k, 25 * k],
    [-12.5 * k, 27 * k],
    [-12.5 * k, 19.5 * k],
    [12 * k, 19.5 * k],
    [15 * k, w],
    [wb - 15.4 * k, w],
    [wb - 12.4 * k, 19 * k],
    [wb + 12.1 * k, 19 * k],
    [wb + 12.1 * k, 27 * k],
    [wb + 26.6 * k, 27 * k],
    [wb + 26.6 * k, 0],
  ].map(([x, y]) => [round(x), round(y)]);
}

export function newDesign(scale = '1/32') {
  const p = PROFILES[scale];
  const big = scale === '1/24', small = scale === '1/43';
  // 1/43 sizes are the 1/32 ones scaled down, except where Peter's 1:43 chassis gives them.
  const S = (v32, v24, v43 = round(v32 * 32 / 43, 1)) => (big ? v24 : small ? v43 : v32);
  const wb = S(83.4, 100, PETER.rear.wheelbase);
  const design = {
    format: FORMAT,
    version: VERSION,
    name: 'New chassis',
    scale,
    units: 'mm',
    mirror: true,
    // Wheel inserts for the car's aluminium wheels (inserts.js): one for the rear, and one for the front.
    inserts: newInserts(scale),
    // A rear wing for the body (wings.js).
    wing: newWing(scale),
    printer: { name: 'My printer', material: 'petg', nozzle: 0.4, holeFix: 0.2, boreFix: 0.2, minWall: 0.8, bridge: 8, overhang: 50 },
    rules: { maxWidth: p.maxWidth, guideLeadMax: p.guideLeadMax, minClearance: p.minClearance },
    car: {
      wheelbase: wb,
      clearance: S(2.0, 2.5, 1.5),
      axleD: p.axleD,
      front: { tyreD: S(19.5, 25.5, 16.5), tyreW: S(9, 8, 6), inOut: S(25.5, 33.5, 17) },
      rear: { tyreD: S(20.5, 27.5, 17), tyreW: S(10.5, 13, 7), inOut: S(25.75, 33, 17.5) },
    },
    drivetrain: {
      layout: 'inline',
      motor: big ? 'fk180' : small ? 'ff030' : 'fc130',
      gear: 'si-in-27-9',
      offset: 0.75,
      faceGap: 12.0, // inline: motor face to rear axle centre (unconfirmed)
      centre: 11.25, // sidewinder / anglewinder: shaft to axle (from the gears; unconfirmed)
      shiftX: 0,
      shiftY: 0,
      reverse: false, // the motor turned end for end: the shaft comes out of its endbell
      drives: 'right', // the side of the car the gear is on: the rear wheel the motor drives
      angle: null, // anglewinder: the motor's angle to the rear axle; null follows the gear set
    },
    chassis: { features: [] },
    pod: { features: [] },
  };
  design.chassis.features = [
    feature('outline', { points: defaultOutline(wb, scale), thickness: p.plate, round: 1.0, bevelTop: 0, bevelBottom: 0 }),
    feature('podOpening', { gap: 0.5 }),
    feature('fill', { style: 'frame', railWidth: 1.6, outerRail: 2.4, pad: 1.6, cross: proposeCross(design, 2, wb), length: [S(23, 30)], spine: true, axleRail: true, guideRail: true, tail: true, struts: 'fan', latticeCell: 7 }),
    feature('guide', { guide: p.guide, along: S(-19, -24, -5.5), side: 0, hole: GUIDES[p.guide].hole, bossD: S(6.3, 8), bossH: 5.8, padD: 11 }),
    // travel: how far the axle can move up and down in its slot; grubTop: a second grub screw from above; independent: a stub axle per wheel.
    // mount: the axle in a hole or slot of the uprights ('bracket'), or in bearings ('bearing') as on metal chassis:
    // a seat for the bearing (from the library), bThick thick along the axle, with `wall` round it; a flanged one rests outside.
    feature('frontAxle', { along: 0, spread: S(34.5, 46), width: 5, thick: 3, slot: true, grub: 1.6, travel: 0, grubTop: false, independent: false,
      mount: 'bracket', bearing: p.bearing, seat: BEARINGS[p.bearing].seat, bThick: S(4, 6, 3), wall: 1.5, flange: false, flangeD: 6.0, flangeT: 0.6 }),
    feature('podMounts', { hole: 1.8, padD: 5.8 }),
    // One mount on the centre line between the guide and the front axle, one on it behind the rear axle.
    feature('bodyMounts', { posts: [{ along: S(-9.5, -12), side: 0 }, { along: wb + 16.6, side: 0 }], padD: 6.6, hole: 2.5, recessD: 4.5, recessDepth: 1.0, height: 4 }),
    feature('kickup', { fold: wb + 12.1, angle: 12, strakes: 7, strakeT: 0.8, fillFloor: true, zone: 'full', zoneHalf: S(12, 16) }),
    // Off until asked for:
    feature('profile', { points: [[round(wb * 0.3), 0], [round(wb * 0.6), 0]] }, { enabled: false }),
    feature('kickfront', { fold: S(-14, -18), angle: 8, strakes: 0, strakeT: 0.8, fillFloor: false, zone: 'full', zoneHalf: S(12, 16) }, { enabled: false }),
    feature('split', { along: round(wb * 0.36), tabs: 2, spread: S(23, 30), depth: 4, neck: 3.5, head: 6, play: 0.15 }, { enabled: false }),
  ];
  design.pod.features = [
    // onTop: the pod sits on top of the chassis, resting on it by `rest` all round, where otherwise it drops into its opening.
    // drop: the motor and the axle moved up (+) or down (−) in the pod, through its floor.
    // builtIn: the pod is not a part of its own but built into the chassis, as on metal chassis: one part, no lugs or screws.
    feature('base', { width: S(25.4, 30), thickness: 1.5, sideways: 0, onTop: false, rest: 2, drop: 0, builtIn: false }),
    feature('motorSeat', { wall: 2.0, clear: 0.3 }),
    // form: a straight seat for a bearing or bushing, or a round socket for a spherical bushing (a ball with flat sides,
    // ballD x ballW) that snaps in past a lip (`opening`) and can tilt; `slits` let the lip give.
    // tube: one axle tube through both uprights (tubeLen end to end): its length sets how far apart they stand.
    // flange: a flanged bearing or bushing (flangeD x flangeT) whose flange rests against the wheel side or the
    // motor side of each upright (flangeAt), sunk into a recess or standing proud of the face (flangeRecess).
    feature('uprights', { bearing: p.bearing, seat: BEARINGS[p.bearing].seat, holder: 'closed', spread: S(29, 36), wall: 2.0, thick: 3.0, brace: true, buttress: true, lube: false,
      form: 'straight', ballD: 3.8, ballW: 2.0, opening: 3.2, slits: 4, slitW: 0.6, tube: false, tubeLen: 29, tubeD: 3.0,
      flange: false, flangeD: 6.0, flangeT: 0.6, flangeAt: 'out', flangeRecess: true,
      // ecc: an eccentric bushing's offset (it turns in its seat to set the axle's height), with a mark on the
      // upright to set it against. shoulder: the seat only as deep as the bearing, for one without a flange.
      ecc: 0, eccMark: true, shoulder: false }),
    // float: play for a pod that hangs on loosened screws: its screw holes are that much larger.
    feature('lugs', { patternX: 63.2, patternY: 20, rearBehindAxle: 6.6, lugD: 4.6, lugT: 2.0, hole: 2.3, float: 0 }),
  ];
  return design;
}

// The parts in a one-piece car, for the 3D view: the wheels and axles, the motor in its cradle, the gears and the guide.
function onePieceParts(d) {
  const P = d.onePiece, L = onePieceLayout(P), ride = rideHeight(P, d.car.rear.tyreD), wb = d.car.wheelbase, m = motorOf(d), g = gearOf(d);
  const at = (y) => y - P.front.at, z = ride + P.motor.shaftH, x = at(L.bayTo) - m.length / 2;
  const out = {
    wheels: [],
    axles: [
      { x: 0, z: ride + P.front.height, half: d.car.front.inOut + d.car.front.tyreW / 2, d: d.car.axleD, inner: null },
      { x: wb, z: ride + P.rear.height, half: d.car.rear.inOut + d.car.rear.tyreW / 2, d: d.car.axleD },
    ],
    motor: { x, y: 0, angle: 0, z, length: m.length, width: m.width, height: m.height },
    shaft: { x0: x, y0: 0, x1: x + m.length / 2 + m.shaftOut, y1: 0, z, d: m.shaftD },
    pinion: { x: x + m.length / 2 + m.shaftOut - 2.5, y: 0, z, angle: 0, d: g.pinionD, length: 5 },
    gear: { x: wb, y: g.pinionD / 2 + 1.9, z: ride + P.rear.height, d: g.gearD, width: 4 },
    guide: { x: at(P.guide.at), y: 0, length: 12 },
    bushes: [],
    gearBoss: null,
  };
  for (const [x, w] of [[0, d.car.front], [wb, d.car.rear]])
    for (const s of [1, -1]) out.wheels.push({ x, y: s * w.inOut, z: w.tyreD / 2, d: w.tyreD, w: w.tyreW });
  for (const [x, e] of [[0, P.front], [wb, P.rear]])
    for (const s of [1, -1]) out.bushes.push({ x, y: s * (e.inner + e.thick / 2), z: ride + e.height, d: e.hole, w: e.thick });
  return out;
}

// A pod built into the chassis: one part, as on metal chassis (Plafit, Schöler).
export const builtIn = (d) => !d.onePiece && !d.pod.imported && find(d.pod, 'base')?.params.builtIn === true;
// The front axle in bearings: a bearing picked from the library sets the seat and the flange.
export const frontBearings = (d) => { const f = find(d.chassis, 'frontAxle'); return on(f) && f.params.mount === 'bearing' ? f.params : null; };
export function useFrontBearing(p, b) {
  if (!b) return;
  p.seat = b.seat;
  p.flange = (b.flangeD || 0) > b.seat;
  if (p.flange) { p.flangeD = b.flangeD; p.flangeT = b.flangeT; }
  p.bThick = Math.max(p.bThick, round(b.width + (p.flange ? 0 : 0.5), 2));
}

// A one-piece design: the chassis and the motor bay in one part (onepiece.js). It starts as Peter's 1:43 chassis.
export function newOnePieceDesign() {
  const d = newDesign('1/43');
  d.name = PETER.name;
  d.onePiece = newOnePiece();
  d.car.wheelbase = d.onePiece.rear.wheelbase;
  return d;
}

// Cross rail positions spread over the pod opening's length.
export function proposeCross(design, count, wb = design.car.wheelbase) {
  const out = [];
  const x0 = wb - 50, x1 = wb - 12;
  for (let i = 0; i < count; i++) out.push(round(x0 + ((i + 0.5) * (x1 - x0)) / count));
  return out;
}

export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export const find = (part, type) => part.features.find((f) => f.type === type);
export const on = (f) => !!f && f.enabled !== false;

// ------------------------------------------------------------ derived numbers

// A design may carry its own components (from the library): d.custom = { motor: { id: {…} }, gear: …, bearing: …, guide: … }.
// They are looked up before the built-in ones.
const own = (d, kind, id) => (typeof id === 'string' && d.custom?.[kind] && Object.hasOwn(d.custom[kind], id) ? d.custom[kind][id] : undefined);
export const motorOf = (d) => own(d, 'motor', d.drivetrain.motor) ?? (Object.hasOwn(MOTORS, d.drivetrain.motor) ? MOTORS[d.drivetrain.motor] : MOTORS.fc130);
// The gear sets a layout can use: the built-in ones, then the design's own.
export function gearsFor(d, layout = d.drivetrain.layout) {
  const mine = Object.entries(d.custom?.gear ?? {}).filter(([, g]) => g.layout === layout).map(([id, g]) => ({ id, ...g }));
  return [...(GEARS[layout] ?? GEARS.inline), ...mine];
}
export function gearOf(d) {
  const list = gearsFor(d);
  return list.find((g) => g.id === d.drivetrain.gear) ?? list[0];
}
export const bearingOf = (d, id) => own(d, 'bearing', id) ?? (Object.hasOwn(BEARINGS, id ?? '') ? BEARINGS[id] : null);
export const guideOf = (d, id) => own(d, 'guide', id) ?? (Object.hasOwn(GUIDES, id ?? '') ? GUIDES[id] : null);
// What a select offers for a kind: { id: name }, built-in first.
export function choicesFor(d, kind) {
  const mine = Object.entries(d.custom?.[kind] ?? {});
  if (kind === 'motor') return Object.fromEntries([...Object.entries(MOTORS), ...mine].map(([k, m]) => [k, `${m.name} · ${m.length} × ${m.width} × ${m.height}`]));
  if (kind === 'gear') return Object.fromEntries(gearsFor(d).map((g) => [g.id, g.name]));
  return Object.fromEntries([...Object.entries(kind === 'bearing' ? BEARINGS : GUIDES), ...mine].map(([k, c]) => [k, c.name]));
}
// Puts one of your own components into the design, so the design carries it along.
export function adopt(d, kind, id, component) {
  if (!DESIGN_KINDS.includes(kind)) return;
  d.custom ??= {};
  d.custom[kind] ??= {};
  d.custom[kind][id] = cleanComponent(kind, component);
}
// The design's own components that a part really uses, or null.
export function customUsed(d, part) {
  const out = {};
  const take = (kind, id) => { const c = own(d, kind, id); if (c) (out[kind] ??= {})[id] = c; };
  if (part === 'pod') {
    take('motor', d.drivetrain.motor);
    take('gear', d.drivetrain.gear);
    take('bearing', find(d.pod, 'uprights')?.params.bearing);
  } else take('guide', find(d.chassis, 'guide')?.params.guide);
  return Object.keys(out).length ? out : null;
}
// Moves everything behind the middle of the car with the rear axle, when the wheelbase changes.
export function moveRear(d, from, to) {
  const shift = to - from, mid = from / 2;
  if (Math.abs(shift) < 1e-6) return;
  for (const p of find(d.chassis, 'outline').params.points) if (p[0] > mid) p[0] = round(p[0] + shift);
  const fill = find(d.chassis, 'fill').params;
  fill.cross = fill.cross.map((x) => (x > mid ? round(x + shift) : x));
  for (const q of find(d.chassis, 'bodyMounts').params.posts) if (q.along > mid) q.along = round(q.along + shift);
  const kick = find(d.chassis, 'kickup').params;
  kick.fold = round(kick.fold + shift);
  for (const q of find(d.chassis, 'profile').params.points) if (q[0] > mid) q[0] = round(q[0] + shift);
  const cutAt = find(d.chassis, 'split').params;
  if (cutAt.along > mid) cutAt.along = round(cutAt.along + shift);
  for (const f of d.chassis.features.filter((x) => MULTI.includes(x.type))) {
    const p = f.params;
    for (const q of p.points ?? []) if (q[0] > mid) q[0] = round(q[0] + shift);
    for (const k of ['x0', 'x1', 'along']) if (typeof p[k] === 'number' && p[k] > mid) p[k] = round(p[k] + shift);
  }
}

// Heights above the chassis underside (the pod's underside is flush with it).
// A pod on top of the chassis stands a plate's thickness higher than one in its opening, and `drop`
// moves the motor and axle in the pod. The wheels still stand on the track, so together these decide
// how high the chassis really rides: by `podRide` lower than the ground clearance that was asked for.
// (With the pod on top and the motor and axle dropped by the plate's thickness, that is nothing.)
export function podRide(d) {
  if (d.pod.imported) return 0;
  const base = find(d.pod, 'base')?.params ?? {};
  return (base.onTop === true ? find(d.chassis, 'outline').params.thickness : 0) + (base.drop || 0);
}
export const rideClearance = (d) => round(d.onePiece ? rideHeight(d.onePiece, d.car.rear.tyreD) : d.car.clearance - podRide(d), 3);
export function heights(d) {
  if (d.onePiece) { const P = d.onePiece; return { frontAxle: P.front.height, axle: P.rear.height, shaft: P.motor.shaftH }; }
  const axle = d.car.rear.tyreD / 2 - d.car.clearance;
  const shaft = axle - d.drivetrain.offset;
  const m = motorOf(d);
  return { axle, shaft, motorBottom: shaft - m.height / 2, frontAxle: d.car.front.tyreD / 2 - d.car.clearance };
}

// How far apart the bearing holders stand (outside to outside). A sidewinder motor lies
// between them, so they are never closer than the motor is long.
export function uprightSpread(d) {
  const p = find(d.pod, 'uprights').params;
  if (p.tube) return tubeSpread(p);
  return motorSpread(d);
}
// With an axle tube the uprights stand where its ends are: flush with its straight ends, or with each
// socket round a ball end (the length is taken over the balls).
// The size of the hole the holder is built round: the seat, or the ball of a spherical bushing.
export const seatSize = (p) => (p.form === 'sphere' ? p.ballD : p.seat);
// The inner face of an upright whose outer face is at `yo`: never closer than 0.5 mm to the middle.
export const uprightInner = (yo, p) => yo - Math.min(p.thick, yo - 0.5);
// A flange counts on a straight seat of its own (an axle tube's ends sit in the seats instead).
export const flanged = (p) => p.flange === true && p.form !== 'sphere' && !p.tube;
// How far a flange stands out of an upright's face on one side ('out': the wheel side, 'in': the motor side).
export const flangeProud = (p, at) => (flanged(p) && !p.flangeRecess && (p.flangeAt === at || p.flangeAt === 'both') ? p.flangeT : 0);
// The faces of an upright a flange rests against: 'out' (the wheel side), 'in' (the motor side), or both.
export const flangeSides = (p) => (p.flangeAt === 'both' ? ['out', 'in'] : [p.flangeAt]);
// The size the holder is built round: the seat or the ball, or a sunk flange when that is bigger.
export const holderSize = (p) => (flanged(p) && p.flangeRecess ? Math.max(seatSize(p), p.flangeD) : seatSize(p));
// Puts a bearing to work in the uprights: its seat, and its flange when it has one.
export function useBearing(p, b) {
  if (!b) return;
  p.seat = b.seat;
  p.flange = b.flangeD > 0 && b.flangeT > 0;
  if (p.flange) Object.assign(p, { flangeD: b.flangeD, flangeT: b.flangeT });
  // Two flanges hold the upright between them; a sunk flange cannot do that.
  if (p.flange && b.flanges === 2) Object.assign(p, { flangeAt: 'both', flangeRecess: false });
  else if (p.flangeAt === 'both') p.flangeAt = 'out';
  p.ecc = b.ecc ?? 0;
}
export const tubeSpread = (p) => round(p.form === 'sphere' ? p.tubeLen - p.ballW + p.thick : p.tubeLen, 3);
// The spread the motor asks for (a sidewinder's can lies between the holders).
export function motorSpread(d) {
  const p = find(d.pod, 'uprights').params, m = motorOf(d);
  if (d.drivetrain.layout !== 'sidewinder') return p.spread;
  // Room for the can between the holders, also on the side away from the gear
  // (a long shaft pushes the motor that way).
  const clear = find(d.pod, 'motorSeat')?.params.clear ?? 0.3;
  const t = p.thick + flangeProud(p, 'in');
  return Math.max(p.spread, m.length + 2 * t + 2.8, pinionReach(m) + m.length / 2 + clear + t - 2.1);
}
// Where a sidewinder or anglewinder gear runs: outside the pod, beside the wheel.
// (An inline crown runs between the bearing holders instead; this returns null for it.)
// The drivetrain can sit either way round: the gear by the right rear wheel (+Y) or by the left one.
// Everything is worked out for the right-hand side; a left-hand drivetrain is its mirror image.
const leftHand = (d) => d.drivetrain.drives === 'left';
export const asRight = (d) => (leftHand(d) ? { ...d, drivetrain: { ...d.drivetrain, drives: 'right', shiftY: -d.drivetrain.shiftY } } : d);
// The whole pod can sit off the centre line: `sideways` on its base plate, towards the right (+) or
// the left (-). Everything is worked out for a pod on the centre line and then moved over.
export const podShift = (d) => (d.pod.imported ? 0 : find(d.pod, 'base')?.params.sideways || 0);
export const unshifted = (d) => (podShift(d) ? { ...d, pod: { ...d.pod, features: d.pod.features.map((f) => (f.type === 'base' ? { ...f, params: { ...f.params, sideways: 0 } } : f)) } } : d);
export function gearSide(d) {
  if (d.drivetrain.layout === 'inline') return null;
  if (podShift(d)) { const r = gearSide(unshifted(d)); return { ...r, y: r.y + podShift(d), yd: r.yd + podShift(d) }; }
  if (leftHand(d)) { const r = gearSide(asRight(d)); return { ...r, y: -r.y, yd: -r.yd }; }
  // A gear is a toothed disc with, usually, a boss on one side. Down at the plate only the disc is in
  // the way: `yd` is its middle and `t` its thickness; `y` and `w` are the middle and width of the whole gear.
  const g = gearOf(d), shape = gearShape(g, d.drivetrain.layout), w = shape.discT + shape.bossL;
  // It starts a little clear of the bearing holder: an anglewinder's crown stands further out than a spur gear.
  // A flange standing out of the upright's wheel side pushes the gear out by its thickness.
  const up = find(d.pod, 'uprights'), proud = on(up) ? flangeProud(up.params, 'out') : 0;
  const from = uprightSpread(d) / 2 + proud + (d.drivetrain.layout === 'anglewinder' ? 2.5 : 0.3);
  return { y: from + w / 2, w, r: g.gearD / 2, yd: from + (shape.boss === 'in' ? shape.bossL : 0) + shape.discT / 2, t: shape.discT };
}
// The shape of a gear: what its gear set says, or else what such gears usually are (a spur gear: a 2 mm
// disc by the wheel with a 2 mm boss towards the bearing; a crown: 3 mm with no boss to speak of).
export function gearShape(g, layout) {
  const spur = layout === 'sidewinder';
  return {
    discT: Number.isFinite(g.discT) ? g.discT : spur ? 2 : 3,
    bossL: Number.isFinite(g.bossL) ? g.bossL : spur ? 2 : 0,
    bossD: Number.isFinite(g.bossD) ? g.bossD : Math.min(6.5, g.gearD * 0.45),
    boss: g.boss === 'out' ? 'out' : 'in',
  };
}
// How far along its shaft the pinion sits, from the motor's centre. A sidewinder's pinion is out
// near the shaft's end; an anglewinder's is pressed on close to the can (as on the measured example pod).
const pinionReach = (m, layout = 'sidewinder') => (layout === 'anglewinder' ? m.length / 2 + 3.5 : m.length / 2 + m.shaftOut - 2.5);

// Do two convex shapes, each a list of corners, overlap? (Separating-axis test.)
function shapesOverlap(a, b) {
  for (const shape of [a, b])
    for (let i = 0; i < shape.length; i++) {
      const p = shape[i], q = shape[(i + 1) % shape.length], nx = q[1] - p[1], ny = p[0] - q[0];
      const span = (pts) => pts.reduce(([lo, hi], [x, y]) => { const v = x * nx + y * ny; return [Math.min(lo, v), Math.max(hi, v)]; }, [Infinity, -Infinity]);
      const [a0, a1] = span(a), [b0, b1] = span(b);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
}
// The corners of a motor's can seen from above, with some play around it.
function canCorners(m, cx, cy, ux, uy, play) {
  const hl = m.length / 2 + play, hw = m.width / 2 + play, nx = -uy, ny = ux;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [cx + i * hl * ux + j * hw * nx, cy + i * hl * uy + j * hw * ny]);
}
// How far out on its shaft an anglewinder's pinion sits, measured from the can's face to the pinion's middle.
// As close to the can as it will go: 3.5 mm on the measured 25° pod. A motor at a shallower angle lies
// almost across the car; its pinion sits further out, so that the can stays clear of the bearing holders.
export function pinionOut(d) {
  d = asRight(unshifted(d));
  const m = motorOf(d), g = gearOf(d), up = find(d.pod, 'uprights');
  const least = 3.5, most = Math.max(least, m.shaftOut - 2.5);
  if (d.drivetrain.layout !== 'anglewinder' || !on(up)) return least;
  const rad = (motorAngle(d) * Math.PI) / 180, ux = Math.sin(rad), uy = Math.cos(rad);
  const wb = d.car.wheelbase, side = gearSide(d), play = find(d.pod, 'motorSeat')?.params.clear ?? 0.3;
  const hw = holderSize(up.params) / 2 + up.params.wall, yo = uprightSpread(d) / 2, yi = yo - up.params.thick - flangeProud(up.params, 'in');
  // The two holders from above. The can already carries its own play, so they are taken as they are.
  const feet = [1, -1].map((s) => [[wb - hw, s * yi], [wb + hw, s * yi], [wb + hw, s * yo], [wb - hw, s * yo]]);
  for (let out = least; out <= most + 1e-9; out += 0.1) {
    const reach = m.length / 2 + out;
    const can = canCorners(m, wb - d.drivetrain.centre - ux * reach, side.y - 0.4 - uy * reach, ux, uy, play);
    if (!feet.some((f) => shapesOverlap(can, f))) return round(out, 1);
  }
  return most;
}
// From the motor's centre to the middle of its pinion, along the shaft.
const reachOf = (d) => (d.drivetrain.layout === 'anglewinder' ? motorOf(d).length / 2 + pinionOut(d) : pinionReach(motorOf(d), d.drivetrain.layout));

// Where the motor sits: its centre, and the angle of its shaft from the car's X axis.
// The motor is placed so that its pinion meets the gear; `centre` is how far ahead of the axle the pinion sits.
// For an anglewinder this matches the example Slot.it-type pod to within half a millimetre
// (motor centre 18.4 mm ahead of the axle and 3.5 mm to the gear's side, at 24.8°).
export function motorPlace(d) {
  if (podShift(d)) { const r = motorPlace(unshifted(d)); return { ...r, y: r.y + podShift(d) }; }
  if (leftHand(d)) { const r = motorPlace(asRight(d)); return { x: r.x, y: r.y ? -r.y : 0, angle: r.angle ? -r.angle : 0 }; }
  const m = motorOf(d), g = gearOf(d), dt = d.drivetrain, wb = d.car.wheelbase;
  if (dt.layout === 'inline')
    return { x: wb - dt.faceGap - m.length / 2 + dt.shiftX, y: dt.shiftY, angle: 0 };
  const side = gearSide(d);
  if (dt.layout === 'sidewinder')
    return { x: wb - dt.centre + dt.shiftX, y: side.y - pinionReach(m) + dt.shiftY, angle: 90 };
  const a = motorAngle(d); // angle between the shaft and the axle
  const rad = (a * Math.PI) / 180, reach = reachOf(d);
  // The pinion lies just inside the crown's teeth; the motor's centre is back along the shaft from there.
  return { x: wb - dt.centre - Math.sin(rad) * reach + dt.shiftX, y: side.y - 0.4 - Math.cos(rad) * reach + dt.shiftY, angle: 90 - a };
}
// How far ahead of the axle two gears put the pinion (module 0.5).
// Spur gears (sidewinder): half their diameters, less one tooth. A crown (anglewinder) is met at its rim,
// so the pinion sits half the two diameters ahead; the example pod measures 11.6 mm against 11.25.
// An anglewinder motor's angle to the rear axle, in degrees: the one you set, or else the angle
// the chosen gears are cut for (25 when the gear set names none).
export const gearAngle = (d) => gearOf(d).angle || 25;
export const motorAngle = (d) => (typeof d.drivetrain.angle === 'number' && Number.isFinite(d.drivetrain.angle) ? Math.min(45, Math.max(0, d.drivetrain.angle)) : gearAngle(d));
export const meshCentre = (g, layout = 'sidewinder') => (g.pinionD + g.gearD) / 2 - (layout === 'anglewinder' ? 0 : 1);
// The kick-ups that really bend the chassis: switched on, with an angle, and not on an imported chassis.
// `front` is true for the one that lifts the nose.
export function activeKicks(d) {
  if (d.chassis.imported) return [];
  return [['kickup', false], ['kickfront', true]]
    .map(([type, front]) => ({ f: find(d.chassis, type), front }))
    .filter(({ f }) => on(f) && f.params.angle > 0.01);
}
export const kickActive = (d) => activeKicks(d).some((k) => !k.front);
// The side profile as a height line: its points in order along the car, and the lift at any place.
// Before the first point and after the last the lift stays what it is there. Empty when it does nothing.
export function profileOf(d) {
  const f = find(d.chassis, 'profile');
  const none = { points: [], at: () => 0 };
  if (!on(f) || d.chassis.imported) return none;
  const pts = f.params.points.slice().sort((a, b) => a[0] - b[0]).filter((q, i, all) => i === 0 || q[0] - all[i - 1][0] > 0.05);
  if (pts.length < 2 || pts.every((q) => Math.abs(q[1]) < 0.01)) return none;
  return {
    points: pts,
    at(x) {
      if (x <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++)
        if (x <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
      return pts.at(-1)[1];
    },
  };
}

// The pod's four screw points and its base rectangle, from the lugs feature.
export function podLayout(d) {
  if (podShift(d)) {
    const o = podShift(d), lay = podLayout(unshifted(d));
    return { ...lay, cy: o, points: lay.points.map(([x, y]) => [x, y + o]), seatFoot: lay.seatFoot?.map(([x, y]) => [x, y + o]) ?? null };
  }
  const imp = d.pod.imported;
  if (imp) {
    // An imported pod brings its own screw points and footprint; its rear axle lands on the car's.
    const off = d.car.wheelbase - imp.axleX;
    return { points: imp.mounts.map(([x, y]) => [x + off, y]), x0: imp.box[0] + off, x1: imp.box[1] + off, width: imp.box[2], off, imported: true, cy: 0 };
  }
  const lugs = find(d.pod, 'lugs').params, base = find(d.pod, 'base').params;
  const rearX = d.car.wheelbase + lugs.rearBehindAxle, frontX = rearX - lugs.patternX;
  const hy = lugs.patternY / 2;
  const m = motorOf(d), place = motorPlace(d);
  const rad = (place.angle * Math.PI) / 180;
  // Width the motor needs across the car, with a wall each side.
  const seat = find(d.pod, 'motorSeat')?.params ?? { wall: 2, clear: 0.3 };
  const need = Math.abs(Math.cos(rad)) * m.width + Math.abs(Math.sin(rad)) * m.length + 2 * (seat.wall + seat.clear) + 0.4;
  const up = find(d.pod, 'uprights');
  // The base carries the bearing holders, so it is at least as wide and as long as they are.
  // The narrow part of the base; a motor that lies across the car widens it locally (see `seatFoot`).
  const width = Math.max(base.width, on(up) ? uprightSpread(d) : 0);
  // The motor seat's footprint: the motor plus play and wall, turned as the motor is.
  const half = [m.length / 2 + seat.clear + seat.wall, m.width / 2 + seat.clear + seat.wall];
  const seatFoot = d.drivetrain.layout === 'inline' || !on(find(d.pod, 'motorSeat')) ? null
    : [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [place.x + Math.cos(rad) * a * half[0] - Math.sin(rad) * b * half[1], place.y + Math.sin(rad) * a * half[0] + Math.cos(rad) * b * half[1]]);
  const behind = on(up) ? holderSize(up.params) / 2 + up.params.wall + 0.1 : 0;
  return {
    points: [[frontX, hy], [frontX, -hy], [rearX, hy], [rearX, -hy]],
    x0: frontX + 3,
    x1: Math.max(rearX - 3, d.car.wheelbase + behind),
    width,
    cy: 0, // the middle of the pod across the car
    seatFoot,
    widest: seatFoot ? Math.max(width, 2 * Math.max(...seatFoot.map((q) => Math.abs(q[1])))) : width,
  };
}

// Where a front stub axle ends, from the centre line, when each front wheel has its own; null for one through axle.
export function frontStub(d) {
  const f = find(d.chassis, 'frontAxle');
  return on(f) && f.params.independent && f.params.mount !== 'bearing' ? Math.max(1, f.params.spread / 2 - Math.max(f.params.thick, 5) / 2 - 1) : null;
}
// The middle of a closed mesh's weight and its volume: { x, y, z, volume }.
export function centroidOf(mesh) {
  const p = mesh.positions, t = mesh.indices;
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    const v = (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
    vol += v; cx += v * (p[a] + p[b] + p[c]) / 4; cy += v * (p[a + 1] + p[b + 1] + p[c + 1]) / 4; cz += v * (p[a + 2] + p[b + 2] + p[c + 2]) / 4;
  }
  return vol ? { x: cx / vol, y: cy / vol, z: cz / vol, volume: Math.abs(vol) } : { x: 0, y: 0, z: 0, volume: 0 };
}
// What the printed parts and the weights you add come to, and where their centre of gravity lies.
// (The bought parts are not in it: motor, wheels, axles, gears, guide, body.)
export function balance(d, built) {
  const density = MATERIALS[d.printer.material]?.density ?? 1.24, items = [];
  // A one-piece chassis, or one with its motor mount built in, has no pod of its own.
  for (const mesh of [built.chassis, built.pod].filter(Boolean)) { const c = centroidOf(mesh); items.push({ g: (c.volume / 1000) * density, x: c.x, y: c.y, z: c.z }); }
  const printed = items.reduce((t, i) => t + i.g, 0), zTop = rideClearance(d) + (d.onePiece ? d.onePiece.plate.panT : find(d.chassis, 'outline').params.thickness);
  for (const f of d.onePiece ? [] : d.chassis.features.filter((x) => x.type === 'holder' && on(x) && x.params.mass > 0))
    for (const s of f.params.mirror && Math.abs(f.params.side) > 0.01 ? [1, -1] : [1]) items.push({ g: f.params.mass, x: f.params.along, y: s * f.params.side, z: zTop });
  const total = items.reduce((t, i) => t + i.g, 0) || 1, at = (k) => items.reduce((t, i) => t + i.g * i[k], 0) / total;
  return { printed, added: total - printed, total, x: at('x'), y: at('y'), z: at('z'), share: (at('x') / d.car.wheelbase) * 100 };
}
// The bought parts shown as a preview: wheels, axles, motor, gears and guide.
// Boxes and cylinders in the car frame; `z` values are above the track.
export function partsLayout(d) {
  if (d.onePiece) return onePieceParts(d);
  const h = heights(d), z0 = d.car.clearance, wb = d.car.wheelbase, m = motorOf(d), g = gearOf(d), place = motorPlace(d);
  const guide = find(d.chassis, 'guide'), up = find(d.pod, 'uprights');
  const rad = (place.angle * Math.PI) / 180, ux = Math.cos(rad), uy = Math.sin(rad);
  const tip = m.length / 2 + m.shaftOut, reach = reachOf(d);
  const out = {
    wheels: [],
    axles: [
      // With a stub axle per wheel, each ends just inside its bracket.
      { x: find(d.chassis, 'frontAxle')?.params.along ?? 0, z: z0 + h.frontAxle, half: d.car.front.inOut + d.car.front.tyreW / 2, d: d.car.axleD, inner: frontStub(d) },
      { x: wb, z: z0 + h.axle, half: d.car.rear.inOut + d.car.rear.tyreW / 2, d: d.car.axleD },
    ],
    motor: { ...place, z: z0 + h.shaft, length: m.length, width: m.width, height: m.height },
    shaft: { x0: place.x, y0: place.y, x1: place.x + ux * tip, y1: place.y + uy * tip, z: z0 + h.shaft, d: m.shaftD },
    pinion: { x: place.x + ux * reach, y: place.y + uy * reach, z: z0 + h.shaft, angle: place.angle, d: g.pinionD, length: 5 },
    gear: null,
    guide: on(guide) ? { x: guide.params.along, y: guide.params.side, length: guideOf(d, guide.params.guide)?.bladeL ?? 21 } : null,
  };
  for (const [x, w] of [[0, d.car.front], [wb, d.car.rear]])
    for (const s of [1, -1]) out.wheels.push({ x, y: s * w.inOut, z: w.tyreD / 2, d: w.tyreD, w: w.tyreW });
  // The gear sits on the rear axle: beside the pinion (inline), or by a bearing holder.
  const side = gearSide(d);
  // A spur gear is shown as it is: a thin toothed disc by the wheel and a narrow boss that points in to the bearing.
  out.gear = { x: wb, y: side ? side.yd : (leftHand(d) ? -1 : 1) * (g.pinionD / 2 + 1.9) + podShift(d), z: z0 + h.axle, d: g.gearD, width: side ? side.t : 4 };
  // The bearings or bushings in the uprights, and an axle tube between them.
  out.bushes = [];
  if (on(up) && !d.pod.imported) {
    const p = up.params, yo = uprightSpread(d) / 2, yc = yo - p.thick / 2, o = podShift(d), z = z0 + h.axle;
    const ball = p.form === 'sphere', b = bearingOf(d, p.bearing);
    if (p.tube) out.bushes.push({ x: wb, y: o, z, d: p.tubeD, w: 2 * yc });
    for (const s of [1, -1]) out.bushes.push(ball ? { x: wb, y: o + s * yc, z, d: p.ballD, w: p.ballW } : p.tube ? { x: wb, y: o + s * yc, z, d: p.seat, w: p.thick } : { x: wb, y: o + s * yc, z, d: p.seat, w: Math.min(p.thick, b?.width ?? p.thick) });
    // A flange against one face of each upright: in a recess in the face, or standing out of it.
    if (flanged(p)) for (const at of flangeSides(p)) {
      const face = at === 'in' ? uprightInner(yo, p) : yo, into = at === 'in' ? 1 : -1, t = p.flangeT;
      const mid = face + (p.flangeRecess ? into : -into) * t / 2;
      for (const s of [1, -1]) out.bushes.push({ x: wb, y: o + s * mid, z, d: p.flangeD, w: t, flange: true });
    }
  }
  // The front bearings, in their uprights.
  const fb = frontBearings(d);
  if (fb) for (const s of [1, -1]) out.bushes.push({ x: fb.along, y: (s * fb.spread) / 2, z: z0 + h.frontAxle, d: fb.seat, w: fb.bThick });
  out.gearBoss = null;
  if (side && side.t < side.w - 0.01) {
    const s = Math.sign(side.yd - side.y) || 1, from = side.y - (s * side.w) / 2, to = side.yd - (s * side.t) / 2;
    out.gearBoss = { x: wb, y: (from + to) / 2, z: z0 + h.axle, d: Math.min(gearShape(g, d.drivetrain.layout).bossD, g.gearD - 1), width: Math.abs(to - from) };
  }
  return out;
}

export function summary(d) {
  if (d.onePiece) {
    const P = d.onePiece, tyres = Math.max(d.car.front.inOut + d.car.front.tyreW / 2, d.car.rear.inOut + d.car.rear.tyreW / 2) * 2;
    return { wheelbase: d.car.wheelbase, guideLead: d.car.wheelbase + P.front.at - P.guide.at, minX: -P.front.at, maxX: P.plate.length - P.front.at, length: P.plate.length, plateWidth: P.plate.panW, width: Math.max(P.plate.panW, tyres), clearance: rideClearance(d) };
  }
  const guide = find(d.chassis, 'guide');
  const outline = find(d.chassis, 'outline').params, imp = d.chassis.imported;
  const xs = imp ? [-imp.frontX, imp.size[0] - imp.frontX] : outline.points.map((p) => p[0]);
  const ys = imp ? [imp.size[1] / 2] : outline.points.map((p) => p[1]);
  const tyres = Math.max(d.car.front.inOut + d.car.front.tyreW / 2, d.car.rear.inOut + d.car.rear.tyreW / 2) * 2;
  return {
    wheelbase: d.car.wheelbase,
    guideLead: on(guide) ? d.car.wheelbase - guide.params.along : null,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    length: Math.max(...xs) - Math.min(...xs),
    plateWidth: Math.max(...ys) * 2,
    width: Math.max(Math.max(...ys) * 2, tyres),
    clearance: rideClearance(d),
  };
}

// Values this design leans on that nobody has confirmed.
export function unconfirmed(d) {
  // A one-piece chassis brings its own sizes (Peter's are measured from Peter's model); only the motor may be a guess.
  if (d.onePiece) return motorOf(d).confirmed === false ? ['Motor sizes'] : [];
  const out = [];
  const guide = find(d.chassis, 'guide');
  if (on(guide) && guideOf(d, guide.params.guide)?.confirmed === false) out.push('Guide hole');
  const up = find(d.pod, 'uprights');
  if (on(up) && up.params.form !== 'sphere' && bearingOf(d, up.params.bearing)?.confirmed === false) out.push('Bearing seat');
  if (on(up) && up.params.form === 'sphere') out.push('Spherical bushing size');
  if (on(up) && up.params.tube) out.push('Axle tube length');
  if (on(up) && flanged(up.params)) {
    const b = bearingOf(d, up.params.bearing), same = (a, v) => Math.abs((a ?? -1) - v) < 0.011;
    if (!(b?.confirmed && same(b.flangeD, up.params.flangeD) && same(b.flangeT, up.params.flangeT))) out.push('Flange size');
  }
  if (!d.pod.imported && motorOf(d).confirmed === false) out.push('Motor sizes');
  if (!d.pod.imported && gearOf(d).confirmed === false) out.push('Gear sizes');
  if (d.pod.imported) return out.filter((x) => !['Bearing seat', 'Spherical bushing size', 'Axle tube length', 'Flange size'].includes(x));
  out.push(d.drivetrain.layout === 'inline' ? 'Motor-face distance' : 'Motor-to-axle distance');
  return out;
}

// ------------------------------------------------------------ an outline traced from a body
// What the tracer needs to know about the wheels (see engine.js › trace).
// How far to move the pod sideways so that the gear runs free of the rear tyre: away from the gear,
// no further than the other side has room for. 0 when nothing is needed (or for an inline motor).
export function podSideways(d) {
  const c = unshifted(d), gs = gearSide(c);
  if (!gs || d.pod.imported) return 0;
  const rear = d.car.rear, tyre = rear.inOut - rear.tyreW / 2, wall = d.printer.minWall;
  const need = Math.abs(gs.y) + gs.w / 2 + 0.3 - tyre;
  if (need <= 0) return 0;
  const fill = find(d.chassis, 'fill')?.params ?? {}, ring = Math.max(wall, fill.railWidth ?? 1.6), gap = find(d.chassis, 'podOpening')?.params.gap ?? 0.5;
  const spare = tyre - 0.5 - (podLayout(c).width / 2 + gap + ring);
  return -Math.sign(gs.y) * Math.max(0, Math.min(Math.ceil(need * 10) / 10, Math.floor(spare * 10) / 10)) || 0;
}
// Two body mounts on the centre line, as a new design has them, placed for this design: one midway
// between the guide and the front axle, one behind the rear axle, on the plate.
export function centreMounts(d) {
  const guide = find(d.chassis, 'guide'), posts = find(d.chassis, 'bodyMounts').params, s = summary(d), pad = posts.padD / 2 + 0.5;
  const front = on(guide) ? guide.params.along / 2 : Math.max(s.minX + pad, -9.5);
  const rear = Math.max(d.car.wheelbase + pad, Math.min(d.car.wheelbase + 16.6, s.maxX - pad));
  return [{ along: round(front, 1), side: 0 }, { along: round(rear, 1), side: 0 }];
}
// The body's wheel arches as the tracer wants them: each with the inner face of the tyre that runs in it.
export const traceArches = (d, arches) => (arches ?? []).map((a, i) => { const w = i === 0 ? d.car.front : d.car.rear; return { x: a.x, length: a.length, inner: w.inOut - w.tyreW / 2 }; });
export const traceWheels = (d) => [[0, d.car.front], [d.car.wheelbase, d.car.rear]].map(([x, w]) => ({ x, inner: w.inOut - w.tyreW / 2, length: w.tyreD }));
// Puts a traced outline into the design and moves what would otherwise hang off it.
export function applyOutline(d, points) {
  const o = find(d.chassis, 'outline').params;
  o.points = points.map(([x, y]) => [round(x, 1), round(y, 1)]);
  o.round = Math.min(o.round, 0.5); // a traced shape already has its curves
  const xs = o.points.map((q) => q[0]), nose = Math.min(...xs), tail = Math.max(...xs);
  const guide = find(d.chassis, 'guide').params, room = guide.padD / 2 + 1;
  if (guide.along < nose + room) guide.along = round(nose + room, 1);
  for (const type of ['kickup', 'kickfront']) {
    const k = find(d.chassis, type).params, front = type === 'kickfront';
    if (front ? k.fold < nose + 3 : k.fold > tail - 3) k.fold = round(front ? nose + 8 : tail - 10, 1);
  }
  // How far the plate reaches from the centre line at a place along the car (the least, where it steps).
  const half = (x) => {
    let least = Infinity;
    for (let i = 1; i < o.points.length; i++) {
      const [x0, y0] = o.points[i - 1], [x1, y1] = o.points[i];
      if (x < Math.min(x0, x1) - 1e-6 || x > Math.max(x0, x1) + 1e-6) continue;
      least = Math.min(least, Math.abs(x1 - x0) < 1e-6 ? Math.min(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
    }
    return Number.isFinite(least) ? least : 0;
  };
  // Body mounts and front axle brackets come in with a narrower plate, so that none is left standing beside it.
  const posts = find(d.chassis, 'bodyMounts').params, pad = posts.padD / 2;
  for (const q of posts.posts) {
    q.along = round(Math.min(Math.max(q.along, nose + pad + 0.5), tail - pad - 0.5), 1);
    const room = Math.min(half(q.along - pad), half(q.along), half(q.along + pad)) - pad - 0.3;
    if (Math.abs(q.side) > room) q.side = room > pad ? round(Math.floor(room * 10) / 10, 1) : 0;
  }
  const axle = find(d.chassis, 'frontAxle').params;
  const reach = Math.min(half(axle.along - axle.width / 2), half(axle.along + axle.width / 2)) - axle.thick / 2 - 0.3;
  if (axle.spread / 2 > reach) axle.spread = Math.max(8, round(Math.floor(reach * 20) / 10, 1));
  const split = find(d.chassis, 'split').params;
  split.along = round(Math.min(Math.max(split.along, nose + 10), tail - 10), 1);
  find(d.chassis, 'fill').params.cross = proposeCross(d, Math.max(2, find(d.chassis, 'fill').params.cross.length));
}

// ------------------------------------------------------------ the calibration coupon
// What the coupon tests: every size of upright hole this design has, its bearing seat and its axle slot.
// Each is printed six times, with 0.0 to 0.5 mm added, so you can see which fix your printer needs.
export const COUPON_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
export function couponHoles(d) {
  const c = d.chassis, found = [];
  const add = (name, size) => { if (size > 0.2) found.push([name, round(size)]); };
  const guide = find(c, 'guide'), axle = find(c, 'frontAxle'), mounts = find(c, 'podMounts'), posts = find(c, 'bodyMounts');
  const lugs = find(d.pod, 'lugs'), up = find(d.pod, 'uprights');
  if (on(guide)) add('Guide', guide.params.hole);
  if (on(mounts)) add('Pod mount screw', d.pod.imported ? d.pod.imported.holeD : mounts.params.hole);
  if (on(posts)) add('Body mount screw', posts.params.hole);
  if (on(axle)) add('Front axle grub screw', axle.params.grub);
  if (on(lugs) && !d.pod.imported) add('Pod lug', lugs.params.hole);
  // One row per size, smallest first; holes of the same size share a row.
  const rows = [];
  for (const [name, size] of found.sort((a, b) => a[1] - b[1])) {
    const same = rows.find((r) => Math.abs(r.d - size) < 0.005);
    if (same) same.name += ', ' + name.toLowerCase();
    else if (rows.length < 6) rows.push({ n: rows.length + 1, name, d: size });
  }
  return {
    steps: COUPON_STEPS,
    rows,
    seat: !on(up) || d.pod.imported ? null : up.params.form === 'sphere'
      ? { name: `Spherical bushing Ø${round(up.params.ballD)} × ${round(up.params.ballW)}`, d: up.params.ballD, sphere: true, opening: up.params.opening, slits: up.params.slits, slitW: up.params.slitW, holder: 'closed', thick: up.params.thick, wall: up.params.wall }
      : { name: bearingOf(d, up.params.bearing)?.name ?? 'Bearing seat', d: up.params.seat, holder: up.params.holder, thick: up.params.thick, wall: up.params.wall,
        flange: flanged(up.params) && up.params.flangeRecess ? { d: up.params.flangeD, t: up.params.flangeT } : null },
    axle: { d: d.car.axleD },
    thickness: find(c, 'outline').params.thickness,
  };
}

// ------------------------------------------------------------ checks that need no geometry

export function checks(d) {
  const s = summary(d), h = heights(d), g = gearOf(d), out = [];
  const add = (ok, title, text) => out.push({ ok, title, text });
  add(true, `Gear ratio ${(g.gearT / g.pinionT).toFixed(2)} : 1`, `${g.gearT} / ${g.pinionT} · gear Ø${g.gearD} with pinion Ø${g.pinionD}`);
  // A one-piece chassis is checked by its own rules (onepiece.js, with the build); the car's limits still apply.
  if (d.onePiece) {
    add(s.width <= d.rules.maxWidth, `Width ${s.width.toFixed(1)} mm`, `Limit: ${d.rules.maxWidth} mm.`);
    add(s.guideLead <= d.rules.guideLeadMax, `Guide lead ${s.guideLead.toFixed(1)} mm`, `Limit: ${d.rules.guideLeadMax} mm.`);
    return out;
  }
  // A can that is flush with the underside, give or take 0.1 mm, is how bought pods are made.
  // (Measured from the chassis's underside as it really rides: see podRide.)
  const under = h.motorBottom + podRide(d), flush = under >= -0.1;
  add(flush, flush ? 'Motor clears the track side' : 'Motor hangs below the pod', flush
    ? (under < 0.1 ? 'The motor is flush with the chassis underside.' : `The motor sits ${under.toFixed(2)} mm above the chassis underside.`)
    : `The motor would sit ${(-under).toFixed(2)} mm below the underside. Use bigger rear tyres, less clearance or less offset.`);
  const low = rideClearance(d) + (flush ? 0 : under);
  add(low >= d.rules.minClearance, `Ground clearance ${low.toFixed(2)} mm`, `Limit for this rule set: ${d.rules.minClearance} mm.`);
  add(s.width <= d.rules.maxWidth, `Width ${s.width.toFixed(1)} mm`, `Limit: ${d.rules.maxWidth} mm.`);
  if (s.guideLead !== null) add(s.guideLead <= d.rules.guideLeadMax, `Guide lead ${s.guideLead.toFixed(1)} mm`, `Limit: ${d.rules.guideLeadMax} mm.`);
  if (!d.pod.imported && d.drivetrain.layout !== 'inline') {
    // Do the pinion and the gear meet?
    if (d.drivetrain.layout === 'anglewinder' && Math.abs(motorAngle(d) - gearAngle(d)) > 0.5)
      add(false, 'Motor angle differs from the gears', `The motor is set at ${round(motorAngle(d), 1)}° to the axle; these gears are cut for ${gearAngle(d)}°. They will not mesh cleanly unless the gears match the angle.`);
    const parts = partsLayout(d), want = meshCentre(g, d.drivetrain.layout);
    const got = d.car.wheelbase - parts.pinion.x, off = Math.abs(got - want);
    add(off <= 0.6, off <= 0.6 ? 'Pinion meets the gear' : 'Pinion does not meet the gear',
      `These gears ask for the pinion ${want.toFixed(2)} mm ahead of the axle; it sits at ${got.toFixed(2)} mm.`);
  }
  const up = find(d.pod, 'uprights');
  if (!d.pod.imported && on(up) && up.params.tube) {
    if (d.drivetrain.layout === 'inline') add(false, 'An axle tube cannot pass the crown gear', 'With an inline motor the crown gear sits on the axle between the uprights, where the tube would run. Use separate bearings, or an anglewinder or sidewinder.');
    else if (motorSpread(d) > tubeSpread(up.params) + 0.01) add(false, 'The axle tube is too short for the motor', `The motor needs the uprights ${motorSpread(d).toFixed(1)} mm apart (outside to outside); this tube puts them ${tubeSpread(up.params).toFixed(1)} mm apart.`);
    else add(true, `Axle tube ${up.params.tubeLen} mm`, `The uprights stand ${tubeSpread(up.params).toFixed(1)} mm apart, outside to outside, so that the tube fits between them.`);
  }
  const kick = find(d.chassis, 'kickup');
  if (d.pod.imported) {
    const diff = d.pod.imported.axleZ - h.axle;
    add(Math.abs(diff) < 0.3, Math.abs(diff) < 0.3 ? 'Imported pod matches the axle height' : 'Imported pod sits at another axle height',
      `The pod's axle is ${d.pod.imported.axleZ.toFixed(2)} mm above its underside; the rear tyres and clearance give ${h.axle.toFixed(2)} mm.`);
  }
  for (const { f, front } of activeKicks(d)) {
    const carried = f.params.fillFloor && f.params.strakes > 0, name = front ? 'Front kick-up' : 'Kick-up';
    add(carried, carried ? `${name} is carried by its strakes` : `${name} needs support`, carried ? `The strakes reach bed level, so the raised ${front ? 'nose' : 'rear'} prints without supports.` : 'Add strakes filled to floor level, or print with supports.');
  }
  if (profileOf(d).points.length) add(false, 'Side profile needs support', 'A plate that rises off the print bed needs supports under it, or printing as split parts.');
  // Unconfirmed values are a reminder, not a fault: they never stop a design being "ready".
  const un = unconfirmed(d);
  if (un.length) out.push({ ok: false, soft: true, title: `${un.length} value${un.length > 1 ? 's' : ''} to test-fit`, text: un.join(', ') + ': nobody has published or measured these. Test-fit before racing.' });
  return out;
}

// ------------------------------------------------------------ project files, undo

export const encodeProject = (d) => JSON.stringify({ ...d, format: FORMAT, version: VERSION }, null, 1);
export function decodeProject(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw Error('This is not a SlotForge Frame file.');
  }
  if (d?.format !== FORMAT) throw Error('This is not a SlotForge Frame file.');
  if (d.version > VERSION) throw Error('This file was made by a newer SlotForge Frame.');
  if (!d.chassis?.features || !d.pod?.features || !d.car || !d.drivetrain) throw Error('This file is incomplete.');
  return cleanDesign(d);
}

// ------------------------------------------------------------ checking what a file brings
// A design read from a file may be old, hand-edited or made by someone else.
// cleanDesign rebuilds it on top of a fresh default design: known fields only, every
// value of the right kind and within sane limits, fresh ids.

const LIMIT = 600;
const CHOICES = {
  style: ['closed', 'frame', 'lattice'], struts: ['none', 'axle', 'fan'], shape: ['round', 'bar'],
  holder: ['closed', 'snap', 'clamp'], form: ['straight', 'sphere'], mount: ['bracket', 'bearing'], flangeAt: ['out', 'in', 'both'], side: ['top', 'under'], zone: ['full', 'centre', 'sides'],
};
// Ranges for values where the general ±2000 limit is too loose.
const RANGE = {
  thickness: [0.4, 20], round: [0, 50], railWidth: [0.2, 20], outerRail: [0.2, 20], pad: [0, 20], latticeCell: [3, 100],
  strakes: [0, 40], strakeT: [0.2, 10], angle: [0, 80], windows: [0, 20], bar: [0.2, 20], lean: [-45, 60],
  hole: [0.3, 20], bossD: [1, 40], bossH: [0, 40], padD: [1, 40], grub: [0, 10], recessD: [0, 40], recessDepth: [0, 20],
  wall: [0.2, 20], thick: [0.2, 20], bThick: [0.5, 20], seat: [1, 20], ballD: [1.5, 12], ballW: [0.5, 10], opening: [0.5, 12], slits: [0, 8], slitW: [0.2, 2], tubeLen: [8, 80], tubeD: [0.5, 12], flangeD: [1, 30], flangeT: [0.1, 5], ecc: [0, 2], spread: [4, 200], lugD: [1, 30], lugT: [0.4, 20], clear: [0, 5],
  root: [0, 5], deep: [0.2, 20], floor: [0, 5], mass: [0, 200], reach: [0, 20], rise: [0, 30], sink: [0, 20], d: [1, 40], travel: [0, 6], float: [0, 2], sideways: [-15, 15], rest: [0, 10], drop: [-10, 10], gap: [0, 10], holeFix: [-0.5, 1], zoneHalf: [0.5, 200], bevelTop: [0, 1.5], bevelBottom: [0, 1.5], tabs: [1, 8], depth: [1, 20], neck: [1, 30], head: [1, 30], play: [0, 1], patternX: [5, 300], patternY: [2, 200], h0: [0, 60], h1: [0, 60], height: [0, 80], width: [0.2, 300], offset: [-20, 40],
};
const numIn = (v, def, key) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const [lo, hi] = RANGE[key] ?? [-LIMIT, LIMIT];
  return Math.min(hi, Math.max(lo, v));
};
const pair = (q) => (Array.isArray(q) && q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]) ? [numIn(q[0], 0), numIn(q[1], 0)] : null);

function cleanParams(def, raw, type) {
  const out = {};
  raw = raw && typeof raw === 'object' ? raw : {};
  for (const [key, dv] of Object.entries(def)) {
    const v = raw[key];
    if (key === 'points') {
      // An outline point may be marked as curved: a third entry, 1.
      const pts = Array.isArray(v) ? v.slice(0, 200).map((q) => { const xy = pair(q); if (xy && type === 'outline' && q[2]) xy.push(1); return xy; }).filter(Boolean) : [];
      out.points = pts.length >= (type === 'outline' ? 3 : 2) ? pts : dv.map((p) => [...p]);
    } else if ((key === 'cross' || key === 'length') && Array.isArray(dv)) out[key] = Array.isArray(v) ? v.slice(0, 40).filter(Number.isFinite).map((x) => numIn(x, 0)) : [...dv];
    else if (key === 'posts') out.posts = Array.isArray(v) ? v.slice(0, 40).filter((q) => q && Number.isFinite(q.along) && Number.isFinite(q.side)).map((q) => ({ along: numIn(q.along, 0), side: Math.abs(numIn(q.side, 0)) })) : dv.map((q) => ({ ...q }));
    else if (typeof dv === 'boolean') out[key] = typeof v === 'boolean' ? v : dv;
    // A guide or bearing may be one of the design's own; cleanDesign checks that it exists.
    else if (key === 'guide' || key === 'bearing') out[key] = typeof v === 'string' && KEY.test(v) ? v : dv;
    else if (typeof dv === 'string') out[key] = CHOICES[key]?.includes(v) ? v : dv;
    else if (key === 'from' || key === 'to' || key === 'strakes' || key === 'windows' || key === 'tabs' || key === 'slits') out[key] = Math.round(numIn(v, dv, key === 'from' || key === 'to' ? undefined : key));
    else out[key] = numIn(v, dv, key);
  }
  return out;
}
function cleanFeatures(defaults, raw, multiSource) {
  raw = Array.isArray(raw) ? raw.filter((f) => f && typeof f === 'object') : [];
  const out = defaults.map((def) => {
    const got = raw.find((f) => f.type === def.type);
    return { id: newId(), type: def.type, enabled: got ? got.enabled !== false : def.enabled, params: cleanParams(def.params, got?.params, def.type) };
  });
  if (multiSource)
    for (const f of raw.filter((x) => MULTI.includes(x.type)).slice(0, 80))
      out.push({ id: newId(), type: f.type, enabled: f.enabled !== false, params: cleanParams(newShape(f.type, multiSource).params, f.params, f.type) });
  return out;
}
const KEY = /^[\w-]{1,64}$/;
const label = (v, def) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : def);

// What an imported part needs to be placed: checked the same way as everything else.
export function cleanImported(kind, raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.mesh !== 'string' || !KEY.test(raw.mesh)) return null;
  if (kind === 'pod') {
    const mounts = (Array.isArray(raw.mounts) ? raw.mounts : []).slice(0, 12).map(pair).filter(Boolean);
    const box = Array.isArray(raw.box) && raw.box.length === 3 && raw.box.every(Number.isFinite) ? raw.box.map((v) => numIn(v, 0)) : [0, 60, 25];
    return { mesh: raw.mesh, name: label(raw.name, 'Imported pod'), mounts, holeD: numIn(raw.holeD, 1.8, 'hole'), axleX: numIn(raw.axleX, 50), axleZ: Math.max(0, numIn(raw.axleZ, 7.5)), box: [Math.min(box[0], box[1]), Math.max(box[0], box[1]), Math.max(1, Math.abs(box[2]))] };
  }
  const size = Array.isArray(raw.size) && raw.size.length === 3 && raw.size.every(Number.isFinite) ? raw.size.map((v) => Math.max(0.1, Math.abs(numIn(v, 1)))) : [140, 60, 12];
  return { mesh: raw.mesh, name: label(raw.name, 'Imported chassis'), frontX: numIn(raw.frontX, 30), size };
}

// The body from SlotForge Anvil, shown as a ghost: which model, and where it sits on the car.
export function cleanBody(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.mesh !== 'string' || !KEY.test(raw.mesh)) return null;
  return { mesh: raw.mesh, name: label(raw.name, 'Body'), shift: numIn(raw.shift, 0), lift: Math.max(0, numIn(raw.lift, 2)), onPlate: raw.onPlate === true, turn: [90, 180, 270].includes(raw.turn) ? raw.turn : 0, up: ['+z', '-z', '+y', '-y', '+x', '-x'].includes(raw.up) ? raw.up : '+z' };
}

export function cleanDesign(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const scale = Object.hasOwn(PROFILES, raw.scale) ? raw.scale : '1/32';
  const d = newDesign(scale);
  d.name = label(raw.name, d.name);
  const section = (def, got, ranges = {}) => {
    got = got && typeof got === 'object' ? got : {};
    for (const [k, dv] of Object.entries(def)) {
      if (typeof dv === 'number') {
        const [lo, hi] = ranges[k] ?? [-LIMIT, LIMIT];
        def[k] = typeof got[k] === 'number' && Number.isFinite(got[k]) ? Math.min(hi, Math.max(lo, got[k])) : dv;
      }
    }
  };
  section(d.printer, raw.printer, { nozzle: [0.1, 2], holeFix: [-0.5, 1], boreFix: [-0.5, 1], minWall: [0.2, 5], bridge: [0, 200], overhang: [0, 89] });
  if (Object.hasOwn(MATERIALS, raw.printer?.material)) d.printer.material = raw.printer.material;
  d.printer.name = label(raw.printer?.name, d.printer.name);
  section(d.rules, raw.rules, { maxWidth: [1, 500], guideLeadMax: [1, 1000], minClearance: [0, 50] });
  section(d.car, raw.car, { wheelbase: [20, 300], clearance: [0, 30], axleD: [0.5, 10] });
  const tyre = { tyreD: [4, 100], tyreW: [1, 60], inOut: [2, 200] };
  section(d.car.front, raw.car?.front, tyre);
  section(d.car.rear, raw.car?.rear, tyre);
  section(d.drivetrain, raw.drivetrain, { offset: [-5, 5], faceGap: [2, 80], centre: [2, 80], shiftX: [-80, 80], shiftY: [-80, 80] });
  // The motor angle is a number you set, or nothing (then it follows the gear set).
  d.units = raw.units === 'in' ? 'in' : 'mm';
  d.inserts = cleanInserts(raw.inserts, scale);
  d.wing = cleanWing(raw.wing, scale);
  if (raw.onePiece && typeof raw.onePiece === 'object') {
    d.onePiece = cleanOnePiece(raw.onePiece);
    d.car.wheelbase = d.onePiece.rear.wheelbase;
  }
  d.drivetrain.drives = raw.drivetrain?.drives === 'left' ? 'left' : 'right';
  d.drivetrain.reverse = raw.drivetrain?.reverse === true;
  const angle = raw.drivetrain?.angle;
  d.drivetrain.angle = typeof angle === 'number' && Number.isFinite(angle) ? Math.min(45, Math.max(0, angle)) : null;
  // The design's own components: at most 20 of a kind, each checked, none hiding a built-in one.
  const custom = {}, builtIn = { motor: MOTORS, bearing: BEARINGS, guide: GUIDES, gear: Object.fromEntries(Object.values(GEARS).flat().map((g) => [g.id, g])) };
  for (const kind of DESIGN_KINDS) {
    const src = raw.custom?.[kind];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [id, c] of Object.entries(src).slice(0, 20))
      if (KEY.test(id) && !Object.hasOwn(builtIn[kind], id)) (custom[kind] ??= {})[id] = cleanComponent(kind, c);
  }
  if (Object.keys(custom).length) d.custom = custom;
  if (Object.hasOwn(GEARS, raw.drivetrain?.layout)) d.drivetrain.layout = raw.drivetrain.layout;
  const motor = raw.drivetrain?.motor;
  if (Object.hasOwn(MOTORS, motor ?? '') || own(d, 'motor', motor)) d.drivetrain.motor = motor;
  const gears = gearsFor(d);
  d.drivetrain.gear = gears.some((g) => g.id === raw.drivetrain?.gear) ? raw.drivetrain.gear : gears[0].id;
  // Positions in the default design follow its own wheelbase; the file's features replace them.
  const defaults = { guide: find(d.chassis, 'guide').params.guide, bearing: find(d.pod, 'uprights').params.bearing };
  d.chassis.features = cleanFeatures(d.chassis.features, raw.chassis?.features, d);
  d.pod.features = cleanFeatures(d.pod.features, raw.pod?.features, null);
  // A guide or bearing the design does not know falls back to the scale's own.
  const g = find(d.chassis, 'guide').params, b = find(d.pod, 'uprights').params;
  if (!guideOf(d, g.guide)) g.guide = defaults.guide;
  if (!bearingOf(d, b.bearing)) b.bearing = defaults.bearing;
  const ci = cleanImported('chassis', raw.chassis?.imported), pi = cleanImported('pod', raw.pod?.imported);
  if (ci) d.chassis.imported = ci;
  if (pi) d.pod.imported = pi;
  const body = cleanBody(raw.body);
  if (body) d.body = body;
  return d;
}

// The settings a library part carries, cleaned. A pod carries its drivetrain and features;
// a chassis carries the car's sizes, its rules and its features. Imported parts carry their placement.
export function cleanPart(kind, data, hasMesh) {
  data = data && typeof data === 'object' ? data : {};
  if (COMPONENT_KINDS.includes(kind)) return cleanComponent(kind, data);
  // A wheel insert: its base and its layers.
  if (kind === 'insert') return { insert: cleanInsert(data.insert) };
  if (kind === 'wing') return { wing: cleanWing(data.wing) };
  // A part brings along the design's own components it uses (a motor, a guide…), when it has any.
  const extra = (d, part) => { const c = customUsed(d, part); return c ? { custom: c } : {}; };
  if (kind === 'pod') {
    const imported = hasMesh ? cleanImported('pod', data.imported) : null;
    if (imported) return { imported };
    const d = cleanDesign({ scale: data.scale, drivetrain: data.drivetrain, custom: data.custom, pod: { features: data.features } });
    return { drivetrain: d.drivetrain, features: d.pod.features, ...extra(d, 'pod') };
  }
  const imported = hasMesh ? cleanImported('chassis', data.imported) : null;
  const d = cleanDesign({ scale: data.scale, car: data.car, rules: data.rules, custom: data.custom, chassis: { features: data.features }, onePiece: imported ? undefined : data.onePiece });
  return { ...(imported ? { imported } : {}), car: d.car, rules: d.rules, features: d.chassis.features, ...(d.onePiece ? { onePiece: d.onePiece } : {}), ...extra(d, 'chassis') };
}

export function createHistory(limit = 80) {
  const past = [], future = [];
  return {
    push(state) {
      past.push(state);
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      return future.pop();
    },
    clear() { past.length = future.length = 0; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
