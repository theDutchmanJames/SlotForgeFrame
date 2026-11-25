// The rear axle seats: spherical bushings in round sockets, and an axle tube through both uprights.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, find, cleanDesign, heights, checks, partsLayout, uprightSpread, tubeSpread, unconfirmed, couponHoles, podShift, podSideways, meshCentre, gearOf } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const faults = (out) => out.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title);
// The vertices of a mesh that lie within `r` of a point.
const near = (mesh, [x, y, z], r) => {
  const out = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const dist = Math.hypot(mesh.positions[i] - x, mesh.positions[i + 1] - y, mesh.positions[i + 2] - z);
    if (dist < r) out.push(dist);
  }
  return out;
};

test('a spherical bushing gets a round socket with a lip on both faces, and slits on the wheel side', () => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  assert.equal(up.form, 'straight', 'the straight seat stays the default');
  const plain = engine.build(d);
  up.form = 'sphere';
  const out = engine.build(d);
  assert.deepEqual(faults(out), []);
  const fix = d.printer.boreFix ?? d.printer.holeFix, R = (up.ballD + fix) / 2, ro = (up.opening + fix) / 2;
  const yo = uprightSpread(d) / 2, yc = yo - up.thick / 2, centre = [d.car.wheelbase, yc + podShift(d), d.car.clearance + heights(d).axle];
  // The socket's wall is round: its points lie on the ball's surface, none of the pod inside it.
  const pts = near(out.pod, centre, R + 0.6);
  assert.ok(pts.some((r) => Math.abs(r - R) < 0.03), 'the socket is the shape of the ball');
  assert.ok(pts.every((r) => r > ro - 0.03), 'nothing of the pod reaches into the ball or the axle');
  assert.ok(out.pod.volume !== plain.pod.volume);
  // The parts preview shows the two balls in the sockets.
  const balls = partsLayout(d).bushes;
  assert.equal(balls.length, 2);
  assert.ok(balls.every((b) => b.d === up.ballD && b.w === up.ballW && Math.abs(Math.abs(b.y - podShift(d)) - yc) < 1e-9));
  assert.ok(unconfirmed(d).includes('Spherical bushing size') && !unconfirmed(d).includes('Bearing seat'));
  // Fewer slits take away less of the lip.
  up.slits = 0;
  assert.ok(engine.build(d).pod.volume > out.pod.volume);
});

test('a spherical socket that cannot hold its ball, or the axle, says so', () => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  up.form = 'sphere';
  up.opening = 3.8;
  assert.ok(faults(engine.build(d)).includes('The ball can fall out of its socket'));
  up.opening = 2.4;
  assert.ok(faults(engine.build(d)).includes('The opening is too small for the axle'));
  up.opening = 3.2;
  up.thick = 2.2;
  assert.ok(faults(engine.build(d)).includes('The uprights are too thin for the ball'));
});

test('the spherical socket works on either rear wheel and with the pod moved over', () => {
  for (const drives of ['right', 'left']) {
    const d = newDesign();
    d.drivetrain.drives = drives;
    find(d.pod, 'uprights').params.form = 'sphere';
    find(d.pod, 'base').params.sideways = drives === 'right' ? -1 : 1;
    assert.deepEqual(faults(engine.build(d)), [], drives);
  }
});

// An anglewinder, set up as the app does when it is chosen.
function angled() {
  const d = newDesign();
  Object.assign(d.drivetrain, { layout: 'anglewinder', gear: 'si-aw-28-11', angle: null });
  d.drivetrain.centre = meshCentre(gearOf(d), 'anglewinder');
  find(d.pod, 'base').params.sideways = podSideways(d);
  return d;
}

test('an axle tube sets how far apart the uprights stand', () => {
  const d = angled(), up = find(d.pod, 'uprights').params;
  Object.assign(up, { tube: true, tubeLen: 31, tubeD: 4.6, bearing: 'universal', seat: 4.8 });
  find(d.pod, 'base').params.sideways = podSideways(d); // as the app does when the tube changes
  // Straight ends: the uprights are flush with them.
  assert.equal(uprightSpread(d), 31);
  let out = engine.build(d);
  assert.deepEqual(faults(out), []);
  const parts = partsLayout(d).bushes;
  assert.equal(parts.length, 3, 'the tube and its two ends');
  assert.ok(Math.abs(parts[0].w - (31 - up.thick)) < 1e-9, 'the tube runs between the middles of the uprights');
  assert.ok(checks(d).some((c) => c.ok && c.title === 'Axle tube 31 mm'));
  // Ball ends (a Combi Plus Monoblock): each socket sits round a ball, the length taken over the balls.
  Object.assign(up, { form: 'sphere', tubeLen: 29, tubeD: 3 });
  find(d.pod, 'base').params.sideways = podSideways(d);
  assert.equal(tubeSpread(up), 29 - up.ballW + up.thick);
  assert.equal(uprightSpread(d), tubeSpread(up));
  out = engine.build(d);
  assert.deepEqual(faults(out), []);
  assert.ok(unconfirmed(d).includes('Axle tube length'));
});

test('an axle tube is refused with an inline motor, and with a sidewinder can it is too short for', () => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  up.tube = true;
  d.drivetrain.layout = 'inline';
  assert.ok(checks(d).some((c) => !c.ok && c.title === 'An axle tube cannot pass the crown gear'));
  d.drivetrain.layout = 'sidewinder';
  up.tubeLen = 12;
  assert.ok(checks(d).some((c) => !c.ok && c.title === 'The axle tube is too short for the motor'));
});

test('the calibration coupon prints spherical sockets when the design uses them', () => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  up.form = 'sphere';
  const spec = couponHoles(d);
  assert.ok(spec.seat.sphere && spec.seat.d === up.ballD && /Spherical bushing/.test(spec.seat.name));
  const c = engine.coupon(d);
  assert.equal(c.pieces, 1);
  up.form = 'straight';
  assert.ok(engine.coupon(d).mesh.positions.length !== c.mesh.positions.length);
});

test('the seat settings survive a save and are kept in range', () => {
  const d = newDesign(), up = find(d.pod, 'uprights').params;
  Object.assign(up, { form: 'sphere', ballD: 4, ballW: 2.2, opening: 3.3, slits: 6, slitW: 0.5, tube: true, tubeLen: 32.5, tubeD: 3.1 });
  const back = find(cleanDesign(JSON.parse(JSON.stringify(d))).pod, 'uprights').params;
  for (const k of ['form', 'ballD', 'ballW', 'opening', 'slits', 'slitW', 'tube', 'tubeLen', 'tubeD']) assert.equal(back[k], up[k], k);
  const raw = JSON.parse(JSON.stringify(d));
  Object.assign(raw.pod.features.find((f) => f.type === 'uprights').params, { form: 'cone', slits: 2.6, tubeLen: 500 });
  const bad = find(cleanDesign(raw).pod, 'uprights').params;
  assert.deepEqual([bad.form, bad.slits, bad.tubeLen], ['straight', 3, 80]);
});
