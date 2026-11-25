// Components: the built-in tables, your own entries, and how a design carries them.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { KINDS, COMPONENT_KINDS, DESIGN_KINDS, builtins, cleanComponent, MOTORS, GEARS, RULESETS, CARS, PRINTERS, MATERIALS } from '../src/components.js';
import { cleanItem, encodeShare, decodeShare } from '../src/library-core.js';
import {
  newDesign, find, adopt, motorOf, gearOf, gearsFor, bearingOf, guideOf, choicesFor, customUsed, moveRear, meshCentre, unconfirmed, cleanDesign, cleanPart,
  decodeProject, encodeProject, podLayout, summary,
} from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const noIds = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' ? undefined : v)));

test('every built-in entry is a valid component of its kind', () => {
  for (const kind of COMPONENT_KINDS) {
    const list = builtins(kind);
    assert.ok(list.length >= 3, `${kind}: there are built-in entries`);
    assert.equal(new Set(list.map((c) => c.id)).size, list.length, `${kind}: ids are unique`);
    for (const { id, ...values } of list) {
      // Cleaning must change nothing: every number is within its limits and every choice is a real one.
      const clean = cleanComponent(kind, values);
      for (const key of Object.keys(clean)) assert.deepEqual(clean[key], values[key] ?? (key === 'confirmed' ? false : values[key]), `${kind} ${id}: ${key}`);
      assert.ok(KINDS[kind].line(clean).length > 3);
    }
  }
  // The tables agree with each other.
  for (const p of Object.values(PRINTERS)) assert.ok(MATERIALS[p.material], 'a printer names a real material');
  for (const [layout, list] of Object.entries(GEARS)) for (const g of list) assert.ok(layout !== 'anglewinder' || g.angle > 0, `${g.id} has an angle`);
  assert.ok(Object.values(CARS).some((c) => c.scale === '1/24') && Object.values(RULESETS).some((r) => r.maxWidth > 80));
});

test('a component from a file is checked: known fields, sane numbers, plain name', () => {
  const m = cleanComponent('motor', { name: '<b>Fast</b>'.repeat(30), length: 1e9, width: 'wide', height: -3, shaftD: NaN, extra: 'x', confirmed: 'yes', __proto__: { evil: 1 } });
  assert.ok(m.name.length <= 80);
  assert.equal(m.length, 80);
  assert.equal(m.width, MOTORS.fc130.width, 'a missing or wrong value takes the default');
  assert.equal(m.height, 5);
  assert.equal(m.shaftD, 2);
  assert.equal(m.confirmed, false, 'only a real yes counts as confirmed');
  assert.equal(m.extra, undefined);
  assert.equal(m.evil, undefined);
  const g = cleanComponent('gear', { layout: 'upside-down', gearT: 33.6, pinionT: 2, angle: 90 });
  assert.equal(g.layout, 'sidewinder');
  assert.equal(g.gearT, 34);
  assert.equal(g.pinionT, 5);
  assert.equal(g.angle, 45);
  assert.equal(cleanComponent('printer', { material: 'cheese' }).material, 'petg');
  assert.equal(cleanComponent('printer', {}).confirmed, undefined, 'a printer profile has nothing to confirm');
  assert.equal(cleanComponent('car', { scale: '1/43', wheelbase: 5 }).wheelbase, 20);
  assert.throws(() => cleanComponent('spaceship', {}), /not a known kind/);
});

test('a design carries its own motor, and the pod is built around it', () => {
  const d = newDesign(), plain = engine.build(d);
  adopt(d, 'motor', 'mine1', { ...MOTORS.fc130, name: 'My long motor', length: 30, width: 21, confirmed: false });
  d.drivetrain.motor = 'mine1';
  assert.equal(motorOf(d).length, 30);
  assert.match(choicesFor(d, 'motor').mine1, /My long motor · 30 × 21/);
  assert.ok(unconfirmed(d).includes('Motor sizes'));
  const out = engine.build(d);
  // The motor's window in the pod floor is as long as the motor, plus play.
  const span = (rings) => Math.max(...rings.flat().map((p) => p[0])) - Math.min(...rings.flat().map((p) => p[0]));
  assert.ok(Math.abs(span(out.top.window) - 30.6) < 0.01);
  assert.ok(Math.abs(span(plain.top.window) - 25.6) < 0.01);
  // It travels in the project file, and is cleaned on the way in.
  const back = decodeProject(encodeProject(d));
  assert.deepEqual(back.custom, d.custom);
  assert.equal(motorOf(back).name, 'My long motor');
  // Without its motor the design falls back to the default one instead of failing.
  const raw = JSON.parse(encodeProject(d));
  delete raw.custom;
  assert.equal(decodeProject(JSON.stringify(raw)).drivetrain.motor, 'fc130');
  assert.equal(motorOf({ drivetrain: { motor: 'toString' } }), MOTORS.fc130, 'a name that only looks like a key is not a motor');
});

test('own gears, bearings and guides are found, and only where they belong', () => {
  const d = newDesign();
  adopt(d, 'gear', 'g1', { name: 'My spur', layout: 'sidewinder', gearD: 19, gearT: 36, pinionD: 6, pinionT: 12, angle: 0, confirmed: true });
  assert.equal(gearsFor(d, 'sidewinder').at(-1).id, 'g1');
  assert.ok(!gearsFor(d, 'inline').some((g) => g.id === 'g1'), 'not offered for another layout');
  Object.assign(d.drivetrain, { layout: 'sidewinder', gear: 'g1', centre: meshCentre(gearsFor(d, 'sidewinder').at(-1)) });
  assert.equal(gearOf(d).gearD, 19);
  assert.equal(d.drivetrain.centre, 11.5);
  assert.ok(engine.build(d).pod.volume > 100);
  adopt(d, 'bearing', 'b1', { name: 'Odd bush', seat: 5.2, width: 3, confirmed: false });
  adopt(d, 'guide', 'u1', { name: 'Wood guide', hole: 4.1, bladeL: 26, confirmed: true });
  Object.assign(find(d.pod, 'uprights').params, { bearing: 'b1', seat: 5.2 });
  Object.assign(find(d.chassis, 'guide').params, { guide: 'u1', hole: 4.1 });
  assert.equal(bearingOf(d, 'b1').seat, 5.2);
  assert.equal(guideOf(d, 'u1').bladeL, 26);
  assert.equal(guideOf(d, 'nope'), null);
  assert.deepEqual(unconfirmed(d).filter((u) => /Bearing|Guide/.test(u)), ['Bearing seat'], 'the confirmed guide is not listed, the unconfirmed bearing is');
  assert.deepEqual(Object.keys(customUsed(d, 'pod')).sort(), ['bearing', 'gear']);
  assert.deepEqual(Object.keys(customUsed(d, 'chassis')), ['guide']);
  // A file cannot use an own component to hide a built-in one, or carry hundreds.
  const raw = JSON.parse(encodeProject(d));
  raw.custom.motor = { fc130: { name: 'Fake', length: 60 }, 'bad id!': { name: 'x' } };
  for (let i = 0; i < 50; i++) raw.custom.guide['x' + i] = { name: 'g' + i };
  const clean = cleanDesign(raw);
  assert.equal(clean.custom.motor, undefined);
  assert.equal(motorOf(clean).length, 25);
  assert.ok(Object.keys(clean.custom.guide).length <= 20);
  // A guide or bearing the design does not know falls back to the scale's own.
  raw.chassis.features.find((f) => f.type === 'guide').params.guide = 'missing';
  raw.pod.features.find((f) => f.type === 'uprights').params.bearing = 'missing';
  const fixed = cleanDesign(raw);
  assert.equal(find(fixed.chassis, 'guide').params.guide, 'slotit');
  assert.equal(find(fixed.pod, 'uprights').params.bearing, 'ball');
});

test('a pod in the library brings its own motor and gears along', () => {
  const d = newDesign();
  adopt(d, 'motor', 'm9', { ...MOTORS.ff050, name: 'Tiny', length: 22, confirmed: true });
  adopt(d, 'guide', 'u9', { name: 'Not for the pod', hole: 4, bladeL: 20 });
  d.drivetrain.motor = 'm9';
  const item = cleanItem({ kind: 'pod', name: 'Tiny pod', data: { scale: d.scale, drivetrain: d.drivetrain, features: d.pod.features, custom: d.custom } }, cleanPart);
  assert.deepEqual(Object.keys(item.data.custom), ['motor'], 'only what the pod uses');
  const got = decodeShare(encodeShare([item]), cleanPart).items[0];
  assert.equal(got.data.custom.motor.m9.length, 22);
  // Someone else uses it in a fresh design.
  const e = newDesign();
  for (const [kind, set] of Object.entries(got.data.custom)) for (const [id, c] of Object.entries(set)) adopt(e, kind, id, c);
  e.drivetrain = got.data.drivetrain;
  e.pod.features = got.data.features;
  assert.equal(motorOf(e).name, 'Tiny');
  assert.ok(engine.build(e).pod.volume > 100);
  // A pod without own components carries no empty baggage.
  const plain = newDesign();
  assert.deepEqual(Object.keys(cleanPart('pod', { drivetrain: plain.drivetrain, features: plain.pod.features })).sort(), ['drivetrain', 'features']);
});

test('components are library entries of their own and travel through a share file', () => {
  const items = [
    cleanItem({ kind: 'motor', data: { ...MOTORS.fk180, name: 'Club motor', confirmed: true } }, cleanPart),
    cleanItem({ kind: 'rules', data: { name: 'Our club', maxWidth: 62, guideLeadMax: 100, minClearance: 1.2 } }, cleanPart),
    cleanItem({ kind: 'car', data: { name: 'My GT', scale: '1/24', wheelbase: 108 } }, cleanPart),
  ];
  assert.deepEqual(items.map((i) => i.name), ['Club motor', 'Our club', 'My GT'], 'an entry is named after its component');
  assert.ok(items.every((i) => i.mesh === null && i.source === 'made'));
  const { items: back, skipped } = decodeShare(encodeShare(items), cleanPart);
  assert.equal(skipped.length, 0);
  assert.deepEqual(noIds(back.map((i) => i.data)), noIds(items.map((i) => i.data)));
  // A hostile one is tamed, not trusted.
  const bad = JSON.stringify({ format: 'slotforge-frame-library', version: 1, items: [{ kind: 'motor', name: 'ignored', mesh: { p: 'x', i: 'y' }, data: { name: '"><script>', length: -1 } }] });
  const m = decodeShare(bad, cleanPart).items[0];
  assert.equal(m.data.length, 5);
  assert.equal(m.mesh, null, 'a component has no model');
  assert.equal(m.name, '"><script>', 'the name is kept as plain text and escaped when shown');
});

test('a car preset moves the rear of the chassis with the rear axle', () => {
  const d = newDesign(), before = JSON.parse(JSON.stringify(d));
  const from = d.car.wheelbase;
  d.car.wheelbase = 92.5;
  moveRear(d, from, 92.5);
  const by = 92.5 - from, pts = find(d.chassis, 'outline').params.points, old = find(before.chassis, 'outline').params.points;
  pts.forEach((p, i) => assert.ok(Math.abs(p[0] - (old[i][0] > from / 2 ? old[i][0] + by : old[i][0])) < 0.011, `outline point ${i + 1}`));
  assert.ok(Math.abs(find(d.chassis, 'kickup').params.fold - (find(before.chassis, 'kickup').params.fold + by)) < 0.011);
  assert.ok(Math.abs(summary(d).length - (summary(before).length + by)) < 0.011, 'the chassis is longer by the difference');
  const out = engine.build(d);
  assert.deepEqual(out.notes.filter((n) => !n.ok).map((n) => n.title), [], 'and still builds cleanly');
  assert.ok(Math.abs(podLayout(d).x1 - (podLayout(before).x1 + by)) < 0.011, 'the pod moved with the axle');
});

test('every built-in motor and gear set builds a pod in its layout', () => {
  for (const [layout, list] of Object.entries(GEARS))
    for (const g of list) {
      const d = newDesign(g.gearD > 20 ? '1/24' : '1/32');
      Object.assign(d.drivetrain, { layout, gear: g.id, centre: meshCentre(g, layout) });
      const out = engine.build(d);
      assert.ok(out.pod.volume > 100, g.id);
      assert.equal(out.notes.filter((n) => /pod is in|overlap/.test(n.title)).length, 0, `${g.id}: the pod is whole and fits`);
      assert.equal(out.notes.some((n) => /bearing holder/.test(n.title)), false, `${g.id}: the motor stays clear of the bearing holders`);
    }
  for (const motor of Object.keys(MOTORS))
    for (const layout of ['inline', 'sidewinder', 'anglewinder']) {
      const d = newDesign('1/24');
      Object.assign(d.drivetrain, { layout, motor, gear: GEARS[layout][0].id, centre: meshCentre(GEARS[layout][0], layout) });
      const out = engine.build(d);
      assert.ok(out.pod.volume > 100, `${motor} ${layout}`);
      assert.equal(out.notes.filter((n) => /pod is in/.test(n.title)).length, 0, `${motor} ${layout}: the pod is one piece`);
      // Known limit: a sidewinder's gear runs outside the bearing holder, so the shaft must reach past it.
      // The short FF-030's shaft (7 mm) cannot; the app reports that the motor would cut into the holder.
      const tooShort = layout === 'sidewinder' && MOTORS[motor].shaftOut - 2.5 < 3 + 2.6;
      assert.equal(out.notes.some((n) => /bearing holder/.test(n.title)), tooShort, `${motor} ${layout}: a motor that reaches a bearing seat is reported, and only then`);
    }
  assert.deepEqual(DESIGN_KINDS, ['motor', 'gear', 'bearing', 'guide']);
});
