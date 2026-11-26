// A motor mount built into the chassis (podless, as on metal chassis), and the front axle in bearings.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, newOnePieceDesign, find, gearsFor, builtIn, frontBearings, useFrontBearing, partsLayout, balance, BEARINGS, cleanDesign, encodeProject, decodeProject } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const podless = (scale, layout) => {
  const d = newDesign(scale);
  d.drivetrain.layout = layout;
  if (layout !== 'inline') d.drivetrain.gear = gearsFor(d)[0].id;
  find(d.pod, 'base').params.builtIn = true;
  return d;
};

test('built in, the chassis and its motor mount are one part, in every layout and scale', () => {
  for (const scale of ['1/32', '1/24']) for (const layout of ['inline', 'sidewinder', 'anglewinder']) {
    const d = podless(scale, layout), r = engine.build(d);
    assert.equal(r.pod, null, `${scale} ${layout}`);
    assert.ok(r.notes.some((n) => n.ok && n.title === 'Motor mount built in'), `${scale} ${layout}: one part`);
    // About as much plastic as the chassis and the pod were apart, less the lugs.
    find(d.pod, 'base').params.builtIn = false;
    const apart = engine.build(d), sum = apart.chassis && apart.pod ? volumeOf(apart.chassis) + volumeOf(apart.pod) : 0;
    assert.ok(r.volume > 0.8 * sum && r.volume < 1.1 * sum, `${scale} ${layout}: ${r.volume.toFixed(0)} against ${sum.toFixed(0)}`);
  }
});

test('the choice is kept in the file, and a split chassis is not split when built in', () => {
  const d = podless('1/24', 'anglewinder');
  assert.ok(builtIn(decodeProject(encodeProject(d))));
  assert.ok(!builtIn(cleanDesign({ ...JSON.parse(encodeProject(d)), pod: { features: [{ type: 'base', params: { builtIn: 'yes' } }] } })));
  find(d.chassis, 'split').enabled = true;
  const r = engine.build(d);
  assert.equal(r.split, null);
  assert.ok(r.notes.some((n) => n.title === 'Not split'));
});

test('the front axle runs in bearings: a seat from the library, a flange recess, and a check of the wall', () => {
  const d = newDesign('1/24'), fa = find(d.chassis, 'frontAxle').params;
  fa.mount = 'bearing';
  useFrontBearing(fa, BEARINGS.mf63);
  assert.deepEqual([fa.seat, fa.flange, fa.flangeD, fa.flangeT], [6, true, 7.2, 0.6]);
  assert.ok(frontBearings(d));
  const plain = engine.build(d);
  assert.ok(!plain.notes.some((n) => !n.ok), plain.notes.filter((n) => !n.ok).map((n) => n.title).join(', '));
  assert.equal(partsLayout(d).bushes.filter((b) => b.x === fa.along).length, 2, 'the bearings are drawn');
  fa.wall = 0.3;
  assert.ok(engine.build(d).notes.some((n) => /Thin wall round the front bearings/.test(n.title)));
  // In bearings, the front axle is always a through axle.
  fa.wall = 1.5; fa.independent = true;
  assert.equal(partsLayout(d).axles[0].inner, null);
});

test('the weight and its balance work without a pod: built in, and one piece', () => {
  for (const d of [podless('1/24', 'anglewinder'), newOnePieceDesign()]) {
    const b = balance(d, engine.build(d));
    assert.ok(b.printed > 1 && b.total >= b.printed && b.share > 0 && b.share < 100, JSON.stringify(b));
  }
});

function volumeOf(mesh) {
  const p = mesh.positions, t = mesh.indices;
  let v = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
