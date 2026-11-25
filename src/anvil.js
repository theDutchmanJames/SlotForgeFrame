// Working with SlotForge Anvil.
//
// Chassis → Anvil: a chassis file (.anvilchassis, Anvil's own format, version 1) that carries the
// wheels, the heights, the body-mount spots and the real shape of the chassis and pod.
// Anvil shows it inside the body and builds its body posts on the spots.
//
// Anvil → Chassis: the body, exported from Anvil as an STL, shown here as a ghost.

import { find, on, summary, rideClearance } from './model.js';
import { encodeSTL } from './geometry/stl.js';
import { bytesToBase64 } from './library-core.js';
import { orient, boundsOf as sizeOf, UPS } from './geometry/stl-read.js';

export const ANVIL_CHASSIS_FORMAT = 'slotforge-anvil-chassis';

// The chassis and the pod as one model, for showing in Anvil.
export function joinMeshes(parts) {
  const list = parts.filter(Boolean);
  const positions = new Float32Array(list.reduce((n, m) => n + m.positions.length, 0));
  const indices = new Uint32Array(list.reduce((n, m) => n + m.indices.length, 0));
  let po = 0, io = 0;
  for (const m of list) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    po += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (positions[i + k] < min[k]) min[k] = positions[i + k];
      if (positions[i + k] > max[k]) max[k] = positions[i + k];
    }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

// Anvil turns a chassis STL the way it turns a car: the longest side runs along the car, the
// narrower of top and bottom is the top, and the end whose top is lower is the front. It starts
// by taking the file's +X end for the front, and only changes its mind when the -X end is lower.
// Our front is at -X, so Anvil gets it right only when our front end is the lower one.
// This predicts that, so the file can tell Anvil to turn the chassis round when it would guess wrong.
export function anvilGuess(mesh) {
  const p = mesh.positions, b = boundsOf(p);
  const lengthIsX = b.size[0] >= b.size[1] && b.size[0] >= b.size[2];
  const upIsZ = b.size[2] <= b.size[0] && b.size[2] <= b.size[1];
  const band = b.size[2] * 0.2, end = b.size[0] * 0.12;
  let lo = [Infinity, -Infinity], hi = [Infinity, -Infinity], frontTop = 0, rearTop = 0;
  for (let i = 0; i < p.length; i += 3) {
    const h = p[i + 2] - b.min[2], w = p[i + 1];
    if (h < band) lo = [Math.min(lo[0], w), Math.max(lo[1], w)];
    if (h > b.size[2] - band) hi = [Math.min(hi[0], w), Math.max(hi[1], w)];
    if (p[i] < b.min[0] + end) frontTop = Math.max(frontTop, h);
    if (p[i] > b.max[0] - end) rearTop = Math.max(rearTop, h);
  }
  return {
    lies: lengthIsX && upIsZ, // Anvil keeps X along the car and Z up
    upright: hi[1] - hi[0] <= lo[1] - lo[0], // false: Anvil would stand it on its head
    facesRight: frontTop < rearTop, // false: Anvil would take the rear for the front
  };
}

// The chassis record Anvil reads, and the model that goes with it.
export function anvilChassis(design, built) {
  const d = design, s = summary(d);
  const outline = find(d.chassis, 'outline').params, guide = find(d.chassis, 'guide'), mounts = find(d.chassis, 'bodyMounts');
  const mesh = joinMeshes([built.chassis, built.pod]);
  const b = boundsOf(mesh.positions), guess = anvilGuess(mesh);
  const round = (v, n = 2) => Number(Number(v).toFixed(n));
  const fileName = `${d.name}.stl`;
  const chassis = {
    name: d.name,
    // Anvil moves the front axle onto the body's front wheel arch; this is only its start.
    frontX: round(-d.car.wheelbase / 2),
    wheelbase: round(d.car.wheelbase),
    wheelbaseMin: null,
    wheelbaseMax: null,
    clearance: round(rideClearance(d)), // body above the track: level with the chassis underside
    // Where the body's posts end: on top of the chassis's body mounts.
    deck: round(rideClearance(d) + outline.thickness + (on(mounts) ? mounts.params.height : 0)),
    guideAhead: round(on(guide) ? -guide.params.along : d.car.wheelbase * 0.2),
    front: { diameter: round(d.car.front.tyreD), width: round(d.car.front.tyreW), inOut: round(d.car.front.inOut) },
    rear: { diameter: round(d.car.rear.tyreD), width: round(d.car.rear.tyreW), inOut: round(d.car.rear.inOut) },
    // Spots are measured from the front axle and from the centre line; one off the centre line is a pair.
    posts: on(mounts) ? mounts.params.posts.map((q) => ({ along: round(q.along), side: round(Math.abs(q.side)) })) : [],
    stl: {
      fileName,
      flip: !guess.facesRight,
      // Anvil centres the model between the axles and stands it on the track, then applies these.
      along: round((b.min[0] + b.max[0]) / 2 - d.car.wheelbase / 2),
      height: round(b.min[2]),
    },
    madeWith: 'SlotForge Frame',
    scale: d.scale,
  };
  const warnings = [];
  if (!guess.lies) warnings.push('The chassis is taller or wider than it is long, so Anvil may lay it the wrong way.');
  if (!guess.upright) warnings.push('The chassis is wider at the top than at the bottom, so Anvil may show it upside down.');
  if (s.guideLead === null) warnings.push('There is no guide holder; the guide position is a guess.');
  if (!chassis.posts.length) warnings.push('There are no body mounts, so Anvil gets no post spots.');
  return { chassis, mesh, warnings, fileName };
}

export function encodeAnvilChassis(design, built) {
  const { chassis, mesh, warnings } = anvilChassis(design, built);
  const text = JSON.stringify({ format: ANVIL_CHASSIS_FORMAT, version: 1, chassis, stl: bytesToBase64(encodeSTL(mesh, 'SlotForge Frame for Anvil')) });
  return { text, warnings, posts: chassis.posts.length };
}

// ------------------------------------------------------------ the body as a ghost

// The body where it sits on this car: centred between the axles (plus `shift`), its underside `lift` above the track.
export function placeBody(mesh, body, wheelbase) {
  // Stood up and turned as asked (quarter turns), then set down: centred between the axles, its underside at `lift`.
  const stood = orient(mesh, { up: UPS.includes(body.up) ? body.up : '+z', turn: body.turn || 0 });
  const out = stood.positions, length = sizeOf(stood).size[0];
  for (let i = 0; i < out.length; i += 3) {
    out[i] += wheelbase / 2 + body.shift - length / 2;
    out[i + 2] += body.lift;
  }
  return { positions: out, indices: mesh.indices };
}

// A first guess at how a body lies in its file: its lowest side is its height, its longest its length.
// Which end is the front, and whether it lies on its roof, cannot be told from the sizes: that is for the buttons.
export function bodyGuess(mesh) {
  const size = sizeOf(mesh).size, axis = size.indexOf(Math.min(...size));
  const up = ['+x', '+y', '+z'][axis], stood = sizeOf(orient(mesh, { up })).size;
  return { up, turn: stood[1] > stood[0] ? 90 : 0 };
}

// The wheel arches of a body that stands on the car (X along it, Z up): where the lower edge of its
// sides rises. Returns the two arches as { x: its middle along the car, length, height: how far the
// edge rises }, front first, or null when two arches cannot be told.
export function findArches({ positions: p, indices: idx }) {
  const b = sizeOf({ positions: p }), STEP = 0.5, k0 = Math.floor(b.min[0] / STEP), n = Math.ceil(b.size[0] / STEP) + 2;
  const half = Math.max(Math.abs(b.min[1]), Math.abs(b.max[1])), scale = b.size[0] / 150;
  // The lowest point of the outer skin, for every half millimetre along the car.
  const low = new Float32Array(n).fill(Infinity);
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e] * 3, c = idx[t + ((e + 1) % 3)] * 3;
      const steps = Math.max(1, Math.ceil(Math.hypot(p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]) / STEP));
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, y = p[a + 1] + (p[c + 1] - p[a + 1]) * u;
        if (Math.abs(y) < half * 0.72) continue; // not the side of the car
        const k = Math.round((p[a] + (p[c] - p[a]) * u) / STEP) - k0, z = p[a + 2] + (p[c + 2] - p[a + 2]) * u;
        if (k >= 0 && k < n && z < low[k]) low[k] = z;
      }
    }
  const seen = [...low].filter(Number.isFinite).sort((x, y) => x - y);
  if (seen.length < 20) return null;
  // The sills: the level most of the lower edge keeps to. An arch rises clearly above it.
  const sill = seen[Math.floor(seen.length * 0.25)], rise = 2.5 * scale;
  const runs = [];
  let run = null;
  for (let k = 0; k < n; k++) {
    const up = Number.isFinite(low[k]) && low[k] > sill + rise;
    if (up) { run ??= { k0: k, k1: k, top: 0 }; run.k1 = k; run.top = Math.max(run.top, low[k] - sill); }
    else if (run && k - run.k1 > 2 / STEP) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  // An arch is about as long as a wheel: longer than a vent, shorter than a raised nose or tail.
  const arches = runs.map((r) => ({ x: ((r.k0 + r.k1) / 2 + k0) * STEP, length: (r.k1 - r.k0 + 1) * STEP, height: r.top }))
    .filter((a) => a.length > 12 * scale && a.length < 48 * scale && a.x - a.length / 2 > b.min[0] + 3 * scale && a.x + a.length / 2 < b.max[0] - 3 * scale);
  if (arches.length < 2) return null;
  const two = arches.sort((x, y) => y.height * y.length - x.height * x.length).slice(0, 2).sort((x, y) => x.x - y.x);
  const r1 = (v) => Math.round(v * 10) / 10;
  return two.map((a) => ({ x: r1(a.x), length: r1(a.length), height: r1(a.height) }));
}

// What it takes to put both axles in the middle of the arches found on the placed body: the
// wheelbase, and how far the body moves along the car. (A body lies centred between the axles,
// so a new wheelbase moves it by half the change.)
export function archFit(design, arches) {
  const wheelbase = Math.min(300, Math.max(30, Math.round((arches[1].x - arches[0].x) * 10) / 10));
  const shift = (design.body?.shift ?? 0) - arches[0].x - (wheelbase - design.car.wheelbase) / 2;
  return { wheelbase, shift: Math.round(shift * 10) / 10 };
}
// Whether the axles sit in the arches, as a row for the checks.
export function archNote(design, arches) {
  if (!arches) return null;
  const front = arches[0].x, rear = arches[1].x - design.car.wheelbase, off = Math.max(Math.abs(front), Math.abs(rear));
  const say = (v) => `${Math.abs(v).toFixed(1)} mm ${v > 0 ? 'ahead of' : 'behind'}`;
  return off <= 1
    ? { ok: true, title: 'The axles sit in the wheel arches', text: 'Both axles are within a millimetre of the middle of their arch.' }
    : { ok: false, title: 'The axles are not in the wheel arches', text: `The front axle is ${say(front)} the middle of its arch, the rear axle ${say(rear)} its arch. Use "Fit the axles to the arches", or set the wheelbase and move the body.` };
}

// The body's outline from above, as its convex hull: [[x, y], …] going round once.
export function hullOf(positions) {
  const pts = [];
  const seen = new Set();
  for (let i = 0; i < positions.length; i += 3) {
    const x = Math.round(positions[i] * 10) / 10, y = Math.round(positions[i + 1] * 10) / 10, key = x * 100003 + y;
    if (!seen.has(key)) {
      seen.add(key);
      pts.push([x, y]);
    }
  }
  if (pts.length < 3) return pts;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const insideHull = (hull, [x, y], slack = 0.05) => {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / len < -slack) return false;
  }
  return true;
};

// Does the car stay inside the body, seen from above? `rings` is the chassis from above.
export function bodyFit(hull, rings, design) {
  const notes = [];
  if (hull.length < 3) return notes;
  let out = 0;
  for (const ring of rings) for (const p of ring) if (!insideHull(hull, p)) out++;
  notes.push(out
    ? { ok: false, title: 'The chassis sticks out of the body', text: 'Seen from above, part of the chassis lies outside the body. Pull the outline in, or move the body.' }
    : { ok: true, title: 'The chassis stays inside the body', text: 'Seen from above, nothing of the chassis lies outside the body.' });
  const wheels = [];
  for (const [x, w] of [[0, design.car.front], [design.car.wheelbase, design.car.rear]])
    for (const s of [1, -1]) wheels.push([x, s * (w.inOut + w.tyreW / 2)]);
  const wide = wheels.some((p) => !insideHull(hull, p));
  notes.push(wide
    ? { ok: false, title: 'The wheels stick out of the body', text: 'A tyre reaches past the body. Move the wheels in, or use narrower tyres.' }
    : { ok: true, title: 'The wheels stay inside the body', text: 'The tyres do not reach past the body.' });
  return notes;
}
