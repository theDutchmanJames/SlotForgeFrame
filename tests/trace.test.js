// Tracing a body from Anvil into a chassis outline.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { placeBody } from '../src/anvil.js';
import { newDesign, find, traceWheels, traceArches, applyOutline, centreMounts, summary, checks } from '../src/model.js';
import { findArches } from '../src/anvil.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);

// A simple body shell, open underneath: straight sides, rounded bumpers, wheel arches cut out of the
// sides, a roof, and door mirrors high up that stick out. `length` × `width` × 36 mm, front at X = 0.
function bodyShell({ length = 150, width = 64, arches = [[33, 22], [116, 22]], archTop = 14 } = {}) {
  const pos = [], idx = [], half = width / 2, r = 12;
  const v = (x, y, z) => pos.push(x, y, z) / 3 - 1;
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  // The outline of the body from above, as [x, y] going round once.
  const ring = [];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 8; i++) { const a = a0 + ((a1 - a0) * i) / 8; ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(r, half - r, Math.PI, Math.PI / 2);
  arc(length - r, half - r, Math.PI / 2, 0);
  arc(length - r, -half + r, 0, -Math.PI / 2);
  arc(r, -half + r, -Math.PI / 2, -Math.PI);
  // Walls from the underside up; over a wheel arch the wall starts higher.
  const lowAt = (x, y) => (Math.abs(Math.abs(y) - half) < 0.01 && arches.some(([cx, w]) => Math.abs(x - cx) < w / 2) ? archTop : 0);
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    // Split a wall at the arch edges so the arch is cut cleanly.
    const cuts = [0, 1];
    if (Math.abs(y0 - y1) < 0.01 && Math.abs(Math.abs(y0) - half) < 0.01)
      for (const [cx, w] of arches) for (const ex of [cx - w / 2, cx + w / 2]) { const k = (ex - x0) / (x1 - x0); if (k > 0.001 && k < 0.999) cuts.push(k); }
    cuts.sort((a, b) => a - b);
    for (let c = 0; c < cuts.length - 1; c++) {
      const ax = x0 + (x1 - x0) * cuts[c], bx = x0 + (x1 - x0) * cuts[c + 1], ay = y0 + (y1 - y0) * cuts[c], by = y0 + (y1 - y0) * cuts[c + 1];
      const low = lowAt((ax + bx) / 2, (ay + by) / 2);
      quad(v(ax, ay, low), v(bx, by, low), v(bx, by, 30), v(ax, ay, 30));
    }
  }
  // A roof, and two mirrors that reach 6 mm past the sides, well above the sills.
  quad(v(20, -half + 6, 36), v(length - 30, -half + 6, 36), v(length - 30, half - 6, 36), v(20, half - 6, 36));
  for (const s of [1, -1]) quad(v(50, s * half, 22), v(54, s * half, 22), v(54, s * (half + 6), 24), v(50, s * (half + 6), 24));
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}
// The half-width of a traced outline at a place along the car (the outline is a line of points).
function widthAt(points, x) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && Math.abs(x1 - x0) > 1e-6) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return 0;
}
// The body on a default 1/32 car: 150 long, centred between the axles.
function setUp(options) {
  const d = newDesign(), body = placeBody(bodyShell(options), { shift: 0, lift: 2, turn: 0 }, d.car.wheelbase);
  return { d, body, front: d.car.wheelbase / 2 - 75 };
}

test('the outline follows the body, pulled in by the gap, with the curved bumpers', () => {
  const { d, body, front } = setUp();
  const out = engine.trace({ body, band: 6, gap: 1.5, wheels: [] });
  const pts = out.points;
  assert.deepEqual([pts[0][1], pts.at(-1)[1]], [0, 0], 'it starts and ends on the centre line');
  assert.ok(pts.every((q, i) => q[1] >= 0 && (i === 0 || q[0] >= pts[i - 1][0] - 0.11)), 'one side only, running from nose to tail');
  assert.ok(Math.abs(pts[0][0] - (front + 1.5)) < 0.3 && Math.abs(pts.at(-1)[0] - (front + 150 - 1.5)) < 0.3, 'the nose and tail sit a gap inside the bumpers');
  assert.ok(Math.abs(out.length - 147) < 0.5 && Math.abs(out.width - 61) < 0.5, `147 × 61 mm (got ${out.length.toFixed(1)} × ${out.width.toFixed(1)})`);
  assert.ok(Math.abs(widthAt(pts, d.car.wheelbase / 2) - 30.5) < 0.2, 'straight sides, a gap inside the body');
  // The bumper corners are rounded, not square: 3 mm in from the nose the outline is much narrower than the sides.
  // (a 10.5 mm corner: 20 + √(10.5² − 7.5²) = 27.3 there, against 30.5 along the sides)
  assert.ok(Math.abs(widthAt(pts, pts[0][0] + 3) - 27.3) < 0.4, `the corner is followed (${widthAt(pts, pts[0][0] + 3)})`);
  assert.ok(pts.length <= 48, `few enough points to edit by hand (${pts.length})`);
  // A bigger gap gives a smaller chassis.
  const tight = engine.trace({ body, band: 6, gap: 4, wheels: [] });
  assert.ok(Math.abs(tight.width - 56) < 0.5 && tight.length < out.length - 4);
});

test('only the lowest band of the body is traced: mirrors and the roof are ignored, arches are bridged', () => {
  const { d, body } = setUp();
  const low = engine.trace({ body, band: 6, gap: 0, wheels: [] });
  // The mirrors sit 20 mm up and 6 mm out; the sills are at 32.
  assert.ok(Math.abs(low.width - 64) < 0.3, `the sills, not the mirrors (${low.width})`);
  // Over the wheel arches the band is empty; the outline carries straight across.
  assert.ok(Math.abs(widthAt(low.points, 0) - 32) < 0.3 && Math.abs(widthAt(low.points, d.car.wheelbase) - 32) < 0.3);
  // Looking at the whole height takes the mirrors in.
  const all = engine.trace({ body, band: 40, gap: 0, wheels: [] });
  assert.ok(all.width > 74);
  assert.throws(() => engine.trace({ body: { positions: new Float32Array(9), indices: Uint32Array.from([0, 1, 2]) } }), /nothing to trace/);
});

test('the outline is drawn in at the wheels, leaving room around each tyre', () => {
  const { d, body } = setUp();
  const wheels = traceWheels(d);
  assert.deepEqual(wheels.map((w) => [w.x, w.inner, w.length]), [[0, 21, 19.5], [83.4, 20.5, 20.5]]);
  const pts = engine.trace({ body, band: 6, gap: 1.5, wheels, wellSide: 1, wellEnd: 1.5 }).points;
  assert.ok(Math.abs(widthAt(pts, 0) - 20) < 0.15, 'at the front axle: 1 mm inside the tyre');
  assert.ok(Math.abs(widthAt(pts, 83.4) - 19.5) < 0.15, 'at the rear axle too');
  assert.ok(Math.abs(widthAt(pts, 0 + 9.75 + 1.0) - 20) < 0.15, 'still drawn in just past the tyre');
  assert.ok(Math.abs(widthAt(pts, 0 + 9.75 + 1.5 + 1.0) - 30.5) < 0.6, 'and back out beyond the room left for it');
  assert.ok(Math.abs(widthAt(pts, 41.7) - 30.5) < 0.2, 'full width between the wheels');
  // Wheels far too wide for the body: the gap alone decides.
  const wide = engine.trace({ body, band: 6, gap: 1.5, wheels: wheels.map((w) => ({ ...w, inner: 60 })) }).points;
  assert.ok(Math.abs(widthAt(wide, 0) - 30.5) < 0.2);
});

test('a design given a traced outline builds, stays inside the body and clears its tyres', () => {
  for (const options of [{}, { length: 136, width: 60 }, { length: 162, width: 66 }]) {
    const { d, body } = setUp(options);
    const traced = engine.trace({ body, band: 6, gap: 1.5, wheels: traceWheels(d) });
    applyOutline(d, traced.points);
    const o = find(d.chassis, 'outline').params, s = summary(d);
    assert.equal(o.points.length, traced.points.length);
    assert.ok(o.round <= 0.5);
    assert.ok(Math.abs(s.length - traced.length) < 0.2);
    // What would hang off the new shape has been moved onto it.
    const guide = find(d.chassis, 'guide').params, kick = find(d.chassis, 'kickup').params;
    assert.ok(guide.along >= s.minX + guide.padD / 2, 'the guide holder is on the plate');
    assert.ok(kick.fold < s.maxX - 3 && kick.fold > 40, 'the kick-up folds on the plate');
    const out = engine.build(d), faults = [...checks(d), ...out.notes].filter((n) => !n.ok && !n.soft).map((n) => n.title);
    assert.deepEqual(faults.filter((f) => !/Guide lead|Width/.test(f)), [], `${JSON.stringify(options)}: it builds without faults`);
    assert.ok(out.notes.find((n) => n.title === 'Tyres clear the chassis')?.ok);
    // Every corner of the plate lies inside the body, a gap from its sides.
    const bw = (options.width ?? 64) / 2;
    assert.ok(out.top.chassis.flat().every((q) => Math.abs(q[1]) <= bw - 1.4), 'inside the body');
  }
});

// A body with real walls: a box shell 150 x 64 x 36 with walls 1.5 thick, open underneath, with arches
// cut 14 mm up into its sides, a bumper lip 5 deep inside its tail, and a post standing free inside.
function thickBody() {
  const { Manifold } = wasm, box = (x0, y0, z0, x1, y1, z1) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  let m = box(0, -32, 0, 150, 32, 36).subtract(box(1.5, -30.5, -1, 148.5, 30.5, 34.5));
  for (const [c, w] of [[33, 24], [116, 26]]) m = m.subtract(box(c - w / 2, -40, -1, c + w / 2, 40, 14));
  m = m.add(box(143.5, -30.5, 0, 148.5, 30.5, 3)); // the tail's lip, low down
  m = m.add(box(70, 10, 2.5, 74, 14, 30)); // a post, ending just above the plate's underside
  const mesh = m.getMesh();
  const positions = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
  for (let i = 0, k = 0; i < mesh.vertProperties.length; i += mesh.numProp) { positions[k++] = mesh.vertProperties[i]; positions[k++] = mesh.vertProperties[i + 1]; positions[k++] = mesh.vertProperties[i + 2]; }
  return { positions, indices: Uint32Array.from(mesh.triVerts) };
}

test('the traced outline stays inside the walls of a body with thickness, clear of its bumper and its arches', () => {
  const d = newDesign(), body = placeBody(thickBody(), { shift: 0, lift: 2, turn: 0, up: '+z' }, d.car.wheelbase);
  const nose = d.car.wheelbase / 2 - 75, plateTop = d.car.clearance + find(d.chassis, 'outline').params.thickness + 1;
  // Without looking at the body's thickness: a gap from its outer skin, so the plate would sit in the wall.
  const skin = engine.trace({ body, gap: 1, wheels: [] });
  assert.ok(Math.abs(skin.width - 62) < 0.3);
  // Looking at it: a gap from the inside of the wall (1.5 thick), all round.
  const inside = engine.trace({ body, gap: 1, wheels: [], plateTop });
  assert.ok(Math.abs(widthAt(inside.points, nose + 75) - 29.5) < 0.2, `sides: ${widthAt(inside.points, nose + 75)}`);
  // (Where an arch is open there is no wall, so there the outline still follows the outer line until the arches are given.)
  assert.ok(Math.abs(widthAt(inside.points, nose + 33) - 31) < 0.2);
  assert.ok(Math.abs(inside.points[0][0] - (nose + 2.5)) < 0.3, `nose: ${inside.points[0][0] - nose}`);
  // The tail keeps the gap from the bumper's lip, which reaches 6.5 mm in.
  assert.ok(Math.abs(inside.points.at(-1)[0] - (nose + 150 - 6.5 - 1)) < 0.3, `tail: ${nose + 150 - inside.points.at(-1)[0]}`);
  // The post stands free inside the body: it is not a hole in the outline, and the outline is still one simple line.
  assert.ok(inside.points.every((q, i) => i === 0 || q[0] >= inside.points[i - 1][0] - 0.11));
  assert.ok(Math.abs(widthAt(inside.points, nose + 72) - 29.5) < 0.2, 'full width beside the post');
  // A lip higher up than the plate reaches does not count...
  const low = engine.trace({ body, gap: 1, wheels: [], plateTop: 1.9 });
  assert.ok(Math.abs(low.width - 62) < 0.3, 'below the body nothing is in the way');
  // ...and the arches: the body's own are found and left open over their whole length, not only beside the tyre.
  const arches = traceArches(d, findArches(body));
  assert.equal(arches.length, 2);
  assert.ok(Math.abs(arches[0].length - 24) <= 1 && Math.abs(arches[0].inner - 21) < 0.01);
  const withArches = engine.trace({ body, gap: 1, wheels: [], arches, plateTop, wellSide: 1 });
  const a0 = nose + 33;
  for (const x of [a0 - 11.5, a0, a0 + 11.5]) assert.ok(Math.abs(widthAt(withArches.points, x) - 20) < 0.2, `in at the arch, ${x - a0} from its middle (${widthAt(withArches.points, x)})`);
  assert.ok(Math.abs(widthAt(withArches.points, a0 + 14.5) - 29.5) < 0.3, 'back out behind the arch');
  // A body with a floor at the height of the plate leaves no room, and the app says so.
  const floored = { positions: Float32Array.from([...body.positions, nose, -32, 2.5, nose + 150, -32, 2.5, nose + 150, 32, 2.5, nose, 32, 2.5]), indices: Uint32Array.from([...body.indices, ...[0, 1, 2, 0, 2, 3].map((i) => i + body.positions.length / 3)]) };
  assert.throws(() => engine.trace({ body: floored, gap: 1, wheels: [], plateTop }), /Nothing is left of the outline/);
});

test('a narrow traced outline takes the body mounts and the axle brackets in with it', () => {
  const d = newDesign(), posts = find(d.chassis, 'bodyMounts').params, axle = find(d.chassis, 'frontAxle').params;
  // The default mounts sit on the centre line: one between the guide and the front axle, one behind the rear axle.
  assert.deepEqual(posts.posts, [{ along: -9.5, side: 0 }, { along: 100, side: 0 }]);
  // Mounts placed out to the side, and one behind where the new plate will end.
  posts.posts = [{ along: 30, side: 26 }, { along: 80, side: 9 }, { along: 108, side: 0 }];
  // A plate only 44 mm wide between the wheels, 26 at the front axle, ending at 100.
  applyOutline(d, [[-28, 0], [-28, 10], [-12, 13], [12, 13], [14, 22], [90, 22], [92, 12], [100, 12], [100, 0]]);
  const half = (x) => (x < 14 ? 13 : x <= 90 ? 22 : 12);
  for (const q of posts.posts) assert.ok(Math.abs(q.side) + posts.padD / 2 <= half(q.along) - 0.2 && q.along + posts.padD / 2 <= 100, `a mount at ${q.along} is on the plate (${q.side})`);
  assert.ok(Math.abs(posts.posts[0].side - 18.4) < 0.11, 'the wide one came in as far as it had to');
  assert.equal(posts.posts[1].side, 9, 'one that has room stays where it was');
  assert.ok(posts.posts[2].along <= 100 - 3.3, 'the one behind the tail came forward onto it');
  assert.ok(axle.spread / 2 + axle.thick / 2 <= 13 - 0.2 && axle.spread >= 8, `the brackets too (${axle.spread})`);
  // A plate with room leaves them where they were.
  const e = newDesign(), before = JSON.stringify(find(e.chassis, 'bodyMounts').params.posts), spread = find(e.chassis, 'frontAxle').params.spread;
  applyOutline(e, find(e.chassis, 'outline').params.points.map((q) => [...q]));
  assert.equal(JSON.stringify(find(e.chassis, 'bodyMounts').params.posts), before);
  assert.equal(find(e.chassis, 'frontAxle').params.spread, spread);
});

test('"Two on the centre line" places the body mounts for the design as it is', () => {
  const d = newDesign();
  assert.deepEqual(centreMounts(d), find(d.chassis, 'bodyMounts').params.posts, 'on a new design: where they already are');
  // A shorter car with its guide further back and a short tail.
  d.car.wheelbase = 66;
  find(d.chassis, 'guide').params.along = -15;
  const pts = find(d.chassis, 'outline').params.points;
  for (const q of pts) if (q[0] > 78) q[0] = 78;
  const [front, rear] = centreMounts(d);
  assert.deepEqual(front, { along: -7.5, side: 0 }, 'midway between the guide and the front axle');
  assert.equal(rear.side, 0);
  assert.ok(rear.along > 66 + 3.3 && rear.along + 3.3 <= 78 - 0.4, `behind the rear axle and on the plate (${rear.along})`);
});

test('under the body: the plate follows the outer line and reaches out from under it by a set amount', () => {
  const d = newDesign(), body = placeBody(thickBody(), { shift: 0, lift: 2, turn: 0, up: '+z' }, d.car.wheelbase);
  const nose = d.car.wheelbase / 2 - 75, plateTop = 4.5;
  const mid = (out) => widthAt(out.points, nose + 75);
  // Flush with the body, 1 mm out from under it all round, and 2 mm inside its outer line.
  const flush = engine.trace({ body, wheels: [], extend: 0, plateTop }), proud = engine.trace({ body, wheels: [], extend: 1, plateTop }), shy = engine.trace({ body, wheels: [], extend: -2, plateTop });
  assert.ok(Math.abs(mid(flush) - 32) < 0.2 && Math.abs(flush.length - 150) < 0.4, `flush: ${mid(flush)} × ${flush.length}`);
  assert.ok(Math.abs(mid(proud) - 33) < 0.2 && Math.abs(proud.length - 152) < 0.4, `1 mm out: ${mid(proud)} × ${proud.length}`);
  assert.ok(Math.abs(proud.points[0][0] - (nose - 1)) < 0.3, 'ahead of the nose too');
  assert.ok(Math.abs(mid(shy) - 30) < 0.2 && Math.abs(shy.length - 146) < 0.4, `2 mm in: ${mid(shy)}`);
  // The body's walls and bumper lip do not pull this outline in: the body stands on the plate, not round it.
  assert.ok(Math.abs(proud.points.at(-1)[0] - (nose + 151)) < 0.3);
  // The gap setting plays no part, and the arches are still left open, to the tyres' inner faces.
  assert.deepEqual(engine.trace({ body, wheels: [], extend: 1, gap: 5, plateTop }).points, proud.points);
  const arches = traceArches(d, findArches(body));
  const open = engine.trace({ body, wheels: traceWheels(d), arches, extend: 1, plateTop, wellSide: 1 });
  assert.ok(Math.abs(widthAt(open.points, nose + 33) - 20) < 0.2 && Math.abs(widthAt(open.points, nose + 75) - 33) < 0.2);
});

test('a body that runs into the chassis is found in 3D, and one that clears it is not', () => {
  // A plain shell with real walls and a bumper lip low down inside its tail (no post inside).
  const { Manifold } = wasm, box = (x0, y0, z0, x1, y1, z1) => Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const m = box(0, -32, 0, 150, 32, 36).subtract(box(1.5, -30.5, -1, 148.5, 30.5, 34.5)).add(box(143.5, -30.5, 0, 148.5, 30.5, 3)).getMesh();
  const positions = new Float32Array((m.vertProperties.length / m.numProp) * 3);
  for (let i = 0, k = 0; i < m.vertProperties.length; i += m.numProp) { positions[k++] = m.vertProperties[i]; positions[k++] = m.vertProperties[i + 1]; positions[k++] = m.vertProperties[i + 2]; }
  const shell = { positions, indices: Uint32Array.from(m.triVerts) };
  const d = newDesign();
  const at = (shift, lift = 2) => placeBody(shell, { shift, lift, turn: 0, up: '+z' }, d.car.wheelbase);
  // The chassis traced inside this body, a gap from its walls and its lip.
  applyOutline(d, engine.trace({ body: at(0), gap: 1.5, wheels: traceWheels(d), plateTop: 6 }).points);
  const built = engine.build(d), parts = [built.chassis, built.pod];
  const clear = engine.bodyClash({ body: at(0), parts });
  assert.ok(clear.area < 1, `clear: ${clear.area} mm² at ${clear.at}`);
  // Moved 9 mm forward, the tail's bumper lip comes over the kicked-up tail.
  const hit = engine.bodyClash({ body: at(-9), parts });
  assert.ok(hit.area > 10 && hit.depth > 0.5, `hit: ${hit.area} mm², ${hit.depth} mm`);
  assert.ok(hit.at[0] > 90 && hit.at[2] >= 1.9, `at the tail (${hit.at})`);
  // Seen from above the two overlap just the same; lifted clear of everything, nothing touches.
  assert.ok(engine.bodyClash({ body: at(-9, 16), parts }).area < 1, 'lifted over the chassis: clear');
  // A flat plate under a body that stands on it: touching is not running into. Sunk into it, it is found.
  const flat = newDesign();
  find(flat.chassis, 'kickup').enabled = false;
  find(flat.chassis, 'bodyMounts').enabled = false;
  find(flat.chassis, 'fill').params.style = 'closed';
  for (const q of find(flat.chassis, 'outline').params.points) if (q[1] > 0) q[1] += 3; // wide enough to lie under the walls
  const plate = engine.build(flat), top = flat.car.clearance + find(flat.chassis, 'outline').params.thickness;
  assert.ok(engine.bodyClash({ body: at(0, top), parts: [plate.chassis] }).area < 1, 'a body standing on the plate');
  assert.ok(engine.bodyClash({ body: at(0, top - 0.6), parts: [plate.chassis] }).area > 20, 'a body sunk 0.6 mm into the plate');
  // Nothing to check against is no clash.
  assert.deepEqual(engine.bodyClash({ body: at(0), parts: [] }), { area: 0, depth: 0, at: null });
});
