import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { encodeSTL, layFlat } from '../src/geometry/stl.js';
import { newDesign, newShape, MULTI, find, GEARS, checks, decodeProject, encodeProject, summary, heights } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);

// A closed surface: every edge is used by exactly two triangles.
function watertight({ indices }) {
  const edges = new Map();
  for (let t = 0; t < indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k], b = indices[t + ((k + 1) % 3)];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  return [...edges.values()].every((n) => n === 2);
}
const bounds = ({ positions }) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  return { min, max };
};

test('the default 1/32 design builds two watertight parts', () => {
  const d = newDesign('1/32');
  const out = engine.build(d);
  for (const part of [out.chassis, out.pod]) {
    assert.ok(part.indices.length > 300);
    assert.ok(part.volume > 100);
    assert.ok(watertight(part));
  }
  const b = bounds(out.chassis);
  assert.ok(Math.abs(b.min[2] - d.car.clearance) < 1e-3, 'chassis underside sits at the ground clearance');
  assert.ok(Math.abs(b.min[1] + b.max[1]) < 1e-3, 'chassis is symmetric');
  assert.ok(Math.abs(bounds(out.pod).min[2] - d.car.clearance) < 1e-3, 'pod underside is flush with the chassis');
  assert.ok(out.notes.find((n) => n.title === 'Pod fits its opening')?.ok);
  assert.ok(out.notes.find((n) => n.title === 'Tyres clear the chassis')?.ok);
});

test('the default 1/24 design builds', () => {
  const out = engine.build(newDesign('1/24'));
  assert.ok(watertight(out.chassis) && watertight(out.pod));
  assert.ok(out.notes.find((n) => n.title === 'Pod fits its opening')?.ok);
});

test('every fill style builds, and a frame is lighter than a closed plate', () => {
  const volumes = {};
  for (const style of ['closed', 'open', 'frame', 'lattice']) {
    const d = newDesign();
    find(d.chassis, 'fill').params.style = style;
    const out = engine.build(d);
    assert.ok(watertight(out.chassis), style);
    volumes[style] = out.chassis.volume;
  }
  assert.ok(volumes.frame < volumes.closed * 0.8);
  assert.ok(volumes.lattice < volumes.closed);
});

test('every layout and holder builds', () => {
  for (const layout of ['inline', 'sidewinder', 'anglewinder'])
    for (const holder of ['closed', 'snap', 'clamp']) {
      const d = newDesign();
      d.drivetrain.layout = layout;
      d.drivetrain.gear = GEARS[layout][0].id;
      find(d.pod, 'uprights').params.holder = holder;
      const out = engine.build(d);
      assert.ok(watertight(out.pod), `${layout} ${holder}`);
      assert.ok(out.pod.volume > 100);
      assert.equal(out.notes.filter((n) => /pod is in|overlap/.test(n.title)).length, 0, `${layout} ${holder}: the pod is one piece and fits`);
      assert.equal(out.notes.filter((n) => /chassis is in/.test(n.title)).length, 0, `${layout} ${holder}: the chassis stays in one piece`);
    }
});

test('the kick-up raises the rear and can be switched off', () => {
  const d = newDesign();
  const up = bounds(engine.build(d).chassis).max[2];
  find(d.chassis, 'kickup').enabled = false;
  const flat = engine.build(d);
  assert.ok(watertight(flat.chassis));
  find(d.chassis, 'kickup').enabled = true;
  find(d.chassis, 'kickup').params.angle = 25;
  const steep = bounds(engine.build(d).chassis);
  assert.ok(steep.max[2] >= up);
  assert.ok(Math.abs(steep.min[2] - d.car.clearance) < 1e-3, 'strakes stop at the underside');
});

test('features can be switched off and moved', () => {
  const d = newDesign();
  for (const type of ['guide', 'frontAxle', 'podMounts', 'bodyMounts', 'podOpening']) find(d.chassis, type).enabled = false;
  assert.ok(watertight(engine.build(d).chassis));
  const e = newDesign();
  find(e.chassis, 'guide').params.along = -24;
  find(e.chassis, 'guide').params.side = 3;
  find(e.chassis, 'bodyMounts').params.posts.push({ along: 40, side: 27 });
  assert.ok(watertight(engine.build(e).chassis));
});

test('an empty outline is refused', () => {
  const d = newDesign();
  find(d.chassis, 'outline').params.points = [[0, 0], [10, 0]];
  assert.throws(() => engine.build(d), /outline/i);
});

test('the STL has one record per triangle and lies flat', () => {
  const out = engine.build(newDesign());
  const flat = layFlat(out.chassis);
  assert.ok(Math.abs(bounds(flat).min[2]) < 1e-4);
  const bytes = encodeSTL(flat);
  assert.equal(bytes.length, 84 + (out.chassis.indices.length / 3) * 50);
  assert.equal(new DataView(bytes.buffer).getUint32(80, true), out.chassis.indices.length / 3);
});

test('model: summary, heights, checks and project files', () => {
  const d = newDesign();
  const s = summary(d);
  assert.equal(s.wheelbase, 83.4);
  assert.ok(Math.abs(s.guideLead - 102.4) < 1e-9);
  assert.ok(Math.abs(heights(d).axle - 8.25) < 1e-9);
  assert.ok(checks(d).length >= 5);
  const back = decodeProject(encodeProject(d));
  const noIds = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' ? undefined : v)));
  assert.deepEqual(noIds(back.chassis), noIds(d.chassis));
  assert.throws(() => decodeProject('{"format":"other"}'), /not a SlotForge Frame file/);
  d.car.clearance = 6;
  assert.equal(checks(d).find((c) => /Motor/.test(c.title)).ok, false);
});

test('shaping features build, add or remove material, and stay one piece', () => {
  const plain = engine.build(newDesign());
  const cases = {
    rib: (v, b) => v > b, wall: (v, b) => v > b, tunnel: (v, b) => v > b, panel: (v, b) => v > b,
    level: (v, b) => v > b, window: (v, b) => v < b, rail: (v, b) => v > b,
  };
  for (const [type, expect] of Object.entries(cases)) {
    const d = newDesign();
    d.chassis.features.push(newShape(type, d));
    const out = engine.build(d);
    assert.ok(watertight(out.chassis), type);
    assert.ok(expect(out.chassis.volume, plain.chassis.volume), `${type} changes the volume the right way`);
    assert.equal(out.notes.filter((n) => /separate pieces/.test(n.title)).length, 0, `${type} is joined to the chassis`);
    assert.ok(Math.abs(bounds(out.chassis).min[1] + bounds(out.chassis).max[1]) < 1e-3, `${type} is mirrored`);
  }
});

test('a pocket sinks into the plate, an under-rib is reported, and all shapes build together', () => {
  const plain = engine.build(newDesign());
  const d = newDesign();
  const level = newShape('level', d);
  level.params.offset = -0.8;
  d.chassis.features.push(level);
  assert.ok(engine.build(d).chassis.volume < plain.chassis.volume);

  const e = newDesign();
  for (const type of MULTI) e.chassis.features.push(newShape(type, e));
  const rib = e.chassis.features.find((f) => f.type === 'rib');
  Object.assign(rib.params, { side: 'under', h0: 1, h1: 1 });
  const out = engine.build(e);
  assert.ok(watertight(out.chassis));
  assert.ok(out.notes.some((n) => /Lowest point/.test(n.title)));
  assert.ok(Math.abs(bounds(out.chassis).min[2] - (e.car.clearance - 1)) < 1e-3);
});
