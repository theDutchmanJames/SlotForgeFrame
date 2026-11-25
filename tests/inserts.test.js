// Wheel inserts: the pattern layers, the solids the engine makes of them, the checks, and keeping them.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, cleanDesign, encodeProject, decodeProject, cleanPart } from '../src/model.js';
import { PRESETS, presetFor, newLayer, layerShape, insertChecks, directional, cleanInsert, fitToSegment, insertOf, LAYER_TYPES } from '../src/inserts.js';
import { cleanItem } from '../src/library-core.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const bad = (notes) => notes.filter((n) => !n.ok && !n.soft).map((n) => n.title);
const build = (ins) => engine.insert({ insert: ins, nozzle: 0.4, axleD: 2.38 });
const withPreset = (name, base = newDesign().inserts.rear.base) => ({ ...presetFor(name, base), faceDown: false });

test('a new design has a rear and a front insert, the same, sized for its scale', () => {
  for (const scale of ['1/32', '1/24']) {
    const d = newDesign(scale), b = d.inserts.rear.base;
    assert.equal(d.inserts.same, true);
    assert.equal(b.od, Math.round((b.pocketD - 2 * b.clear) * 1000) / 1000, 'the insert fits its pocket');
    assert.ok(b.wheelD > b.pocketD && b.thick < b.pocketDepth);
    assert.equal(insertOf(d, 'front'), d.inserts.rear, 'the front uses the rear while they are the same');
    assert.deepEqual(bad(insertChecks(d.inserts.rear)), [], scale);
  }
});

test('every ready-made pattern builds as one clean piece that fits its pocket', () => {
  for (const name of Object.keys(PRESETS)) {
    const ins = withPreset(name), out = build(ins);
    assert.equal(out.pieces, 1, name);
    assert.deepEqual(bad(out.notes), [], name);
    assert.ok(out.notes.every((n) => n.ok || n.soft), name);
    assert.ok(Math.abs(out.size[0] - ins.base.od) < 0.02 && Math.abs(out.size[1] - ins.base.od) < 0.02, `${name} is as wide as the insert`);
    assert.ok(out.size[2] <= ins.base.pocketDepth + 1e-6, `${name} sits in the pocket`);
    assert.ok(out.top.length >= 1);
  }
});

test('a layer is cut through, sunk or raised', () => {
  const base = newDesign().inserts.rear.base, plain = build({ base, layers: [] }).volume;
  const ring = { ...newLayer('ring', base.od / 2), r: 3.5, w: 1, h: 0.3 };
  const vol = (mode) => build({ base, layers: [{ ...ring, mode }] }).volume;
  const ringArea = Math.PI * (4 ** 2 - 3 ** 2);
  assert.ok(Math.abs(plain - vol('cut') - ringArea * base.thick) < 1.5, 'cut through takes the full thickness');
  assert.ok(Math.abs(plain - vol('recess') - ringArea * 0.3) < 0.8, 'sunk takes its depth');
  assert.ok(Math.abs(vol('raise') - plain - ringArea * 0.3) < 0.8, 'raised adds its height');
});

test('spokes keep the spokes and open the gaps between them; split, crossed and bent ones too', () => {
  const R = 5.9, L = newLayer('spokes', R);
  const s = layerShape(L, R);
  assert.equal(s.add.length, 1, 'the ring the spokes run across');
  assert.equal(s.sub.length, 1 + L.count, 'the hub and every spoke stay');
  assert.equal(layerShape({ ...L, split: 0.8 }, R).sub.length, 1 + 2 * L.count);
  assert.equal(layerShape({ ...L, crossed: true }, R).sub.length, 1 + 2 * L.count);
  // A bent spoke ends further round than it starts.
  const bent = layerShape({ ...L, count: 1, curve: 40 }, R).sub[1], first = bent[0], tip = bent[Math.floor(bent.length / 2) - 1];
  assert.ok(Math.atan2(tip[1], tip[0]) - Math.atan2(first[1], first[0]) > 0.5);
  assert.equal(directional({ layers: [{ ...L, curve: 40 }] }), true);
  assert.equal(directional({ layers: [{ ...L, curve: 40, crossed: true }] }), false, 'a crossed mesh looks the same both ways');
  assert.equal(directional({ layers: [L] }), false);
});

test('a pattern that cannot print, or cannot fit, says so', () => {
  const base = newDesign().inserts.rear.base, R = base.od / 2;
  const titles = (layers, b = base) => insertChecks({ base: b, layers }, { nozzle: 0.4, axleD: 2.38 }).filter((n) => !n.ok).map((n) => n.title);
  assert.ok(titles([{ ...newLayer('spokes', R), wHub: 0.2 }]).some((t) => /thinner than the nozzle/.test(t)));
  assert.ok(titles([{ ...newLayer('spokes', R), rim: R }]).some((t) => /cuts through the rim/.test(t)));
  assert.ok(titles([{ ...newLayer('holes', R), count: 14, size: 2 }]).some((t) => /run into each other/.test(t)));
  assert.ok(titles([], { ...base, hole: 2 }).includes('The centre hole is smaller than the axle'));
  assert.ok(titles([], { ...base, dish: 1.1 }).includes('The dish is too deep'));
  assert.ok(titles([], { ...base, od: 12.5 }).includes('The insert does not match the pocket'));
  assert.ok(titles([{ ...newLayer('ring', R), h: 0.8 }]).includes('The insert stands out of the pocket'));
  // A spoke pattern that cuts the rim off leaves loose pieces: the engine counts them.
  const loose = build({ base, layers: [{ ...newLayer('ring', R), mode: 'cut', r: 4.5, w: 0.6 }] });
  assert.equal(loose.pieces, 2);
  assert.ok(bad(loose.notes).includes('The insert falls apart'));
});

test('a cup has a skirt behind the face, and a drawn layer is copied round', () => {
  const base = { ...newDesign().inserts.rear.base, form: 'cup', skirt: 1, wall: 0.6 };
  const out = build({ base, layers: [] });
  assert.ok(Math.abs(out.size[2] - (base.thick + 1 + base.lipH)) < 1e-6, 'skirt, face and lip');
  const draw = newLayer('draw', base.od / 2), shape = layerShape(draw, base.od / 2);
  assert.equal(shape.add.length, draw.count);
  assert.ok(build({ base, layers: [draw] }).volume < out.volume);
  // An imported outline is fitted into the segment that points up (y is down in the drawing).
  const fitted = fitToSegment([[0, 0], [100, 0], [100, 300], [0, 300]], base.od / 2, 6);
  assert.ok(fitted.every(([x, y]) => y < 0 && Math.hypot(x, y) < base.od / 2));
});

test('the set of four mirrors a pattern that bends one way, and lays the inserts out apart', () => {
  const d = newDesign();
  d.inserts.rear = withPreset('Turbine');
  const set = engine.insertSet(d);
  assert.equal(set.pieces, 4);
  const one = build(d.inserts.rear);
  assert.ok(Math.abs(set.volume - 4 * one.volume) < 0.5);
  // Front and rear can differ.
  d.inserts.same = false;
  d.inserts.front = withPreset('Plain');
  const mixed = engine.insertSet(d);
  assert.ok(Math.abs(mixed.volume - 2 * one.volume - 2 * build(d.inserts.front).volume) < 0.5);
  // Face down: a flat face goes on the bed, the same size.
  d.inserts.front.faceDown = true;
  assert.equal(engine.insertSet(d).pieces, 4);
});

test('the calibration ring has six numbered discs round the insert size', () => {
  const d = newDesign(), ring = engine.insertRing({ insert: d.inserts.rear });
  assert.equal(ring.pieces, 6);
  assert.deepEqual(ring.steps, [-0.1, -0.05, 0, 0.05, 0.1, 0.15].map((s) => Math.round((d.inserts.rear.base.od + s) * 1000) / 1000));
});

test('inserts are kept in the design file and in the library, and cleaned on the way in', () => {
  const d = newDesign();
  d.inserts = { same: false, rear: withPreset('Slots'), front: withPreset('Mesh') };
  d.inserts.front.layers.push(newLayer('draw'));
  const back = decodeProject(encodeProject(d));
  assert.deepEqual(back.inserts, JSON.parse(JSON.stringify(d.inserts)));
  // An old file without inserts gets the default ones; a broken one is put right.
  const old = JSON.parse(encodeProject(newDesign()));
  delete old.inserts;
  assert.deepEqual(cleanDesign(old).inserts, newDesign().inserts);
  const broken = cleanInsert({ base: { od: 900, form: 'bowl' }, layers: [{ type: 'spokes', count: 3.6, mode: 'melt' }, { type: 'laser' }, null] });
  assert.equal(broken.base.od, 50);
  assert.equal(broken.base.form, 'disc');
  assert.deepEqual(broken.layers.map((l) => [l.type, l.count, l.mode]), [['spokes', 4, 'cut']]);
  assert.deepEqual(LAYER_TYPES.map((t) => cleanInsert({ layers: [newLayer(t)] }).layers[0]), LAYER_TYPES.map((t) => newLayer(t)), 'a fresh layer of every kind survives cleaning');
  // The library keeps an insert as a part of its own.
  const item = cleanItem({ kind: 'insert', name: 'Mesh', scale: '1/32', data: { insert: d.inserts.front } }, cleanPart);
  assert.equal(item.kind, 'insert');
  assert.deepEqual(item.data.insert, JSON.parse(JSON.stringify(d.inserts.front)));
});
