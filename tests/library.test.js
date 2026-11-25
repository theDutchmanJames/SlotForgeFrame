import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { encodeSTL } from '../src/geometry/stl.js';
import { readSTL, orient, guessOrientation, boundsOf, weld } from '../src/geometry/stl-read.js';
import { pickMounts } from '../src/geometry/mesh-measure.js';
import { cleanItem, encodeShare, decodeShare, packMesh, unpackMesh, thumbOf, cleanThumb } from '../src/library-core.js';
import { newDesign, newShape, cleanPart, cleanDesign, decodeProject, encodeProject, find, podLayout, checks } from '../src/model.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const noIds = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' ? undefined : v)));

// The default pod, exported and read back the way a user would import it.
function podFromFile() {
  const d = newDesign();
  const built = engine.build(d);
  const stood = orient(readSTL(encodeSTL(built.pod)), { up: '+z', turn: 0 });
  const info = engine.analyse(stood);
  return { d, built, stood, info };
}

// ------------------------------------------------------------ reading STL files

test('a binary STL written by the app reads back as the same closed shape', () => {
  const built = engine.build(newDesign());
  const mesh = readSTL(encodeSTL(built.chassis));
  // Welding may drop a few needle-thin triangles; the shape stays closed and the same size.
  assert.ok(Math.abs(mesh.indices.length - built.chassis.indices.length) < built.chassis.indices.length * 0.01);
  assert.ok(Math.abs(engine.analyse(orient(mesh)).volume - built.chassis.volume) < 0.5);
});

test('a text STL reads the same as a binary one', () => {
  const tri = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 10, 10, 0, 0, 0, 0, 10, 0, 10, 0];
  let text = 'solid tetra\n';
  for (let t = 0; t < tri.length; t += 9)
    text += ` facet normal 0 0 0\n  outer loop\n${[0, 3, 6].map((k) => `   vertex ${tri[t + k]} ${tri[t + k + 1]} ${tri[t + k + 2].toExponential(3)}`).join('\n')}\n  endloop\n endfacet\n`;
  const mesh = readSTL(new TextEncoder().encode(text + 'endsolid tetra\n'));
  assert.equal(mesh.positions.length / 3, 4);
  assert.equal(mesh.indices.length / 3, 4);
});

test('files that are not a usable STL are refused with a clear message', () => {
  assert.throws(() => readSTL(new Uint8Array(4)), /too small/);
  assert.throws(() => readSTL(new TextEncoder().encode('hello, this is a letter and not a model at all')), /not an STL/);
  const bad = new Uint8Array(84 + 50);
  new DataView(bad.buffer).setUint32(80, 1, true);
  new DataView(bad.buffer).setFloat32(84 + 12, NaN, true);
  assert.throws(() => readSTL(bad), /not valid/);
  // One loose triangle is no solid.
  const flat = new Uint8Array(84 + 50), v = new DataView(flat.buffer);
  v.setUint32(80, 1, true);
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((p, i) => p.forEach((c, k) => v.setFloat32(84 + 12 + i * 12 + k * 4, c, true)));
  assert.throws(() => readSTL(flat), /no solid shape/);
  assert.throws(() => engine.analyse(weld(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0]))), /not a closed solid/);
});

test('orient stands a part up whichever way it lies in the file, and scales inches', () => {
  const { stood } = podFromFile();
  const size = boundsOf(stood).size;
  // Lay it on its side (old Y becomes up), then ask for it back.
  const side = { positions: Float32Array.from(stood.positions), indices: stood.indices };
  for (let i = 0; i < side.positions.length; i += 3) [side.positions[i + 1], side.positions[i + 2]] = [-side.positions[i + 2], side.positions[i + 1]];
  const guess = guessOrientation(side);
  assert.equal(guess.up[1], 'y');
  const back = orient(side, guess), b = boundsOf(back);
  assert.ok(Math.abs(b.size[2] - size[2]) < 1e-3 && Math.abs(b.size[0] - size[0]) < 1e-3, 'same size once stood up');
  assert.ok(Math.abs(b.min[2]) < 1e-4 && Math.abs(b.min[0]) < 1e-4 && Math.abs(b.min[1] + b.max[1]) < 1e-3, 'underside on 0, front on 0, centred');
  assert.ok(engine.analyse(back).volume > 0, 'still a closed solid, not turned inside out');
  assert.ok(Math.abs(boundsOf(orient(stood, { scale: 25.4 })).size[0] - size[0] * 25.4) < 0.01);
});

// ------------------------------------------------------------ importing a pod

test('an imported pod gives back its four screw points', () => {
  const { d, info } = podFromFile();
  const mounts = pickMounts(info.holes), lugs = find(d.pod, 'lugs').params;
  assert.equal(mounts.length, 4);
  const xs = mounts.map((m) => m.x), ys = mounts.map((m) => m.y);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - lugs.patternX) < 0.05, 'pattern along');
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - lugs.patternY) < 0.05, 'pattern across');
});

test('a design that uses an imported pod builds, and the chassis follows the pod', () => {
  const { d, stood, info } = podFromFile();
  const mounts = pickMounts(info.holes), rear = Math.max(...mounts.map((m) => m.x));
  engine.setMesh({ key: 'pod1', ...stood });
  d.pod.imported = { mesh: 'pod1', name: 'Test pod', mounts: mounts.map((m) => [m.x, m.y]), holeD: 1.8, axleX: rear - 6.6, axleZ: 8.25, box: [0, info.size[0], info.size[1]] };
  const out = engine.build(d);
  assert.ok(out.notes.find((n) => n.title === 'Pod fits its opening')?.ok, 'the opening follows the pod');
  assert.equal(out.notes.filter((n) => /separate pieces/.test(n.title)).length, 0);
  assert.ok(Math.abs(out.pod.volume - engine.analyse(stood).volume) < 0.5, 'the pod is the imported shape');
  // The screw points land where the generated pod had them.
  const lay = podLayout(d), plain = podLayout(newDesign());
  for (const [x, y] of plain.points) assert.ok(lay.points.some(([a, b]) => Math.abs(a - x) < 0.1 && Math.abs(b - y) < 0.1));
  assert.ok(checks(d).some((c) => /Imported pod matches/.test(c.title)));
  // Without its model the design is refused, not built wrong.
  d.pod.imported.mesh = 'gone';
  assert.throws(() => engine.build(d), /lost its model/);
});

test('an imported chassis keeps its shape and still takes features and cuts', () => {
  const src = newDesign();
  find(src.chassis, 'kickup').enabled = false;
  const stood = orient(readSTL(encodeSTL(engine.build(src).chassis)));
  const info = engine.analyse(stood);
  engine.setMesh({ key: 'ch1', ...stood });
  const d = newDesign();
  for (const type of ['guide', 'frontAxle', 'podMounts', 'bodyMounts', 'podOpening', 'kickup']) find(d.chassis, type).enabled = false;
  d.chassis.imported = { mesh: 'ch1', name: 'Test chassis', frontX: 30, size: info.size };
  const plain = engine.build(d);
  assert.ok(Math.abs(plain.chassis.volume - info.volume) < 1, 'untouched when nothing is added');
  d.chassis.features.push(newShape('rib', d));
  const more = engine.build(d);
  assert.ok(more.chassis.volume > plain.chassis.volume, 'a rib adds to it');
  const win = newShape('window', d);
  Object.assign(win.params, { x0: 20, x1: 40, y0: 20, y1: 29 });
  d.chassis.features.push(win);
  assert.ok(engine.build(d).chassis.volume < more.chassis.volume, 'a window cuts through it');
});

// ------------------------------------------------------------ library items and share files

test('a mesh survives packing, and damaged ones are refused', () => {
  const { stood } = podFromFile();
  const back = unpackMesh(packMesh(stood));
  assert.deepEqual(back.positions, stood.positions);
  assert.deepEqual(back.indices, stood.indices);
  assert.throws(() => unpackMesh(null), /no model/);
  assert.throws(() => unpackMesh({ p: '!!!', i: 'AAAA' }), /damaged/);
  assert.throws(() => unpackMesh({ p: btoa('12345'), i: btoa('123456789012') }), /damaged/);
  const wild = packMesh({ positions: new Float32Array(9), indices: Uint32Array.from([0, 1, 7]) });
  assert.throws(() => unpackMesh(wild), /damaged/, 'a corner pointing past the last point');
  const nan = packMesh({ positions: Float32Array.from([0, 0, NaN, 0, 0, 0, 0, 0, 0]), indices: Uint32Array.from([0, 1, 2]) });
  assert.throws(() => unpackMesh(nan), /damaged/);
});

test('a made pod and a made chassis travel through a share file unchanged', () => {
  const d = newDesign();
  d.drivetrain.layout = 'anglewinder';
  d.drivetrain.gear = 'nsr-aw-31-13';
  d.chassis.features.push(newShape('tunnel', d));
  const built = engine.build(d);
  const pod = cleanItem({ kind: 'pod', name: 'My pod', scale: '1/32', thumb: thumbOf(built.top.pod), data: { scale: d.scale, drivetrain: d.drivetrain, features: d.pod.features } }, cleanPart);
  const chassis = cleanItem({ kind: 'chassis', name: 'My chassis', scale: '1/32', data: { scale: d.scale, car: d.car, rules: d.rules, features: d.chassis.features } }, cleanPart);
  const { items, skipped } = decodeShare(encodeShare([pod, chassis]), cleanPart);
  assert.equal(skipped.length, 0);
  assert.deepEqual(noIds(items[0].data), noIds({ drivetrain: d.drivetrain, features: d.pod.features }));
  assert.deepEqual(noIds(items[1].data.features), noIds(d.chassis.features));
  assert.equal(items[1].data.car.wheelbase, d.car.wheelbase);
  assert.equal(items[0].source, 'made');
  assert.notEqual(items[0].id, pod.id, 'a shared part gets its own id');
  assert.ok(items[0].thumb.d.startsWith('M'));
  // Used in a fresh design, the shared pod builds.
  const e = newDesign();
  e.drivetrain = items[0].data.drivetrain;
  e.pod.features = items[0].data.features;
  assert.ok(engine.build(e).pod.volume > 100);
});

test('an imported pod travels through a share file with its model', () => {
  const { stood, info } = podFromFile();
  const item = cleanItem({ kind: 'pod', name: 'Bought pod', scale: '1/32', mesh: packMesh(stood), data: { imported: { mesh: 'lib', name: 'Bought pod', mounts: [[2, 10], [2, -10]], holeD: 1.8, axleX: 50, axleZ: 7.5, box: [0, info.size[0], info.size[1]] } } }, cleanPart);
  assert.equal(item.source, 'imported');
  const back = decodeShare(encodeShare([item]), cleanPart).items[0];
  assert.deepEqual(unpackMesh(back.mesh).indices, stood.indices);
  assert.deepEqual(back.data.imported.mounts, [[2, 10], [2, -10]]);
  // The same settings without a model are not an imported part.
  assert.throws(() => decodeShare(JSON.stringify({ format: 'slotforge-frame-library', version: 1, items: [{ kind: 'pod', name: 'x', mesh: { p: 'AAAA', i: 'AAAA' }, data: item.data }] }), cleanPart), /damaged/);
});

test('a share file from someone else cannot smuggle anything in', () => {
  const hostile = {
    format: 'slotforge-frame-library', version: 1,
    items: [
      { kind: 'pod', id: '"><img src=x onerror=alert(1)>', name: '<script>alert(1)</script>'.repeat(20), scale: '"><b>', source: 'evil', note: 7,
        thumb: { vb: [0, 0, 10, 10], d: 'M0 0"/><script>alert(1)</script>' },
        data: { drivetrain: { layout: '__proto__', motor: 'constructor', gear: {}, offset: 1e308 }, features: [{ type: 'uprights', id: '"><x', params: { seat: -5, holder: '<i>', spread: 'wide' } }, { type: 'nonsense' }] } },
      { kind: 'spaceship', name: 'x', data: {} },
      'not an item',
    ],
  };
  const { items, skipped } = decodeShare(JSON.stringify(hostile), cleanPart);
  assert.equal(items.length, 1);
  assert.equal(skipped.length, 2);
  const it = items[0];
  assert.match(it.id, /^[\w-]+$/);
  assert.ok(it.name.length <= 80);
  assert.equal(it.scale, '1/32');
  assert.equal(it.source, 'made');
  assert.equal(it.note, '');
  assert.equal(it.thumb, null, 'a drawing with anything but straight lines is dropped');
  assert.equal(it.data.drivetrain.layout, 'inline');
  assert.equal(it.data.drivetrain.motor, 'fc130');
  assert.ok(Math.abs(it.data.drivetrain.offset) <= 5);
  const up = it.data.features.find((f) => f.type === 'uprights');
  assert.match(up.id, /^[\w-]+$/);
  assert.equal(up.params.holder, 'closed');
  assert.ok(up.params.seat >= 1 && Number.isFinite(up.params.spread));
  assert.deepEqual(it.data.features.map((f) => f.type), ['base', 'motorSeat', 'uprights', 'lugs']);
  // A name is plain text and is escaped when shown; nothing else may carry markup.
  assert.equal(JSON.stringify({ ...it, name: '' }).includes('<'), false);
  assert.equal(cleanThumb({ vb: [0, 0, 1, 1], d: 'M0 0L1 1Z' }).d, 'M0 0L1 1Z');
});

test('files of the wrong kind are refused', () => {
  assert.throws(() => decodeShare('nope', cleanPart), /not a SlotForge Frame library file/);
  assert.throws(() => decodeShare(JSON.stringify({ format: 'slotforge-frame-project' }), cleanPart), /not a SlotForge Frame library file/);
  assert.throws(() => decodeShare(JSON.stringify({ format: 'slotforge-frame-library', version: 99, items: [] }), cleanPart), /newer/);
  assert.throws(() => decodeShare(JSON.stringify({ format: 'slotforge-frame-library', version: 1, items: [] }), cleanPart), /no parts/);
  assert.throws(() => decodeProject(encodeShare([])), /not a SlotForge Frame file/);
});

// ------------------------------------------------------------ project files

test('a project file is cleaned when opened: old, hand-edited or hostile', () => {
  const d = newDesign('1/24');
  d.chassis.features.push(newShape('wall', d), newShape('panel', d));
  assert.deepEqual(noIds(decodeProject(encodeProject(d))), noIds(d), 'a good file comes back unchanged');

  const raw = JSON.parse(encodeProject(d));
  raw.scale = '<img src=x>';
  raw.printer.material = 'unobtainium';
  raw.car.wheelbase = 'long';
  raw.car.rear.tyreD = -4;
  raw.chassis.features = raw.chassis.features.filter((f) => f.type !== 'guide'); // an old file without a guide
  raw.chassis.features.find((f) => f.type === 'kickup').params.strakes = 5e6;
  raw.chassis.features.find((f) => f.type === 'outline').params.points = [[0, 0]];
  raw.chassis.features.push({ type: 'rib', enabled: 'yes', params: { points: [[1, 'a'], null], width: -3, side: 'sideways' } });
  raw.pod.imported = { mesh: '../../etc', mounts: 'all' };
  const c = decodeProject(JSON.stringify(raw));
  assert.equal(c.scale, '1/32');
  assert.equal(c.printer.material, 'petg');
  assert.ok(c.car.wheelbase > 20 && c.car.rear.tyreD >= 4);
  assert.ok(find(c.chassis, 'guide'), 'a missing feature is put back');
  assert.ok(find(c.chassis, 'kickup').params.strakes <= 40);
  assert.ok(find(c.chassis, 'outline').params.points.length >= 3);
  const rib = c.chassis.features.at(-1);
  assert.equal(rib.type, 'rib');
  assert.ok(rib.params.points.length >= 2 && rib.params.width >= 0.2 && rib.params.side === 'top');
  assert.equal(c.pod.imported, undefined, 'an imported part with a bad key is dropped');
  assert.ok(engine.build(c).chassis.volume > 100, 'and the cleaned design builds');
  assert.equal(cleanDesign(null).scale, '1/32');
});
