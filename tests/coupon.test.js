// The calibration coupon, and the two hole fixes it sets.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, find, couponHoles, COUPON_STEPS, cleanDesign, encodeProject, decodeProject } from '../src/model.js';
import { cleanComponent, PRINTERS } from '../src/components.js';

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

test('the coupon lists every upright hole size of the design, smallest first', () => {
  const d = newDesign(), spec = couponHoles(d);
  assert.deepEqual(spec.steps, [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.deepEqual(spec.rows.map((r) => [r.n, r.d]), [[1, 1.6], [2, 1.8], [3, 2.3], [4, 2.5], [5, 3.7]]);
  assert.match(spec.rows[4].name, /Guide/);
  assert.equal(spec.seat.d, 4.75);
  assert.equal(spec.axle.d, 2.38);
  assert.equal(spec.thickness, 1.5);
  // Holes of one size share a row; a feature that is switched off has no row.
  find(d.pod, 'lugs').params.hole = 2.5;
  find(d.chassis, 'frontAxle').enabled = false;
  const merged = couponHoles(d);
  assert.deepEqual(merged.rows.map((r) => r.d), [1.8, 2.5, 3.7]);
  assert.match(merged.rows[1].name, /Body mount screw, pod lug|Pod lug, body mount screw/);
  // An imported pod has no bearing seat of ours to test, and brings its own screw size.
  d.pod.imported = { mesh: 'x', name: 'p', mounts: [], holeD: 2.1, axleX: 50, axleZ: 7.5, box: [0, 60, 25] };
  const imp = couponHoles(d);
  assert.equal(imp.seat, null);
  assert.ok(imp.rows.some((r) => r.d === 2.1 && /Pod mount/.test(r.name)));
  assert.ok(!imp.rows.some((r) => /lug/i.test(r.name)));
});

test('the coupon is one closed piece, and its holes have the sizes it says', () => {
  for (const scale of ['1/32', '1/24']) {
    const d = newDesign(scale), c = engine.coupon(d);
    assert.ok(watertight(c.mesh), `${scale}: closed`);
    assert.equal(c.pieces, 1, `${scale}: one piece (numbers and walls are fused to the plate)`);
    assert.ok(c.size[0] < 90 && c.size[1] < 70 && c.size[2] < 16, `${scale}: a small piece (${c.size.map((v) => v.toFixed(0)).join(' × ')} mm)`);
    assert.equal(c.layout.cols.length, 6);
    // Measure the upright holes with the importer's own hole finder.
    const { positions } = c.mesh;
    let minX = Infinity, minY = Infinity;
    for (let i = 0; i < positions.length; i += 3) { minX = Math.min(minX, positions[i]); minY = Math.min(minY, positions[i + 1]); }
    const holes = engine.analyse(c.mesh).holes;
    assert.equal(holes.length, c.spec.rows.length * 6, `${scale}: six holes for each row`);
    for (const [r, row] of c.spec.rows.entries())
      for (const [i, step] of COUPON_STEPS.entries()) {
        const hit = holes.find((h) => Math.abs(h.x - c.layout.cols[i]) < 0.2 && Math.abs(h.y - c.layout.rows[r]) < 0.2);
        assert.ok(hit, `${scale}: row ${row.n} column ${i} has a hole`);
        assert.ok(Math.abs(hit.d - (row.d + step)) < 0.06, `${scale}: row ${row.n} column ${i} is Ø${(row.d + step).toFixed(2)} (found ${hit.d})`);
      }
  }
});

test('the coupon follows the design: plate thickness, holder style, hole sizes', () => {
  const d = newDesign(), base = engine.coupon(d);
  assert.ok(Math.abs(base.size[2] - (1.5 + 2 + 5.25 + 2)) < 0.01, 'as tall as plate + wall + seat + wall');
  const thick = newDesign();
  find(thick.chassis, 'outline').params.thickness = 2.5;
  assert.ok(Math.abs(engine.coupon(thick).size[2] - base.size[2] - 1) < 0.01, 'a thicker chassis gives a thicker coupon');
  const snap = newDesign();
  find(snap.pod, 'uprights').params.holder = 'snap';
  assert.ok(engine.coupon(snap).mesh.volume < base.mesh.volume, 'snap-in seats are open at the top');
  const big = newDesign();
  // (Not the largest hole: that one also sets how far apart the holes are spaced.)
  find(big.chassis, 'podMounts').params.hole = 2.1;
  assert.ok(engine.coupon(big).mesh.volume < base.mesh.volume, 'bigger holes leave less plate');
  const wide = newDesign();
  find(wide.chassis, 'guide').params.hole = 5.5;
  assert.ok(engine.coupon(wide).size[1] > base.size[1], 'a larger largest hole spaces the rows further apart');
  // Nothing to test at all still gives a usable piece (axle slots only).
  const bare = newDesign();
  for (const type of ['guide', 'frontAxle', 'podMounts', 'bodyMounts']) find(bare.chassis, type).enabled = false;
  for (const type of ['lugs', 'uprights']) find(bare.pod, type).enabled = false;
  const c = engine.coupon(bare);
  assert.equal(c.spec.rows.length, 0);
  assert.ok(watertight(c.mesh) && c.pieces === 1 && c.mesh.volume > 100);
});

test('upright holes and sideways holes each have their own fix', () => {
  // A pod of base, motor seat and bearing holders only: the lugs' upright holes are left out.
  const pod = (change) => {
    const d = newDesign();
    find(d.pod, 'lugs').enabled = false;
    change(d);
    return engine.build(d);
  };
  const base = pod(() => {});
  const upright = pod((d) => { d.printer.holeFix = 0.5; });
  const sideways = pod((d) => { d.printer.boreFix = 0.5; });
  assert.ok(Math.abs(upright.pod.volume - base.pod.volume) < 0.01, 'the fix for upright holes leaves the bearing seat alone');
  assert.ok(sideways.pod.volume < base.pod.volume - 1, 'the fix for sideways holes opens the bearing seat and the motor bosses');
  // On the chassis: the axle slot lies sideways, the screw holes stand upright.
  assert.ok(sideways.chassis.volume < base.chassis.volume - 0.3, 'the front axle slot follows the sideways fix');
  assert.ok(upright.chassis.volume < base.chassis.volume - 1, 'the screw and guide holes follow the upright fix');
  // The coupon itself is printed at the sizes as typed: the fixes do not change it.
  const d = newDesign(), a = engine.coupon(d).mesh.volume;
  Object.assign(d.printer, { holeFix: 0.4, boreFix: 0.1 });
  assert.equal(engine.coupon(d).mesh.volume, a);
});

test('the sideways fix is kept in files, and older files and printers get one', () => {
  const d = newDesign();
  d.printer.boreFix = 0.35;
  assert.equal(decodeProject(encodeProject(d)).printer.boreFix, 0.35);
  const raw = JSON.parse(encodeProject(d));
  delete raw.printer.boreFix;
  assert.equal(cleanDesign(raw).printer.boreFix, 0.2, 'an older file starts at the default');
  raw.printer.boreFix = 99;
  assert.equal(cleanDesign(raw).printer.boreFix, 1, 'and a wild value is pulled back in');
  for (const p of Object.values(PRINTERS)) assert.ok(Number.isFinite(p.boreFix));
  assert.equal(cleanComponent('printer', { name: 'Old profile', holeFix: 0.3 }).boreFix, 0.2);
});
