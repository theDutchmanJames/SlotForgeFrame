// The one-piece chassis: with Peter's settings it is Peter's 1:43 chassis; every size can be changed from there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { readSTL } from '../src/geometry/stl-read.js';
import { onePieceSolid, PETER, newOnePiece, cleanOnePiece, changedFromPeter, onePieceChecks, ONE_PIECE_PARTS, ONE_PIECE_FIELDS, MAIN_FIELDS, LINKS, applyLinks, isLinked } from '../src/onepiece.js';
import { newOnePieceDesign, newDesign, cleanDesign, encodeProject, decodeProject, cleanPart, summary, partsLayout, checks } from '../src/model.js';
import { cleanItem } from '../src/library-core.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const kernel = { Manifold: wasm.Manifold, CrossSection: wasm.CrossSection, K: (o) => o };
const peterSTL = () => {
  const b = readFileSync(new URL("../assets/peter-143/Peter's 1-43 Chassis.stl", import.meta.url)), m = readSTL(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices });
  mesh.merge();
  const s = new wasm.Manifold(mesh), bb = s.boundingBox();
  return s.translate([-(bb.min[0] + bb.max[0]) / 2, -bb.min[1], -bb.min[2]]);
};

test("with Peter's settings it builds Peter's chassis", () => {
  const peter = peterSTL(), mine = onePieceSolid(kernel, newOnePiece());
  const extra = mine.subtract(peter).volume(), missing = peter.subtract(mine).volume();
  // Only the facets of round edges differ: well under half a percent of the part.
  assert.ok(extra + missing < 0.003 * peter.volume(), `extra ${extra.toFixed(2)} + missing ${missing.toFixed(2)} of ${peter.volume().toFixed(1)} mm³`);
  assert.equal(mine.decompose().length, 1);
  const a = mine.boundingBox(), b = peter.boundingBox();
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.min[k] - b.min[k]) < 0.01 && Math.abs(a.max[k] - b.max[k]) < 0.01, 'the same size');
});

test('every setting is in the panel, and Peter\'s design is unchanged until one is', () => {
  for (const part of ONE_PIECE_PARTS) {
    const listed = new Set(ONE_PIECE_FIELDS[part].map((f) => f[0]));
    for (const [k, v] of Object.entries(PETER[part])) if (typeof v === 'number' && k !== 'boss') assert.ok(listed.has(k), `${part}.${k} has a field`);
  }
  const P = newOnePiece();
  assert.deepEqual(changedFromPeter(P), []);
  P.front.outer = 10;
  assert.deepEqual(changedFromPeter(P), ['front.outer']);
  assert.ok(onePieceChecks(P)[0].title.startsWith("Changed from Peter's design: 1 setting"));
});

test('a one-piece design builds on the car, with no pod, and follows its wheelbase', () => {
  const d = newOnePieceDesign();
  assert.equal(d.scale, '1/43');
  assert.equal(d.car.wheelbase, PETER.rear.wheelbase);
  const r = engine.build(d);
  assert.equal(r.pod, null);
  assert.ok(Math.abs(r.volume - peterSTL().volume()) < 0.003 * r.volume);
  assert.deepEqual(r.notes.filter((n) => !n.ok).map((n) => n.title), []);
  const p = r.chassis.positions;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); }
  assert.ok(Math.abs(minX + PETER.front.at) < 0.01 && Math.abs(maxX - (PETER.plate.length - PETER.front.at)) < 0.01, 'the front axle at x = 0');
  const s = summary(d);
  assert.ok(Math.abs(s.guideLead - 60.52) < 0.01 && s.clearance === 3);
  assert.equal(partsLayout(d).wheels.length, 4);
  assert.ok(checks(d).every((c) => c.ok));
});

test('the parts can be changed and still build in one piece', () => {
  const d = newOnePieceDesign(), P = d.onePiece;
  P.rear.wheelbase = 62; P.plate.length += 6.98; P.gear.slotFrom += 6.98;
  P.front.outer = 9.5; P.motor.len = 25; P.mounts.at.push(58); P.mounts.boss = 0; P.plate.panW = 30;
  d.car.wheelbase = 62;
  const r = engine.build(d);
  assert.ok(!r.notes.some((n) => /falls apart/.test(n.title)));
  assert.ok(r.volume > 4000);
  // Eyes too thin for the nozzle, and key slots that break through, are caught.
  P.rear.outer = 5;
  assert.ok(onePieceChecks(P).some((n) => !n.ok && /Rear axle eyes too thin/.test(n.title)));
  P.rear.outer = 8; P.rear.keyLen = 7.6;
  assert.ok(onePieceChecks(P).some((n) => !n.ok && /key slots break through/.test(n.title)));
  // Tyres too small: the chassis or its motor reach the track.
  assert.ok(onePieceChecks(newOnePiece(), { rearTyreD: 11 }).some((n) => !n.ok && /too low/.test(n.title)));
});

test('it is kept in the design file and in the library, and cleaned on the way in', () => {
  const d = newOnePieceDesign();
  d.onePiece.rear.wheelbase = 58;
  const back = decodeProject(encodeProject(d));
  assert.deepEqual(back.onePiece, JSON.parse(JSON.stringify(d.onePiece)));
  assert.equal(back.car.wheelbase, 58);
  const odd = cleanOnePiece({ plate: { panW: 'wide', length: -4 }, mounts: { at: [1, 2, 'x', 3, 4, 5, 6, 7], boss: 9 } });
  assert.equal(odd.plate.panW, PETER.plate.panW);
  assert.equal(odd.plate.length, 0);
  assert.deepEqual(odd.mounts.at, [1, 2, 3, 4, 5, 6]);
  assert.equal(odd.mounts.boss, 1);
  assert.equal(cleanDesign({ scale: '1/43' }).scale, '1/43');
  assert.equal(newDesign('1/43').onePiece, undefined, 'a plain 1/43 design has a pod');
  const item = cleanItem({ kind: 'chassis', name: 'Mine', scale: '1/43', data: { car: d.car, rules: d.rules, features: d.chassis.features, onePiece: d.onePiece } }, cleanPart);
  assert.equal(item.scale, '1/43');
  assert.equal(item.data.onePiece.rear.wheelbase, 58);
});

test("linked settings follow the main ones at Peter's distance, until they are unlinked", () => {
  const has = (path) => { const [pt, k] = path.split('.'); return ONE_PIECE_FIELDS[pt].some((f) => f[0] === k); };
  for (const [path] of MAIN_FIELDS) assert.ok(has(path), `${path} is a setting`);
  for (const [to, from] of LINKS) assert.ok(has(to) && has(from), `${to} and ${from} are settings`);
  const P = newOnePiece();
  assert.deepEqual(changedFromPeter(applyLinks(P)), [], "linked, untouched: still Peter's chassis");
  P.plate.panFrom = 22; P.front.height = 6; P.plate.frontW = 20;
  applyLinks(P);
  assert.equal(P.plate.wallFrom, 21); assert.equal(P.motor.from, 29);
  assert.equal(P.rear.height, 6); assert.equal(P.plate.rearW, 20);
  P.links['rear.height'] = false; P.rear.height = 5;
  P.front.height = 7; applyLinks(P);
  assert.equal(P.rear.height, 5, 'unlinked: set by hand');
  assert.ok(!isLinked(P, 'rear.height') && isLinked(P, 'rear.hole'));
});

test("a file from before links is linked only where it keeps Peter's distances; saved links come back", () => {
  const { links, ...old } = JSON.parse(JSON.stringify(PETER));
  old.rear = { ...old.rear, height: 6 };
  const P = cleanOnePiece(old);
  assert.equal(P.links['rear.height'], false, 'its own rear axle height stays');
  assert.equal(P.rear.height, 6);
  assert.equal(P.links['rear.hole'], true);
  const back = cleanOnePiece(JSON.parse(JSON.stringify({ ...P, links: { ...P.links, 'motor.from': false } })));
  assert.equal(back.links['motor.from'], false);
  assert.equal(back.links['rear.height'], false);
});
