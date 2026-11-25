// Regression tests for defects found in code review (24 November 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { encodeSTL } from '../src/geometry/stl.js';
import { readSTL, orient } from '../src/geometry/stl-read.js';
import { pickMounts } from '../src/geometry/mesh-measure.js';
import {
  newDesign, newShape, MULTI, GEARS, find, checks, cleanDesign, createHistory, partsLayout, motorPlace, pinionOut, motorAngle, gearOf, gearSide, uprightSpread, meshCentre, kickActive, podLayout,
} from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);

// A build either gives two real parts or says clearly why not. It never hands back an empty part.
function buildOrRefuse(d, label) {
  let out;
  try {
    out = engine.build(d);
  } catch (e) {
    assert.match(e.message, /came out empty|outline has no area/, `${label}: refused with a clear reason`);
    return null;
  }
  assert.ok(out.chassis.volume > 0.5 && out.chassis.indices.length > 0, `${label}: the chassis is not empty`);
  assert.ok(out.pod.volume > 0.5 && out.pod.indices.length > 0, `${label}: the pod is not empty`);
  return out;
}

test('a single zero or impossible size never erases a part', () => {
  const cases = {
    'head recess of zero': (d) => { find(d.chassis, 'bodyMounts').params.recessD = 0; },
    'a level off the plate': (d) => { const f = newShape('level', d); Object.assign(f.params, { x0: 500, x1: 520, y0: 100, y1: 120 }); d.chassis.features.push(f); },
    'a level of no size': (d) => { const f = newShape('level', d); Object.assign(f.params, { x0: 40, x1: 40, y0: 20, y1: 20 }); d.chassis.features.push(f); },
    'a sunk level off the plate': (d) => { const f = newShape('level', d); Object.assign(f.params, { x0: 500, x1: 520, offset: -1 }); d.chassis.features.push(f); },
    'a tunnel wall thicker than the tunnel': (d) => { const f = newShape('tunnel', d); Object.assign(f.params, { wall: 3, height: 2 }); d.chassis.features.push(f); },
    'a tunnel of no height': (d) => { const f = newShape('tunnel', d); f.params.height = 0; d.chassis.features.push(f); },
    'a tunnel of no length': (d) => { const f = newShape('tunnel', d); f.params.x1 = f.params.x0; d.chassis.features.push(f); },
    'uprights thicker than their spread': (d) => { find(d.pod, 'uprights').params.thick = 16; },
    'a hole fix of -2': (d) => { d.printer.holeFix = -2; },
    'a tiny hole with a negative fix': (d) => { d.printer.holeFix = -1; find(d.chassis, 'podMounts').params.hole = 0.5; find(d.chassis, 'frontAxle').params.grub = 0.1; },
    'a kick-up of 90 degrees': (d) => { find(d.chassis, 'kickup').params.angle = 90; },
    'a window of no size': (d) => { const f = newShape('window', d); f.params.x1 = f.params.x0; d.chassis.features.push(f); },
    'a rib of no length or height': (d) => { const f = newShape('rib', d); Object.assign(f.params, { points: [[40, 22], [40, 22]], h0: 0, h1: 0 }); d.chassis.features.push(f); },
    'a panel of no size': (d) => { const f = newShape('panel', d); Object.assign(f.params, { width: 0, height: 0 }); d.chassis.features.push(f); },
    'a wall of no height': (d) => { const f = newShape('wall', d); f.params.height = 0; d.chassis.features.push(f); },
    'a guide with no boss': (d) => { Object.assign(find(d.chassis, 'guide').params, { bossD: 0, bossH: 0, padD: 0 }); },
    'lugs of no size': (d) => { Object.assign(find(d.pod, 'lugs').params, { lugD: 0, lugT: 0 }); },
    'a base of no thickness': (d) => { find(d.pod, 'base').params.thickness = 0; },
  };
  const plain = engine.build(newDesign());
  for (const [label, change] of Object.entries(cases)) {
    const d = newDesign();
    change(d);
    const out = buildOrRefuse(d, label);
    if (out && !/base of no thickness|uprights|lugs/.test(label)) assert.ok(out.chassis.volume > plain.chassis.volume * 0.5, `${label}: the chassis is still whole`);
  }
});

test('every setting at the lowest and highest value a file may carry still builds', () => {
  for (const extreme of [-1e9, 1e9]) {
    const base = newDesign();
    for (const type of MULTI) base.chassis.features.push(newShape(type, base));
    const all = [...base.chassis.features, ...base.pod.features];
    for (const f of all)
      for (const [key, value] of Object.entries(f.params)) {
        if (typeof value !== 'number') continue;
        const raw = JSON.parse(JSON.stringify(base));
        const target = [...raw.chassis.features, ...raw.pod.features].find((x) => x.id === f.id);
        target.params[key] = extreme;
        buildOrRefuse(cleanDesign(raw), `${f.type}.${key} = ${extreme}`);
      }
    for (const [group, key] of [['printer', 'holeFix'], ['printer', 'minWall'], ['car', 'wheelbase'], ['car', 'clearance'], ['car', 'axleD'], ['drivetrain', 'offset'], ['drivetrain', 'shiftX'], ['drivetrain', 'shiftY']]) {
      const raw = JSON.parse(JSON.stringify(base));
      raw[group][key] = extreme;
      buildOrRefuse(cleanDesign(raw), `${group}.${key} = ${extreme}`);
    }
  }
});

test('a sidewinder pinion meets its gear, and the motor leaves the bearing holders whole', () => {
  for (const scale of ['1/32', '1/24'])
    for (const motor of ['fc130', 'ff050']) {
      const d = newDesign(scale);
      Object.assign(d.drivetrain, { layout: 'sidewinder', motor, gear: GEARS.sidewinder[0].id, centre: meshCentre(GEARS.sidewinder[0]) });
      const parts = partsLayout(d), side = gearSide(d);
      // The pinion is longer than the gear's toothed disc is thick, and reaches across all of it.
      assert.ok(Math.abs(parts.pinion.y - parts.gear.y) <= (parts.pinion.length - parts.gear.width) / 2 + 0.01, `${scale} ${motor}: the pinion covers the gear's teeth`);
      assert.ok(side.y > uprightSpread(d) / 2, 'the gear runs outside the bearing holders');
      assert.ok(Math.abs(d.car.wheelbase - parts.pinion.x - meshCentre(GEARS.sidewinder[0])) < 1e-6, 'at the distance the gears ask for');
      const out = engine.build(d), notes = [...checks(d), ...out.notes];
      assert.ok(notes.find((n) => n.title === 'Pinion meets the gear')?.ok, `${scale} ${motor}: the check agrees`);
      assert.equal(notes.filter((n) => /bearing holder|overlap/.test(n.title)).length, 0, `${scale} ${motor}: holders untouched, pod fits`);
    }
  // A wrong distance is reported.
  const d = newDesign();
  Object.assign(d.drivetrain, { layout: 'sidewinder', gear: GEARS.sidewinder[0].id, centre: 14 });
  assert.equal(checks(d).find((n) => /Pinion/.test(n.title)).ok, false);
});

test('an anglewinder pinion is set beside the gear, and every layout fits its opening', () => {
  const d = newDesign('1/24');
  Object.assign(d.drivetrain, { layout: 'anglewinder', gear: GEARS.anglewinder[0].id });
  const parts = partsLayout(d);
  assert.ok(Math.abs(parts.gear.y - parts.pinion.y - 0.4) < 0.01, 'the pinion lies just inside the crown');
  for (const scale of ['1/32', '1/24'])
    for (const layout of ['inline', 'sidewinder', 'anglewinder']) {
      const e = newDesign(scale);
      Object.assign(e.drivetrain, { layout, gear: GEARS[layout][0].id });
      const out = engine.build(e);
      assert.ok(out.notes.find((n) => n.title === 'Pod fits its opening')?.ok, `${scale} ${layout}`);
      assert.equal(out.notes.filter((n) => /pod is in/.test(n.title)).length, 0, `${scale} ${layout}: the pod is one piece`);
    }
});

test('a 1/32 anglewinder sits where the measured example pod has its motor, and the chassis stays whole', () => {
  // Measured on the example anglewinder pod (AW.stl): motor centre 18.4 mm ahead of the rear axle
  // and 3.5 mm to the gear's side, shaft at 24.8 degrees to the axle; its pinion 11.6 mm ahead of the axle.
  const d = newDesign();
  Object.assign(d.drivetrain, { layout: 'anglewinder', gear: 'si-aw-28-11', centre: meshCentre(GEARS.anglewinder[0], 'anglewinder') });
  const place = motorPlace(d), parts = partsLayout(d);
  assert.ok(Math.abs(d.car.wheelbase - place.x - 18.4) < 0.6, `motor ${(d.car.wheelbase - place.x).toFixed(2)} mm ahead of the axle`);
  assert.ok(Math.abs(place.y - 3.5) < 0.6, `motor ${place.y.toFixed(2)} mm to the gear's side`);
  assert.equal(90 - place.angle, 25);
  assert.ok(Math.abs(d.car.wheelbase - parts.pinion.x - 11.6) < 0.6);
  assert.ok(parts.gear.y + parts.gear.width / 2 < d.car.rear.inOut - d.car.rear.tyreW / 2 + 0.01, 'the crown runs inboard of the rear tyre');
  for (const motor of ['fc130', 'ff050']) {
    d.drivetrain.motor = motor;
    const rows = [...checks(d), ...engine.build(d).notes].filter((r) => !r.ok && !r.soft && r.title !== 'The chassis is open beside the gear').map((r) => r.title);
    assert.deepEqual(rows, [], `${motor}: one piece, pod fits, pinion meets the gear`);
  }
  // Moving the motor along is reported.
  d.drivetrain.shiftX = 2;
  assert.equal(checks(d).find((r) => /Pinion/.test(r.title)).ok, false);
});

test('a shallow anglewinder has its pinion further out, so the can clears the bearing holders', () => {
  const place = (gear, motor = 'fc130', scale = '1/32') => {
    const d = newDesign(scale), g = GEARS.anglewinder.find((x) => x.id === gear);
    Object.assign(d.drivetrain, { layout: 'anglewinder', motor, gear, centre: meshCentre(g, 'anglewinder') });
    return { d, out: pinionOut(d), parts: partsLayout(d), notes: [...checks(d), ...engine.build(d).notes] };
  };
  // The measured 25 degree pod: pinion 3.5 mm from the can, as before.
  assert.equal(place('si-aw-28-11').out, 3.5);
  // NSR at 15 and Sloting Plus at 11 degrees: further out, but still on the shaft (9.4 mm of it, a 5 mm pinion).
  const nsr = place('nsr-aw-31-13'), sp = place('sp-aw-29-12');
  assert.ok(nsr.out > 3.5 && nsr.out <= 6.9, `NSR: ${nsr.out} mm`);
  assert.ok(sp.out > nsr.out && sp.out <= 6.9, `the shallower the angle, the further out (${sp.out} mm)`);
  for (const { d, parts, notes } of [nsr, sp, place('nsr-aw-31-13', 'ff050'), place('brm24-aw-41-11', 'fk180', '1/24')]) {
    // Wherever the pinion sits on the shaft, it still meets the gear.
    assert.ok(Math.abs(parts.gear.y - parts.pinion.y - 0.4) < 0.01);
    assert.ok(Math.abs(d.car.wheelbase - parts.pinion.x - meshCentre(gearOf(d), 'anglewinder')) < 0.01);
    assert.deepEqual(notes.filter((n) => !n.ok && !n.soft && n.title !== 'The chassis is open beside the gear').map((n) => n.title), [], `${d.drivetrain.gear} with ${d.drivetrain.motor}: no faults`);
  }
  // Without bearing holders there is nothing to clear: the pinion stays by the can.
  const bare = newDesign();
  Object.assign(bare.drivetrain, { layout: 'anglewinder', gear: 'sp-aw-29-12' });
  find(bare.pod, 'uprights').enabled = false;
  assert.equal(pinionOut(bare), 3.5);
  // An inline or sidewinder motor is not touched by any of this.
  assert.equal(pinionOut(newDesign()), 3.5);
});

test('the anglewinder angle can be set by hand, and the app says when it differs from the gears', () => {
  const d = newDesign();
  Object.assign(d.drivetrain, { layout: 'anglewinder', gear: 'si-aw-28-11', centre: meshCentre(GEARS.anglewinder[0], 'anglewinder') });
  assert.equal(d.drivetrain.angle, null, 'not set: the motor follows the gears');
  assert.equal(motorAngle(d), 25);
  assert.equal(90 - motorPlace(d).angle, 25);
  const flat = motorPlace(d), wide = podLayout(d).widest;
  // Set it to 18 degrees: the motor turns, and so does the pod around it.
  d.drivetrain.angle = 18;
  assert.equal(motorAngle(d), 18);
  assert.equal(90 - motorPlace(d).angle, 18);
  assert.notDeepEqual(motorPlace(d), flat);
  assert.ok(podLayout(d).widest < wide, 'a motor lying flatter makes a narrower pod');
  const out = engine.build(d), rows = [...checks(d), ...out.notes];
  assert.ok(out.pod.volume > 100);
  assert.equal(rows.find((r) => r.title === 'Motor angle differs from the gears')?.ok, false, 'the mismatch with 25 degree gears is reported');
  assert.equal(rows.filter((r) => !r.ok && !r.soft && r.title !== 'The chassis is open beside the gear').length, 1, 'and it is the only fault: the pod still fits');
  // The pinion still lies against the gear, whatever the angle.
  const parts = partsLayout(d);
  assert.ok(Math.abs(parts.gear.y - parts.pinion.y - 0.4) < 0.01 && Math.abs(d.car.wheelbase - parts.pinion.x - d.drivetrain.centre) < 0.01);
  // Half a degree either way is not worth a warning.
  d.drivetrain.angle = 25.4;
  assert.ok(!checks(d).some((r) => /angle differs/.test(r.title)));
  // In files: kept when set, tamed when wild, and absent means "follow the gears" (also for older files).
  d.drivetrain.angle = 18;
  assert.equal(cleanDesign(JSON.parse(JSON.stringify(d))).drivetrain.angle, 18);
  assert.equal(cleanDesign({ ...JSON.parse(JSON.stringify(d)), drivetrain: { ...d.drivetrain, angle: 400 } }).drivetrain.angle, 45);
  const old = JSON.parse(JSON.stringify(d));
  delete old.drivetrain.angle;
  old.drivetrain.gear = 'nsr-aw-31-13';
  const back = cleanDesign(old);
  assert.equal(back.drivetrain.angle, null);
  assert.equal(motorAngle(back), 15, 'an older file with NSR gears keeps their 15 degrees');
  // A sidewinder or inline design ignores the setting.
  const sw = newDesign();
  Object.assign(sw.drivetrain, { layout: 'sidewinder', gear: 'si-sw-34-11', angle: 30 });
  assert.equal(motorPlace(sw).angle, 90);
  assert.ok(!checks(sw).some((r) => /angle differs/.test(r.title)));
});

test('an imported pod sets the size of the chassis mount holes', () => {
  const src = newDesign();
  const stood = orient(readSTL(encodeSTL(engine.build(src).pod)));
  const info = engine.analyse(stood), mounts = pickMounts(info.holes);
  engine.setMesh({ key: 'rv-pod', ...stood });
  const volume = (holeD) => {
    const d = newDesign();
    d.pod.imported = { mesh: 'rv-pod', name: 'x', mounts: mounts.map((m) => [m.x, m.y]), holeD, axleX: Math.max(...mounts.map((m) => m.x)) - 6.6, axleZ: 8.25, box: [0, info.size[0], info.size[1]] };
    return engine.build(d).chassis.volume;
  };
  assert.ok(volume(1.0) > volume(4.0) + 5, 'bigger holes remove more of the chassis');
  assert.deepEqual(engine.dropMesh({ key: 'rv-pod' }), { dropped: true });
  assert.deepEqual(engine.dropMesh({ key: 'rv-pod' }), { dropped: false });
});

test('the default design is ready to print: no faults, only reminders', () => {
  for (const scale of ['1/32', '1/24']) {
    const d = newDesign(scale), rows = [...checks(d), ...engine.build(d).notes];
    assert.deepEqual(rows.filter((r) => !r.ok && !r.soft).map((r) => r.title), [], scale);
    assert.ok(rows.find((r) => /Kick-up is carried/.test(r.title))?.ok);
    assert.ok(rows.some((r) => r.soft && /test-fit/.test(r.title)), 'unconfirmed values stay visible as a reminder');
  }
  const d = newDesign();
  find(d.chassis, 'kickup').params.fillFloor = false;
  assert.equal(checks(d).find((r) => /Kick-up/.test(r.title)).ok, false, 'a kick-up nothing carries is a fault');
});

test('a long car is not clipped', () => {
  const d = cleanDesign({ ...newDesign(), car: { ...newDesign().car, wheelbase: 5000 } });
  assert.equal(d.car.wheelbase, 300, 'the wheelbase a file may carry is capped');
  // The default outline belongs to an 83.4 mm car; move its rear with the axle, as the app does.
  const by = 300 - 83.4;
  for (const p of find(d.chassis, 'outline').params.points) if (p[0] > 40) p[0] += by;
  find(d.chassis, 'kickup').params.fold += by;
  const out = engine.build(d), plain = engine.build(newDesign());
  assert.ok(Math.abs(out.pod.volume - plain.pod.volume) < 1, 'the pod is whole at the far end');
  assert.ok(out.chassis.volume > plain.chassis.volume, 'and so is the chassis');
});

test('a kick-up that does nothing leaves the fill alone', () => {
  const off = newDesign(), flat = newDesign();
  find(off.chassis, 'kickup').enabled = false;
  find(flat.chassis, 'kickup').params.angle = 0;
  assert.equal(kickActive(flat), false);
  assert.ok(Math.abs(engine.build(off).chassis.volume - engine.build(flat).chassis.volume) < 0.01);
  const imp = newDesign();
  imp.chassis.imported = { mesh: 'k', name: 'x', frontX: 0, size: [1, 1, 1] };
  assert.equal(kickActive(imp), false, 'an imported chassis is never kicked up');
});

test('undo history can be emptied, so it never reaches into another design', () => {
  const h = createHistory();
  h.push('a');
  h.push('b');
  assert.equal(h.undo('c'), 'b');
  assert.ok(h.canUndo && h.canRedo);
  h.clear();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo('c'), null);
});

test('a pod base follows a motor that lies across the car', () => {
  const d = newDesign();
  Object.assign(d.drivetrain, { layout: 'anglewinder', gear: GEARS.anglewinder[0].id });
  const lay = podLayout(d);
  assert.equal(lay.seatFoot.length, 4);
  assert.ok(lay.widest > lay.width, 'wider at the motor than at the axle');
  assert.equal(podLayout(newDesign()).seatFoot, null, 'an inline pod stays a plain rectangle');
});

test('a rear tyre that reaches the pod is reported', () => {
  const d = newDesign();
  assert.equal(engine.build(d).notes.some((n) => /tyre touches the pod/.test(n.title)), false);
  d.car.rear.inOut = 17; // wheels pulled far in: the tyres now lie over the bearing holders
  assert.ok(engine.build(d).notes.some((n) => /tyre touches the pod/.test(n.title)));
});
