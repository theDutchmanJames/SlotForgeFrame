// One-piece chassis: the motor sits in the chassis itself, with no separate pod.
// The settings start from Peter's 1:43 chassis (designed by Peter on SlotForum, included with the designer's permission):
// with them untouched, the build is his chassis. Every size can be changed.
//
// The part is drawn in its own frame: y along the car from the front of the guide post (0) to the back,
// x across the car (0 in the middle), z up from the underside of the plate. Sizes in mm.

export const ONE_PIECE_PARTS = ['plate', 'guide', 'front', 'motor', 'gear', 'rear', 'mounts'];
export const ONE_PIECE_NAMES = {
  plate: 'Plate and side pans', guide: 'Guide post', front: 'Front axle', motor: 'Motor bay',
  gear: 'Gear well', rear: 'Rear axle', mounts: 'Body mounts',
};

// Peter's sizes, measured from Peter's model.
export const PETER = {
  name: "Peter's 1:43 Chassis",
  plate: { length: 72.52, frontW: 19, frontT: 1, panFrom: 19.52, panLen: 35, panW: 32, panT: 2, rearW: 19, rearT: 1, arcR: 10, arcAt: 4.9, wall: 2, wallH: 6, wallFrom: 18.52, back: 1 },
  guide: { at: 3, d: 6, hole: 3, h: 5, spineW: 4, spineH: 5, spineZ: 1, notch: 3 },
  front: { at: 8.5, height: 5.5, inner: 5.5, thick: 4, outer: 9, hole: 4.5, key: 1.5, keyLen: 5.5, rail: 6.5, railH: 5, fillet: 0.75 },
  motor: { from: 26.52, len: 23, width: 15, height: 13.96, axis: 5.1, bellLen: 5.52, frontWall: 1, frontWallH: 5, rearWall: 1, shaftD: 5, shaftH: 5.5, step: 2, stepFloor: 0.92, stepLen: 1 },
  gear: { floor: 1, rampTop: 2.57, rampLen: 3.67, slotW: 9, slotFrom: 56.72, slotLen: 12.6, chamfer: 1.05 },
  rear: { wheelbase: 55.02, height: 5.5, inner: 6.5, thick: 5, outer: 8, hole: 4.5, key: 1.5, keyLen: 5.5 },
  mounts: { x: 12.5, hole: 3, at: [25.02, 39.52, 50.02], boss: 1, bossX: 12, bossD: 8, bossH: 6 },
};

// Where the main things are, worked out from the settings.
export function layout(P) {
  const frontY = P.front.at, rearY = frontY + P.rear.wheelbase;
  const bayFrom = P.motor.from, bayTo = bayFrom + P.motor.len;
  return { frontY, rearY, bayFrom, bayTo, wellFrom: bayTo + P.motor.rearWall, panTo: P.plate.panFrom + P.plate.panLen, bellFrom: bayFrom - P.motor.bellLen };
}

// Builds the solid in the part's own frame. `k` is the kernel: { Manifold, CrossSection, K } where K keeps
// every object made so the caller can free them.
export function onePieceSolid(k, P) {
  const { Manifold, CrossSection, K } = k;
  const L = layout(P), pl = P.plate, g = P.guide, f = P.front, m = P.motor, w = P.gear, r = P.rear, mt = P.mounts;
  // Round parts are made of 96 sides, whatever the app's own setting: fine enough to match Peter's model.
  const BIG = 100, E = 0.01, SEG = 96;
  const box = (x0, x1, y0, y1, z0, z1) => K(K(Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false)).translate([x0, y0, z0]));
  const both = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];
  const cylZ = (x, y, z0, z1, d) => K(K(Manifold.cylinder(z1 - z0, d / 2, d / 2, SEG)).translate([x, y, z0]));
  // A cylinder along x, from x0 to x1, its axis at (y, z).
  const cylX = (x0, x1, y, z, d) => K(K(K(Manifold.cylinder(x1 - x0, d / 2, d / 2, SEG)).rotate([0, 90, 0])).translate([x0, y, z]));
  // An oval along y, from y0 to y1: `wide` across, `tall` up, its middle at height z.
  const ovalY = (y0, y1, z, wide, tall) => K(K(K(K(Manifold.cylinder(y1 - y0, 0.5, 0.5, SEG)).scale([wide, tall, 1])).rotate([-90, 0, 0])).translate([0, y0, z]));
  // A side view (y, z) pushed across the car from x0 to x1; `across` does it from -x to x.
  const side = (pts, x0, x1) => K(K(K(K(new CrossSection([pts], 'NonZero')).extrude(x1 - x0)).rotate([90, 0, 90])).translate([x0, 0, 0]));
  const across = (pts, x) => side(pts, -x, x);
  const U = (list) => K(Manifold.union(list.flat()));

  // ---- what is there
  const panTo = L.panTo;
  const frontPlate = K(box(-pl.frontW / 2, pl.frontW / 2, pl.arcAt, pl.panFrom + E, 0, pl.frontT).subtract(cylZ(0, pl.arcAt, -1, pl.frontT + 1, 2 * pl.arcR)));
  const adds = [
    frontPlate,
    // The side pans; between the spine and the rails the floor stays thin up to the wall ahead of the motor.
    K(box(-pl.panW / 2, pl.panW / 2, pl.panFrom, panTo, 0, pl.panT).subtract(box(-f.rail, f.rail, pl.panFrom - 1, L.bellFrom - m.frontWall, pl.frontT, BIG))),
    box(-pl.rearW / 2, pl.rearW / 2, panTo - E, pl.length, 0, pl.rearT),
    // Side walls from ahead of the motor to the back, and the back wall.
    both(pl.rearW / 2 - pl.wall, pl.rearW / 2, pl.wallFrom, pl.length, 0, pl.wallH),
    box(-pl.rearW / 2, pl.rearW / 2, pl.length - pl.back, pl.length, 0, pl.wallH),
    // The motor bay starts as a block between the side walls; the cradle is cut out of it.
    box(-(pl.rearW / 2 - pl.wall) - E, pl.rearW / 2 - pl.wall + E, L.bellFrom, L.bayTo, 0, pl.wallH),
    // The walls at both ends of the motor bay.
    box(-(pl.rearW / 2 - pl.wall) - E, pl.rearW / 2 - pl.wall + E, L.bellFrom - m.frontWall, L.bellFrom, 0, m.frontWallH),
    box(-(pl.rearW / 2 - pl.wall) - E, pl.rearW / 2 - pl.wall + E, L.bayTo, L.bayTo + m.rearWall, 0, pl.wallH),
    // The spine from the guide post to the motor bay, with room for the front axle.
    K(box(-g.spineW / 2, g.spineW / 2, g.at, L.bellFrom - m.frontWall + E, g.spineZ, g.spineH).subtract(cylX(-BIG, BIG, L.frontY, f.height, g.notch))),
    cylZ(0, g.at, 0, g.h, g.d),
    // Rails from the front axle to the side walls.
    both(pl.frontW / 2 - pl.wall, pl.frontW / 2, L.frontY, L.frontY + f.outer / 2, f.height - f.outer / 2, 2),
    both(f.rail, pl.frontW / 2, L.frontY, L.bellFrom - m.frontWall + E, 2, f.railH),
    both(f.rail, pl.frontW / 2, L.frontY + f.outer / 2, L.bellFrom - m.frontWall + E, f.height - f.outer / 2, 2),
    // The front axle eyes, with a small fillet down to the rails behind them.
    cylX(f.inner, f.inner + f.thick, L.frontY, f.height, f.outer), cylX(-f.inner - f.thick, -f.inner, L.frontY, f.height, f.outer),
    ...[1, -1].map((s) => side([[L.frontY + f.outer / 2 - 0.03 - 0.5, f.railH], [L.frontY + f.outer / 2 + f.fillet, f.railH], [L.frontY + f.outer / 2 - 0.03, f.railH + 0.7], [L.frontY + f.outer / 2 - 0.03 - 0.5, f.railH + 0.7]], s > 0 ? f.rail : -pl.frontW / 2, s > 0 ? pl.frontW / 2 : -f.rail)),
  ];
  // The boss under one body mount: from the side wall out to a round end.
  if (mt.boss >= 0 && mt.boss < mt.at.length && mt.bossH > 0) {
    const y = mt.at[mt.boss], R = mt.bossD / 2;
    adds.push(box(pl.rearW / 2 - E, mt.bossX, y - R, y + R, 0, mt.bossH), cylZ(mt.bossX, y, 0, mt.bossH, mt.bossD));
    adds.push(box(-mt.bossX, -pl.rearW / 2 + E, y - R, y + R, 0, mt.bossH), cylZ(-mt.bossX, y, 0, mt.bossH, mt.bossD));
  }
  let solid = U(adds);

  // ---- what is taken away
  // The motor bay: an oval cradle along the car, through the floor except at its front end, where the floor steps down.
  const ov = (y0, y1) => ovalY(y0, y1, m.axis, m.width, m.height);
  const cuts = [
    ov(L.bayFrom + m.step + m.stepLen, L.bayTo),
    K(ov(L.bayFrom + m.step, L.bayFrom + m.step + m.stepLen + E).intersect(box(-BIG, BIG, -BIG, BIG, m.stepFloor, BIG))),
    K(ov(L.bayFrom, L.bayFrom + m.step + E).intersect(box(-BIG, BIG, -BIG, BIG, pl.panT, BIG))),
    box(-(pl.rearW / 2 - pl.wall), pl.rearW / 2 - pl.wall, L.bellFrom, L.bayFrom + E, pl.panT, BIG),
    // The motor shaft through the back wall of the bay.
    K(K(K(Manifold.cylinder(m.rearWall + 2 * E, m.shaftD / 2, m.shaftD / 2, SEG)).rotate([-90, 0, 0])).translate([0, L.bayTo - E, m.shaftH])),
    box(-m.shaftD / 2, m.shaftD / 2, L.bayTo - E, L.bayTo + m.rearWall + E, m.shaftH, BIG),
    // The gear well: down to its floor behind the back wall of the bay.
    box(-(pl.rearW / 2 - pl.wall), pl.rearW / 2 - pl.wall, L.wellFrom, pl.length - pl.back, w.floor, BIG),
  ];
  solid = K(solid.subtract(U(cuts)));
  // The ramp down from the back wall of the bay to the gear well's floor.
  solid = U([solid, across([[L.wellFrom - E, 0], [L.wellFrom + w.rampLen, 0], [L.wellFrom + w.rampLen, w.floor], [L.wellFrom - E, w.rampTop]], pl.rearW / 2 - pl.wall + E)]);
  // The rear axle eyes stand into the gear well, so they come after it.
  solid = U([solid, cylX(r.inner, r.inner + r.thick, L.rearY, r.height, r.outer), cylX(-r.inner - r.thick, -r.inner, L.rearY, r.height, r.outer)]);
  // The slot for the crown gear, its ends chamfered; the holes.
  const s0 = w.slotFrom, s1 = w.slotFrom + w.slotLen, c = w.chamfer;
  const holes = [
    across([[s0, -1], [s1, -1], [s1, 0], [s1 + c, w.floor], [s1 + c, w.floor + E], [s0 - c, w.floor + E], [s0 - c, w.floor], [s0, 0]], w.slotW / 2),
    cylZ(0, g.at, -1, g.h + 1, g.hole),
    ...mt.at.flatMap((y) => [cylZ(mt.x, y, -1, BIG, mt.hole), cylZ(-mt.x, y, -1, BIG, mt.hole)]),
  ];
  // The axle seats: round, with key slots above and below so a bushing cannot turn.
  const seat = (e, y, x0, x1) => [cylX(x0, x1, y, e.height, e.hole), ...(e.key > 0 ? [box(x0, x1, y - e.key / 2, y + e.key / 2, e.height - e.keyLen / 2, e.height + e.keyLen / 2)] : [])];
  holes.push(...seat(f, L.frontY, f.inner - E, f.inner + f.thick + E), ...seat(f, L.frontY, -f.inner - f.thick - E, -f.inner + E));
  holes.push(...seat(r, L.rearY, r.inner - E, r.inner + r.thick + E), ...seat(r, L.rearY, -r.inner - r.thick - E, -r.inner + E));
  return K(solid.subtract(U(holes)));
}

// ------------------------------------------------------------ settings

// What each setting is called in the panel, by part. Every one is a length in mm.
export const ONE_PIECE_FIELDS = {
  plate: [['length', 'Length'], ['panW', 'Side pans: width'], ['panLen', 'Side pans: length'], ['panFrom', 'Side pans: from the front'], ['panT', 'Side pans: thickness'],
    ['frontW', 'Front: width'], ['frontT', 'Front: thickness'], ['rearW', 'Rear: width'], ['rearT', 'Rear: thickness'], ['arcR', 'Cut-out round the guide: radius'], ['arcAt', 'Cut-out: middle from the front'],
    ['wall', 'Side walls: thickness'], ['wallH', 'Side walls: height'], ['wallFrom', 'Side walls: from the front'], ['back', 'Back wall: thickness']],
  guide: [['at', 'From the front'], ['d', 'Post diameter'], ['hole', 'Guide hole'], ['h', 'Post height'], ['spineW', 'Spine: width'], ['spineH', 'Spine: height'], ['spineZ', 'Spine: from the bottom'], ['notch', 'Room for the front axle']],
  front: [['at', 'Axle from the front'], ['height', 'Axle height'], ['inner', 'Eyes: inside face from the middle'], ['thick', 'Eyes: thickness'], ['outer', 'Eyes: outside diameter'], ['hole', 'Seat diameter'], ['key', 'Key slots: width (0: none)'], ['keyLen', 'Key slots: end to end'], ['rail', 'Rails: inside face from the middle'], ['railH', 'Rails: height'], ['fillet', 'Rails: fillet behind the eyes']],
  motor: [['from', 'Cradle starts at'], ['len', 'Cradle length'], ['width', 'Cradle width'], ['height', 'Cradle height'], ['axis', 'Cradle middle: height'], ['bellLen', 'Endbell pocket: length'], ['frontWall', 'Front wall: thickness'], ['frontWallH', 'Front wall: height'], ['rearWall', 'Back wall: thickness'], ['shaftD', 'Shaft slot: width'], ['shaftH', 'Shaft slot: height'], ['step', 'Floor under the endbell: length'], ['stepFloor', 'Thin floor: thickness'], ['stepLen', 'Thin floor: length']],
  gear: [['floor', 'Floor thickness'], ['rampTop', 'Ramp: top'], ['rampLen', 'Ramp: length'], ['slotW', 'Floor slot: width'], ['slotFrom', 'Floor slot: from the front'], ['slotLen', 'Floor slot: length'], ['chamfer', 'Floor slot: chamfer']],
  rear: [['wheelbase', 'Wheelbase'], ['height', 'Axle height'], ['inner', 'Eyes: inside face from the middle'], ['thick', 'Eyes: thickness'], ['outer', 'Eyes: outside diameter'], ['hole', 'Seat diameter'], ['key', 'Key slots: width (0: none)'], ['keyLen', 'Key slots: end to end']],
  mounts: [['x', 'Holes from the middle'], ['hole', 'Hole diameter'], ['bossX', 'Boss: middle from the middle'], ['bossD', 'Boss: diameter'], ['bossH', 'Boss: height']],
};
const RANGE = [0, 200];
const clamp = (v, def, [lo, hi] = RANGE) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const clone = (o) => JSON.parse(JSON.stringify(o));
const round = (v) => Math.round(v * 1000) / 1000;

// The settings most chassis need, on the one Chassis page. Everything else stays on the part pages.
export const MAIN_FIELDS = [['rear.wheelbase', 'Wheelbase'], ['plate.length', 'Length'], ['plate.frontW', 'Centre width, front and rear'],
  ['plate.panW', 'Side pans: width'], ['plate.panLen', 'Side pans: length'], ['plate.panFrom', 'Side pans: from the front'],
  ['front.height', 'Axle height, front and rear'], ['front.hole', 'Axle seats, front and rear: diameter'], ['front.key', 'Axle seats: key slots width (0: none)'],
  ['motor.len', 'Motor cradle: length'], ['motor.width', 'Motor cradle: width'], ['motor.height', 'Motor cradle: height'],
  ['guide.hole', 'Guide hole'], ['mounts.x', 'Body mounts: holes from the middle']];
// Linked settings, as [setting, the one it follows]. A linked setting stays at Peter's distance from the one it follows
// (so untouched, the build is still Peter's chassis), until it is unlinked and set by hand.
export const LINKS = [['plate.wallFrom', 'plate.panFrom'], ['motor.from', 'plate.panFrom'], ['plate.rearW', 'plate.frontW'], ['plate.rearT', 'plate.frontT'],
  ['rear.height', 'front.height'], ['rear.hole', 'front.hole'], ['rear.key', 'front.key'], ['rear.keyLen', 'front.keyLen'], ['guide.spineH', 'guide.h']];
const valueAt = (P, path) => path.split('.').reduce((o, k) => o?.[k], P);
const put = (P, path, v) => { const [part, k] = path.split('.'); P[part][k] = v; };
export const linkOffset = (to, from) => round(valueAt(PETER, to) - valueAt(PETER, from));
export const linkOf = (path) => LINKS.find(([to]) => to === path);
export const isLinked = (P, path) => !!linkOf(path) && P.links?.[path] !== false;
// Sets every linked setting from the one it follows.
export function applyLinks(P) {
  for (const [to, from] of LINKS) if (isLinked(P, to)) put(P, to, round(valueAt(P, from) + linkOffset(to, from)));
  return P;
}
export const newOnePiece = () => ({ ...clone(PETER), links: Object.fromEntries(LINKS.map(([to]) => [to, true])) });


// Checks what a file brings: every setting a number in range, the body mounts a short list.
export function cleanOnePiece(raw) {
  const out = newOnePiece();
  raw = raw && typeof raw === 'object' ? raw : {};
  if (typeof raw.name === 'string' && raw.name.trim()) out.name = raw.name.trim().slice(0, 80);
  for (const part of ONE_PIECE_PARTS) {
    const src = raw[part] && typeof raw[part] === 'object' ? raw[part] : {};
    for (const [k, dv] of Object.entries(out[part])) if (typeof dv === 'number' && k !== 'boss') out[part][k] = clamp(src[k], dv);
  }
  const at = Array.isArray(raw.mounts?.at) ? raw.mounts.at.filter(Number.isFinite).slice(0, 6).map((v) => clamp(v, 0)) : null;
  if (at) out.mounts.at = at;
  const boss = raw.mounts?.boss;
  out.mounts.boss = Number.isInteger(boss) && boss >= -1 && boss < out.mounts.at.length ? boss : Math.min(PETER.mounts.boss, out.mounts.at.length - 1);
  // Links: as saved; a file from before links existed is linked only where its sizes still keep Peter's distance.
  for (const [to, from] of LINKS) {
    const saved = raw.links?.[to];
    out.links[to] = typeof saved === 'boolean' ? saved : Math.abs(valueAt(out, to) - (valueAt(out, from) + linkOffset(to, from))) < 1e-6;
  }
  return applyLinks(out);
}

// The settings that differ from Peter's, as "part.key".
export function changedFromPeter(P) {
  const out = [];
  for (const part of ONE_PIECE_PARTS) for (const [k, v] of Object.entries(PETER[part])) if (JSON.stringify(P[part]?.[k]) !== JSON.stringify(v)) out.push(`${part}.${k}`);
  return out;
}

// Linked sizes: a new wheelbase carries the gear well's slot and the end of the plate with the rear axle.
export function moveRearAxle(P, wheelbase, from) {
  const d = wheelbase - from;
  P.gear.slotFrom = round(P.gear.slotFrom + d);
  P.plate.length = round(P.plate.length + d);
}

// How high the chassis rides: its underside sits so far above the track that the rear axle is at the tyres' middle.
export const rideHeight = (P, rearTyreD) => rearTyreD / 2 - P.rear.height;

// Checks that need no solid: walls round the axle seats, the motor clearing the track, the width.
export function onePieceChecks(P, ctx = {}) {
  const nozzle = ctx.nozzle ?? 0.4, out = [], add = (ok, title, text, soft) => out.push({ ok, title, text, ...(soft ? { soft: true } : {}) });
  const changed = changedFromPeter(P).length;
  add(true, changed ? `Changed from Peter's design: ${changed} setting${changed > 1 ? 's' : ''}` : "Exactly Peter's design", changed ? "Back to Peter's, in the panel, undoes the changes." : 'Every size is as Peter drew it.');
  for (const [part, e] of [['Front', P.front], ['Rear', P.rear]]) {
    const ring = (e.outer - e.hole) / 2, keyed = (e.outer - e.keyLen) / 2;
    if (ring < nozzle) add(false, `${part} axle eyes too thin`, `Only ${round(ring)} mm round the seat: at least one nozzle (${nozzle} mm) is needed.`);
    else if (e.key > 0 && keyed < nozzle) add(false, `${part} key slots break through`, `The key slots leave ${round(Math.max(0, keyed))} mm of eye above and below them.`);
  }
  if (ctx.rearTyreD) {
    const ride = rideHeight(P, ctx.rearTyreD), low = ride + P.motor.axis - P.motor.height / 2;
    if (ride < (ctx.minClearance ?? 0.5)) add(false, 'The chassis is too low', `With Ø${ctx.rearTyreD} rear tyres its underside is ${round(ride)} mm above the track.`);
    else if (low < 0.2) add(false, 'The motor cradle reaches the track', `It goes ${round(-low)} mm below the track with Ø${ctx.rearTyreD} rear tyres. A motor smaller than the cradle may still clear it; bigger tyres or a higher cradle make sure.`, true);
    else add(true, `Rides ${round(ride)} mm above the track`, `With Ø${ctx.rearTyreD} rear tyres; the cradle clears the track by ${round(low)} mm.`);
  }
  if (P.plate.panW > (ctx.maxWidth ?? Infinity)) add(false, 'Wider than your rules allow', `${P.plate.panW} mm; the rules allow ${ctx.maxWidth} mm.`);
  if (P.guide.d - P.guide.hole < 2 * nozzle) add(false, 'The guide post wall is too thin', `${round((P.guide.d - P.guide.hole) / 2)} mm round the guide hole.`);
  return out;
}

// The plate seen from above, as it stands on the car (front axle at x = 0): for pictures in the library.
export function outlineOf(P) {
  const L = layout(P), pl = P.plate, x = (y) => y - P.front.at;
  return [[[x(pl.arcAt), -pl.frontW / 2], [x(pl.panFrom), -pl.frontW / 2], [x(pl.panFrom), -pl.panW / 2], [x(L.panTo), -pl.panW / 2], [x(L.panTo), -pl.rearW / 2], [x(pl.length), -pl.rearW / 2],
    [x(pl.length), pl.rearW / 2], [x(L.panTo), pl.rearW / 2], [x(L.panTo), pl.panW / 2], [x(pl.panFrom), pl.panW / 2], [x(pl.panFrom), pl.frontW / 2], [x(pl.arcAt), pl.frontW / 2]]];
}
