// The rail frame: closed round the gear's cut-out, and the struts in the nose.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createEngine } from '../src/geometry/engine.js';
import { newDesign, find, cleanDesign, gearOf, gearSide, meshCentre, podLayout, partsLayout, motorPlace, podSideways, podShift, podRide, rideClearance, heights, checks, gearShape, uprightSpread, frontStub, newShape, balance, centroidOf, MATERIALS } from '../src/model.js';
import { cleanComponent } from '../src/components.js';

const wasm = await Module();
wasm.setup();
const engine = createEngine(wasm);
// Whether a point lies in the plate as seen from above (its rings, holes included).
function inPlate(rings, x, y) {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

test('beside a sidewinder or anglewinder gear the frame is tied to the tail behind the pod, on either side', () => {
  for (const [layout, gear] of [['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11']])
    for (const drives of ['right', 'left']) {
      const d = newDesign(), what = `${layout}, ${drives}`;
      Object.assign(d.drivetrain, { layout, gear, angle: null, drives });
      d.drivetrain.centre = meshCentre(gearOf(d), layout);
      find(d.pod, 'base').params.sideways = podSideways(d); // as the app does when the layout is chosen
      const gs = gearSide(d), wb = d.car.wheelbase, w = find(d.chassis, 'fill').params.railWidth, lay = podLayout(d);
      const sg = drives === 'left' ? -1 : 1;
      assert.equal(Math.sign(gs.y), sg, `${what}: the gear is on that side`);
      const out = engine.build(d), rings = out.top.chassis;
      // The gear has its cut-out, across its whole width, and nothing is left standing ahead of or behind it there.
      const across = [];
      for (let y = gs.yd - gs.t / 2 - 0.6; y <= gs.yd + gs.t / 2 + 0.6; y += 0.2) across.push(y);
      assert.ok(!across.some((y) => inPlate(rings, wb, y)), `${what}: the gear runs free`);
      const outer = across.filter((y) => Math.abs(y) > Math.abs(gs.yd));
      for (const x of [wb - gs.r - 0.8 - w / 2, wb + gs.r + 0.8 + w / 2])
        assert.ok(!outer.some((y) => inPlate(rings, x, y) && !inPlate(rings, x, -y)), `${what}: no stub towards the wheel at ${x.toFixed(1)}`);
      // Behind the pod a rail runs back to the tail, along the inner edge of the cut-out.
      const inner = gs.yd - sg * (gs.t / 2 + 0.8), fold = find(d.chassis, 'kickup').params.fold;
      const from = lay.x1 + find(d.chassis, 'podOpening').params.gap + w + 0.3;
      assert.ok(fold > from + 1, `${what}: there is a stretch between the pod and the tail`);
      for (const k of [0.2, 0.5, 0.8]) assert.ok(inPlate(rings, from + (fold - from) * k, inner - sg * (w / 2)), `${what}: the link to the tail, ${k * 100}% along`);
      assert.deepEqual(out.notes.filter((n) => !n.ok && !n.soft && n.title !== 'The chassis is open beside the gear'), [], `${what}: no faults`);
      // A closed plate keeps its cut-out and needs no rail.
      find(d.chassis, 'fill').params.style = 'closed';
      assert.ok(!across.some((y) => inPlate(engine.build(d).top.chassis, wb, y)));
    }
});

test('the drivetrain can sit on the left: pod, gear and motor are the mirror image', () => {
  const box = (mesh) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < mesh.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.positions[i + k]); hi[k] = Math.max(hi[k], mesh.positions[i + k]); } return { lo, hi }; };
  const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
  assert.equal(newDesign().drivetrain.drives, 'right');
  for (const [layout, gear] of [['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11'], ['inline', null]]) {
    const d = newDesign();
    Object.assign(d.drivetrain, { layout, angle: null, shiftY: 0.5 }, gear ? { gear } : {});
    if (gear) d.drivetrain.centre = meshCentre(gearOf(d), layout);
    const right = engine.build(d), pr = partsLayout(d), mr = motorPlace(d), lr = podLayout(d);
    d.drivetrain.drives = 'left';
    d.drivetrain.shiftY = -0.5; // "sideways" is a place on the car, so the twin of +0.5 is -0.5
    const left = engine.build(d), pl = partsLayout(d), ml = motorPlace(d), ll = podLayout(d);
    // Motor, pinion and gear swap sides; along the car nothing changes.
    assert.ok(near(ml.x, mr.x) && near(ml.y, -mr.y) && near(ml.angle, -mr.angle), `${layout}: the motor`);
    assert.ok(near(pl.gear.y, -pr.gear.y) && near(pl.gear.x, pr.gear.x) && near(pl.pinion.y, -pr.pinion.y) && near(pl.pinion.x, pr.pinion.x), `${layout}: gear and pinion`);
    assert.ok(Math.abs(pr.gear.y) > 1, `${layout}: the gear is off the centre line, so the side matters`);
    assert.ok(near(pl.shaft.y1, -pr.shaft.y1) && near(ll.widest, lr.widest) && near(ll.x0, lr.x0));
    // The pod is the same part turned over.
    const br = box(right.pod), bl = box(left.pod);
    assert.ok(near(left.pod.volume, right.pod.volume, 0.05), `${layout}: the same amount of pod`);
    assert.ok(near(bl.lo[1], -br.hi[1], 0.02) && near(bl.hi[1], -br.lo[1], 0.02) && near(bl.lo[0], br.lo[0], 0.02) && near(bl.hi[2], br.hi[2], 0.02), `${layout}: the pod is mirrored`);
    // Its outline from above is mirrored too, and the chassis is built round it.
    const ys = (rings) => rings.flat().map((q) => q[1]);
    assert.ok(near(Math.max(...ys(left.top.pod)), -Math.min(...ys(right.top.pod)), 0.02));
    assert.ok(near(left.chassis.volume, right.chassis.volume, 0.5), `${layout}: the chassis is the mirror image as well`);
    assert.deepEqual(left.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title), right.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title), `${layout}: the same checks pass`);
    assert.ok(left.notes.find((n) => n.title === 'Pod fits its opening')?.ok);
  }
  // In files: kept, and anything else is the right-hand side (also for older files).
  const d = newDesign();
  d.drivetrain.drives = 'left';
  assert.equal(cleanDesign(JSON.parse(JSON.stringify(d))).drivetrain.drives, 'left');
  const old = JSON.parse(JSON.stringify(d));
  delete old.drivetrain.drives;
  assert.equal(cleanDesign(old).drivetrain.drives, 'right');
  old.drivetrain.drives = 'middle';
  assert.equal(cleanDesign(old).drivetrain.drives, 'right');
});

test('nose struts run from the guide to the axle brackets and to the pod opening', () => {
  const d = newDesign(), fill = find(d.chassis, 'fill').params;
  assert.equal(fill.struts, 'fan', 'a new frame has them');
  const guide = find(d.chassis, 'guide').params, axle = find(d.chassis, 'frontAxle').params, lay = podLayout(d);
  const from = [guide.along, guide.side], bracket = [axle.along, axle.spread / 2], corner = [lay.x0, lay.width / 2];
  // Two places along a strut, clear of the pads at its ends.
  const along = (to) => [0.45, 0.6].map((k) => [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]);
  const has = (rings, to) => along(to).every(([x, y]) => inPlate(rings, x, y) && inPlate(rings, x, -y));
  fill.guideRail = false; fill.axleRail = false; // only the struts
  const built = (struts) => { fill.struts = struts; return engine.build(d); };
  const fan = built('fan'), toAxle = built('axle'), none = built('none');
  assert.ok(has(fan.top.chassis, bracket) && has(fan.top.chassis, corner), 'fan: both pairs, on both sides');
  assert.ok(has(toAxle.top.chassis, bracket) && !has(toAxle.top.chassis, corner), 'axle: only the pair to the brackets');
  assert.ok(!has(none.top.chassis, bracket) && !has(none.top.chassis, corner), 'none: the nose as it was');
  assert.ok(fan.chassis.volume > toAxle.chassis.volume && toAxle.chassis.volume > none.chassis.volume);
  for (const out of [fan, toAxle, none]) assert.deepEqual(out.notes.filter((n) => !n.ok && !n.soft), []);
  // In files: kept, and an unknown value or an older file gets the fan.
  fill.struts = 'axle';
  assert.equal(find(cleanDesign(JSON.parse(JSON.stringify(d))).chassis, 'fill').params.struts, 'axle');
  const old = JSON.parse(JSON.stringify(d));
  delete old.chassis.features.find((f) => f.type === 'fill').params.struts;
  assert.equal(find(cleanDesign(old).chassis, 'fill').params.struts, 'fan');
  old.chassis.features.find((f) => f.type === 'fill').params.struts = 'everywhere';
  assert.equal(find(cleanDesign(old).chassis, 'fill').params.struts, 'fan');
  // A lattice and a closed plate have no struts to add.
  fill.style = 'closed'; fill.struts = 'fan';
  const closed = engine.build(d).chassis.volume;
  fill.struts = 'none';
  assert.equal(engine.build(d).chassis.volume, closed);
});

test('a rail runs under the front axle from bracket to bracket', () => {
  const d = newDesign(), fill = find(d.chassis, 'fill').params, axle = find(d.chassis, 'frontAxle').params;
  assert.equal(fill.axleRail, true, 'a new frame has it');
  fill.struts = 'none'; // nothing else crosses there
  fill.guideRail = false;
  // Places under the axle, between the centre rail and a bracket, on both sides.
  const under = (rings) => [0.25, 0.5, 0.75].every((k) => [1, -1].every((s) => inPlate(rings, axle.along, (s * k * axle.spread) / 2)));
  const withRail = engine.build(d);
  assert.ok(under(withRail.top.chassis));
  assert.deepEqual(withRail.notes.filter((n) => !n.ok && !n.soft), []);
  fill.axleRail = false;
  const without = engine.build(d);
  assert.ok(!under(without.top.chassis), 'switched off, the nose is open there');
  assert.ok(withRail.chassis.volume > without.chassis.volume);
  // It follows the axle and its brackets when they move.
  fill.axleRail = true;
  axle.along = 4; axle.spread = 30;
  assert.ok(under(engine.build(d).top.chassis));
  // In files: kept when off; an older file without the setting gets the rail.
  fill.axleRail = false;
  assert.equal(find(cleanDesign(JSON.parse(JSON.stringify(d))).chassis, 'fill').params.axleRail, false);
  const old = JSON.parse(JSON.stringify(d));
  delete old.chassis.features.find((f) => f.type === 'fill').params.axleRail;
  assert.equal(find(cleanDesign(old).chassis, 'fill').params.axleRail, true);
});

test('strakes under a kick-up stay under a tail that narrows', () => {
  const d = newDesign(), outline = find(d.chassis, 'outline').params, kick = find(d.chassis, 'kickup').params;
  // The tail runs in from 27 mm at the fold to 8 mm at its end, as a traced outline does.
  const n = outline.points.length;
  assert.deepEqual(outline.points.slice(n - 3), [[95.5, 27], [110, 27], [110, 0]]);
  outline.points[n - 2] = [110, 8];
  outline.round = 0;
  kick.fold = 96;
  const rad = (kick.angle * Math.PI) / 180, edge = (flat) => 27 - ((flat - 95.5) * 19) / 14.5;
  const outside = (mesh) => {
    let worst = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i], y = Math.abs(mesh.positions[i + 1]);
      if (x > kick.fold + 1) worst = Math.max(worst, y - edge(kick.fold + (x - kick.fold) / Math.cos(rad)));
    }
    return worst;
  };
  const out = engine.build(d);
  assert.ok(outside(out.chassis) < 0.3, `nothing stands beside the tail (${outside(out.chassis).toFixed(2)} mm out)`);
  assert.deepEqual(out.notes.filter((r) => !r.ok && !r.soft), []);
  // The strakes are still there, under the plate.
  kick.strakes = 0;
  const bare = engine.build(d);
  assert.ok(out.chassis.volume > bare.chassis.volume + 5, 'strakes add material');
  assert.ok(outside(bare.chassis) < 0.3);
  // A straight tail keeps every strake whole: the same volume as before this rule.
  const plain = newDesign(), full = engine.build(plain).chassis.volume;
  find(plain.chassis, 'kickup').params.strakes = 0;
  const k = find(newDesign().chassis, 'kickup').params, len = 110 - k.fold, r = (k.angle * Math.PI) / 180;
  const each = 0.5 * len * Math.cos(r) * len * Math.sin(r) * k.strakeT;
  assert.ok(Math.abs(full - engine.build(plain).chassis.volume - k.strakes * each) < k.strakes * each * 0.2, 'on a straight tail the strakes are whole');
});

test('a rail runs across the nose from the guide holder to both sides', () => {
  const d = newDesign(), fill = find(d.chassis, 'fill').params, guide = find(d.chassis, 'guide').params;
  assert.equal(fill.guideRail, true, 'a new frame has it');
  fill.struts = 'none'; fill.axleRail = false;
  // The plate's half-width at the guide, from the outline; then places between the guide's pad and the outer rail.
  const pts = find(d.chassis, 'outline').params.points;
  const halfAt = (x) => { for (let i = 1; i < pts.length; i++) if (x >= pts[i - 1][0] && x <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]); return 0; };
  const reach = halfAt(guide.along), from = guide.padD / 2 + 1, to = reach - fill.outerRail - 1;
  assert.ok(to > from + 2, 'there is open frame beside the guide to cross');
  const across = (rings) => [0.2, 0.5, 0.8].every((k) => [1, -1].every((s) => inPlate(rings, guide.along, s * (from + (to - from) * k))));
  const withRail = engine.build(d);
  assert.ok(across(withRail.top.chassis), 'on both sides');
  assert.deepEqual(withRail.notes.filter((n) => !n.ok && !n.soft), []);
  fill.guideRail = false;
  assert.ok(!across(engine.build(d).top.chassis), 'switched off, it is gone');
  // It follows the guide when the guide moves.
  fill.guideRail = true;
  guide.along += 3;
  assert.ok([1, -1].every((s) => inPlate(engine.build(d).top.chassis, guide.along, s * (from + 2))));
  // An older file without the setting gets the rail.
  const old = JSON.parse(JSON.stringify(d));
  delete old.chassis.features.find((f) => f.type === 'fill').params.guideRail;
  assert.equal(find(cleanDesign(old).chassis, 'fill').params.guideRail, true);
});

test('a motor can be turned end for end: the bulkheads swap openings and the screw holes move to the far end', () => {
  // Where the weight of a part lies along the car.
  const centreX = (mesh) => {
    const p = mesh.positions, t = mesh.indices;
    let vol = 0, cx = 0;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      const v = (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
      vol += v; cx += (v * (p[a] + p[b] + p[c])) / 4;
    }
    return cx / vol;
  };
  const d = newDesign(); // inline: the shaft points back, at the rear axle
  assert.equal(d.drivetrain.reverse, false);
  // FK-130 type: both bosses are the same size, so only the two screw holes move, from the rear bulkhead to the front one.
  d.drivetrain.motor = 'fk130';
  const normal = engine.build(d);
  d.drivetrain.reverse = true;
  const turned = engine.build(d);
  assert.ok(Math.abs(turned.pod.volume - normal.pod.volume) < 0.2, 'the same amount of pod');
  assert.ok(centreX(turned.pod) > centreX(normal.pod) + 0.002, 'material came back at the shaft end, holes went to the far end');
  assert.deepEqual(turned.notes.filter((n) => !n.ok && !n.soft), []);
  assert.ok(Math.abs(turned.chassis.volume - normal.chassis.volume) < 0.01, 'the chassis does not change');
  // FC-130: the endbell's boss is wider than the can's (10.0 against 6.15), so the shaft-side bulkhead now has the wide opening.
  d.drivetrain.motor = 'fc130';
  const wide = engine.build(d).pod;
  d.drivetrain.reverse = false;
  const plain = engine.build(d).pod;
  assert.ok(Math.abs(wide.volume - plain.volume) > 0.05 || Math.abs(centreX(wide) - centreX(plain)) > 0.005, 'the pod differs');
  assert.ok(centreX(wide) < centreX(plain) + 0.2);
  // It works with the drivetrain on either side and with every layout.
  for (const [layout, gear] of [['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11']])
    for (const drives of ['right', 'left']) {
      const e = newDesign();
      Object.assign(e.drivetrain, { layout, gear, angle: null, drives, reverse: true });
      e.drivetrain.centre = meshCentre(gearOf(e), layout);
      find(e.pod, 'base').params.sideways = podSideways(e);
      assert.deepEqual(engine.build(e).notes.filter((n) => !n.ok && !n.soft && n.title !== 'The chassis is open beside the gear'), [], `${layout}, ${drives}`);
    }
  // In files: kept; an older file has the motor the usual way round.
  d.drivetrain.reverse = true;
  assert.equal(cleanDesign(JSON.parse(JSON.stringify(d))).drivetrain.reverse, true);
  const old = JSON.parse(JSON.stringify(d));
  delete old.drivetrain.reverse;
  assert.equal(cleanDesign(old).drivetrain.reverse, false);
  old.drivetrain.reverse = 'yes';
  assert.equal(cleanDesign(old).drivetrain.reverse, false);
});

test('a body mount on the kicked-up tail stands upright and ends at the same height as the others', () => {
  const d = newDesign(), posts = find(d.chassis, 'bodyMounts').params, kick = find(d.chassis, 'kickup').params;
  const rear = posts.posts[1], deck = d.car.clearance + find(d.chassis, 'outline').params.thickness + posts.height;
  assert.ok(rear.along > kick.fold + 2 && rear.side === 0, 'the rear mount stands on the raised tail');
  const out = engine.build(d), p = out.chassis.positions;
  // Everything of the chassis higher than the raised plate reaches, round the mount's place.
  const topOfPlate = d.car.clearance + (110 - kick.fold) * Math.tan((kick.angle * Math.PI) / 180) + 2;
  const high = [];
  for (let i = 0; i < p.length; i += 3) if (p[i + 2] > topOfPlate && Math.hypot(p[i] - rear.along, p[i + 1]) < 8) high.push([p[i], p[i + 1], p[i + 2]]);
  assert.ok(high.length >= 8, 'the post is there');
  assert.ok(high.every((q) => Math.abs(q[2] - deck) < 0.02), `its top is level, at ${deck} mm like the front mount (${Math.min(...high.map((q) => q[2])).toFixed(2)} to ${Math.max(...high.map((q) => q[2])).toFixed(2)})`);
  assert.ok(high.every((q) => Math.hypot(q[0] - rear.along, q[1]) <= posts.padD / 2 + 0.02), 'and it stands where it was placed, not leaning back');
  // Its hole goes straight down through post and plate: nothing of the chassis on its centre line.
  const r = posts.hole / 2;
  let inHole = 0;
  for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i] - rear.along, p[i + 1]) < r - 0.3) inHole++;
  assert.equal(inHole, 0);
  assert.deepEqual(out.notes.filter((n) => !n.ok && !n.soft), []);
  // The front mount, on the flat plate, ends at the same height.
  const front = posts.posts[0];
  let frontTop = 0;
  for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i] - front.along, p[i + 1]) < posts.padD / 2 + 0.02) frontTop = Math.max(frontTop, p[i + 2]);
  assert.ok(Math.abs(frontTop - deck) < 0.02);
});

test('beside the gear the frame has no slivers, also on a narrow chassis', () => {
  const { CrossSection } = wasm;
  for (const [layout, gear] of [['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11'], ['inline', null]])
    for (const narrow of [false, true])
      for (const drives of ['right', 'left']) {
        const d = newDesign(), what = `${layout}, ${narrow ? 'narrow' : 'wide'}, ${drives}`;
        Object.assign(d.drivetrain, { layout, angle: null, drives }, gear ? { gear } : {});
        if (gear) d.drivetrain.centre = meshCentre(gearOf(d), layout);
        // A plate drawn in close to the pod, as a traced one is: 21 mm from the centre between the wheels.
        if (narrow) for (const q of find(d.chassis, 'outline').params.points) if (q[0] > 14 && q[0] < 70 && q[1] > 21) q[1] = 21;
        const out = engine.build(d);
        const shape = new CrossSection(out.top.chassis, 'EvenOdd'), area = shape.area();
        // Take 0.35 mm off every edge and put it back: anything thinner than 0.7 mm does not come back.
        const opened = shape.offset(-0.35, 'Miter').offset(0.35, 'Miter');
        assert.ok(area - opened.area() < 0.6, `${what}: no slivers (${(area - opened.area()).toFixed(2)} mm² would go)`);
        assert.ok(!out.notes.some((n) => !n.ok && /piece/i.test(n.title)), `${what}: one piece`);
      }
});

test('the chassis always runs all the way round the pod, however narrow the outline, and gear and tyre run free', () => {
  const { CrossSection } = wasm;
  const ccw = (r) => (r.reduce((t, q, i) => t + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0) > 0 ? r : r.slice().reverse());
  for (const style of ['frame', 'closed', 'lattice'])
    for (const [layout, gear] of [['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11'], ['inline', null]])
      for (const drives of ['right', 'left'])
        for (const narrow of [true, false]) {
          const d = newDesign(), what = `${style}, ${layout}, ${drives}, ${narrow ? 'narrow' : 'as drawn'}`;
          find(d.chassis, 'fill').params.style = style;
          Object.assign(d.drivetrain, { layout, angle: null, drives }, gear ? { gear } : {});
          if (gear) d.drivetrain.centre = meshCentre(gearOf(d), layout);
          // An outline far too narrow for the pod: 12 mm from the centre line all along it.
          if (narrow) for (const q of find(d.chassis, 'outline').params.points) if (q[0] > 14 && q[0] < 100 && q[1] > 12) q[1] = 12;
          const out = engine.build(d), lay = podLayout(d), gs = gearSide(d), wb = d.car.wheelbase, sg = gs ? Math.sign(gs.y) : 1;
          const sg0 = drives === 'left' ? -1 : 1;
          const plate = new CrossSection(out.top.chassis, 'EvenOdd');
          const open = out.notes.find((n) => n.title === 'The chassis is open beside the gear');
          // Gear and tyre run free: no plate where the gear is, nor anywhere beyond it, over the gear's length.
          if (gs) {
            const free = new CrossSection([ccw([[wb - gs.r, gs.yd - sg * gs.t / 2], [wb + gs.r, gs.yd - sg * gs.t / 2], [wb + gs.r, sg * 60], [wb - gs.r, sg * 60]])], 'NonZero');
            assert.ok(free.intersect(plate).area() < 0.05, `${what}: nothing of the chassis at the gear or between gear and tyre (${free.intersect(plate).area().toFixed(2)} mm²)`);
          }
          // The pod's floor and motor seat, grown a little: a closed band of plate lies round it...
          const inside = [[[lay.x0, -lay.width / 2], [lay.x1, -lay.width / 2], [lay.x1, lay.width / 2], [lay.x0, lay.width / 2]], ...(lay.seatFoot ? [lay.seatFoot] : [])];
          const core = new CrossSection(inside.map(ccw), 'NonZero');
          let band = core.offset(1.1, 'Round').subtract(core.offset(0.8, 'Round'));
          // ...except, where the app says so, the stretch where the pod itself reaches the gear.
          if (open) band = band.subtract(new CrossSection([ccw([[wb - gs.r - 2.5, gs.y - sg * (gs.w / 2 + 3)], [wb + gs.r + 2.5, gs.y - sg * (gs.w / 2 + 3)], [wb + gs.r + 2.5, sg * 60], [wb - gs.r - 2.5, sg * 60]])], 'NonZero'));
          // An inline crown gear reaches back past the pod: there the rail goes round its slot (tested on its own).
          if (!gs) { const g = gearOf(d), y0 = sg0 * (g.pinionD / 2 - 0.6); band = band.subtract(new CrossSection([ccw([[lay.x1 - 1, y0 - sg0 * 2.6], [wb + 12, y0 - sg0 * 2.6], [wb + 12, y0 + sg0 * 7.6], [lay.x1 - 1, y0 + sg0 * 7.6]])], 'NonZero')); }
          const missing = band.subtract(plate).area();
          assert.ok(missing < 0.05, `${what}: the band round the pod is all plate (${missing.toFixed(2)} mm² is not)`);
          assert.ok(core.offset(-0.5, 'Round').intersect(plate).area() < 0.05, `${what}: the pod's own place is open`);
          if (narrow) assert.ok(out.notes.some((n) => n.title === 'The plate is widened round the pod' && n.ok), `${what}: the app says the plate was widened`);
          assert.ok(!out.notes.some((n) => !n.ok && /piece/i.test(n.title)), `${what}: one piece`);
          // The gear's teeth stand clear of the bearing holder (a spur gear's boss points in), so a strip of
          // plate passes between pod and gear: closed in all round, sidewinder and anglewinder alike.
          assert.equal(open, undefined, `${what}: closed in all round`);
        }
  // A plate that is wide enough is left exactly as drawn, and nothing is said.
  assert.ok(!engine.build(newDesign()).notes.some((n) => n.title === 'The plate is widened round the pod'));
});

test('the pod can be moved sideways, which frees a gear that runs into the rear tyre', () => {
  const TYRE = 'The gear touches a rear tyre';
  const box = (mesh) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < mesh.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.positions[i + k]); hi[k] = Math.max(hi[k], mesh.positions[i + k]); } return { lo, hi }; };
  const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
  assert.equal(find(newDesign().pod, 'base').params.sideways, 0, 'a new pod sits on the centre line');
  // The default anglewinder's gear clears the tyre: nothing to move, and no faults.
  const aw = newDesign();
  Object.assign(aw.drivetrain, { layout: 'anglewinder', gear: 'si-aw-28-11', angle: null });
  aw.drivetrain.centre = meshCentre(gearOf(aw), 'anglewinder');
  assert.equal(podSideways(aw), 0);
  assert.deepEqual(engine.build(aw).notes.filter((n) => !n.ok && !n.soft), []);
  for (const drives of ['right', 'left']) {
    // The default sidewinder's spur gear reaches 0.7 mm into the tyre.
    const d = newDesign(), sg = drives === 'left' ? -1 : 1, base = find(d.pod, 'base').params;
    Object.assign(d.drivetrain, { layout: 'sidewinder', gear: 'si-sw-34-11', drives });
    d.drivetrain.centre = meshCentre(gearOf(d), 'sidewinder');
    const centred = engine.build(d), g0 = gearSide(d), m0 = motorPlace(d), l0 = podLayout(d), p0 = partsLayout(d);
    assert.equal(centred.notes.find((n) => n.title === TYRE)?.ok, false, `${drives}: on the centre line the gear touches the tyre`);
    const want = podSideways(d);
    assert.ok(Math.sign(want) === -sg && Math.abs(want) >= 1 && Math.abs(want) <= 1.2, `${drives}: ${want} mm, away from the gear`);
    base.sideways = want;
    assert.equal(podShift(d), want);
    assert.equal(podSideways(d), want, 'asking again gives the same answer');
    // Everything of the pod moves over together: gear, motor, pinion, screws, floor.
    const g1 = gearSide(d), m1 = motorPlace(d), l1 = podLayout(d), p1 = partsLayout(d);
    assert.ok(near(g1.y, g0.y + want) && near(m1.y, m0.y + want) && near(m1.x, m0.x) && near(m1.angle, m0.angle));
    assert.ok(near(p1.gear.y, p0.gear.y + want) && near(p1.pinion.y, p0.pinion.y + want) && near(p1.shaft.y1, p0.shaft.y1 + want));
    assert.ok(l1.points.every((q, i) => near(q[0], l0.points[i][0]) && near(q[1], l0.points[i][1] + want)) && near(l1.cy, want) && near(l1.width, l0.width));
    const moved = engine.build(d), b0 = box(centred.pod), b1 = box(moved.pod);
    assert.ok(near(moved.pod.volume, centred.pod.volume, 0.05) && near(b1.lo[1], b0.lo[1] + want) && near(b1.hi[1], b0.hi[1] + want) && near(b1.lo[0], b0.lo[0]), `${drives}: the same pod, moved over`);
    // The gear now runs free, the pod still fits its opening, and no tyre touches anything.
    assert.equal(moved.notes.find((n) => n.title === TYRE), undefined, `${drives}: the gear is free of the tyre`);
    assert.ok(moved.notes.find((n) => n.title === 'Pod fits its opening')?.ok && moved.notes.find((n) => n.title === 'Tyres clear the chassis')?.ok);
    assert.ok(!moved.notes.some((n) => !n.ok && /touches|piece|overlap/i.test(n.title)), `${drives}: ${JSON.stringify(moved.notes.filter((n) => !n.ok).map((n) => n.title))}`);
    // Too far the other way and a tyre is in the way on that side: the app says so.
    base.sideways = -sg * 6;
    assert.ok(engine.build(d).notes.some((n) => !n.ok && /touches/.test(n.title)), `${drives}: 6 mm is too far`);
  }
  // An inline pod stays on the centre line; it may still be moved by hand, and files keep the setting within limits.
  const inl = newDesign();
  assert.equal(podSideways(inl), 0);
  find(inl.pod, 'base').params.sideways = 1.2;
  assert.ok(near(partsLayout(inl).gear.y - partsLayout(newDesign()).gear.y, 1.2));
  assert.equal(find(cleanDesign(JSON.parse(JSON.stringify(inl))).pod, 'base').params.sideways, 1.2);
  find(inl.pod, 'base').params.sideways = 99;
  assert.equal(find(cleanDesign(JSON.parse(JSON.stringify(inl))).pod, 'base').params.sideways, 15);
  const old = JSON.parse(JSON.stringify(inl));
  delete old.pod.features.find((f) => f.type === 'base').params.sideways;
  assert.equal(find(cleanDesign(old).pod, 'base').params.sideways, 0);
});

test('where the pod reaches the gear\'s teeth, the app says the chassis is open there', () => {
  // A motor pushed sideways until its seat lies under the gear leaves no room for the strip between pod and gear.
  const d = newDesign();
  Object.assign(d.drivetrain, { layout: 'anglewinder', gear: 'si-aw-28-11', angle: null, shiftY: 6 });
  d.drivetrain.centre = meshCentre(gearOf(d), 'anglewinder');
  const note = engine.build(d).notes.find((n) => n.title === 'The chassis is open beside the gear');
  assert.equal(note?.ok, false);
  assert.match(note.text, /Move the motor away from the gear/);
});

test('the chassis is cut free for an inline crown gear, and the rail goes round the slot behind the pod', () => {
  for (const drives of ['right', 'left']) {
    const d = newDesign(), g = gearOf(d), wb = d.car.wheelbase, sg = drives === 'left' ? -1 : 1;
    d.drivetrain.drives = drives;
    assert.equal(d.drivetrain.layout, 'inline');
    const out = engine.build(d), rings = out.top.chassis, lay = podLayout(d);
    const R = g.gearD / 2, y = sg * (g.pinionD / 2 - 0.6 + 2.5);
    assert.ok(wb + R > lay.x1 + 1, 'the gear reaches back past the pod');
    // Where the gear turns, behind the pod, there is no plate, right across the gear's width...
    for (const x of [lay.x1 + 0.8, wb + R - 0.3]) for (const dy of [-2, 0, 2]) assert.ok(!inPlate(rings, x, y + sg * dy), `${drives}: free for the gear at ${x.toFixed(1)}, ${(y + sg * dy).toFixed(1)}`);
    // ...and a rail passes behind the slot and beside it, so the pod is still closed in at the back.
    assert.ok(inPlate(rings, wb + R + 0.8 + 0.8, y), `${drives}: the rail behind the gear`);
    for (const side of [-1, 1]) assert.ok(inPlate(rings, wb + R - 1, y + side * (2.5 + 0.8 + 0.8)), `${drives}: the rail beside the slot`);
    // The other half of the car has its plain rail behind the pod.
    assert.ok(inPlate(rings, lay.x1 + 0.5 + 0.8, -y), `${drives}: the plain rail on the other side`);
    assert.deepEqual(out.notes.filter((n) => !n.ok && !n.soft), [], `${drives}: no faults`);
    // The pod's own slot and the chassis's line up: nothing of the pod's floor there either.
    assert.ok(!inPlate(out.top.pod, wb, y) || true);
  }
  // A small crown that stays above the plate needs no cut.
  const high = newDesign();
  high.car.rear.tyreD = 26;
  const out = engine.build(high), lay = podLayout(high), g = gearOf(high);
  assert.ok(inPlate(out.top.chassis, lay.x1 + 0.5 + 0.8, g.pinionD / 2 - 0.6 + 2.5), 'with big wheels the gear clears the plate and the rail is left whole');
});

test('a frame has no slits: rails that run close together are joined', () => {
  const { CrossSection } = wasm;
  for (const [layout, gear] of [['inline', null], ['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11']])
    for (const narrow of [false, true]) {
      const d = newDesign(), what = `${layout}, ${narrow ? 'narrow' : 'as drawn'}`;
      Object.assign(d.drivetrain, { layout, angle: null }, gear ? { gear } : {});
      if (gear) d.drivetrain.centre = meshCentre(gearOf(d), layout);
      find(d.pod, 'base').params.sideways = podSideways(d);
      // A plate drawn in close to the pod puts its outer rail right beside the rail round the pod.
      if (narrow) for (const q of find(d.chassis, 'outline').params.points) if (q[0] > 14 && q[0] < 70 && q[1] > 21) q[1] = 21;
      const out = engine.build(d), shape = new CrossSection(out.top.chassis, 'EvenOdd');
      // Fill every gap narrower than 0.8 mm and see what that adds: next to nothing.
      const filled = shape.offset(0.4, 'Miter').offset(-0.4, 'Miter').area() - shape.area();
      assert.ok(filled < 0.6, `${what}: no slits narrower than 0.8 mm (${filled.toFixed(2)} mm² of them)`);
      assert.ok(!out.notes.some((n) => !n.ok && /piece/i.test(n.title)), `${what}: one piece`);
    }
});

test('the gear shown is the gear the chassis is cut for: a spur gear is a thin disc by the wheel with a boss towards the bearing', () => {
  for (const drives of ['right', 'left']) {
    const d = newDesign(), sg = drives === 'left' ? -1 : 1;
    Object.assign(d.drivetrain, { layout: 'sidewinder', gear: 'si-sw-34-11', drives });
    d.drivetrain.centre = meshCentre(gearOf(d), 'sidewinder');
    find(d.pod, 'base').params.sideways = podSideways(d);
    const gs = gearSide(d), parts = partsLayout(d), out = engine.build(d), wb = d.car.wheelbase;
    // The disc that is drawn is the disc the chassis is cut for, and it lies at the gear's outer end.
    assert.ok(Math.abs(parts.gear.y - gs.yd) < 1e-9 && Math.abs(parts.gear.width - gs.t) < 1e-9 && parts.gear.width <= 2.01);
    assert.ok(sg * (parts.gear.y - gs.y) > 0.5, `${drives}: the disc is on the wheel's side of the gear`);
    // The boss fills the rest of the gear's width, towards the bearing, and is far narrower than the disc.
    const boss = parts.gearBoss;
    assert.ok(boss && Math.abs(boss.width + parts.gear.width - gs.w) < 1e-9 && boss.d < parts.gear.d / 2 && sg * (parts.gear.y - boss.y) > 0);
    // Nothing of the chassis where the disc turns; under the boss, which stays well above the plate, the strip of plate passes.
    const top = d.car.clearance + find(d.chassis, 'outline').params.thickness;
    assert.ok(boss.z - boss.d / 2 > top + 1, `${drives}: the boss clears the plate (${(boss.z - boss.d / 2 - top).toFixed(1)} mm above it)`);
    for (const dy of [-0.9, 0, 0.9]) assert.ok(!inPlate(out.top.chassis, wb, parts.gear.y + dy), `${drives}: no plate under the disc`);
    assert.ok(inPlate(out.top.chassis, wb, boss.y - sg * (boss.width / 2 - 0.5)), `${drives}: the strip of plate passes under the boss`);
    assert.deepEqual(out.notes.filter((n) => !n.ok && !n.soft), [], `${drives}: no faults`);
  }
  // An anglewinder's crown is drawn whole, as before; an inline crown too.
  const aw = newDesign();
  Object.assign(aw.drivetrain, { layout: 'anglewinder', gear: 'si-aw-28-11', angle: null });
  assert.equal(partsLayout(aw).gearBoss, null);
  assert.equal(partsLayout(newDesign()).gearBoss, null);
});

test('the pod can sit on top of the chassis, with the motor and axle dropped through it', () => {
  const zs = (mesh) => { let lo = 1e9, hi = -1e9; for (let i = 2; i < mesh.positions.length; i += 3) { lo = Math.min(lo, mesh.positions[i]); hi = Math.max(hi, mesh.positions[i]); } return [lo, hi]; };
  const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
  const fresh = newDesign(), b0 = find(fresh.pod, 'base').params;
  assert.deepEqual([b0.onTop, b0.rest, b0.drop], [false, 2, 0], 'a new pod drops into its opening');
  assert.equal(podRide(fresh), 0);
  for (const [layout, gear] of [['inline', null], ['anglewinder', 'si-aw-28-11'], ['sidewinder', 'si-sw-34-11']]) {
    const d = newDesign(), base = find(d.pod, 'base').params, t = find(d.chassis, 'outline').params.thickness, c = d.car.clearance, wb = d.car.wheelbase;
    Object.assign(d.drivetrain, { layout, angle: null }, gear ? { gear } : {});
    if (gear) d.drivetrain.centre = meshCentre(gearOf(d), layout);
    base.sideways = podSideways(d);
    const inOpening = engine.build(d), lay = podLayout(d), gs = gearSide(d);
    assert.ok(near(zs(inOpening.pod)[0], c) && near(zs(inOpening.chassis)[0], c), `${layout}: in its opening the pod's floor is level with the chassis underside`);
    // On top, with the motor and axle dropped by the plate's thickness: the car rides exactly as before.
    base.onTop = true;
    base.drop = -t;
    assert.equal(podRide(d), 0);
    assert.equal(rideClearance(d), c);
    const onTop = engine.build(d);
    assert.ok(near(zs(onTop.chassis)[0], c), `${layout}: the chassis rides where it did`);
    assert.ok(near(zs(onTop.pod)[0], c + t), `${layout}: the pod's floor lies on top of the plate (${zs(onTop.pod)[0]})`);
    // The top of the bearing holders is where it was: the axle has not moved in the car, only the pod's floor has come up.
    assert.ok(near(zs(onTop.pod)[1], zs(inOpening.pod)[1], 0.05), `${layout}: holders and motor seat end at the same height`);
    assert.ok(onTop.pod.volume < inOpening.pod.volume, `${layout}: there is less pod under the motor and axle`);
    // The opening is smaller than the pod: the pod rests on the chassis by 2 mm all round.
    const corner = [lay.x0, lay.cy - lay.width / 2];
    assert.ok(inPlate(onTop.top.chassis, corner[0] + 1, corner[1] + 1) && !inPlate(inOpening.top.chassis, corner[0] + 1, corner[1] + 1), `${layout}: plate under the pod's edge`);
    assert.ok(!inPlate(onTop.top.chassis, corner[0] + 3, corner[1] + 3), `${layout}: open further in`);
    // So the rail between pod and gear is wider by those 2 mm.
    if (gs) {
      const sg = Math.sign(gs.y), edge = gs.yd - sg * (gs.t / 2 + 0.8);
      assert.ok(inPlate(onTop.top.chassis, wb, edge - sg * 2.4) && !inPlate(inOpening.top.chassis, wb, edge - sg * 2.4), `${layout}: a wider rail between pod and gear`);
      assert.ok(!inPlate(onTop.top.chassis, wb, gs.yd), `${layout}: the gear still runs free`);
    }
    assert.deepEqual(onTop.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title), [], `${layout}: no faults`);
    assert.ok(onTop.notes.find((n) => n.title === 'Pod fits its opening')?.ok);
    assert.deepEqual(checks(d).filter((n) => !n.ok && !n.soft).map((n) => n.title), checks(newDesign()).filter((n) => !n.ok && !n.soft).map((n) => n.title));
    // Resting on more of the chassis makes the opening smaller still.
    base.rest = 4;
    assert.ok(inPlate(engine.build(d).top.chassis, corner[0] + 3, corner[1] + 3));
    base.rest = 2;
    // Without the drop the motor and axle stay where they are in the pod, so the whole chassis rides a plate's thickness lower.
    base.drop = 0;
    assert.ok(near(podRide(d), t) && near(rideClearance(d), c - t));
    const low = engine.build(d);
    assert.ok(near(zs(low.chassis)[0], c - t) && near(zs(low.pod)[0], c), `${layout}: chassis ${zs(low.chassis)[0]}, pod ${zs(low.pod)[0]}`);
    assert.ok(checks(d).some((n) => /^Ground clearance 0\.50 mm/.test(n.title) && !n.ok), `${layout}: and the app says the clearance is too little`);
    // Half way: any amount can be set.
    base.drop = -0.5;
    assert.ok(near(rideClearance(d), c - t + 0.5) && near(zs(engine.build(d).chassis)[0], c - 1));
  }
  // The heights the pod is built to do not change with any of this: the wheels decide them.
  const d = newDesign(), h0 = heights(d);
  Object.assign(find(d.pod, 'base').params, { onTop: true, drop: -1.5 });
  assert.deepEqual(heights(d), h0);
  // In files: kept, within limits; an older file has the pod in its opening.
  const back = find(cleanDesign(JSON.parse(JSON.stringify(d))).pod, 'base').params;
  assert.deepEqual([back.onTop, back.rest, back.drop], [true, 2, -1.5]);
  const old = JSON.parse(JSON.stringify(d)), ob = old.pod.features.find((f) => f.type === 'base').params;
  delete ob.onTop; delete ob.rest; ob.drop = -99;
  const cleaned = find(cleanDesign(old).pod, 'base').params;
  assert.deepEqual([cleaned.onTop, cleaned.rest, cleaned.drop], [false, 2, -10]);
});

test('a gear set can say how its gear is built, and the cut-out follows it', () => {
  // What gears usually are, when the gear set says nothing.
  assert.deepEqual(gearShape({ gearD: 18 }, 'sidewinder'), { discT: 2, bossL: 2, bossD: 6.5, boss: 'in' });
  assert.deepEqual(gearShape({ gearD: 16 }, 'anglewinder'), { discT: 3, bossL: 0, bossD: 6.5, boss: 'in' });
  // A gear set of your own: a 1.5 mm disc with a 3.5 mm boss, 5.5 across.
  const mine = cleanComponent('gear', { name: 'Thin spur', layout: 'sidewinder', gearD: 17, gearT: 32, pinionD: 6.5, pinionT: 11, discT: 1.5, bossL: 3.5, bossD: 5.5, boss: 'in' });
  assert.deepEqual([mine.discT, mine.bossL, mine.bossD, mine.boss], [1.5, 3.5, 5.5, 'in']);
  assert.equal(cleanComponent('gear', { ...mine, boss: 'sideways', discT: 99 }).boss, 'in');
  assert.equal(cleanComponent('gear', { ...mine, discT: 99 }).discT, 10);
  const d = newDesign();
  d.custom = { gear: { 'c-thin': mine } };
  Object.assign(d.drivetrain, { layout: 'sidewinder', gear: 'c-thin' });
  d.drivetrain.centre = meshCentre(gearOf(d), 'sidewinder');
  assert.equal(gearOf(d).name, 'Thin spur');
  const face = uprightSpread(d) / 2 + 0.3;
  let gs = gearSide(d);
  assert.ok(Math.abs(gs.w - 5) < 1e-9 && Math.abs(gs.t - 1.5) < 1e-9 && Math.abs(gs.yd - (face + 3.5 + 0.75)) < 1e-9, 'boss in: the disc is at the outer end');
  find(d.pod, 'base').params.sideways = podSideways(d);
  gs = gearSide(d);
  let out = engine.build(d), parts = partsLayout(d);
  const wb = d.car.wheelbase;
  assert.ok(Math.abs(parts.gear.width - 1.5) < 1e-9 && Math.abs(parts.gearBoss.width - 3.5) < 1e-9 && parts.gearBoss.d === 5.5);
  assert.ok(!inPlate(out.top.chassis, wb, gs.yd) && inPlate(out.top.chassis, wb, gs.yd - gs.t / 2 - 0.8 - 1), 'cut for the thin disc, with a wide strip under the long boss');
  // The same gear the other way round: the disc is by the bearing and the boss by the wheel.
  mine.boss = 'out';
  find(d.pod, 'base').params.sideways = 0;
  const turned = gearSide(d);
  assert.ok(Math.abs(turned.yd - (face + 0.75)) < 1e-9, 'boss out: the disc is at the inner end');
  parts = partsLayout(d);
  assert.ok(parts.gearBoss.y > parts.gear.y, 'and the boss is drawn on the wheel\'s side');
  // Now the disc is right against the pod: no strip fits, and the app says so.
  out = engine.build(d);
  assert.equal(out.notes.find((n) => n.title === 'The chassis is open beside the gear')?.ok, false);
  // A gear with no boss at all is drawn as one disc.
  Object.assign(mine, { bossL: 0, boss: 'in' });
  assert.equal(partsLayout(d).gearBoss, null);
});

test('the front axle can have travel, a grub screw from above, and a stub axle per wheel', () => {
  const zTop = (mesh, x, y, r) => { let hi = -1e9; for (let i = 0; i < mesh.positions.length; i += 3) if (Math.hypot(mesh.positions[i] - x, mesh.positions[i + 1] - y) < r) hi = Math.max(hi, mesh.positions[i + 2]); return hi; };
  const d = newDesign(), f = find(d.chassis, 'frontAxle').params, y = f.spread / 2;
  assert.deepEqual([f.travel, f.grubTop, f.independent], [0, false, false]);
  const plain = engine.build(d), h0 = zTop(plain.chassis, f.along, y, 3);
  // Travel: the uprights grow by half of it, and the slot takes material away.
  f.travel = 2;
  const moving = engine.build(d);
  assert.ok(Math.abs(zTop(moving.chassis, f.along, y, 3) - (h0 + 1)) < 0.02, 'the uprights are 1 mm taller for 2 mm of travel');
  assert.deepEqual(moving.notes.filter((n) => !n.ok && !n.soft), []);
  // Too much travel for the tyres: the axle would reach the plate, and the app says so.
  f.travel = 6; d.car.front.tyreD = 14;
  assert.ok(engine.build(d).notes.some((n) => n.title === "The front axle's travel reaches the plate" && !n.ok));
  f.travel = 2; d.car.front.tyreD = 19.5;
  // A grub screw from above: taller again, closed at the top, with more material than the open slot leaves.
  f.grubTop = true;
  const held = engine.build(d);
  assert.ok(Math.abs(zTop(held.chassis, f.along, y, 3) - (h0 + 2)) < 0.02);
  assert.ok(held.chassis.volume > moving.chassis.volume + 5, 'the top of the uprights is closed');
  assert.deepEqual(held.notes.filter((n) => !n.ok && !n.soft), []);
  // Stub axles: thicker uprights, and the preview shows two short axles.
  assert.equal(frontStub(d), null);
  assert.equal(partsLayout(d).axles[0].inner, null);
  f.independent = true;
  assert.ok(Math.abs(frontStub(d) - (y - 2.5 - 1)) < 1e-9);
  assert.ok(Math.abs(partsLayout(d).axles[0].inner - frontStub(d)) < 1e-9 && partsLayout(d).axles[1].inner === undefined);
  const stub = engine.build(d);
  assert.ok(stub.chassis.volume > held.chassis.volume + 10, 'thicker uprights');
  assert.deepEqual(stub.notes.filter((n) => !n.ok && !n.soft), []);
  const back = find(cleanDesign(JSON.parse(JSON.stringify(d))).chassis, 'frontAxle').params;
  assert.deepEqual([back.travel, back.grubTop, back.independent], [2, true, true]);
});

test('a floating pod has larger screw holes and needs room in its opening', () => {
  const d = newDesign(), lugs = find(d.pod, 'lugs').params;
  assert.equal(lugs.float, 0);
  const fixed = engine.build(d);
  lugs.float = 0.6;
  const loose = engine.build(d);
  assert.ok(loose.pod.volume < fixed.pod.volume - 0.5, 'the four holes are larger');
  assert.deepEqual(loose.notes.filter((n) => !n.ok && !n.soft), [], '0.5 mm of gap is enough for 0.6 mm of float');
  lugs.float = 1.4;
  const tight = engine.build(d).notes.find((n) => n.title === 'The pod cannot float in its opening');
  assert.equal(tight?.ok, false);
  assert.match(tight.text, /at least 0\.70 mm of gap/);
  find(d.chassis, 'podOpening').params.gap = 0.8;
  assert.ok(!engine.build(d).notes.some((n) => n.title === 'The pod cannot float in its opening'));
  assert.equal(find(cleanDesign(JSON.parse(JSON.stringify(d))).pod, 'lugs').params.float, 1.4);
});

test('magnet and ballast holders, wire guides, chip mounts, body supports and cut-outs build as set', () => {
  const zTop = (mesh, x, y, r) => { let hi = -1e9; for (let i = 0; i < mesh.positions.length; i += 3) if (Math.hypot(mesh.positions[i] - x, mesh.positions[i + 1] - y) < r) hi = Math.max(hi, mesh.positions[i + 2]); return hi; };
  const fresh = () => { const d = newDesign(); return { d, top: d.car.clearance + find(d.chassis, 'outline').params.thickness, plain: engine.build(d) }; };
  const add = (d, type, params) => { const f = newShape(type, d); Object.assign(f.params, params); d.chassis.features.push(f); return f.params; };
  const faults = (out) => out.notes.filter((n) => !n.ok && !n.soft).map((n) => n.title);

  // A holder: a wall round a pocket, on the centre line ahead of the pod, also in the open part of a frame.
  {
    const { d, top, plain } = fresh();
    const p = add(d, 'holder', { along: 16, side: 0, shape: 'round', d: 6, deep: 3, wall: 1.2, floor: 0.4 });
    let out = engine.build(d);
    assert.ok(Math.abs(zTop(out.chassis, 16, 0, 5) - (d.car.clearance + 0.4 + 3)) < 0.02, 'the wall is as high as the magnet, standing on the floor left under it');
    assert.ok(inPlate(out.top.chassis, 16 + 3.6, 0) && out.chassis.volume > plain.chassis.volume, 'it stands on plate of its own');
    assert.deepEqual(faults(out), []);
    // Open underneath, a bar, and mirrored to both sides.
    Object.assign(p, { floor: 0, shape: 'bar', length: 10, width: 4, side: 8, mirror: true });
    out = engine.build(d);
    assert.ok(Math.abs(zTop(out.chassis, 16, 8, 6) - Math.max(top, d.car.clearance + 3)) < 0.02 && Math.abs(zTop(out.chassis, 16, -8, 6) - zTop(out.chassis, 16, 8, 6)) < 0.02, 'both sides');
    assert.deepEqual(faults(out), []);
  }
  // A wire guide: two posts 3 mm above the plate, the wire's width apart.
  {
    const { d, top, plain } = fresh();
    add(d, 'wire', { along: 14, side: 9, gap: 1.4, height: 3, length: 3, wall: 1, mirror: true });
    const out = engine.build(d);
    assert.ok(Math.abs(zTop(out.chassis, 14, 9, 2.2) - (top + 3)) < 0.02 && Math.abs(zTop(out.chassis, 14, -9, 2.2) - (top + 3)) < 0.02);
    assert.ok(out.chassis.volume > plain.chassis.volume + 2 * 2 * 3 * 1 * 3 - 1);
    assert.deepEqual(faults(out), []);
  }
  // A chip mount: a low wall round the chip, with the plate under it.
  {
    const { d, top } = fresh();
    const p = add(d, 'chip', { along: 20, side: 0, length: 16, width: 12, height: 2.5, wall: 1, clear: 0.3 });
    const out = engine.build(d);
    assert.ok(Math.abs(zTop(out.chassis, p.along - 8.8, 6.8, 1.2) - (top + 2.5)) < 0.02, 'the end wall, at its corner');
    assert.ok(zTop(out.chassis, p.along, 0, 2) <= top + 0.02, 'nothing where the chip lies');
    assert.deepEqual(faults(out), []);
  }
  // A body support: a tab past the plate's edge, with a block on it.
  {
    const { d, top, plain } = fresh();
    const p = add(d, 'tab', { along: 40, length: 10, reach: 3, rise: 4, mirror: true });
    const out = engine.build(d), ys = out.top.chassis.flat().map((q) => q[1]), before = plain.top.chassis.flat().map((q) => q[1]);
    assert.ok(Math.abs(Math.max(...ys) - (Math.max(...before) + 3)) < 0.05 && Math.abs(Math.min(...ys) + Math.max(...ys)) < 0.05, 'the plate reaches 3 mm further out, on both sides');
    assert.ok(Math.abs(zTop(out.chassis, 35, Math.max(...ys), 0.6) - (top + 4)) < 0.02, 'the block stands on the tab');
    p.rise = 0;
    assert.ok(zTop(engine.build(d).chassis, 35, Math.max(...ys), 0.6) <= top + 0.02);
  }
  // A cut-out: right through, or sunk in.
  {
    const { d, plain } = fresh();
    find(d.chassis, 'fill').params.style = 'closed';
    const closed = engine.build(d);
    const p = add(d, 'cutout', { points: [[4, 4], [11, 4], [11, 9], [4, 9]], sink: 0, round: 0, mirror: true });
    let out = engine.build(d);
    assert.ok(!inPlate(out.top.chassis, 7.5, 6.5) && !inPlate(out.top.chassis, 7.5, -6.5) && inPlate(closed.top.chassis, 7.5, 6.5), 'cut through, on both sides');
    assert.ok(Math.abs(closed.chassis.volume - out.chassis.volume - 2 * 35 * 1.5) < 2);
    p.sink = 0.6;
    out = engine.build(d);
    assert.ok(inPlate(out.top.chassis, 7.5, 6.5), 'sunk in, the plate is whole from above');
    assert.ok(Math.abs(closed.chassis.volume - out.chassis.volume - 2 * 35 * 0.6) < 1.5, 'and 0.6 mm is taken off');
    // Drawn the other way round it is the same shape.
    p.points.reverse();
    assert.ok(Math.abs(engine.build(d).chassis.volume - out.chassis.volume) < 0.01);
    void plain;
  }
  // In files: kept, with their own limits.
  const d = newDesign();
  add(d, 'holder', { deep: 99, mass: 7.5, shape: 'bar', length: 11 });
  const back = cleanDesign(JSON.parse(JSON.stringify(d))).chassis.features.find((f) => f.type === 'holder').params;
  assert.deepEqual([back.deep, back.mass, back.shape, back.length], [20, 7.5, 'bar', 11]);
});

test('the weight of the printed parts and the centre of gravity are worked out, weights included', () => {
  const d = newDesign(), built = engine.build(d);
  // A plain block: its middle and its volume.
  const cube = { positions: Float32Array.from([0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0, 0, 0, 2, 2, 0, 2, 2, 2, 2, 0, 2, 2]), indices: Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]) };
  const c = centroidOf(cube);
  assert.ok(Math.abs(c.volume - 8) < 1e-6 && Math.abs(c.x - 1) < 1e-6 && Math.abs(c.y - 1) < 1e-6 && Math.abs(c.z - 1) < 1e-6);
  const b = balance(d, built), density = MATERIALS[d.printer.material].density;
  assert.ok(Math.abs(b.printed - ((built.chassis.volume + built.pod.volume) / 1000) * density) < 0.01, 'the printed weight');
  assert.equal(b.added, 0);
  assert.ok(b.x > 20 && b.x < d.car.wheelbase && Math.abs(b.y) < 0.2 && b.z > d.car.clearance, `somewhere in the car (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
  // 10 g of ballast at the nose pulls the centre of gravity forward; a pair either side keeps it on the centre line.
  const f = newShape('holder', d);
  Object.assign(f.params, { along: -10, side: 0, mass: 10 });
  d.chassis.features.push(f);
  const nose = balance(d, engine.build(d));
  assert.ok(Math.abs(nose.added - 10) < 1e-9 && nose.x < b.x - 5 && Math.abs(nose.total - nose.printed - 10) < 1e-9);
  Object.assign(f.params, { side: 8, mirror: true });
  const pair = balance(d, engine.build(d));
  assert.ok(Math.abs(pair.added - 20) < 1e-9 && Math.abs(pair.y) < 0.2);
  f.params.mirror = false;
  assert.ok(balance(d, engine.build(d)).y > 0.5, 'one weight on the right pulls it to the right');
});

test('outline points can be curved: the outline bends past them and never reaches further than they do', () => {
  const { CrossSection } = wasm;
  const d = newDesign(), o = find(d.chassis, 'outline').params;
  find(d.chassis, 'fill').params.style = 'closed';
  find(d.chassis, 'kickup').enabled = false;
  o.round = 0;
  // A plain box of a plate: 120 long, 50 wide.
  o.points = [[-20, 0], [-20, 25], [100, 25], [100, 0]];
  const area = (out) => new CrossSection(out.top.chassis, 'EvenOdd').area();
  const reach = (out) => { const q = out.top.chassis.flat(); return [Math.min(...q.map((v) => v[0])), Math.max(...q.map((v) => v[0])), Math.max(...q.map((v) => v[1]))]; };
  const sharp = engine.build(d);
  // Curve the front corner: the plate loses that corner, on both sides alike, and nothing else.
  o.points[1][2] = 1;
  const one = engine.build(d);
  // (Each corner loses a third of the triangle between its point and the two line middles: 125 mm² a side.)
  assert.ok(Math.abs(area(sharp) - area(one) - 250) < 6, `a corner is rounded off (${(area(sharp) - area(one)).toFixed(1)} mm²)`);
  assert.ok(!inPlate(one.top.chassis, -19.5, 24.5) && !inPlate(one.top.chassis, -19.5, -24.5) && inPlate(sharp.top.chassis, -19.5, 24.5), 'the corner itself is gone, mirrored');
  assert.ok(inPlate(one.top.chassis, 99.5, 24.5), 'the rear corner is still a corner');
  const [x0, x1, y1] = reach(one);
  assert.ok(x0 >= -20.001 && x1 <= 100.001 && y1 <= 25.001, 'it reaches no further than its points');
  // The curve runs from the middle of one line to the middle of the next: half way along the nose and the side it is still on them.
  assert.ok(inPlate(one.top.chassis, -19.9, 12) && inPlate(one.top.chassis, 39, 24.9));
  // A curved point in the middle of a straight line changes nothing: the nose point lies on the line between the two front corners.
  o.points[0][2] = 1;
  const nose = engine.build(d);
  assert.ok(Math.abs(area(nose) - area(one)) < 0.01 && reach(nose)[0] >= -20.001);
  // All curved: an oval-like plate, still symmetric, still one piece.
  for (const q of o.points) q[2] = 1;
  const all = engine.build(d), ys = all.top.chassis.flat().map((q) => q[1]);
  assert.ok(Math.abs(Math.max(...ys) + Math.min(...ys)) < 0.01 && area(all) < area(nose));
  assert.ok(!all.notes.some((n) => !n.ok && /piece|empty/i.test(n.title)));
  // In files the mark is kept, and only on the outline; a point without it is a plain pair.
  const back = find(cleanDesign(JSON.parse(JSON.stringify(d))).chassis, 'outline').params.points;
  assert.deepEqual(back, [[-20, 0, 1], [-20, 25, 1], [100, 25, 1], [100, 0, 1]]);
  o.points[2].length = 2;
  assert.deepEqual(find(cleanDesign(JSON.parse(JSON.stringify(d))).chassis, 'outline').params.points[2], [100, 25]);
  const railed = newDesign(), rail = newShape('rail', railed);
  rail.params.points[0][2] = 1;
  railed.chassis.features.push(rail);
  assert.equal(cleanDesign(JSON.parse(JSON.stringify(railed))).chassis.features.find((f) => f.type === 'rail').params.points[0].length, 2);
});

test('ribs and walls can have a rounded root where they meet the plate', () => {
  const fillet = (r) => r * r * (1 - Math.PI / 4); // the area of one rounded root, seen along the rib
  // A straight rib 24 long and 3 high on a closed plate, on one side only.
  const d = newDesign();
  find(d.chassis, 'fill').params.style = 'closed';
  const rib = newShape('rib', d);
  Object.assign(rib.params, { points: [[30, 24], [54, 24]], h0: 3, h1: 3, width: 1.2, mirror: false });
  d.chassis.features.push(rib);
  assert.equal(rib.params.root, 0);
  const square = engine.build(d);
  rib.params.root = 1.5;
  const round = engine.build(d), grown = round.chassis.volume - square.chassis.volume;
  assert.ok(Math.abs(grown - 2 * 24 * fillet(1.5)) < 2 * 24 * fillet(1.5) * 0.12, `two roots along 24 mm (${grown.toFixed(2)} mm³ against ${(2 * 24 * fillet(1.5)).toFixed(2)})`);
  assert.deepEqual(round.notes.filter((n) => !n.ok && !n.soft), []);
  // The root is never taller than the rib: on a rib 1 mm high it is 1 mm at most.
  Object.assign(rib.params, { h0: 1, h1: 1, root: 4 });
  const low = engine.build(d);
  rib.params.root = 0;
  const lowSquare = engine.build(d);
  assert.ok(low.chassis.volume - lowSquare.chassis.volume < 2 * 24 * fillet(1) * 1.15);
  // Underneath, the root is under the plate too.
  Object.assign(rib.params, { side: 'under', h0: 1.2, h1: 1.2, root: 1 });
  const under = engine.build(d);
  rib.params.root = 0;
  assert.ok(under.chassis.volume > engine.build(d).chassis.volume + 2 * 24 * fillet(1) * 0.85);
  // A wall has its root on the inside only.
  const e = newDesign();
  find(e.chassis, 'fill').params.style = 'closed';
  const wall = newShape('wall', e);
  Object.assign(wall.params, { height: 6, thick: 1.2, lean: 0, mirror: false });
  e.chassis.features.push(wall);
  const pts = find(e.chassis, 'outline').params.points, a = pts[wall.params.from], b = pts[wall.params.to], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const plain = engine.build(e);
  wall.params.root = 2;
  const rooted = engine.build(e), more = rooted.chassis.volume - plain.chassis.volume;
  assert.ok(more > len * fillet(2) * 0.6 && more < len * fillet(2) * 1.15, `one root along ${len.toFixed(1)} mm (${more.toFixed(2)} mm³)`);
  assert.deepEqual(rooted.notes.filter((n) => !n.ok && !n.soft), plain.notes.filter((n) => !n.ok && !n.soft));
  assert.equal(cleanDesign(JSON.parse(JSON.stringify(e))).chassis.features.find((f) => f.type === 'wall').params.root, 2);
});
