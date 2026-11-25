// More rear axle seats: two flanges with the upright between them, eccentric bushings, and a shoulder.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, find, cleanDesign, useBearing, bearingOf, partsLayout, motorSpread, BEARINGS } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const faults = (out) => out.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title);
const withBearing = (id, extra = {}) => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  up.bearing = id;
  useBearing(up, bearingOf(d, id));
  Object.assign(up, extra);
  return { d, up };
};

test('the makers\' flanged ball bearings bring their flanges, at the catalogue sizes', () => {
  const { d, up } = withBearing('fr133zz');
  assert.deepEqual([up.seat, up.flange, up.flangeD, up.flangeT], [4.76, true, 5.94, 0.79]);
  assert.equal(BEARINGS.mf63.flangeD, 7.2);
  assert.deepEqual(faults(engine.build(d)), []);
});

test('two flanges hold the upright between them, standing out of both faces', () => {
  const d0 = newDesign(), b = { ...bearingOf(d0, 'fr133zz'), flanges: 2 };
  const { d, up } = withBearing('fr133zz');
  useBearing(up, b);
  assert.equal(up.flangeAt, 'both');
  assert.equal(up.flangeRecess, false);
  // The parts preview shows a flange on each face of both uprights.
  assert.equal(partsLayout(d).bushes.filter((x) => x.flange).length, 4);
  // An upright thicker than the gap between the flanges cannot be held: so it says.
  up.thick = 3;
  assert.ok(faults(engine.build(d)).includes('The upright is thicker than the gap between the flanges'));
  up.thick = b.width;
  assert.ok(!faults(engine.build(d)).includes('The upright is thicker than the gap between the flanges'));
  // A sidewinder's uprights move apart for the flanges on the motor side.
  d.drivetrain.layout = 'sidewinder';
  const both = motorSpread(d);
  up.flangeAt = 'out';
  assert.ok(both > motorSpread(d) || both === up.spread);
  // A bearing with one flange puts the flange back on one side.
  useBearing(up, bearingOf(d, 'fr133zz'));
  assert.notEqual(up.flangeAt, 'both');
});

test('an eccentric bushing gets a mark to set it against, and the offset comes with the bushing', () => {
  const { d, up } = withBearing('ecc06');
  assert.equal(up.ecc, 0.6);
  const marked = engine.build(d).pod.volume;
  up.eccMark = false;
  assert.ok(engine.build(d).pod.volume > marked, 'the mark is a groove cut into each upright');
  useBearing(up, bearingOf(d, 'ball'));
  assert.equal(up.ecc, 0, 'a plain bearing has no offset');
});

test('a shoulder stops a bearing without a flange from sliding in', () => {
  const { d, up } = withBearing('ball', { thick: 3.4 });
  const plain = engine.build(d).pod.volume;
  up.shoulder = true;
  const out = engine.build(d);
  assert.deepEqual(faults(out), []);
  assert.ok(out.pod.volume > plain, 'material is left behind the bearing');
  up.thick = 2.6;
  assert.ok(faults(engine.build(d)).includes('No room for a shoulder'));
});

test('the new seat settings survive a save and are kept in range', () => {
  const { d, up } = withBearing('ecc03', { flangeAt: 'both', ecc: 0.3, eccMark: false, shoulder: true });
  const back = find(cleanDesign(JSON.parse(JSON.stringify(d))).pod, 'uprights').params;
  for (const k of ['flangeAt', 'ecc', 'eccMark', 'shoulder']) assert.equal(back[k], up[k], k);
  const raw = JSON.parse(JSON.stringify(d));
  Object.assign(raw.pod.features.find((f) => f.type === 'uprights').params, { flangeAt: 'middle', ecc: 9 });
  const bad = find(cleanDesign(raw).pod, 'uprights').params;
  assert.deepEqual([bad.flangeAt, bad.ecc], ['out', 2]);
});
