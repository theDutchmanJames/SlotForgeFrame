// Flanged bearings and bushings: a flange against one face of each upright, sunk in or standing out.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, find, cleanDesign, heights, partsLayout, uprightSpread, unconfirmed, couponHoles, gearSide, motorSpread, useBearing, bearingOf, holderSize, BEARINGS } from '../src/model.js';
import { cleanComponent } from '../src/components.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const faults = (out) => out.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title);
const flangedDesign = (extra = {}) => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  up.bearing = 'bushing';
  useBearing(up, bearingOf(d, 'bushing'));
  Object.assign(up, extra);
  return { d, up };
};
// Points of the mesh on a ring round the axle: radius r, at y, within 0.03 mm.
const onRing = (mesh, wb, y, zc, r) => {
  const P = mesh.positions;
  for (let i = 0; i < P.length; i += 3)
    if (Math.abs(P[i + 1] - y) < 0.03 && Math.abs(Math.hypot(P[i] - wb, P[i + 2] - zc) - r) < 0.03) return true;
  return false;
};

test('the flanged bushing brings its flange, and any bearing can be given one', () => {
  const { d, up } = flangedDesign();
  assert.ok(up.flange && up.flangeD === BEARINGS.bushing.flangeD && up.flangeT === BEARINGS.bushing.flangeT);
  up.bearing = 'ball';
  useBearing(up, bearingOf(d, 'ball'));
  assert.equal(up.flange, false, 'a bearing without a flange turns it off');
  up.flange = true; // set by hand on any bearing
  assert.deepEqual(faults(engine.build(d)), []);
  assert.ok(unconfirmed(d).includes('Flange size'));
  // A bearing of your own carries a flange too, and its sizes are kept in range.
  const mine = cleanComponent('bearing', { name: 'Mine', seat: 5, width: 2, flangeD: 99, flangeT: 0.8 });
  assert.deepEqual([mine.flangeD, mine.flangeT], [30, 0.8]);
  assert.equal(cleanComponent('bearing', { name: 'Old' }).flangeD, 0, 'an old library bearing has no flange');
});

test('a sunk flange is cut as a recess in the wheel-side face, and the holder grows round it', () => {
  const plain = newDesign();
  find(plain.pod, 'uprights').params.bearing = 'bushing';
  find(plain.pod, 'uprights').params.seat = 4.9;
  const { d, up } = flangedDesign({ flangeD: 7.5, flangeT: 0.8 });
  const out = engine.build(d);
  assert.deepEqual(faults(out), []);
  assert.equal(holderSize(up), 7.5);
  const yo = uprightSpread(d) / 2, zc = d.car.clearance + heights(d).axle, wb = d.car.wheelbase, R = (up.flangeD + d.printer.boreFix) / 2;
  // The recess: the flange's ring at the bottom of it, a flange's thickness in from the outer face.
  for (const s of [1, -1]) assert.ok(onRing(out.pod, wb, s * (yo - up.flangeT), zc, R), 'the recess');
  up.flangeRecess = false;
  assert.ok(!onRing(engine.build(d).pod, wb, yo - up.flangeT, zc, R), 'no recess when the flange stands out');
  up.flangeRecess = true;
  assert.ok(couponHoles(d).seat.flange.d === 7.5);
  assert.notEqual(engine.coupon(d).mesh.positions.length, engine.coupon(plain).mesh.positions.length);
  // The flange shows with the bushing in the parts preview: inside the face when sunk.
  const discs = partsLayout(d).bushes.filter((b) => b.flange);
  assert.equal(discs.length, 2);
  assert.ok(discs.every((b) => Math.abs(Math.abs(b.y) - (yo - 0.4)) < 1e-9));
});

test('a flange standing out on the wheel side moves the gear out; on the motor side it needs the motor clear', () => {
  const { d, up } = flangedDesign({ flangeRecess: false });
  d.drivetrain.layout = 'sidewinder';
  const before = gearSide(d).y;
  up.flange = false;
  const without = gearSide(d).y;
  up.flange = true;
  assert.ok(Math.abs(before - without - up.flangeT) < 1e-9);
  assert.ok(partsLayout(d).bushes.filter((b) => b.flange).every((b) => Math.abs(b.y) > uprightSpread(d) / 2));
  // On the motor side the sidewinder's uprights stand further apart by the flanges.
  const spread = motorSpread(d);
  up.flangeAt = 'in';
  assert.ok(Math.abs(motorSpread(d) - spread - 2 * up.flangeT) < 1e-9 || motorSpread(d) === up.spread);
});

test('a flange that cannot work says so', () => {
  let { d, up } = flangedDesign({ flangeD: 5 });
  assert.ok(faults(engine.build(d)).includes('The flange is no bigger than the seat'));
  ({ d, up } = flangedDesign({ flangeT: 2.5 }));
  assert.ok(faults(engine.build(d)).includes('The upright is too thin for the flange recess'));
  ({ d, up } = flangedDesign({ flangeD: 25 }));
  assert.ok(faults(engine.build(d)).includes('The flange reaches into the pod floor'));
  // An axle tube or a spherical seat has no flange of its own.
  ({ d, up } = flangedDesign({ flangeD: 5, form: 'sphere' }));
  assert.ok(!faults(engine.build(d)).includes('The flange is no bigger than the seat'));
});

test('the flange settings survive a save and are kept in range', () => {
  const { d, up } = flangedDesign({ flangeD: 7, flangeT: 0.9, flangeAt: 'in', flangeRecess: false });
  const back = find(cleanDesign(JSON.parse(JSON.stringify(d))).pod, 'uprights').params;
  for (const k of ['flange', 'flangeD', 'flangeT', 'flangeAt', 'flangeRecess']) assert.equal(back[k], up[k], k);
  const raw = JSON.parse(JSON.stringify(d));
  Object.assign(raw.pod.features.find((f) => f.type === 'uprights').params, { flangeAt: 'top', flangeT: 40 });
  const bad = find(cleanDesign(raw).pod, 'uprights').params;
  assert.deepEqual([bad.flangeAt, bad.flangeT], ['out', 5]);
});
