// Packs Jivko's wheel inserts (assets/jivko-design/*.stl) into the app:
//   src/jivko.js                  what the page needs: names, sizes, where the face starts, a picture
//   src/geometry/jivko-meshes.js  the models themselves, for the geometry worker only
// Run it again after changing a model: node tools/jivko-pack.mjs
import fs from 'node:fs';
import path from 'node:path';
import Module from 'manifold-3d';
import { readSTL, boundsOf } from '../src/geometry/stl-read.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dir = path.join(root, 'assets', 'jivko-design');
const wasm = await Module();
wasm.setup();
const { Manifold, Mesh, CrossSection } = wasm;

const Q = 2000; // positions are kept as whole steps of 1/2000 mm
const r3 = (v) => Math.round(v * 1000) / 1000;
const solidOf = (positions, indices) => { const m = new Mesh({ numProp: 3, vertProperties: positions, triVerts: indices }); m.merge(); return new Manifold(m); };
const same = (a, b) => { const x = a.subtract(b), y = b.subtract(a), d = x.area() + y.area(); x.delete(); y.delete(); return d; };

const meta = [], meshes = {};
for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.stl')).sort()) {
  const name = file.replace(/\.stl$/i, ''), id = 'jivko-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const bytes = fs.readFileSync(path.join(dir, file)), raw = readSTL(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const b = boundsOf(raw), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  // Centred on the axle, the back on z = 0, and rounded to the grid it is kept on.
  const q = new Int16Array(raw.positions.length);
  for (let i = 0; i < q.length; i += 3) {
    q[i] = Math.round((raw.positions[i] - cx) * Q);
    q[i + 1] = Math.round((raw.positions[i + 1] - cy) * Q);
    q[i + 2] = Math.round((raw.positions[i + 2] - b.min[2]) * Q);
  }
  if (raw.positions.length / 3 > 65535) throw Error(`${file}: too many points`);
  const pos = Float32Array.from(q, (v) => v / Q), idx = Uint16Array.from(raw.indices);
  const s = solidOf(pos, Uint32Array.from(idx));
  if (s.isEmpty() || s.decompose().length !== 1) throw Error(`${file}: not one closed solid`);
  const bb = s.boundingBox(), H = r3(bb.max[2]), R0 = r3(Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2);
  // The back is the same all the way up from somewhere near the bed to where the face starts.
  // Found by comparing slices with one a third of the way up.
  const ref = s.slice(H / 3), tol = ref.area() * 0.002, STEP = 0.05;
  let zf = H / 3, zb = H / 3;
  while (zf + STEP < H && same(s.slice(zf + STEP), ref) < tol) zf += STEP;
  while (zb - STEP > 0 && same(s.slice(zb - STEP), ref) < tol) zb -= STEP;
  zf = r3(zf); zb = r3(zb <= STEP + 1e-9 ? 0 : zb);
  // Directional: no mirror image of the face matches it at any turn.
  const looks = [ref, s.slice(zf + (H - zf) * 0.5), s.slice(H - 0.15)];
  let best = Infinity;
  for (let a = 0; a < 360; a += 0.5) {
    let d = 0;
    for (const c of looks) { const m = c.mirror([1, 0]).rotate(a); d += same(m, c) / Math.max(1e-6, c.area()); m.delete(); }
    best = Math.min(best, d);
  }
  const directional = best > 0.03;
  // The solid hub round the axle: the largest circle in the middle with no opening in it, from the bed
  // up to where the middle of the face is (above it there is only air for the hole to pass).
  const inside = (r, x) => { const c = CrossSection.circle(r, 96), d = c.subtract(x), a = d.area(); c.delete(); d.delete(); return a < 1e-4; };
  const hubCuts = [ref];
  for (let z = zf + 0.1; z < H; z += 0.1) { const c = s.slice(z); if (!inside(0.02, c)) { c.delete(); break; } hubCuts.push(c); }
  let lo = 0, hi = R0;
  for (let k = 0; k < 30; k++) {
    const r = (lo + hi) / 2;
    if (hubCuts.every((x) => inside(r, x))) lo = r; else hi = r;
  }
  const hubR = r3(lo);
  // The picture: the back as seen from the front of the wheel (y down), with its openings.
  const r2 = (v) => Math.round(v * 100) / 100, rings = ref.toPolygons().map((ring) => ring.map(([x, y]) => [r2(x), r2(-y)]));
  meta.push({ id, name, file, R0, H, zb, zf, faceDepth: r3(H - zf), hubR, directional, rings });
  meshes[id] = { p: Buffer.from(q.buffer).toString('base64'), i: Buffer.from(idx.buffer).toString('base64') };
  console.log(name.padEnd(12), `Ø${2 * R0} × ${H}`, `back ${zb}–${zf}`, `face ${r3(H - zf)}`, `hub Ø${r3(2 * hubR)}`, directional ? 'directional' : 'symmetric', `(${best.toFixed(3)})`, `${idx.length / 3} triangles`);
  s.delete();
}

const head = '// Made by tools/jivko-pack.mjs from assets/jivko-design: do not edit by hand.\n';
fs.writeFileSync(path.join(root, 'src', 'jivko.js'), `${head}// Wheel inserts designed by Jivko, included with the designer's permission. Sizes in mm as drawn:
// R0 the radius, H the height, the face from zf up to H, the plain back from zb to zf, hubR the solid hub's radius.
export const JIVKO = ${JSON.stringify(meta)};\n`);
fs.writeFileSync(path.join(root, 'src', 'geometry', 'jivko-meshes.js'), `${head}// Positions are int16 steps of 1/${Q} mm (x, y, z), corners are uint16, both little-endian and base64.
export const STEP = ${Q};
export const MESHES = ${JSON.stringify(meshes)};\n`);
