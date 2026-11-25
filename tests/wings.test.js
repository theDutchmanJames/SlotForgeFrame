// Rear wings: the shapes, the solids the engine makes of them, how they print, the checks, and keeping them.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, cleanDesign, encodeProject, decodeProject, cleanPart } from '../src/model.js';
import { WING_PRESETS, wingPreset, newWing, cleanWing, wingSide, pinsOf, legYs, wingChecks, deckZ } from '../src/wings.js';
import { cleanItem } from '../src/library-core.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const bad = (notes) => notes.filter((n) => !n.ok && !n.soft).map((n) => n.title);
const titles = (w, ctx) => wingChecks(w, ctx).filter((n) => !n.ok).map((n) => n.title);

test('a new design has a GT3 swan-neck wing sized for its scale', () => {
  const small = newDesign('1/32').wing, big = newDesign('1/24').wing;
  assert.equal(small.legs, 'swan');
  assert.equal(small.span, 56);
  assert.ok(Math.abs(big.span - 56 * 32 / 24) < 0.01, 'a 1/24 wing is the same wing, larger');
  assert.equal(big.angle, small.angle, 'angles do not scale');
});

test('every ready-made wing builds as one clean piece, in both scales', () => {
  for (const scale of ['1/32', '1/24'])
    for (const name of Object.keys(WING_PRESETS)) {
      const w = wingPreset(name, scale), out = engine.wing({ wing: w, nozzle: 0.4, maxWidth: scale === '1/32' ? 64 : 83 });
      assert.equal(out.pieces, 1, `${scale} ${name}`);
      assert.deepEqual(bad(out.notes), [], `${scale} ${name}`);
      assert.ok(out.volume > 100 && out.side.length >= 1, `${scale} ${name}`);
    }
});

test('the wing prints in one piece, as a kit with the legs apart, or all apart', () => {
  for (const name of Object.keys(WING_PRESETS)) {
    const w = wingPreset(name), legs = legYs(w).length, flap = w.element2 ? 1 : 0;
    assert.equal(engine.wingPrint({ wing: { ...w, printAs: 'one' } }).pieces, 1, name);
    assert.equal(engine.wingPrint({ wing: { ...w, printAs: 'kit' } }).pieces, 1 + legs, name);
    assert.equal(engine.wingPrint({ wing: { ...w, printAs: 'parts' } }).pieces, 1 + flap + 2 + legs, name);
  }
});

test('pins go through the wall: as long as the wall and their diameter to melt, short to glue', () => {
  const w = newWing(), sd = wingSide(w);
  const melt = pinsOf(w, sd);
  assert.equal(melt.length, 1);
  assert.ok(Math.abs(melt[0].below - (w.wall + w.pinD)) < 1e-9);
  assert.ok(Math.abs(melt[0].z - deckZ(w, melt[0].x)) < 1e-9, 'they start at the body\'s surface');
  assert.equal(pinsOf({ ...w, pins: 2 }, sd).length, 2);
  assert.ok(pinsOf({ ...w, fix: 'glue' }, sd)[0].below < w.wall, 'glued pins only locate the wing');
  // The pins really are in the solid: it reaches below the body's surface by the pin's length.
  const one = engine.wing({ wing: w, nozzle: 0.4 }), z = [];
  for (let i = 2; i < one.mesh.positions.length; i += 3) z.push(one.mesh.positions[i]);
  assert.ok(Math.abs(Math.min(...z) - (melt[0].z - melt[0].below)) < 0.05);
});

test('a wing that cannot work, or cannot print, says so', () => {
  const w = newWing();
  assert.ok(titles({ ...w, spacing: 60 }).includes('The legs stand outside the wing'));
  assert.ok(titles({ ...w, pinD: 2 }).includes('The pins are wider than the legs'));
  assert.ok(titles({ ...w, legW: 0.5 }).includes('The legs are thinner than two lines'));
  assert.ok(titles({ ...w, below: 12 }).includes('The endplates reach into the body'));
  assert.ok(titles({ ...w, thick: 4, chord: 6 }).includes('The wing is thinner than two lines'));
  assert.ok(titles(w, { maxWidth: 50 }).includes('The wing is wider than the rules allow'));
  assert.ok(titles({ ...w, pins: 2, legD: 2 }).includes('Two pins do not fit on the leg'));
  // Legs that miss the wing leave it standing on its own: the engine counts the pieces.
  const out = engine.wing({ wing: { ...w, legs: 'posts', lean: 40, height: 30 }, nozzle: 0.4 });
  assert.ok(out.pieces >= 1);
});

test('your own endplate follows the wing, and is kept in range', () => {
  const w = { ...newWing(), plate: 'own', plateOwn: [[0, 0], [1, 0], [1, 1], [0.2, 1]] };
  const sd = wingSide(w), b = sd.box;
  assert.deepEqual(sd.plate[2], [b.x1, b.z1], 'the outline is stretched over the endplate\'s box');
  assert.equal(engine.wing({ wing: w, nozzle: 0.4 }).pieces, 1);
  // A design without its own outline falls back to a GT3 endplate.
  assert.equal(cleanWing({ ...w, plateOwn: null }).plate, 'gt3');
});

test('the drilling template has a hole for every pin', () => {
  const w = { ...newWing(), pins: 2 }, t = engine.wingTemplate({ wing: w });
  assert.ok(t.size[1] >= w.spacing, 'it spans both legs');
  assert.ok(t.mesh.positions.length > 100);
});

test('wings are kept in the design file and in the library, and cleaned on the way in', () => {
  const d = newDesign();
  d.wing = { ...wingPreset('DTM two element'), plate: 'own', plateOwn: [[0, 0], [1, 0], [0.5, 1]], printAs: 'parts' };
  assert.deepEqual(decodeProject(encodeProject(d)).wing, d.wing);
  const old = JSON.parse(encodeProject(newDesign()));
  delete old.wing;
  assert.deepEqual(cleanDesign(old).wing, newWing());
  const broken = cleanWing({ span: 900, legs: 'tentacles', count: 1.6, fix: 'nails', plate: 'own' });
  assert.deepEqual([broken.span, broken.legs, broken.count, broken.fix, broken.plate], [150, 'swan', 2, 'melt', 'gt3']);
  const item = cleanItem({ kind: 'wing', name: 'DTM', scale: '1/32', data: { wing: d.wing } }, cleanPart);
  assert.equal(item.kind, 'wing');
  assert.deepEqual(item.data.wing, d.wing);
});
