// Motor screw holes: on a level line through the shaft on the 20 mm cans, on a tilted one on the slimlines.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, motorOf, motorPlace, heights } from '../src/model.js';
import { MOTORS } from '../src/components.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);

// Is there a hole of radius r along the car at (y, z)? Some of the pod's corners lie on its wall.
function holeAt(mesh, y, z, r) {
  const P = mesh.positions;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(Math.hypot(P[i + 1] - y, P[i + 2] - z) - r) < 0.02) return true;
  return false;
}

test('a slimline motor gets its screw holes on a line tilted 30°, a short can on a level one', () => {
  for (const [id, tilt] of [['ff050', 30], ['fc130', 0]]) {
    const d = newDesign();
    d.drivetrain.motor = id;
    const m = motorOf(d), place = motorPlace(d), pod = engine.build(d).pod;
    assert.equal(MOTORS[id].screwTilt, tilt);
    assert.ok(Math.abs(place.angle) < 1e-9, 'an inline motor lies along the car');
    const fix = d.printer.boreFix ?? d.printer.holeFix, r = 1.1 + fix / 2, zs = d.car.clearance + heights(d).shaft;
    const t = (tilt * Math.PI) / 180, sy = (m.pitch / 2) * Math.cos(t), sz = (m.pitch / 2) * Math.sin(t);
    assert.ok(holeAt(pod, place.y + sy, zs + sz, r) && holeAt(pod, place.y - sy, zs - sz, r), `${id}: both holes where the drawing puts them`);
    if (tilt) assert.ok(!holeAt(pod, place.y + m.pitch / 2, zs, r), `${id}: not on a level line`);
  }
});
