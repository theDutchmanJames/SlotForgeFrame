// Jivko's ready-made wheel inserts: scaled across only, the back made deeper or shallower, an axle hole.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, encodeProject, decodeProject } from '../src/model.js';
import { MODELS, MODEL_IDS, modelInsert, minDepth, modelScale, cleanInsert, insertChecks, directional, mirrored, newBase } from '../src/inserts.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
const build = (ins) => engine.insert({ insert: ins, nozzle: 0.4, axleD: 2.38 });
const at = (id, o = {}) => { const ins = modelInsert(id, { ...newBase('1/32'), ...o }); if (o.depth != null) ins.base.depth = o.depth; return ins; };

test('ten designs by Jivko, each named for the library', () => {
  assert.equal(MODEL_IDS.length, 10);
  for (const id of MODEL_IDS) {
    const m = MODELS[id];
    assert.equal(m.title, `Jivko Design - ${m.name}`);
    assert.ok(m.R0 === 9 && m.H >= 10 && m.faceDepth > 1 && m.faceDepth < 5, id);
    assert.ok(m.hubR > 2.5, `${id} has a hub to drill`);
  }
  assert.deepEqual(MODEL_IDS.filter((id) => MODELS[id].directional), ['jivko-star']);
});

test('as drawn, each builds in one piece at its own size', () => {
  for (const id of MODEL_IDS) {
    const m = MODELS[id], r = build(at(id, { od: 18, hole: 0, depth: m.H }));
    assert.equal(r.pieces, 1, id);
    r.size.forEach((v, i) => assert.ok(Math.abs(v - [18, 18, m.H][i]) < 0.01, `${id} size ${r.size}`));
  }
});

test('the diameter scales across only; the depth changes the back and never the face', () => {
  for (const id of ['jivko-six', 'jivko-aero-two', 'jivko-star']) {
    const m = MODELS[id], full = build(at(id, { od: 18, hole: 0, depth: m.H }));
    for (const [od, depth] of [[11.8, minDepth(m)], [11.8, 8], [16, 14]]) {
      const r = build(at(id, { od, hole: 0, depth })), k = modelScale(m, { od });
      assert.equal(r.pieces, 1, `${id} Ø${od} × ${depth}`);
      r.size.forEach((v, i) => assert.ok(Math.abs(v - [od, od, depth][i]) < 0.01, `${id} size ${r.size}`));
      // The face is the same shape, only narrower: its volume above the back scales with k² exactly.
      const backFull = full.volume, backThis = r.volume;
      // Volume = back (area × length) + face; the back's area scales with k², and so does the face.
      const areaFull = (build(at(id, { od: 18, hole: 0, depth: m.H + 1 })).volume - backFull);
      const faceFull = backFull - areaFull * (m.H - m.faceDepth), faceThis = backThis - areaFull * k * k * (depth - m.faceDepth);
      assert.ok(Math.abs(faceThis - faceFull * k * k) < 0.02 * faceFull * k * k + 0.5, `${id}: face ${faceThis.toFixed(1)} vs ${(faceFull * k * k).toFixed(1)}`);
    }
  }
});

test('the depth is never less than the face needs, in the file or in the engine', () => {
  const m = MODELS['jivko-aero-two'], min = minDepth(m);
  assert.ok(min > m.faceDepth + 0.6 - 1e-9 && min < m.faceDepth + 0.8);
  const ins = cleanInsert(at('jivko-aero-two', { depth: 1 }));
  assert.equal(ins.base.depth, min);
  assert.ok(Math.abs(build(at('jivko-aero-two', { depth: 1 })).size[2] - min) < 0.01);
  assert.ok(insertChecks(ins).some((n) => n.ok && /As shallow as the face allows/.test(n.title)));
});

test('the axle hole goes through the hub, and is checked against the axle and the hub', () => {
  const m = MODELS['jivko-eight'], plain = build(at('jivko-eight', { hole: 0 })), holed = build(at('jivko-eight', { hole: 2.6 }));
  // The hole takes the hub under the dish: at least the whole back, at most the whole depth.
  const ins = at('jivko-eight', { hole: 2.6 }), disc = Math.PI * 1.3 * 1.3, lost = plain.volume - holed.volume;
  assert.ok(lost > disc * (ins.base.depth - m.faceDepth) && lost < disc * ins.base.depth, `${lost} for a depth of ${ins.base.depth}`);
  assert.equal(holed.pieces, 1);
  const k = modelScale(m, ins.base), hub = 2 * m.hubR * k;
  assert.ok(insertChecks(at('jivko-eight', { hole: 2 })).some((n) => /smaller than the axle/.test(n.title)));
  assert.ok(insertChecks(at('jivko-eight', { hole: hub })).some((n) => /runs into the openings/.test(n.title)));
  assert.ok(!insertChecks(ins).some((n) => !n.ok && !n.soft));
});

test('a design that turns one way is mirrored for the other side, unless you say not to', () => {
  const star = at('jivko-star'), six = at('jivko-six');
  assert.ok(directional(star) && mirrored(star) && !directional(six) && !mirrored(six));
  assert.ok(!mirrored({ ...star, mirror: false }));
  const d = newDesign();
  d.inserts.rear = star;
  const a = engine.insertSet(d);
  d.inserts.rear = { ...star, mirror: false };
  const b = engine.insertSet(d);
  assert.ok(Math.abs(a.volume - b.volume) < 0.5);
  // Mirrored, the two left-hand copies differ from the right-hand ones: the plate's points are not the same.
  const points = (r) => { const p = r.mesh.positions, out = []; for (let i = 0; i < p.length; i += 3) out.push(`${p[i].toFixed(2)} ${p[i + 1].toFixed(2)} ${p[i + 2].toFixed(2)}`); return out.sort().join(','); };
  assert.notEqual(points(a), points(b));
});

test('a ready-made insert is kept in the design file; one this copy does not have becomes a disc', () => {
  const d = newDesign();
  d.inserts.same = false;
  d.inserts.front = { ...at('jivko-b29', { od: 12.4, hole: 3, depth: 6 }), mirror: false };
  const back = decodeProject(encodeProject(d));
  assert.deepEqual(back.inserts.front, JSON.parse(JSON.stringify(d.inserts.front)));
  const odd = cleanInsert({ ...d.inserts.front, base: { ...d.inserts.front.base, model: 'jivko-nothing' } });
  assert.equal(odd.base.form, 'disc');
});
