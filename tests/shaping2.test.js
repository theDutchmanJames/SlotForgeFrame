// Zoned and front kick-ups, the side profile, edge bevels and the split part.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine, kickAreas } from '../src/geometry/engine.js';
import { newDesign, find, checks, activeKicks, profileOf, cleanDesign, decodeProject, encodeProject } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);

function watertight({ indices }) {
  const edges = new Map();
  for (let t = 0; t < indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k], b = indices[t + ((k + 1) % 3)], key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  return [...edges.values()].every((n) => n === 2);
}
// The lowest and highest point of a mesh inside a box seen from above.
function span({ positions }, x0, x1, y0, y1) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    lo = Math.min(lo, positions[i + 2]);
    hi = Math.max(hi, positions[i + 2]);
  }
  return { lo, hi };
}
// The highest and lowest surface of a mesh straight above one spot (a flat plate has no corners
// in its middle, so this looks at the triangles, not the points).
function column({ positions: p, indices }, x, y) {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const d = (p[b + 1] - p[c + 1]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 1] - p[c + 1]);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((p[b + 1] - p[c + 1]) * (x - p[c]) + (p[c] - p[b]) * (y - p[c + 1])) / d;
    const v = ((p[c + 1] - p[a + 1]) * (x - p[c]) + (p[a] - p[c]) * (y - p[c + 1])) / d;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    const z = u * p[a + 2] + v * p[b + 2] + (1 - u - v) * p[c + 2];
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
  }
  return { lo, hi };
}
const whole = (out) => out.notes.filter((n) => /separate pieces|came out|falls into/.test(n.title)).length === 0;
// A plain closed plate without mounts, so heights are easy to read.
function plain() {
  const d = newDesign();
  find(d.chassis, 'fill').params.style = 'closed';
  for (const type of ['bodyMounts', 'guide', 'frontAxle']) find(d.chassis, type).enabled = false;
  return d;
}
const TOP = 2 + 1.5; // clearance + plate

test('a kick-up can lift only the centre, or only the sides', () => {
  // Two spots behind the fold (at 95.5): one on the centre line, one out at the side.
  const mid = (m) => column(m, 106, 0), edge = (m) => column(m, 106, 22);
  const d = plain(), kick = find(d.chassis, 'kickup').params;
  Object.assign(kick, { strakes: 0, zone: 'full' });
  const full = engine.build(d);
  assert.ok(edge(full.chassis).hi > TOP + 1 && mid(full.chassis).hi > TOP + 1, 'full width: all of the tail rises');

  Object.assign(kick, { zone: 'centre', zoneHalf: 12 });
  const centre = engine.build(d);
  assert.ok(mid(centre.chassis).hi > TOP + 1, 'the centre rises');
  assert.ok(Math.abs(edge(centre.chassis).hi - TOP) < 0.01, 'the sides stay flat');
  assert.ok(watertight(centre.chassis) && whole(centre));

  kick.zone = 'sides';
  const sides = engine.build(d);
  assert.ok(edge(sides.chassis).hi > TOP + 1, 'the sides rise');
  assert.ok(Math.abs(mid(sides.chassis).hi - TOP) < 0.01, 'the centre stays flat');
  assert.ok(watertight(sides.chassis) && whole(sides));

  // Strakes go under whatever rises, and reach the floor.
  Object.assign(kick, { zone: 'centre', strakes: 3, fillFloor: true });
  const straked = engine.build(d);
  assert.ok(straked.chassis.volume > centre.chassis.volume);
  assert.ok(Math.abs(span(straked.chassis, 100, 111, -11, 11).lo - 2) < 0.01, 'strakes stop at the underside');
  assert.ok(watertight(straked.chassis) && whole(straked));
  assert.deepEqual(kickAreas(d, 500), [[95.49, -12, 500, 12]]);
});

test('a front kick-up lifts the nose, alone or together with the rear one', () => {
  const d = plain(), front = find(d.chassis, 'kickfront');
  assert.equal(activeKicks(d).length, 1, 'only the rear kick-up is on to begin with');
  front.enabled = true;
  Object.assign(front.params, { fold: -14, angle: 15 });
  const out = engine.build(d);
  assert.ok(column(out.chassis, -26, 0).hi > TOP + 2, 'the nose rises');
  assert.ok(Math.abs(column(out.chassis, 20, 20).hi - TOP) < 0.01, 'the middle stays flat');
  assert.ok(column(out.chassis, 106, 0).hi > TOP + 1, 'the rear kick-up still works');
  assert.ok(watertight(out.chassis) && whole(out));
  assert.equal(activeKicks(d).length, 2);
  assert.ok(checks(d).some((n) => n.title === 'Front kick-up needs support' && !n.ok));
  front.params.fold = -200;
  assert.ok(engine.build(d).notes.some((n) => /Front kick-up fold is off the chassis/.test(n.title)));
});

test('a side profile raises the plate along a height line and keeps things upright', () => {
  const d = plain(), prof = find(d.chassis, 'profile');
  find(d.chassis, 'kickup').enabled = false;
  assert.equal(profileOf(d).points.length, 0, 'off to begin with');
  prof.enabled = true;
  prof.params.points = [[60, 3], [30, 0]]; // given out of order on purpose
  const lift = profileOf(d);
  assert.deepEqual(lift.points, [[30, 0], [60, 3]]);
  assert.equal(lift.at(0), 0);
  assert.equal(lift.at(45), 1.5);
  assert.equal(lift.at(200), 3);
  const out = engine.build(d);
  assert.ok(Math.abs(column(out.chassis, 20, 25).lo - 2) < 0.01, 'the front stays on its clearance');
  assert.ok(Math.abs(column(out.chassis, 45, 25).lo - 3.5) < 0.01, 'halfway up the slope it is 1.5 mm higher');
  assert.ok(Math.abs(column(out.chassis, 100, 10).lo - 5) < 0.01, 'the rear is 3 mm higher');
  assert.ok(Math.abs(column(out.chassis, 100, 10).hi - (TOP + 3)) < 0.01, 'and keeps its thickness');
  assert.ok(watertight(out.chassis) && whole(out));
  // Things standing on a sheared stretch stay upright: a body mount there keeps its width.
  const mounts = find(d.chassis, 'bodyMounts');
  mounts.enabled = true;
  mounts.params.posts = [{ along: 45, side: 25 }];
  const flat = JSON.parse(JSON.stringify(d));
  find(flat.chassis, 'profile').enabled = false;
  const width = (m) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i + 2] > 8.5 && m.positions[i + 1] > 0) { lo = Math.min(lo, m.positions[i]); hi = Math.max(hi, m.positions[i]); } return hi - lo; };
  const sheared = engine.build(d);
  assert.ok(Math.abs(width(sheared.chassis) - 6.6) < 0.05, 'the post is still 6.6 mm across at its top');
  assert.ok(checks(d).some((n) => n.title === 'Side profile needs support'));
  // A profile that does nothing is ignored, and an imported chassis has none.
  prof.params.points = [[30, 0], [60, 0]];
  assert.equal(profileOf(d).points.length, 0);
});

test('a bevel steps the plate edge in, top or bottom', () => {
  const d = plain(), o = find(d.chassis, 'outline').params;
  find(d.chassis, 'kickup').enabled = false;
  const square = engine.build(d);
  // A spot 0.2 mm inside the plate's straight side edge (the edge is at 30.5).
  const rim = (m) => column(m, 45, 30.3);
  o.bevelBottom = 0.6;
  const under = engine.build(d);
  assert.ok(under.chassis.volume < square.chassis.volume);
  assert.ok(Math.abs(rim(square.chassis).lo - 2) < 0.01 && Math.abs(rim(square.chassis).hi - TOP) < 0.01, 'a square edge is full height at the rim');
  assert.ok(rim(under.chassis).lo > 2.15, 'stepped in on the underside');
  assert.ok(Math.abs(rim(under.chassis).hi - TOP) < 0.01, 'full width on top');
  assert.ok(Math.abs(column(under.chassis, 45, 20).lo - 2) < 0.01 && Math.abs(column(under.chassis, 45, 20).hi - TOP) < 0.01, 'same thickness away from the edge');
  Object.assign(o, { bevelBottom: 0, bevelTop: 0.6 });
  const over = engine.build(d);
  assert.ok(rim(over.chassis).hi < TOP - 0.15 && Math.abs(rim(over.chassis).lo - 2) < 0.01, 'stepped in on top, square underneath');
  // A bevel can never eat the whole plate.
  Object.assign(o, { bevelBottom: 50, bevelTop: 50 });
  const both = engine.build(d);
  assert.ok(both.chassis.volume > square.chassis.volume * 0.5);
  for (const out of [under, over, both]) assert.ok(watertight(out.chassis) && whole(out));
  // It also works on a frame.
  find(d.chassis, 'fill').params.style = 'frame';
  Object.assign(o, { bevelBottom: 0.4, bevelTop: 0 });
  const frame = engine.build(d);
  assert.ok(watertight(frame.chassis) && whole(frame));
});

test('a split gives two parts that key together', () => {
  for (const style of ['closed', 'frame', 'lattice']) {
    const d = newDesign(), sp = find(d.chassis, 'split');
    find(d.chassis, 'fill').params.style = style;
    assert.equal(engine.build(d).split, null, 'no split unless asked for');
    sp.enabled = true;
    Object.assign(sp.params, { along: 30, tabs: 2, spread: 22 });
    const out = engine.build(d);
    assert.ok(out.split, style);
    const { front, rear } = out.split;
    assert.ok(watertight(front) && watertight(rear), `${style}: both parts are closed`);
    assert.ok(out.notes.find((n) => n.title === 'The chassis prints in two parts')?.ok, `${style}: each part is one piece`);
    assert.ok(front.volume > 100 && rear.volume > 100);
    // Together they are the chassis, less the play in the joint.
    const lost = out.chassis.volume - front.volume - rear.volume;
    assert.ok(lost > 0 && lost < out.chassis.volume * 0.03, `${style}: only the joint's play is missing (${lost.toFixed(1)} mm³)`);
    // The rear part reaches forward by the depth of its keys; the front part ends just short of the cut.
    const xs = (m) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < m.positions.length; i += 3) { lo = Math.min(lo, m.positions[i]); hi = Math.max(hi, m.positions[i]); } return [lo, hi]; };
    assert.ok(Math.abs(xs(rear)[0] - (30 - 4)) < 0.01, 'keys reach 4 mm forward');
    assert.ok(Math.abs(xs(front)[1] - (30 - 0.15)) < 0.01, 'the front stops at the cut, less the play');
  }
  // Switched on as it comes, at either scale, the split lands on solid plate.
  for (const scale of ['1/32', '1/24']) {
    const e = newDesign(scale);
    find(e.chassis, 'split').enabled = true;
    assert.ok(engine.build(e).notes.find((n) => n.title === 'The chassis prints in two parts')?.ok, `${scale}: the default cut works`);
  }
  // A cut that misses the chassis is reported.
  const d = newDesign(), sp = find(d.chassis, 'split');
  sp.enabled = true;
  sp.params.along = 400;
  const out = engine.build(d);
  assert.equal(out.split, null);
  assert.ok(out.notes.some((n) => /split leaves one part empty/.test(n.title)));
});

test('the new settings survive a file and are tamed when a file is odd', () => {
  const d = newDesign();
  Object.assign(find(d.chassis, 'kickup').params, { zone: 'centre', zoneHalf: 9 });
  find(d.chassis, 'profile').enabled = true;
  find(d.chassis, 'profile').params.points = [[10, 0], [40, 2], [80, 2]];
  find(d.chassis, 'split').enabled = true;
  Object.assign(find(d.chassis, 'outline').params, { bevelTop: 0.3, bevelBottom: 0.5 });
  const back = decodeProject(encodeProject(d));
  assert.equal(find(back.chassis, 'kickup').params.zone, 'centre');
  assert.deepEqual(find(back.chassis, 'profile').params.points, [[10, 0], [40, 2], [80, 2]]);
  assert.equal(find(back.chassis, 'split').enabled, true);
  assert.equal(find(back.chassis, 'outline').params.bevelBottom, 0.5);
  // An older file has none of them: they come back switched off.
  const raw = JSON.parse(encodeProject(newDesign()));
  raw.chassis.features = raw.chassis.features.filter((f) => !['profile', 'kickfront', 'split'].includes(f.type));
  delete raw.chassis.features.find((f) => f.type === 'kickup').params.zone;
  const old = cleanDesign(raw);
  for (const type of ['profile', 'kickfront', 'split']) assert.equal(find(old.chassis, type).enabled, false, type);
  assert.equal(find(old.chassis, 'kickup').params.zone, 'full');
  // Odd values.
  raw.chassis.features.push({ type: 'split', enabled: true, params: { tabs: 900, play: -3, depth: 0, along: 'x' } }, { type: 'kickfront', enabled: true, params: { zone: 'everywhere', angle: 500 } });
  const odd = cleanDesign(raw), sp = find(odd.chassis, 'split').params;
  assert.ok(sp.tabs === 8 && sp.play === 0 && sp.depth === 1 && Number.isFinite(sp.along));
  assert.equal(find(odd.chassis, 'kickfront').params.zone, 'full');
  assert.ok(engine.build(odd).chassis.volume > 100);
});
