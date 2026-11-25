// The link with SlotForge Anvil: the chassis file Anvil reads, and the body shown as a ghost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { readSTL, boundsOf } from '../src/geometry/stl-read.js';
import { base64ToBytes } from '../src/library-core.js';
import { anvilChassis, encodeAnvilChassis, anvilGuess, joinMeshes, placeBody, hullOf, bodyFit, bodyGuess, findArches, archFit, archNote, ANVIL_CHASSIS_FORMAT } from '../src/anvil.js';
import { newDesign, newShape, find, cleanDesign, cleanBody, decodeProject, encodeProject } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);

// Anvil's own source, when it sits next to this project (it does on the author's computer).
// With it, the file is checked by the very code that will read it.
const anvilRoot = fileURLToPath(new URL('../../Bodyshop/src/', import.meta.url));
const anvil = async (file) => (existsSync(anvilRoot + file) ? import(pathToFileURL(anvilRoot + file).href).catch(() => null) : null);

test('the chassis file carries the wheels, the heights and the body-mount spots', () => {
  const d = newDesign(), built = engine.build(d);
  const { chassis, mesh, warnings } = anvilChassis(d, built);
  assert.equal(chassis.wheelbase, 83.4);
  assert.equal(chassis.clearance, d.car.clearance);
  assert.deepEqual(chassis.front, { diameter: 19.5, width: 9, inOut: 25.5 });
  assert.deepEqual(chassis.rear, { diameter: 20.5, width: 10.5, inOut: 25.75 });
  assert.equal(chassis.guideAhead, 19, 'the guide is 19 mm ahead of the front axle');
  // Posts end on top of the chassis's body mounts: clearance + plate + mount height.
  assert.equal(chassis.deck, 2 + 1.5 + 4);
  assert.deepEqual(chassis.posts, [{ along: -9.5, side: 0 }, { along: 100, side: 0 }]);
  assert.deepEqual(warnings, []);
  // The model is the chassis and the pod together.
  assert.equal(mesh.indices.length, built.chassis.indices.length + built.pod.indices.length);
  assert.ok(Math.max(...mesh.indices) < mesh.positions.length / 3);
  // Where Anvil must put it: Anvil centres the model between the axles and stands it on the track.
  const b = boundsOf(mesh);
  assert.ok(Math.abs(chassis.stl.along - ((b.min[0] + b.max[0]) / 2 - 83.4 / 2)) < 0.01);
  assert.ok(Math.abs(chassis.stl.height - b.min[2]) < 0.01);
});

test('the file is what Anvil version 1 expects, and its model reads back', () => {
  const d = newDesign();
  d.name = 'GT / test: car';
  const built = engine.build(d);
  const { text, posts } = encodeAnvilChassis(d, built);
  const file = JSON.parse(text);
  assert.equal(file.format, ANVIL_CHASSIS_FORMAT);
  assert.equal(file.version, 1);
  assert.equal(posts, 2);
  // The checks Anvil's reader makes (library-db.js › decodeChassisFile).
  for (const k of ['wheelbase', 'clearance']) assert.ok(Number.isFinite(file.chassis[k]));
  for (const k of ['front', 'rear']) for (const f of ['diameter', 'width', 'inOut']) assert.ok(Number.isFinite(file.chassis[k][f]));
  const mesh = readSTL(base64ToBytes(file.stl));
  assert.ok(mesh.indices.length > 1000);
});

test('Anvil itself accepts the file and turns the model the right way', async (t) => {
  const db = await anvil('library-db.js'), eng = await anvil('geometry/engine.js'), stl = await anvil('geometry/stl-mesh.js');
  if (!db?.decodeChassisFile || !eng?.guessOrient || !stl?.readSTLMesh) return t.skip('SlotForge Anvil is not next to this project');
  for (const change of [() => {}, (d) => { find(d.chassis, 'kickup').enabled = false; }, (d) => { d.chassis.features.push(newShape('panel', d)); },
    (d) => { const p = newShape('panel', d); p.params.height = 25; d.chassis.features.push(p); find(d.chassis, 'guide').params.bossH = 0; }]) {
    const d = newDesign();
    change(d);
    const built = engine.build(d), { text } = encodeAnvilChassis(d, built);
    const { chassis, stl: bytes } = db.decodeChassisFile(text);
    assert.equal(chassis.wheelbase, d.car.wheelbase);
    assert.equal(chassis.posts.length, 2);
    // What Anvil makes of the model: our prediction must match its real guess.
    const raw = stl.readSTLMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const guess = eng.guessOrient(raw), ours = anvilGuess(joinMeshes([built.chassis, built.pod]));
    assert.equal(guess.up, ours.upright ? '+z' : '-z', 'which way is up');
    assert.equal(guess.front[1], 'x', 'the length runs along the car');
    // Anvil takes the file's +x end for the front unless the other end is lower; ours is at -x.
    assert.equal(guess.front === '-x', ours.facesRight, 'which end Anvil takes for the front');
    assert.equal(chassis.stl.flip, !ours.facesRight);
    // The proof: after Anvil's own turning and our "flip", the model lies exactly as it does here
    // (centred on its bounding box, standing on zero). Its centre of mass tells front from rear.
    const car = eng.applyOrient(raw, guess).positions, f = chassis.stl.flip ? -1 : 1;
    const ourMesh = joinMeshes([built.chassis, built.pod]), ob = boundsOf(ourMesh);
    const mean = (pos, map) => { let t = 0; for (let i = 0; i < pos.length; i += 3) t += map(pos[i]); return t / (pos.length / 3); };
    const theirs = mean(car, (x) => x * f), mine = mean(ourMesh.positions, (x) => x - (ob.min[0] + ob.max[0]) / 2);
    assert.ok(Math.abs(mine) > 1, 'the chassis is not symmetric front to rear, so this test can tell');
    assert.ok(Math.abs(theirs - mine) < 1, `faces forward in Anvil (${theirs.toFixed(2)} against ${mine.toFixed(2)})`);
  }
});

test('odd designs are exported with a warning, not silently', () => {
  const d = newDesign();
  find(d.chassis, 'bodyMounts').enabled = false;
  find(d.chassis, 'guide').enabled = false;
  const { chassis, warnings } = anvilChassis(d, engine.build(d));
  assert.deepEqual(chassis.posts, []);
  assert.equal(chassis.deck, 3.5, 'without mounts the posts end on the plate');
  assert.ok(warnings.some((w) => /no body mounts/.test(w)) && warnings.some((w) => /no guide holder/.test(w)));
  // A model that is wider at the top would be stood on its head by Anvil.
  const flat = { positions: Float32Array.from([0, -5, 0, 100, -5, 0, 100, 5, 0, 0, 5, 0, 0, -20, 10, 100, -20, 10, 100, 20, 10, 0, 20, 10]), indices: new Uint32Array(0) };
  assert.equal(anvilGuess(flat).upright, false);
  assert.equal(anvilGuess(flat).lies, true);
});

test('the body sits centred between the axles, on its lift, and can be turned and moved', () => {
  // A wedge: low at one end (x = 0), high at the other (x = 150).
  const body = { positions: Float32Array.from([0, -30, 5, 150, -30, 5, 150, 30, 5, 0, 30, 5, 150, -30, 45, 150, 30, 45]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 1, 4, 5]) };
  const placed = placeBody(body, { shift: 0, lift: 2, turn: 0 }, 83.4), b = boundsOf(placed);
  assert.ok(Math.abs((b.min[0] + b.max[0]) / 2 - 41.7) < 1e-4);
  assert.ok(Math.abs(b.min[2] - 2) < 1e-5 && Math.abs(b.min[1] + b.max[1]) < 1e-5);
  const highAt = (m) => m.positions[4 * 3]; // x of a high corner
  assert.ok(highAt(placed) > 41.7);
  const turned = placeBody(body, { shift: 5, lift: 3, turn: 180 }, 83.4);
  assert.ok(highAt(turned) < 46.7, 'turned round, the high end leads');
  assert.ok(Math.abs((boundsOf(turned).min[0] + boundsOf(turned).max[0]) / 2 - 46.7) < 1e-4, 'and it moved 5 mm back');
  const hull = hullOf(placed.positions);
  assert.equal(hull.length, 4, 'a box seen from above has four corners');
});

test('the body check tells a chassis that fits from one that sticks out', () => {
  const d = newDesign(), built = engine.build(d);
  const box = (halfLen, halfWidth) => {
    const c = 41.7;
    return [[c - halfLen, -halfWidth], [c + halfLen, -halfWidth], [c + halfLen, halfWidth], [c - halfLen, halfWidth]];
  };
  const roomy = bodyFit(box(90, 34), built.top.chassis, d);
  assert.deepEqual(roomy.map((n) => n.ok), [true, true]);
  const narrow = bodyFit(box(90, 29), built.top.chassis, d);
  assert.deepEqual(narrow.map((n) => n.ok), [false, false], 'a 58 mm body is narrower than the plate and the wheels');
  const short = bodyFit(box(50, 34), built.top.chassis, d);
  assert.deepEqual(short.map((n) => n.ok), [false, true], 'a short body leaves the chassis ends showing');
  assert.deepEqual(bodyFit([], built.top.chassis, d), []);
});

test('the body is kept in the project file and checked like everything else', () => {
  const d = newDesign();
  d.body = { mesh: 'b1', name: 'McLaren', shift: 3, lift: 2.5, onPlate: true, turn: 270, up: '-y' };
  assert.deepEqual(decodeProject(encodeProject(d)).body, d.body);
  assert.equal(cleanBody({ mesh: '../x', name: 'n' }), null);
  assert.deepEqual(cleanBody({ mesh: 'ok', name: '<b>'.repeat(60), shift: 1e9, lift: -4, turn: 77 }), { mesh: 'ok', name: '<b>'.repeat(60).slice(0, 80), shift: 600, lift: 0, onPlate: false, turn: 0, up: '+z' });
  assert.equal(cleanDesign({ body: 'nope' }).body, undefined);
});

test('a body can be turned in quarter steps and stood up, and is guessed right when it lies across or on its side', () => {
  // A plain box body, 150 long, 60 wide, 40 high, with a marker corner so that its ends can be told apart.
  const box = (sx, sy, sz) => ({ positions: Float32Array.from([0, 0, 0, sx, 0, 0, sx, sy, 0, 0, sy, 0, 0, 0, sz, sx, 0, sz, sx, sy, sz, 0, sy, sz]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6]) });
  const size = (m) => boundsOf(m).size.map((v) => Math.round(v * 10) / 10);
  const good = box(150, 60, 40);
  assert.deepEqual(bodyGuess(good), { up: '+z', turn: 0 });
  // Lying across the car in its file: a quarter turn puts it along the car.
  const across = box(60, 150, 40);
  assert.deepEqual(bodyGuess(across), { up: '+z', turn: 90 });
  // Standing on its side (Y is its height) or on its nose (X is its height).
  assert.deepEqual(bodyGuess(box(150, 40, 60)), { up: '+y', turn: 0 });
  assert.deepEqual(bodyGuess(box(40, 150, 60)), { up: '+x', turn: 90 });
  for (const mesh of [good, across, box(150, 40, 60), box(40, 150, 60), box(60, 40, 150)]) {
    const placed = placeBody(mesh, { shift: 0, lift: 2, ...bodyGuess(mesh) }, 83.4), b = boundsOf(placed);
    assert.deepEqual(size(placed), [150, 60, 40], 'along the car, on its wheels');
    assert.ok(Math.abs((b.min[0] + b.max[0]) / 2 - 41.7) < 0.01 && Math.abs(b.min[1] + b.max[1]) < 0.01 && Math.abs(b.min[2] - 2) < 0.01, 'centred between the axles, at its height');
  }
  // Each quarter turn swaps length and width; four bring it back. Turning round keeps the size and swaps the ends.
  const at = (turn, up = '+z') => placeBody(good, { shift: 0, lift: 2, turn, up }, 83.4);
  assert.deepEqual([0, 90, 180, 270].map((t) => size(at(t)).slice(0, 2)), [[150, 60], [60, 150], [150, 60], [60, 150]]);
  const first = (m) => [m.positions[0], m.positions[1]].map((v) => Math.round(v * 10) / 10);
  assert.deepEqual(first(at(0)), [-33.3, -30]);
  assert.deepEqual(first(at(180)), [116.7, 30], 'the marked corner is now at the other end and the other side');
  assert.deepEqual(first(at(90)), [71.7, -75]);
  // Upside down in the file: stood on its wheels again, the same size.
  assert.deepEqual(size(at(0, '-z')), [150, 60, 40]);
  assert.ok(Math.abs(boundsOf(at(0, '-z')).min[2] - 2) < 0.01);
  // In files.
  assert.deepEqual(cleanBody({ mesh: 'b1', name: 'x', shift: 0, lift: 2, turn: 270, up: '-y' }), { mesh: 'b1', name: 'x', shift: 0, lift: 2, onPlate: false, turn: 270, up: '-y' });
  assert.equal(cleanBody({ mesh: 'b1', turn: 45, up: 'sideways' }).turn, 0);
  assert.equal(cleanBody({ mesh: 'b1', turn: 45, up: 'sideways' }).up, '+z');
  assert.equal(cleanBody({ mesh: 'b1', turn: 180 }).up, '+z', 'an older file has no "up"');
});

test('the wheel arches of a body are found, and the axles are fitted to them', () => {
  // A shell 150 long and 64 wide, open underneath, with an arch cut 14 mm up into each side.
  function shell(arches, length = 150, half = 32) {
    const pos = [], idx = [], v = (x, y, z) => pos.push(x, y, z) / 3 - 1, quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
    const cuts = [0, length, ...arches.flatMap(([c, w]) => [c - w / 2, c + w / 2])].sort((a, b) => a - b);
    for (const s of [1, -1])
      for (let i = 0; i < cuts.length - 1; i++) {
        const mid = (cuts[i] + cuts[i + 1]) / 2, low = arches.some(([c, w]) => Math.abs(mid - c) < w / 2) ? 14 : 0;
        quad(v(cuts[i], s * half, low), v(cuts[i + 1], s * half, low), v(cuts[i + 1], s * half, 30), v(cuts[i], s * half, 30));
      }
    for (const x of [0, length]) quad(v(x, -half, 0), v(x, half, 0), v(x, half, 30), v(x, -half, 30));
    quad(v(20, -half + 6, 36), v(length - 30, -half + 6, 36), v(length - 30, half - 6, 36), v(20, half - 6, 36));
    return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
  }
  const d = newDesign(); // wheelbase 83.4
  d.body = { mesh: 'b1', name: 'Shell', shift: 0, lift: 2, turn: 0, up: '+z' };
  // Arches 31 and 104 mm from the nose, 22 and 24 long: 73 apart.
  const body = shell([[31, 22], [104, 24]]);
  const placed = placeBody(body, d.body, d.car.wheelbase), arches = findArches(placed);
  assert.equal(arches.length, 2);
  const nose = d.car.wheelbase / 2 - 75;
  assert.ok(Math.abs(arches[0].x - (nose + 31)) <= 0.5 && Math.abs(arches[1].x - (nose + 104)) <= 0.5, JSON.stringify(arches));
  assert.ok(Math.abs(arches[0].length - 22) <= 1 && Math.abs(arches[1].length - 24) <= 1);
  assert.ok(Math.abs(arches[0].height - 14) < 0.5);
  assert.equal(archNote(d, arches).ok, false, 'as loaded, the axles are not in the arches');
  assert.match(archNote(d, arches).text, /front axle is \d+\.\d mm (ahead of|behind)/);
  // Fit: the wheelbase becomes the distance between the arches, and the body moves so the front arch is over the front axle.
  const want = archFit(d, arches);
  assert.ok(Math.abs(want.wheelbase - 73) <= 0.6);
  d.car.wheelbase = want.wheelbase;
  d.body.shift = want.shift;
  const after = findArches(placeBody(body, d.body, d.car.wheelbase));
  assert.ok(Math.abs(after[0].x) <= 0.5 && Math.abs(after[1].x - d.car.wheelbase) <= 0.5, JSON.stringify(after));
  assert.equal(archNote(d, after).ok, true);
  // Fitting again changes nothing.
  const again = archFit(d, after);
  assert.ok(Math.abs(again.wheelbase - d.car.wheelbase) <= 0.11 && Math.abs(again.shift - d.body.shift) <= 0.11);
  // Turned round, the arches are found from the other end.
  const turned = findArches(placeBody(body, { ...d.body, shift: 0, turn: 180 }, 83.4));
  assert.ok(Math.abs(turned[1].x - turned[0].x - 73) <= 0.6 && Math.abs(turned[0].length - 24) <= 1, 'the longer arch now leads');
  // A body without arches, or with one, gives none; so does a small vent in the side.
  assert.equal(findArches(placeBody(shell([]), d.body, 83.4)), null);
  assert.equal(findArches(placeBody(shell([[31, 22]]), d.body, 83.4)), null);
  assert.equal(findArches(placeBody(shell([[31, 22], [70, 5]]), d.body, 83.4)), null);
  assert.equal(archNote(d, null), null);
});
