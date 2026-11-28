// Builds the chassis and the pod as watertight solids from a design.
// Runs in the worker (engine.worker.js) and in Node tests.
// All booleans are done by Manifold, as in SlotForge Foundry.

import { builtIn, find, on, heights, motorOf, gearOf, motorPlace, podLayout, uprightSpread, uprightInner, seatSize, holderSize, flanged, flangeProud, flangeSides, gearSide, asRight, podShift, unshifted, podRide, kickActive, activeKicks, profileOf, bearingOf, couponHoles } from '../model.js';
import { createClearanceInspector } from './clearance.js';
import { createAnalyser } from './mesh-measure.js';
import { layerShape, mirrored, insertOf, insertChecks, ringSizes, modelOf, cutsOf, minDepth, modelScale } from '../inserts.js';
import { MESHES, STEP } from './jivko-meshes.js';
import { onePieceSolid, onePieceChecks, rideHeight } from '../onepiece.js';
import { base64ToBytes } from '../library-core.js';
import { wingSide, legYs, pinsOf, wingChecks, deckZ } from '../wings.js';

// The areas a kick-up lifts, seen from above: [x0, y0, x1, y1] each. `far` is how far 'everything' reaches.
export function kickAreas(d, far) {
  const out = [];
  for (const { f, front } of activeKicks(d)) {
    const p = f.params, x0 = front ? -far : p.fold - 0.01, x1 = front ? p.fold + 0.01 : far, zh = Math.max(0.5, p.zoneHalf ?? 10);
    if (p.zone === 'centre') out.push([x0, -zh, x1, zh]);
    else if (p.zone === 'sides') out.push([x0, zh, x1, far], [x0, -far, x1, -zh]);
    else out.push([x0, -far, x1, far]);
  }
  return out;
}

// Larger than any design: cleanDesign keeps every position within ±600 mm.
const BIG = 1000;

export function createEngine(wasm) {
  const { Manifold, CrossSection } = wasm;
  wasm.setMinCircularAngle(7);
  wasm.setMinCircularEdgeLength(0.2);

  // Imported parts, kept as kernel solids between builds: { key: Manifold }.
  const analyser = createAnalyser(wasm);
  const meshes = new Map();
  function setMesh({ key, positions, indices }) {
    const solid = analyser.solidOf({ positions, indices });
    meshes.get(key)?.delete();
    meshes.set(key, solid);
    return { key };
  }
  function dropMesh({ key }) {
    meshes.get(key)?.delete();
    return { dropped: meshes.delete(key) };
  }
  const imported = (key, what) => {
    const solid = meshes.get(key);
    if (!solid) throw Error(`The imported ${what} has lost its model. Import it again.`);
    return solid;
  };

  // Every kernel object made during a build is kept here and freed at the end.
  let bin = [];
  const K = (o) => (bin.push(o), o);

  // ---------- 2D
  const poly = (pts) => K(new CrossSection([pts], 'NonZero'));
  const rect = (x0, y0, x1, y1) => K(K(CrossSection.square([x1 - x0, y1 - y0], false)).translate([x0, y0]));
  const disc = (x, y, r) => K(K(CrossSection.circle(r)).translate([x, y]));
  const u2 = (list) => (list.length ? K(CrossSection.union(list)) : rect(0, 0, 0, 0));
  const empty2 = () => K(CrossSection.square([0, 0], false));

  // ---------- 3D
  // A shape with no size must be "nothing", never an invalid solid: the kernel turns a
  // union or a cut with an invalid solid into an empty result, which would erase the whole part.
  const none3 = () => K(Manifold.union([]));
  const EPS = 1e-6;
  const box = (x0, y0, z0, x1, y1, z1) => (x1 - x0 > EPS && y1 - y0 > EPS && z1 - z0 > EPS ? K(K(Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false)).translate([x0, y0, z0])) : none3());
  const cylZ = (x, y, z0, z1, r) => (z1 - z0 > EPS && r > EPS ? K(K(Manifold.cylinder(z1 - z0, r, r)).translate([x, y, z0])) : none3());
  const cylY = (x, z, y0, y1, r) => (y1 - y0 > EPS && r > EPS ? K(K(K(Manifold.cylinder(y1 - y0, r, r)).rotate([-90, 0, 0])).translate([x, y0, z])) : none3());
  const cylX = (y, z, x0, x1, r) => (x1 - x0 > EPS && r > EPS ? K(K(K(Manifold.cylinder(x1 - x0, r, r)).rotate([0, 90, 0])).translate([x0, y, z])) : none3());
  const u3 = (list) => K(Manifold.union(list));
  // The radius of a hole once the printer's fix is added; never less than a hair.
  const holeR = (d, fix) => Math.max(0.1, (d + fix) / 2);
  // A 2D profile (u, v) pushed along a length: u runs along `ud`, v is up, the length runs along `wd`.
  const prism = (profile, length, origin, ud, wd) =>
    length <= EPS || poly(profile).area() <= EPS ? none3() : K(K(poly(profile).extrude(length)).transform([ud[0], ud[1], 0, 0, 0, 0, 1, 0, wd[0], wd[1], 0, 0, origin[0], origin[1], origin[2], 1]));
  const both = (solid, mirror) => (mirror ? u3([solid, K(solid.mirror([0, 1, 0]))]) : solid);
  const both2 = (cs, mirror) => (mirror ? u2([cs, K(cs.mirror([0, 1]))]) : cs);
  // A strip of a given width along a line of points.
  function strip(points, width) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      out.push(disc(points[i][0], points[i][1], width / 2));
      if (i === 0) continue;
      const [ax, ay] = points[i - 1], [bx, by] = points[i], len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      const nx = (-(by - ay) / len) * (width / 2), ny = ((bx - ax) / len) * (width / 2);
      out.push(poly([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]));
    }
    return u2(out);
  }
  const boxOf = (p) => rect(Math.min(p.x0, p.x1), Math.min(p.y0, p.y1), Math.max(p.x0, p.x1), Math.max(p.y0, p.y1));
  const ext = (cs, h, z0) => (h > EPS && cs.area() > EPS ? K(K(cs.extrude(h)).translate([0, 0, z0])) : none3());

  function meshOf(solid) {
    const m = solid.getMesh();
    const n = m.numProp, src = m.vertProperties;
    const positions = new Float32Array((src.length / n) * 3);
    for (let i = 0, j = 0; i < src.length; i += n) {
      positions[j++] = src[i]; positions[j++] = src[i + 1]; positions[j++] = src[i + 2];
    }
    return { positions, indices: new Uint32Array(m.triVerts), volume: solid.volume() };
  }
  const polysOf = (cs) => cs.toPolygons().map((ring) => ring.map((p) => [p[0], p[1]]));

  // Drops crumbs (under 1 mm³) that a cut can leave behind, and counts the real pieces.
  function tidy(solid) {
    const all = solid.decompose().map(K), keep = all.filter((p) => p.volume() > 1);
    if (!keep.length) return [solid, all.length];
    return [keep.length === all.length ? solid : u3(keep), keep.length];
  }

  // A rounded root: the cross-section of the fillet where an upright face meets the plate. `u` runs away
  // from the face along the plate, `v` up the face (down, for a rib underneath); the curve is a quarter circle.
  const rootProfile = (r, sign = 1, down = false) => {
    const pts = [[0, -0.3], [sign * r, -0.3]];
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); pts.push([sign * (r - r * Math.sin(a)), r - r * Math.cos(a)]); }
    return down ? pts.map(([u, v]) => [u, -v]) : pts;
  };

  // The full outline from its +Y half.
  // A point marked as curved (a third entry) is not a corner: the outline bends past it, from the
  // middle of the line before it to the middle of the line after it. The line never leaves the shape the
  // points span, so a curved outline is never wider or longer than the straight one.
  function outlinePoints(half) {
    const pts = half.map(([x, y, bend]) => [x, Math.max(0, y), bend ? 1 : 0]);
    const back = pts.slice().reverse().filter(([, y]) => y > 1e-6).map(([x, y, bend]) => [x, -y, bend]);
    const ring = pts.concat(back);
    if (!ring.some((q) => q[2])) return ring.map(([x, y]) => [x, y]);
    const out = [], n = ring.length, STEPS = 10;
    for (let i = 0; i < n; i++) {
      const cur = ring[i];
      if (!cur[2]) { out.push([cur[0], cur[1]]); continue; }
      const prev = ring[(i + n - 1) % n], next = ring[(i + 1) % n];
      const a = [(prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2], b = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2];
      for (let k = 0; k <= STEPS; k++) {
        const u = k / STEPS, v = 1 - u;
        out.push([v * v * a[0] + 2 * v * u * cur[0] + u * u * b[0], v * v * a[1] + 2 * v * u * cur[1] + u * u * b[1]]);
      }
    }
    // Two curved points in a row share the middle of their line: once is enough.
    return out.filter((q, i) => { const p = out[(i + out.length - 1) % out.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6; });
  }

  // ------------------------------------------------------------ chassis

  // The footprint of an imported pod where it passes through the chassis plate (its lugs sit higher and are left out).
  function podFootprint(d) {
    const imp = d.pod.imported;
    if (!imp) return null;
    const src = imported(imp.mesh, 'pod'), t = find(d.chassis, 'outline').params.thickness, rings = [];
    for (const z of [0.15, t / 2, Math.max(0.2, t - 0.05)])
      for (const ring of K(src.slice(z)).toPolygons()) {
        let area = 0;
        for (let i = 0; i < ring.length; i++) area += ring[i][0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * ring[i][1];
        if (area > 0) rings.push(ring);
      }
    if (!rings.length) return null;
    return K(K(new CrossSection(rings, 'NonZero')).translate([podLayout(d).off, 0]));
  }

  // The pod's floor from above: a rectangle, widened where a motor lies across the car.
  const podBase = (lay) => { const cy = lay.cy ?? 0, floor = rect(lay.x0, cy - lay.width / 2, lay.x1, cy + lay.width / 2); return lay.seatFoot ? u2([floor, poly(lay.seatFoot)]) : floor; };

  function buildChassis(d, notes, footprint) {
    // How high the chassis really rides (see podRide): everything below is built at that height.
    if (podRide(d)) d = { ...d, car: { ...d.car, clearance: d.car.clearance - podRide(d) } };
    // Upright holes and sideways holes print differently, so each has its own fix.
    const c = d.chassis, fix = d.printer.holeFix, bfix = d.printer.boreFix ?? fix;
    const outline = find(c, 'outline').params;
    const z0 = d.car.clearance, t = outline.thickness, top = z0 + t;
    const h = heights(d);

    const shapes = (type) => c.features.filter((f) => f.type === type && on(f));
    // An imported chassis keeps its own shape; features are added to it and cut from it.
    const imp = c.imported;
    let plate, importedSolid = null;
    if (imp) {
      importedSolid = K(imported(imp.mesh, 'chassis').translate([-imp.frontX, 0, z0]));
      plate = K(importedSolid.project());
    } else {
      plate = poly(outlinePoints(outline.points));
      const r = Math.max(0, outline.round || 0);
      if (r > 0.05) plate = K(K(K(plate.offset(-r, 'Round')).offset(2 * r, 'Round')).offset(-r, 'Round'));
      if (plate.area() < 1) throw Error('The outline has no area. Check its points.');
    }

    // Body supports: tabs that reach out from the edge of the plate, where you put them.
    const tabs = imp ? [] : shapes('tab').map((f) => {
      const p = f.params, x0 = p.along - Math.max(1, p.length) / 2, x1 = p.along + Math.max(1, p.length) / 2;
      const here = K(plate.intersect(rect(x0, 0, x1, BIG)));
      if (here.area() < 0.01) return null;
      const edge = here.bounds().max[1], out = rect(x0, edge - 1.5, x1, edge + Math.max(0, p.reach));
      return { p, edge, shape: both2(out, p.mirror), block: both2(rect(x0, edge + Math.max(0, p.reach) - Math.min(3, p.reach + 1.5), x1, edge + Math.max(0, p.reach)), p.mirror) };
    }).filter(Boolean);
    if (tabs.length) plate = K(plate.add(u2(tabs.map((q) => q.shape))));

    // Free cut-outs: any closed shape, through the plate or sunk into it.
    const freeShape = (f) => {
      const pts = f.params.points.slice();
      if (pts.length < 3) return null;
      let area = 0;
      for (let i = 0; i < pts.length; i++) area += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
      if (Math.abs(area) < 0.02) return null;
      let shape = poly(area > 0 ? pts : pts.reverse());
      const r = Math.max(0, f.params.round || 0);
      if (r > 0.05) shape = K(K(K(shape.offset(-r, 'Round')).offset(2 * r, 'Round')).offset(-r, 'Round'));
      return shape.area() > 0.05 ? both2(shape, f.params.mirror) : null;
    };

    // Holders, wire guides and chip mounts: their outlines from above, so that a frame carries them.
    const holderShape = (p, grow = 0) => {
      const bar = p.shape === 'bar';
      const one = bar ? K(rect(p.along - p.length / 2 - grow, p.side - p.width / 2 - grow, p.along + p.length / 2 + grow, p.side + p.width / 2 + grow)) : disc(p.along, p.side, p.d / 2 + grow);
      return both2(one, p.mirror && Math.abs(p.side) > 0.01);
    };
    const wirePosts = (p) => both2(u2([1, -1].map((s) => rect(p.along - p.length / 2, p.side + s * (p.gap / 2 + p.wall / 2) - p.wall / 2, p.along + p.length / 2, p.side + s * (p.gap / 2 + p.wall / 2) + p.wall / 2))), p.mirror && Math.abs(p.side) > 0.01);
    const chipRect = (p, grow) => rect(p.along - p.length / 2 - grow, p.side - p.width / 2 - grow, p.along + p.length / 2 + grow, p.side + p.width / 2 + grow);

    // The pod opening.
    const opening = find(c, 'podOpening'), lay = podLayout(d);
    let hole2 = empty2();
    if (on(opening)) {
      const g = opening.params.gap;
      hole2 = footprint ? K(footprint.offset(g, 'Round')) : K(podBase(lay).offset(g, 'Miter'));
      // A pod that sits on top of the chassis rests on it all round: the opening is smaller than the pod.
      // Whatever of the motor hangs down to the plate still gets its room.
      const podBaseP = find(d.pod, 'base')?.params ?? {};
      if (!footprint && podBaseP.onTop === true) {
        const rest = Math.max(0, podBaseP.rest ?? 2), inner = K(podBase(lay).offset(-rest, 'Miter'));
        const m = motorOf(d), place = motorPlace(d), clear = find(d.pod, 'motorSeat')?.params.clear ?? 0.3;
        const motor = h.motorBottom < t + 0.3 ? [K(K(K(CrossSection.square([m.length + 2 * clear + 1, m.width + 2 * clear + 1], true)).rotate(place.angle)).translate([place.x, place.y]))] : [];
        hole2 = u2([inner, ...motor]);
      }
    }

    // Solid pads the features need, whatever the fill.
    const fill = find(c, 'fill'), fp = fill?.params ?? {};
    const margin = fp.pad ?? 1.6;
    const pads = [];
    const guide = find(c, 'guide'), axle = find(c, 'frontAxle'), mounts = find(c, 'podMounts'), posts = find(c, 'bodyMounts');
    if (on(guide)) pads.push(disc(guide.params.along, guide.params.side, guide.params.padD / 2));
    const uprightY = on(axle) ? [axle.params.spread / 2, -axle.params.spread / 2] : [];
    if (on(axle)) for (const y of uprightY) {
      const a = axle.params, bear = a.mount === 'bearing', hx = bear ? a.seat / 2 + a.wall : a.width / 2, hy = bear ? a.bThick / 2 : a.thick / 2;
      pads.push(rect(a.along - hx - margin, y - hy - margin, a.along + hx + margin, y + hy + margin));
    }
    if (on(mounts)) for (const [x, y] of lay.points) pads.push(disc(x, y, mounts.params.padD / 2));
    const postPts = on(posts) ? posts.params.posts.flatMap((p) => (Math.abs(p.side) > 0.01 ? [[p.along, p.side], [p.along, -p.side]] : [[p.along, 0]])) : [];
    for (const [x, y] of postPts) pads.push(disc(x, y, posts.params.padD / 2 + margin * 0.5));
    if (!imp) {
      for (const f of shapes('holder')) pads.push(holderShape(f.params, Math.max(d.printer.minWall, f.params.wall) + margin * 0.5));
      for (const f of shapes('wire')) pads.push(K(wirePosts(f.params).offset(margin * 0.5, 'Miter')));
      for (const f of shapes('chip')) pads.push(chipRect(f.params, (f.params.clear || 0) + Math.max(d.printer.minWall, f.params.wall)));
      for (const q of tabs) pads.push(q.shape);
    }

    // A sidewinder or anglewinder gear sits outside the pod, beside the wheel, and dips through the plate.
    const gs = gearSide(d);
    const gearCut = gs && !imp && d.car.rear.tyreD / 2 - gs.r < top + 0.3 ? rect(d.car.wheelbase - gs.r - 0.8, gs.y > 0 ? gs.yd - gs.t / 2 - 0.8 : -BIG, d.car.wheelbase + gs.r + 0.8, gs.y > 0 ? BIG : gs.yd + gs.t / 2 + 0.8) : null;

    // An inline crown gear runs inside the pod, but reaches back past the pod's rear edge: the chassis is
    // cut free for it there. (The same slot the pod has in its floor.)
    const crown = !gs && !imp && d.drivetrain.layout === 'inline' ? gearOf(d) : null;
    const crownCut = crown && d.car.rear.tyreD / 2 - crown.gearD / 2 < top + 0.3 ? (() => {
      const R = crown.gearD / 2 + 0.8, side = d.drivetrain.drives === 'left' ? -1 : 1, o = podShift(d);
      const a = o + side * (crown.pinionD / 2 - 0.6), b = o + side * (crown.pinionD / 2 - 0.6 + 5);
      return rect(d.car.wheelbase - R, Math.min(a, b), d.car.wheelbase + R, Math.max(a, b));
    })() : null;

    // The kick-up a place on the plate is lifted by, if any.
    const kickAt = (x, y) => imp ? null : activeKicks(d).find(({ f, front }) => {
      const k = f.params, zh = Math.max(0.5, k.zoneHalf ?? 10);
      return (front ? x < k.fold : x > k.fold) && (k.zone === 'centre' ? Math.abs(y) <= zh : k.zone === 'sides' ? Math.abs(y) >= zh : true);
    }) ?? null;

    // The chassis always runs all the way round the pod and its gear. Where the outline as drawn is too
    // narrow for that, the plate is carried round them by a rail's width.
    const fillP = find(c, 'fill')?.params ?? {}, ringW = Math.max(d.printer.minWall, fillP.railWidth ?? 1.6);
    let around = on(opening) && !imp ? K(hole2.offset(ringW, 'Miter')) : null;
    // The gear and the tyre run free: nothing of the chassis stands between them, or beyond the gear.
    // On that side the pod is closed in by the strip of plate between the pod and the gear, which passes
    // under the gear's hub. Only where the pod itself reaches the gear is there no room for that strip.
    let gearSlot = gearCut;
    if (gs && !imp) {
      const rear = d.car.rear, reach = Math.abs(gs.y) + gs.w / 2, tyre = rear.inOut - rear.tyreW / 2;
      if (reach > tyre - 0.1)
        notes.push({ ok: false, title: 'The gear touches a rear tyre', text: `The gear reaches ${(reach - tyre + 0.3).toFixed(1)} mm too far out. Move the pod away from it (Pod › Base plate, "Move the pod sideways"), bring the bearing holders closer together, move the rear wheels out, or use narrower rear tyres.` });
    }
    if (around && gearCut) {
      const keep = K(hole2.offset(d.printer.minWall, 'Miter'));
      const disc = rect(d.car.wheelbase - gs.r - 0.3, gs.yd - gs.t / 2 - 0.3, d.car.wheelbase + gs.r + 0.3, gs.yd + gs.t / 2 + 0.3);
      if (K(keep.intersect(disc)).area() > 0.05)
        notes.push({ ok: false, title: 'The chassis is open beside the gear', text: 'The pod reaches right up to the gear\'s teeth there, so no strip of plate fits between them. Move the motor away from the gear (Pod › Drivetrain: "Move motor sideways", or a steeper angle), or make the motor seat\'s wall thinner.' });
      else gearSlot = K(gearCut.subtract(keep));
    }
    // Behind the pod the rail goes round the crown gear's slot, so the pod stays closed in there too.
    if (around && crownCut) around = u2([around, K(crownCut.offset(ringW, 'Miter'))]);
    if (around) {
      const drawn = plate.area();
      plate = K(plate.add(around));
      if (plate.area() > drawn + 0.5)
        notes.push({ ok: true, title: 'The plate is widened round the pod', text: 'The outline is narrower than the pod and its gear there. The chassis is carried round them by a rail, so that the pod stays enclosed.' });
    }

    // Fill.
    const kick = find(c, 'kickup');
    let base = plate;
    const style = imp ? 'closed' : on(fill) ? fp.style : 'closed';
    if (style === 'frame' || style === 'lattice') {
      const w = Math.max(d.printer.minWall, fp.railWidth);
      const inner = K(plate.offset(-Math.max(d.printer.minWall, fp.outerRail), 'Miter'));
      const parts = [K(plate.subtract(inner)), ...pads];
      for (const f of shapes('rail')) parts.push(both2(strip(f.params.points, Math.max(d.printer.minWall, f.params.width)), f.params.mirror));
      if (around) parts.push(around);
      else if (on(opening)) parts.push(K(hole2.offset(w, 'Miter')));
      // The gear's cut-out takes the side rail beside the wheel away. Nothing can pass the gear there,
      // so the tail is tied in behind the pod instead: a rail along the inner edge of the cut-out, from
      // the pod opening back to the tail. It stays clear of the wheel.
      if (gearCut) {
        const sg = Math.sign(gs.y) || 1, inner = gs.yd - sg * (gs.t / 2 + 0.8), far = inner - sg * (w + 0.8);
        parts.push(rect(lay.x1 - w, Math.min(inner, far), BIG, Math.max(inner, far)));
        // Beside the pod, round the gear and where a motor lying across the car pushes the opening out,
        // the plate is closed: thin rails there would only be cut to stubs by the gear.
        const out = (lay.seatFoot ?? []).filter((q) => sg * (q[1] - lay.cy) > lay.width / 2).map((q) => q[0]);
        const ahead = Math.min(d.car.wheelbase - gs.r - 0.8 - 4 * w, ...out) - w;
        parts.push(rect(ahead, sg > 0 ? lay.cy + lay.width / 2 : -BIG, lay.x1, sg > 0 ? BIG : lay.cy - lay.width / 2));
      }
      if (style === 'frame') {
        for (const x of fp.cross ?? []) parts.push(rect(x - w / 2, -BIG, x + w / 2, BIG));
        for (const y of fp.length ?? []) {
          parts.push(rect(-BIG, y - w / 2, BIG, y + w / 2));
          if (Math.abs(y) > 0.01) parts.push(rect(-BIG, -y - w / 2, BIG, -y + w / 2));
        }
        if (fp.spine !== false) parts.push(rect(-BIG, -w / 2, BIG, w / 2));
        // A rail under the front axle, from bracket to bracket.
        if (fp.axleRail !== false && on(axle)) parts.push(rect(axle.params.along - w / 2, -axle.params.spread / 2, axle.params.along + w / 2, axle.params.spread / 2));
        // A rail across the nose through the guide holder, out to the outer rail on both sides.
        if (fp.guideRail !== false && on(guide)) parts.push(rect(guide.params.along - w / 2, -BIG, guide.params.along + w / 2, BIG));
        // Struts in the nose: from the guide out to the front axle brackets, and back to the front corners of the pod opening.
        const struts = fp.struts ?? 'fan';
        if (struts !== 'none' && on(guide)) {
          const from = [guide.params.along, guide.params.side];
          if (on(axle)) for (const y of uprightY) parts.push(strip([from, [axle.params.along, y]], w));
          if (struts === 'fan' && on(opening)) for (const s of [1, -1]) parts.push(strip([from, [lay.x0, (lay.cy ?? 0) + (s * lay.width) / 2]], w));
        }
      } else {
        const cell = Math.max(3, fp.latticeCell ?? 7), strips = [];
        const pb = plate.bounds(), reach = Math.hypot(Math.max(Math.abs(pb.min[0]), Math.abs(pb.max[0])), Math.max(Math.abs(pb.min[1]), Math.abs(pb.max[1]))) + cell;
        for (let o = -reach; o <= reach; o += cell) strips.push(rect(-reach, o - w / 2, reach, o + w / 2));
        const all = u2(strips);
        parts.push(K(all.rotate(45)), K(all.rotate(-45)));
      }
      // A kicked-up rear is a closed plate.
      // A split needs solid plate to hold its keys: a closed band across the car at the cut.
      const cutAt = find(c, 'split');
      if (on(cutAt)) parts.push(rect(cutAt.params.along - cutAt.params.depth - 2, -BIG, cutAt.params.along + 2.5, BIG));
      // A kicked-up area is a closed plate.
      for (const [x0, y0, x1, y1] of kickAreas(d, BIG)) parts.push(rect(x0, y0, x1, y1));
      // Behind the rear wheels the plate is closed too: a rear plate, as the makers' chassis have.
      if (fp.tail !== false) parts.push(rect(d.car.wheelbase + d.car.rear.tyreD / 2 + 1.5, -BIG, BIG, BIG));
      // Rails that run side by side with only a slit between them are joined into one: a gap narrower
      // than a rail is of no use, and one wide rail is stronger than two thin ones.
      const join = Math.max(0.6, w * 0.6);
      base = K(K(K(K(u2(parts).offset(join, 'Miter')).offset(-join, 'Miter')).simplify(0.02)).intersect(plate));
    }
    base = K(base.subtract(hole2));
    if (gearSlot) base = K(base.subtract(gearSlot));
    if (crownCut) base = K(base.subtract(crownCut));
    // What the cuts leave thinner than half a rail is taken away: such slivers do not print and hold nothing.
    if (style === 'frame' || style === 'lattice') {
      const thin = Math.min(Math.max(d.printer.minWall, fp.railWidth) * 0.25, d.printer.minWall * 0.4);
      base = K(K(base.offset(-thin, 'Miter')).offset(thin, 'Miter'));
      // So are scraps the cuts leave standing on their own, beside the gear or in a wheel arch.
      const lumps = base.decompose().map(K), whole = base.area();
      if (lumps.length > 1) base = u2(lumps.filter((piece) => piece.area() >= Math.max(4, whole * 0.03)));
      // Growing and shrinking leave corners made of several points a hair apart; one point is enough.
      base = K(base.simplify(0.02));
    }
    // Windows are cut through the plate, whatever the fill.
    const wins = shapes('window').map((f) => {
      const r = Math.max(0, Math.min(f.params.round ?? 0, Math.abs(f.params.x1 - f.params.x0) / 2 - 0.05, Math.abs(f.params.y1 - f.params.y0) / 2 - 0.05));
      const w = boxOf(f.params);
      return both2(r > 0.05 ? K(K(w.offset(-r, 'Round')).offset(r, 'Round')) : w, f.params.mirror);
    });
    if (wins.length) base = K(base.subtract(u2(wins)));
    // Cut-outs that go right through.
    const through = imp ? [] : shapes('cutout').filter((f) => !(f.params.sink > 0.01)).map(freeShape).filter(Boolean);
    if (through.length) base = K(base.subtract(u2(through)));

    // The plate. A bevel steps its top or bottom edge in, a print layer at a time.
    const bevel = (v) => Math.max(0, Math.min(v ?? 0, t / 2 - 0.05, 1.5));
    const bTop = bevel(outline.bevelTop), bBot = bevel(outline.bevelBottom);
    let solid;
    if (bTop < 0.05 && bBot < 0.05) solid = ext(base, t, z0);
    else {
      const layers = [ext(base, t - bTop - bBot, z0 + bBot)];
      for (const [b, up] of [[bBot, false], [bTop, true]]) {
        if (b < 0.05) continue;
        const n = Math.max(1, Math.min(8, Math.round(b / 0.2))), h = b / n;
        for (let i = 0; i < n; i++) {
          // Layer i counts from the plate's face inward; the outermost layer is stepped in the most.
          const inset = b * (1 - (i + 0.5) / n), z = up ? top - (i + 1) * h : z0 + i * h;
          layers.push(ext(K(base.offset(-inset, 'Miter')), h + 0.01, up ? z - 0.01 : z));
        }
      }
      solid = u3(layers);
    }
    if (imp) {
      // Openings and windows are cut straight through the imported shape.
      const through = [];
      if (on(opening)) through.push(hole2);
      through.push(...wins);
      solid = through.length ? K(importedSolid.subtract(ext(u2(through), 2 * BIG, -BIG))) : importedSolid;
    }
    const add = [], cut = [];

    if (on(guide)) {
      const p = guide.params;
      add.push(cylZ(p.along, p.side, z0, top + p.bossH, p.bossD / 2));
      cut.push(cylZ(p.along, p.side, z0 - 1, top + p.bossH + 1, holeR(p.hole, fix)));
    }
    if (on(axle) && axle.params.mount === 'bearing') {
      // Bearing uprights, as on metal chassis: a block up to the axle with a round top, the bearing's seat through it.
      // A flanged bearing rests against the outside face, in a recess as deep as its flange.
      const p = axle.params, zc = z0 + h.frontAxle, R = p.seat / 2 + p.wall, half = p.bThick / 2, sr = holeR(p.seat, bfix);
      for (const y of uprightY) {
        add.push(box(p.along - R, y - half, z0, p.along + R, y + half, zc), cylY(p.along, zc, y - half, y + half, R));
        cut.push(cylY(p.along, zc, y - half - 0.01, y + half + 0.01, sr));
        if (p.flange && p.flangeD > p.seat) {
          const out = Math.sign(y) || 1, face = y + out * half;
          cut.push(cylY(p.along, zc, out > 0 ? face - p.flangeT : face - 0.01, out > 0 ? face + 0.01 : face + p.flangeT, holeR(p.flangeD, bfix)));
        }
      }
      // The axle runs free between the uprights.
      cut.push(cylY(p.along, zc, -p.spread / 2 + half, p.spread / 2 - half, holeR(d.car.axleD + 0.6, bfix)));
      if (p.wall < d.printer.minWall) notes.push({ ok: false, title: 'Thin wall round the front bearings', text: `${p.wall} mm round each bearing; your printer's least wall is ${d.printer.minWall} mm.` });
      if (zc - R < z0 - 0.01) notes.push({ ok: false, title: 'The front bearings reach below the chassis', text: `With these front tyres the bearing's upright goes ${(z0 - (zc - R)).toFixed(2)} mm below the plate. Use bigger front tyres, a smaller bearing or a thinner wall.` });
    } else if (on(axle)) {
      const p = axle.params, zc = z0 + h.frontAxle, ad = d.car.axleD;
      // Room for the axle to move up and down, and a grub screw from above as well as from below to hold it.
      const travel = Math.max(0, p.travel || 0), up = travel / 2, fromTop = p.grubTop === true && p.grub > 0;
      // A stub axle needs more upright to hold it than a through axle does.
      const thick = p.independent ? Math.max(p.thick, 5) : p.thick;
      const zt = zc + up + ad / 2 + (fromTop ? 3.5 : 2.5);
      for (const y of uprightY) {
        add.push(box(p.along - p.width / 2, y - thick / 2, z0, p.along + p.width / 2, y + thick / 2, zt));
        if (p.grub > 0) cut.push(cylZ(p.along, y, z0 - 1, zc, holeR(p.grub, fix)));
        if (fromTop) cut.push(cylZ(p.along, y, zc, zt + 1, holeR(p.grub, fix)));
      }
      const sw = holeR(ad + 0.1, bfix);
      // The axle's hole, or with travel a slot that tall. Open at the top when "slot" is on, unless a grub screw closes it from above.
      cut.push(cylY(p.along, zc - up, -BIG, BIG, sw));
      if (travel > 0.01) cut.push(cylY(p.along, zc + up, -BIG, BIG, sw), box(p.along - sw, -BIG, zc - up, p.along + sw, BIG, zc + up));
      // The open slot is cut in the uprights only, so walls and ribs nearby keep their tops.
      if (p.slot && !fromTop) for (const y of uprightY) cut.push(box(p.along - sw, y - thick / 2 - 0.5, zc, p.along + sw, y + thick / 2 + 0.5, zt + 1));
      if (zc - up - ad / 2 < top + 0.4 && travel > 0.01) notes.push({ ok: false, title: 'The front axle\'s travel reaches the plate', text: 'At the bottom of its slot the axle would touch the plate. Give it less travel, or use bigger front tyres.' });
      if (zc - ad / 2 < top + 0.4) notes.push({ ok: false, title: 'Front axle sits very low', text: 'The front axle is close to the plate. Use bigger front tyres or less clearance.' });
    }
    // An imported pod brings its own screw size.
    if (on(mounts)) for (const [x, y] of lay.points) cut.push(cylZ(x, y, z0 - 1, top + 1, holeR(d.pod.imported ? d.pod.imported.holeD : mounts.params.hole, fix)));
    if (on(posts)) {
      const p = posts.params;
      for (const [x, y] of postPts) {
        if (kickAt(x, y)) continue; // on a raised part: built upright once the plate is bent (below)
        if (p.height > 0) add.push(cylZ(x, y, z0, top + p.height, p.padD / 2));
        cut.push(cylZ(x, y, z0 - 1, top + p.height + 1, holeR(p.hole, fix)));
        if (p.recessDepth > 0) cut.push(cylZ(x, y, z0 - 1, z0 + p.recessDepth, p.recessD / 2));
      }
    }
    // ---- shaping features
    // Levels: a raised area on the plate, or a pocket sunk into it.
    if (!imp) {
      // Cut-outs sunk into the plate from the top.
      for (const f of shapes('cutout').filter((x) => x.params.sink > 0.01)) {
        const shape = freeShape(f), deep = Math.min(f.params.sink, t - 0.4);
        if (shape && deep > 0.05) cut.push(ext(shape, deep + 1, top - deep));
      }
      // A holder: a wall round a pocket the size of the magnet or weight, standing on the plate.
      for (const f of shapes('holder')) {
        const p = f.params, wall = Math.max(d.printer.minWall, p.wall), floor = Math.min(Math.max(0, p.floor), t), zTop = Math.max(top, z0 + floor + p.deep);
        add.push(ext(holderShape(p, wall), zTop - z0, z0));
        cut.push(ext(holderShape(p, 0.1), zTop - z0 - floor + 2, floor > 0.01 ? z0 + floor : z0 - 1));
      }
      // A wire guide: two posts with the wire's width between them.
      for (const f of shapes('wire')) add.push(ext(wirePosts(f.params), Math.max(0.5, f.params.height) + 0.3, top - 0.3));
      // A chip mount: a low wall round the chip, open in the middle of each long side for its wires.
      for (const f of shapes('chip')) {
        const p = f.params, wall = Math.max(d.printer.minWall, p.wall), clear = Math.max(0, p.clear || 0);
        const ring = K(K(chipRect(p, clear + wall).subtract(chipRect(p, clear))).subtract(rect(p.along - p.length / 6, -BIG, p.along + p.length / 6, BIG)));
        add.push(ext(ring, Math.max(0.5, p.height) + 0.3, top - 0.3));
      }
      // A block on a body support, up to where the body rests.
      for (const q of tabs) if (q.p.rise > 0.01) add.push(ext(q.block, q.p.rise + 0.3, top - 0.3));
    }
    for (const f of shapes('level')) {
      const p = f.params, area = K(both2(boxOf(p), p.mirror).intersect(plate));
      if (p.offset > 0.01) add.push(ext(K(area.subtract(hole2)), p.offset + 0.3, top - 0.3));
      else if (p.offset < -0.01) cut.push(ext(area, Math.min(-p.offset, t - 0.4) + 1, top - Math.min(-p.offset, t - 0.4)));
    }
    // Ribs and strakes: a fin along a line, with its own height at each end.
    for (const f of shapes('rib')) {
      const p = f.params, pts = p.points, w = Math.max(d.printer.minWall, p.width), under = p.side === 'under';
      const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])), total = lens.reduce((a, b) => a + b, 0) || 1;
      const hAt = (s) => p.h0 + ((p.h1 - p.h0) * s) / total;
      const bits = [];
      let run = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = lens[i - 1];
        if (len < 1e-6) continue;
        const tx = (bx - ax) / len, ty = (by - ay) / len, ha = hAt(run), hb = hAt(run + len);
        // Top ribs stand on the plate; under ribs hang from the underside. Both start 0.3 mm inside it.
        const prof = under ? [[0, 0.3], [len, 0.3], [len, -hb], [0, -ha]] : [[0, -0.3], [len, -0.3], [len, hb], [0, ha]];
        bits.push(prism(prof, w, [ax - (ty * w) / 2, ay + (tx * w) / 2, under ? z0 : top], [tx, ty], [ty, -tx]));
        for (const [x, y, hh] of [[ax, ay, ha], [bx, by, hb]])
          if (hh > 0.05) bits.push(under ? cylZ(x, y, z0 - hh, z0 + 0.3, w / 2) : cylZ(x, y, top - 0.3, top + hh, w / 2));
        // A rounded root on both faces of the rib, no taller than the rib is at its lower end.
        const rr = Math.min(Math.max(0, p.root || 0), Math.min(ha, hb) - 0.05);
        if (rr > 0.05) for (const s of [1, -1])
          bits.push(prism(rootProfile(rr, 1, under), len, [ax - s * (ty * w) / 2, ay + s * (tx * w) / 2, under ? z0 : top], [-s * ty, s * tx], [tx, ty]));
        run += len;
      }
      if (bits.length) add.push(both(u3(bits), p.mirror));
    }
    // Edge walls: a wall along part of the outline, leaning outward if asked.
    for (const f of shapes('wall')) {
      const p = f.params, op = outline.points, th = Math.max(d.printer.minWall, p.thick);
      const a = Math.max(0, Math.min(p.from, p.to)), b = Math.min(op.length - 1, Math.max(p.from, p.to));
      const out = Math.tan((Math.max(-45, Math.min(60, p.lean)) * Math.PI) / 180) * p.height;
      const bits = [];
      for (let i = a; i < b; i++) {
        const [ax, ay] = op[i], [bx, by] = op[i + 1], len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) continue;
        const tx = (bx - ax) / len, ty = (by - ay) / len;
        // u points outward (to the left of the direction of travel on the +Y side).
        bits.push(prism([[0, -0.3], [-th, -0.3], [-th + out, p.height], [out, p.height]], len, [ax, ay, top], [-ty, tx], [tx, ty]));
        if (i > a) bits.push(cylZ(ax + (ty * th) / 2, ay - (tx * th) / 2, top - 0.3, top + p.height, th / 2));
        // A rounded root on the wall's inner face, where it meets the plate.
        const rr = Math.min(Math.max(0, p.root || 0), p.height - 0.05);
        if (rr > 0.05) bits.push(prism(rootProfile(rr, -1).map(([u, v]) => [u - th, v]), len, [ax, ay, top], [-ty, tx], [tx, ty]));
      }
      if (bits.length) add.push(both(u3(bits), p.mirror));
    }
    // Tunnels: a hollow box duct along the car, open at both ends.
    for (const f of shapes('tunnel')) {
      const p = f.params, x0 = Math.min(p.x0, p.x1), x1 = Math.max(p.x0, p.x1);
      const wl = Math.min(Math.max(d.printer.minWall, p.wall), p.width / 2 - 0.2, p.height - 0.2);
      if (wl <= 0) continue;
      const y0 = p.side - p.width / 2, y1 = p.side + p.width / 2;
      const shell = box(x0, y0, top - 0.3, x1, y1, top + p.height);
      const bore = box(x0 - 1, y0 + wl, p.openFloor ? z0 - 1 : top, x1 + 1, y1 - wl, top + p.height - wl);
      add.push(both(shell, p.mirror));
      cut.push(both(bore, p.mirror));
    }
    // Upright panels: a wall across the car with windows in it.
    const panels = [];
    for (const f of shapes('panel')) {
      const p = f.params, th = Math.max(d.printer.minWall, p.thick), hw = p.width / 2;
      let panel = box(0, -hw, -0.3, th, hw, p.height);
      const n = Math.min(20, Math.max(0, Math.round(p.windows))), bar = Math.max(d.printer.minWall, p.bar);
      const ww = n > 0 ? (p.width - bar * (n + 1)) / n : 0, wh = p.height - 2 * bar;
      if (n > 0 && ww > 0.5 && wh > 0.5) {
        const holes = [];
        for (let i = 0; i < n; i++) holes.push(box(-1, -hw + bar + i * (ww + bar), bar, th + 1, -hw + bar + i * (ww + bar) + ww, bar + wh));
        panel = K(panel.subtract(u3(holes)));
      }
      if (Math.abs(p.lean) > 0.01) panel = K(panel.rotate([0, p.lean, 0]));
      panels.push(K(panel.translate([p.along, 0, top])));
    }

    if (add.length) solid = K(solid.add(u3(add)));
    if (cut.length) solid = K(solid.subtract(u3(cut)));
    // Panels go on last, so the holes and ducts cut above do not run through them.
    if (panels.length) solid = K(solid.add(u3(panels)));

    // Side profile: the plate follows a height line along the car. Each stretch between two points is
    // sheared (not turned), so everything standing on it stays upright.
    const lift = profileOf(d);
    if (lift.points.length) {
      const xs = lift.points.map((q) => q[0]), slabs = [];
      for (let i = 0; i <= xs.length; i++) {
        let slab = solid;
        if (i > 0) slab = K(slab.trimByPlane([1, 0, 0], xs[i - 1]));
        if (i < xs.length) slab = K(slab.trimByPlane([-1, 0, 0], -xs[i]));
        if (slab.isEmpty()) continue;
        const x0 = i === 0 ? xs[0] : xs[i - 1], a = lift.at(x0);
        const slope = i === 0 || i === xs.length ? 0 : (lift.at(xs[i]) - a) / (xs[i] - x0);
        slabs.push(K(slab.transform([1, 0, slope, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, a - slope * x0, 1])));
      }
      if (slabs.length) solid = u3(slabs);
    }

    // Kick-ups: what lies behind (or ahead of) a fold line turns upward about the fold.
    // A kick-up can take the full width, only the centre, or only the sides.
    for (const { f, front } of activeKicks(d)) {
      const p = { ...f.params, angle: Math.min(80, f.params.angle) }, bounds = solid.boundingBox(), s = front ? -1 : 1;
      if (!(p.fold > bounds.min[0] + 1 && p.fold < bounds.max[0] - 1)) {
        notes.push({ ok: false, title: `${front ? 'Front kick-up' : 'Kick-up'} fold is off the chassis`, text: 'Move the fold line onto the plate.' });
        continue;
      }
      const keep = [K(solid.trimByPlane([-s, 0, 0], -s * p.fold))];
      let move = K(solid.trimByPlane([s, 0, 0], s * p.fold));
      const zh = Math.max(0.5, p.zoneHalf ?? 10), zoned = p.zone === 'centre' || p.zone === 'sides';
      if (zoned) {
        const mid = K(K(move.trimByPlane([0, 1, 0], -zh)).trimByPlane([0, -1, 0], -zh));
        const outer = u3([K(move.trimByPlane([0, 1, 0], zh)), K(move.trimByPlane([0, -1, 0], zh))]);
        keep.push(p.zone === 'centre' ? outer : mid);
        move = p.zone === 'centre' ? mid : outer;
      }
      const pz = z0 + lift.at(p.fold);
      const pieces = [...keep, K(K(K(move.translate([-p.fold, 0, -pz])).rotate([0, -s * p.angle, 0])).translate([p.fold, 0, pz]))];
      const len = front ? p.fold - bounds.min[0] : bounds.max[0] - p.fold, rad = (p.angle * Math.PI) / 180;
      const count = Math.min(40, Math.max(0, Math.round(p.strakes)));
      if (p.fillFloor && count > 0 && !imp) {
        const side = outline.points.filter(([x]) => (front ? x <= p.fold + 0.01 : x >= p.fold - 0.01)).map(([, y]) => y);
        const halfW = Math.max(...side, 2) - 1.5;
        const from = p.zone === 'sides' ? Math.min(zh + 1, halfW) : 0, to = p.zone === 'centre' ? Math.min(zh - 1, halfW) : halfW;
        // The top edge runs 0.3 mm into the plate, so strake and plate fuse into one piece.
        const tri = [[0, 0], [len * Math.cos(rad), 0], [len * Math.cos(rad), len * Math.sin(rad) + 0.3], [0, 0.3]];
        const strakes = [];
        for (let i = 0; i < count; i++) {
          // Spread over the kicked-up width: across it, or over the two sides when only the sides rise.
          const k = count === 1 ? 0 : -1 + (2 * i) / (count - 1);
          const y = p.zone === 'sides' ? Math.sign(k || 1) * (from + (to - from) * Math.abs(k)) : k * to;
          strakes.push(prism(tri, p.strakeT, [p.fold, y - p.strakeT / 2, pz], [s, 0], [0, 1]));
        }
        // Strakes stay under the plate: a tail that narrows or curves (a traced outline) would otherwise
        // leave their ends standing free beside and behind it. Seen from above, the raised plate is the
        // flat one drawn in towards the fold by the tilt.
        const raised = K(base.intersect(front ? rect(-BIG, -BIG, p.fold, BIG) : rect(p.fold, -BIG, BIG, BIG)));
        // (Kept a hair inside the plate's edge, so that no strake ends exactly on it.)
        const under = K(K(K(K(raised.translate([-p.fold, 0])).scale([Math.cos(rad), 1])).translate([p.fold, 0])).offset(-0.2, 'Miter'));
        pieces.push(K(u3(strakes).intersect(ext(under, len * Math.sin(rad) + 4, pz - 2))));
      }
      solid = u3(pieces);
    }

    // Body mounts on a raised part stand upright, where they were placed, and end at the same height
    // as the others: the body's posts come straight down onto them.
    if (on(posts)) {
      const p = posts.params, standing = [], drilled = [];
      for (const [x, y] of postPts) {
        const k = kickAt(x, y);
        if (!k) continue;
        const a = (Math.min(80, k.f.params.angle) * Math.PI) / 180;
        const under = z0 + lift.at(k.f.params.fold) + Math.abs(x - k.f.params.fold) * Math.tan(a), over = under + t / Math.cos(a);
        const postTop = Math.max(top + p.height, over + (p.height > 0 ? 1 : 0));
        if (p.height > 0) standing.push(cylZ(x, y, under + 0.3, postTop, p.padD / 2));
        drilled.push(cylZ(x, y, under - 3, postTop + 1, holeR(p.hole, fix)));
        if (p.recessDepth > 0) drilled.push(cylZ(x, y, under - 3, under + p.recessDepth, p.recessD / 2));
      }
      if (standing.length) solid = K(solid.add(u3(standing)));
      if (drilled.length) solid = K(solid.subtract(u3(drilled)));
    }

    // Tyres must not touch the plate.
    const tyres = [];
    for (const [x, w] of [[0, d.car.front], [d.car.wheelbase, d.car.rear]])
      for (const s of [1, -1]) tyres.push(rect(x - w.tyreD / 2, s * w.inOut - w.tyreW / 2, x + w.tyreD / 2, s * w.inOut + w.tyreW / 2));
    const hit = K(u2(tyres).intersect(base)).area();
    notes.push(hit > 0.05
      ? { ok: false, title: 'A tyre touches the chassis', text: 'Narrow the outline at the wheels, or move the wheels out.' }
      : { ok: true, title: 'Tyres clear the chassis', text: 'No overlap between the tyres and the plate.' });

    const low = solid.boundingBox().min[2];
    if (low < z0 - 0.01)
      notes.push({ ok: low >= d.rules.minClearance, title: `Lowest point ${low.toFixed(2)} mm above the track`, text: `Something hangs below the plate. Limit for this rule set: ${d.rules.minClearance} mm.` });

    let pieces;
    [solid, pieces] = tidy(solid);
    if (pieces > 1) notes.push({ ok: false, title: `The chassis is in ${pieces} separate pieces`, text: 'Something cuts it apart, or a mount is not joined to the rest. Add a rail, widen the outline, or narrow the pod.' });

    // Split part: the chassis cut across in two print parts, keyed together with dovetails.
    // The rear part carries the keys; the front part has the matching sockets, a little larger.
    let split = null;
    const sp = find(c, 'split');
    if (on(sp)) {
      const p = sp.params, n = Math.min(8, Math.max(1, Math.round(p.tabs))), keys = [];
      for (let i = 0; i < n; i++) {
        const y = n === 1 ? 0 : -p.spread + (2 * p.spread * i) / (n - 1);
        keys.push(poly([[p.along + 0.01, y - p.neck / 2], [p.along - p.depth, y - p.head / 2], [p.along - p.depth, y + p.head / 2], [p.along + 0.01, y + p.neck / 2]]));
      }
      const keys2 = u2(keys), tall = (cs) => ext(cs, 2 * BIG, -BIG);
      const rearTool = u3([box(p.along, -BIG, -BIG, BIG, BIG, BIG), tall(keys2)]);
      const frontCut = u3([box(p.along - p.play, -BIG, -BIG, BIG, BIG, BIG), tall(K(keys2.offset(p.play, 'Miter')))]);
      const [rear, rearPieces] = tidy(K(solid.intersect(rearTool))), [frontPart, frontPieces] = tidy(K(solid.subtract(frontCut)));
      const usable = (m) => m.status() === 'NoError' && !m.isEmpty() && m.volume() > 0.5;
      if (!usable(rear) || !usable(frontPart))
        notes.push({ ok: false, title: 'The split leaves one part empty', text: 'Move the cut onto the chassis.' });
      else {
        split = { front: frontPart, rear };
        if (rearPieces > 1 || frontPieces > 1)
          notes.push({ ok: false, title: 'A split part falls into pieces', text: 'Move the cut, or its keys, onto solid plate. In a frame or lattice, cut across a closed area.' });
        else notes.push({ ok: true, title: 'The chassis prints in two parts', text: `Cut ${p.along.toFixed(1)} mm behind the front axle, with ${n} dovetail key${n > 1 ? 's' : ''}. Glue the joint.` });
      }
    }

    return { solid, top: polysOf(base), split };
  }

  // ------------------------------------------------------------ pod

  // A socket for a spherical bushing, centred at (x, y, z) with the axle along Y: a ball-shaped hole, a
  // smaller opening through both faces, and `slits` across the lip on the outer side (`out`: +1 or -1),
  // reaching `half` from the middle to that face. Returns the pieces to cut away.
  function socket(x, y, z, out, p, half, fix, grow = 0) {
    const R = holeR(p.ballD + grow, fix), ro = holeR(p.opening + grow, fix), reach = R + Math.max(0.4, p.wall * 0.5);
    const parts = [K(K(Manifold.sphere(R, 48)).translate([x, y, z])), cylY(x, z, y - half - 1, y + half + 1, ro)];
    const y0 = out > 0 ? y : y - half - 1, y1 = out > 0 ? y + half + 1 : y;
    for (let i = 0; i < (p.slits || 0); i++) {
      const a = 45 + (i * 360) / p.slits;
      parts.push(K(K(box(0, y0, -p.slitW / 2, reach, y1, p.slitW / 2).rotate([0, a, 0])).translate([x, 0, z])));
    }
    return parts;
  }

  // A drivetrain on the left is built as its right-hand twin and turned over.
  function buildPod(d, notes) {
    // ...and a pod off the centre line is built on it and moved over.
    const o = podShift(d), left = !d.pod.imported && d.drivetrain.drives === 'left';
    if (!o && !left) return buildPodRight(d, notes);
    let part = buildPodRight(left ? asRight(unshifted(d)) : unshifted(d), notes, left ? o : -o);
    const flip = (rings) => rings.map((ring) => ring.map(([x, y]) => [x, -y]).reverse()), over = (rings) => rings.map((ring) => ring.map(([x, y]) => [x, y + o]));
    if (left) part = { solid: K(part.solid.mirror([0, 1, 0])), top: flip(part.top), window: flip(part.window) };
    return o ? { solid: K(part.solid.translate([0, o, 0])), top: over(part.top), window: over(part.window) } : part;
  }
  // `tyresAt`: where the car's centre line lies, seen from a pod that will be moved over afterwards.
  function buildPodRight(d, notes, tyresAt = 0) {
    const pod = d.pod, fix = d.printer.holeFix, bfix = d.printer.boreFix ?? fix;
    const base = find(pod, 'base').params, lay = podLayout(d), wb = d.car.wheelbase;
    // The pod's floor: level with the chassis's underside, or on top of the chassis. The motor and the axle
    // keep their place in the car (the wheels decide that), so in the pod they sit `drop` higher or lower.
    const drop = pod.imported ? 0 : base.drop || 0, onTop = !pod.imported && base.onTop === true;
    const z0 = d.car.clearance - drop, real = heights(d);
    const h = { axle: real.axle + drop, shaft: real.shaft + drop, motorBottom: real.motorBottom + drop };
    const m = motorOf(d), place = motorPlace(d), g = gearOf(d);
    const seat = find(pod, 'motorSeat'), up = find(pod, 'uprights'), lugs = find(pod, 'lugs');
    const plateT = find(d.chassis, 'outline').params.thickness;

    if (pod.imported) {
      const solid = K(imported(pod.imported.mesh, 'pod').translate([lay.off, 0, z0]));
      return { solid, top: polysOf(K(solid.project())), window: [] };
    }

    const turn = (solid) => K(K(solid.rotate([0, 0, place.angle])).translate([place.x, place.y, z0]));
    const clear = seat?.params.clear ?? 0.3, wall = seat?.params.wall ?? 2;

    // Base plate with a window where the motor hangs through.
    let base2 = podBase(lay);
    base2 = K(K(K(base2.offset(-1, 'Round')).offset(1, 'Round')));
    const top2 = [base2];
    const motorWin = K(K(K(CrossSection.square([m.length + 2 * clear, m.width + 2 * clear], true)).rotate(place.angle)).translate([place.x, place.y]));
    if (h.motorBottom < base.thickness + 0.2) base2 = K(base2.subtract(motorWin));

    // The gear needs a slot through the base and the brace.
    const upP = up?.params, seatD = upP?.seat ?? 4.75;
    const gearR = g.gearD / 2 + 0.8;
    // An inline crown runs between the bearing holders and needs a slot; other gears sit outside the pod.
    const gy0 = g.pinionD / 2 - 0.6;
    const gearSlot = d.drivetrain.layout === 'inline' && h.axle - gearR < base.thickness + 0.2 ? box(wb - gearR, gy0, z0 - 1, wb + gearR, gy0 + 5, z0 + h.axle) : null;

    let solid = ext(base2, base.thickness, z0);
    const add = [], cut = [];

    if (on(seat)) {
      const L = m.length / 2 + clear, W = m.width / 2 + clear;
      // A motor turned end for end drives from its endbell: the two bulkheads swap their openings,
      // and the screw holes go with the can's face to the far end.
      const rev = d.drivetrain.reverse === true, fD = rev ? m.endD : m.bossD, rD = rev ? m.bossD : m.endD;
      const fh = h.shaft + fD / 2 + 2, rh = h.shaft + rD / 2 + 2;
      // The two screw holes in the motor's face, on a line through the shaft: level on the 20 mm cans,
      // tilted (30°) on the slimlines.
      const tilt = ((m.screwTilt || 0) * Math.PI) / 180, sy = (m.pitch / 2) * Math.cos(tilt), sz = (m.pitch / 2) * Math.sin(tilt);
      // A motor without screw holes (pitch 0) is held by the seat alone.
      const screws = (x0, x1) => (!(m.pitch > 0) ? [] : [cylX(sy, h.shaft + sz, x0, x1, 1.1 + bfix / 2), cylX(-sy, h.shaft - sz, x0, x1, 1.1 + bfix / 2)]);
      // Shaft-side bulkhead, endbell-side bulkhead and two low side rails, in the motor's own frame.
      const front = K(box(L, -W - wall, 0, L + wall, W + wall, fh)
        .subtract(u3([cylX(0, h.shaft, L - 1, L + wall + 1, (fD + bfix + 0.1) / 2), box(L - 1, -(fD + bfix + 0.1) / 2, h.shaft, L + wall + 1, (fD + bfix + 0.1) / 2, fh + 1),
          ...(rev ? [] : screws(L - 1, L + wall + 1))])));
      const rear = K(box(-L - wall, -W - wall, 0, -L, W + wall, rh)
        .subtract(u3([cylX(0, h.shaft, -L - wall - 1, -L + 1, (rD + bfix + 0.1) / 2), box(-L - wall - 1, -(rD + bfix + 0.1) / 2, h.shaft, -L + 1, (rD + bfix + 0.1) / 2, rh + 1),
          ...(rev ? screws(-L - wall - 1, -L + 1) : [])])));
      const railH = Math.min(Math.max(h.shaft - 1, base.thickness + 1), 5);
      add.push(turn(u3([front, rear, box(-L - wall, W, 0, L + wall, W + wall, railH), box(-L - wall, -W - wall, 0, L + wall, -W, railH)])));
    }

    if (on(up)) {
      const p = upP, ball = p.form === 'sphere', sd = seatSize(p), zc = z0 + h.axle, hw = holderSize(p) / 2 + p.wall, zt = zc + holderSize(p) / 2 + p.wall;
      const yo = uprightSpread(d) / 2, yi = uprightInner(yo, p);
      // The motor may clip a holder's corner (a shallow anglewinder does), but must leave the
      // bearing seat its wall: half the wall around the seat is kept clear.
      const keep = sd / 2 + p.wall / 2;
      const feet = u2([rect(wb - keep, yi, wb + keep, yo), rect(wb - keep, -yo, wb + keep, -yi)]);
      if (K(feet.intersect(motorWin)).area() > 0.05)
        notes.push({ ok: false, title: 'The motor cuts into a bearing holder', text: 'Move the motor, widen the spread of the uprights, or thin them.' });
      for (const s of [1, -1]) {
        const a = Math.min(s * yi, s * yo), b = Math.max(s * yi, s * yo);
        add.push(box(wb - hw, a, z0, wb + hw, b, zt));
        if (p.buttress) add.push(box(wb - hw - 2.5, a, z0, wb + hw, b,Math.max(z0 + base.thickness, zc - sd / 2 - 0.5)));
        if (p.lube) cut.push(cylZ(wb, s * (yo + yi) / 2, z0 - 1, zc, 0.6));
      }
      // What runs between the uprights: the axle, or an axle tube round it.
      const between = p.tube ? p.tubeD : d.car.axleD;
      if (p.brace) {
        const bz = z0 + Math.max(base.thickness, Math.min(h.axle - between / 2 - 1.2, 5));
        add.push(box(wb - 1.2, -yi, z0, wb + 1.2, yi, bz));
      }
      const sr = holeR(sd, bfix);
      if (zc - sr < z0 + 0.6) notes.push({ ok: false, title: 'The axle sits too low in the pod', text: 'The bearing seat reaches the pod\'s floor. Raise the motor and axle in the pod (Pod › Base plate), or use larger rear tyres.' });
      const yc = (yo + yi) / 2;
      if (ball) {
        // A round socket in the middle of each upright, with a lip on both faces: the ball snaps in from
        // the wheel side, where slits let the lip give, and can tilt but not fall out.
        for (const s of [1, -1]) cut.push(...socket(wb, s * yc, zc, s, p, yo - yc, bfix));
        if (p.thick < p.ballW + 0.4) notes.push({ ok: false, title: 'The uprights are too thin for the ball', text: `A ball ${p.ballW} mm wide needs uprights at least ${(p.ballW + 0.4).toFixed(1)} mm thick, so that a lip is left on both sides of it.` });
        if (p.opening >= p.ballD - 0.2) notes.push({ ok: false, title: 'The ball can fall out of its socket', text: `The opening (Ø${p.opening}) has to be smaller than the ball (Ø${p.ballD}): about 0.5 mm is usual.` });
        if (p.opening < d.car.axleD + 0.3) notes.push({ ok: false, title: 'The opening is too small for the axle', text: `The axle (Ø${d.car.axleD}) needs room to tilt with the ball: make the opening at least Ø${(d.car.axleD + 0.3).toFixed(2)}.` });
      } else if (p.shoulder && !p.tube) {
        // A shoulder: the seat goes in from the wheel side only as deep as the bearing, and a smaller hole
        // goes on through, so a bearing without a flange cannot slide in towards the motor.
        const wide = bearingOf(d, p.bearing)?.width ?? p.thick - 0.6, deep = Math.min(wide, p.thick - 0.6), stop = Math.max(between / 2 + 0.6, sr - 0.5);
        for (const s of [1, -1]) cut.push(cylY(wb, zc, s > 0 ? yo - deep : -yo - 1, s > 0 ? yo + 1 : -yo + deep, sr));
        cut.push(cylY(wb, zc, -yo - 1, yo + 1, stop));
        if (p.thick - wide < 0.6 - 1e-9) notes.push({ ok: false, title: 'No room for a shoulder', text: 'The bearing is as wide as the upright, so there is nothing left behind it to stop it. Thicken the uprights, or turn the shoulder off.' });
      } else cut.push(cylY(wb, zc, -yo - 1, yo + 1, sr));
      // An eccentric bushing: a small groove up the wheel side of each upright, above the seat, to set its mark against.
      if (!ball && p.ecc > 0 && p.eccMark)
        for (const s of [1, -1]) cut.push(box(wb - 0.25, s > 0 ? yo - 0.3 : -yo - 1, zc + sr + 0.3, wb + 0.25, s > 0 ? yo + 1 : -yo + 0.3, zt + 1));
      if (flanged(p)) {
        // A flanged bearing: its flange rests against the wheel side or the motor side of each upright,
        // in a recess as deep as the flange, or standing out of the face.
        const fr = holeR(p.flangeD, bfix), t = p.flangeT;
        for (const at of flangeSides(p)) {
          const inSide = at === 'in';
          for (const s of [1, -1]) {
            if (p.flangeRecess) {
              const [a, b] = inSide ? [yi - 0.01, yi + t] : [yo - t, yo + 1];
              cut.push(cylY(wb, zc, Math.min(s * a, s * b), Math.max(s * a, s * b), fr));
            } else if (inSide && K(rect(wb - fr, s > 0 ? yi - t : -yi, wb + fr, s > 0 ? yi : -yi + t).intersect(motorWin)).area() > 0.05)
              notes.push({ ok: false, title: 'The flange touches the motor', text: 'The flange stands out of the upright towards the motor. Sink it into the upright, put it on the wheel side, or move the motor.' });
          }
        }
        // Two flanges hold the upright between them: it must not be thicker than the bearing between its flanges.
        const between2 = bearingOf(d, p.bearing)?.width;
        if (p.flangeAt === 'both' && !p.flangeRecess && between2 && p.thick > between2 + 0.05)
          notes.push({ ok: false, title: 'The upright is thicker than the gap between the flanges', text: `This bearing holds an upright of ${between2} mm between its flanges; the uprights are ${p.thick} mm. Make them ${between2} mm, or use a snap-in holder.` });
        if (p.flangeD < p.seat + 0.4) notes.push({ ok: false, title: 'The flange is no bigger than the seat', text: `A flange of Ø${p.flangeD} cannot rest against the upright round a seat of Ø${p.seat}: it would slip through. Measure the flange, or turn the flange off.` });
        if (p.flangeRecess && p.thick - t < 1) notes.push({ ok: false, title: 'The upright is too thin for the flange recess', text: `With a ${t} mm recess, ${(p.thick - t).toFixed(1)} mm of the upright is left to hold the seat: at least 1 mm is needed. Thicken the uprights, or let the flange stand out of the face.` });
        if (zc - p.flangeD / 2 < z0 + base.thickness) notes.push({ ok: false, title: 'The flange reaches into the pod floor', text: 'The axle sits too low for a flange this big. Raise the axle in the pod (Pod › Base plate), or use a smaller flange.' });
      }
      // Room for the axle, or the axle tube, between the seats. A tube with ball ends runs into the sockets.
      const inner = p.tube && ball ? yc : yi - 0.01;
      cut.push(cylY(wb, zc, -inner, inner, between / 2 + 0.6));
      if (!ball && p.holder === 'snap') cut.push(box(wb - sr * 0.84, -yo - 1, zc, wb + sr * 0.84, yo + 1, zt + 1));
      if (!ball && p.holder === 'clamp') cut.push(box(wb - 0.4, -yo - 1, zc, wb + 0.4, yo + 1, zt + 1));
      if (wb + hw > lay.x1 + 0.01) notes.push({ ok: false, title: 'Uprights overhang the pod', text: 'The bearing holders reach past the pod base. Move the rear screws back or thin the wall.' });
    }

    // A pod that floats needs room to move in its opening as well as on its screws.
    if (on(lugs) && (lugs.params.float || 0) > 0.01 && !onTop) {
      const gap = find(d.chassis, 'podOpening')?.params.gap ?? 0;
      if (gap < lugs.params.float / 2 - 1e-6) notes.push({ ok: false, title: 'The pod cannot float in its opening', text: `With ${lugs.params.float} mm of float the pod needs at least ${(lugs.params.float / 2).toFixed(2)} mm of gap round it; the pod opening leaves ${gap} mm.` });
    }
    if (on(lugs)) {
      // The lugs lie on top of the chassis: a plate's thickness above the floor of a pod in its opening, level with the floor of one on top.
      const p = lugs.params, za = z0 + (onTop ? 0 : plateT), zb = za + p.lugT;
      for (const [x, y] of lay.points) {
        const inward = x < (lay.x0 + lay.x1) / 2 ? 1 : -1, end = inward > 0 ? lay.x0 : lay.x1;
        const a = Math.min(x, end + inward * 4), b = Math.max(x, end + inward * 4);
        add.push(cylZ(x, y, za, zb, p.lugD / 2));
        add.push(box(a, y - p.lugD / 2, za, b, y + p.lugD / 2, zb));
        add.push(box(Math.min(end, end + inward * 4), y - p.lugD / 2, z0, Math.max(end, end + inward * 4), y + p.lugD / 2, zb));
        cut.push(cylZ(x, y, z0 - 1, zb + 1, holeR(p.hole + Math.max(0, p.float || 0), fix)));
        top2.push(disc(x, y, p.lugD / 2), rect(a, y - p.lugD / 2, b, y + p.lugD / 2));
      }
    }

    if (add.length) solid = K(solid.add(u3(add)));
    if (gearSlot) cut.push(gearSlot);
    // Keep the motor's own space free of pod material.
    cut.push(turn(box(-m.length / 2 - clear, -m.width / 2 - clear, h.motorBottom - clear, m.length / 2 + clear, m.width / 2 + clear, h.motorBottom + m.height + 20)));
    solid = K(solid.subtract(u3(cut)));
    // Nothing of the pod hangs below its underside.
    solid = K(solid.intersect(box(-BIG, -BIG, z0, BIG, BIG, BIG)));

    let pieces;
    [solid, pieces] = tidy(solid);
    if (pieces > 1) notes.push({ ok: false, title: `The pod is in ${pieces} separate pieces`, text: 'Part of the pod is not joined to the rest. Widen the base or move the motor.' });

    const bearing = bearingOf(d, upP?.bearing);
    if (on(up) && upP.form !== 'sphere' && bearing && Math.abs(bearing.seat - seatD) > 0.011)
      notes.push({ ok: false, title: 'Seat differs from the bearing', text: `The ${bearing.name.split(' · ')[0].toLowerCase()} asks for Ø${bearing.seat}; the seat is Ø${seatD}.` });

    // The pod must stay clear of the rear tyres too (a motor lying across the car reaches furthest).
    const footprint = u2([...top2, podBase(lay)]), rear = d.car.rear;
    const tyres = u2([1, -1].map((s) => rect(wb - rear.tyreD / 2, tyresAt + s * rear.inOut - rear.tyreW / 2, wb + rear.tyreD / 2, tyresAt + s * rear.inOut + rear.tyreW / 2)));
    if (K(footprint.intersect(tyres)).area() > 0.05)
      notes.push({ ok: false, title: 'A rear tyre touches the pod', text: 'Move the rear wheels out, use narrower tyres, or narrow the pod.' });

    return { solid, top: polysOf(footprint), window: polysOf(motorWin) };
  }

  // ------------------------------------------------------------ build

  // ------------------------------------------------------------ tracing a body

  // Draws a chassis outline inside a body. It looks at the lowest band of the body (its sills and
  // bumpers), takes how wide that is at every place along the car, pulls the shape in by a gap, and
  // cuts it in at the wheels. Returns the outline's +Y half, from the nose to the tail.
  //   body: { positions, indices } as it sits on the car (X along the car, Y across, Z up)
  //   band: how much of the body's height to look at, from its underside up
  //   gap: how far the chassis stays inside the body
  //   wheels: [{ x, inner, length }] — a tyre's middle, its inner face from the centre line, its diameter
  //   wellSide / wellEnd: the room left beside and ahead of / behind each tyre
  //   plateTop: how high above the track the body must be kept clear of (the top of the plate, and a little)
  //   arches: [{ x, length, inner }] — the body's wheel arches, cleared over their whole length
  function trace({ body, band = 6, gap = 1.5, wheels = [], wellSide = 1, wellEnd = 1.5, plateTop = null, arches = [], extend = null }) {
    bin = [];
    try {
      const p = body.positions, idx = body.indices, STEP = 0.5;
      // The band is measured up from the body's lower edge where you are along the car, not from its lowest
      // point anywhere: a nose or tail that sits higher than the sills is followed all the same, and a
      // bumper that juts out above the lower edge does not count while the edge below it does.
      const reach = Math.max(0.5, band), NEAR = Math.round(5 / STEP), lowest = new Map(), wide = new Map();
      const walk = (visit) => {
        for (let t = 0; t < idx.length; t += 3)
          for (let e = 0; e < 3; e++) {
            const a = idx[t + e] * 3, b = idx[t + ((e + 1) % 3)] * 3;
            const n = Math.min(2000, Math.max(1, Math.ceil(Math.max(Math.abs(p[b] - p[a]) / STEP, Math.abs(p[b + 2] - p[a + 2]) / 0.25))));
            for (let i = 0; i <= n; i++) { const u = i / n; visit(p[a] + (p[b] - p[a]) * u, p[a + 1] + (p[b + 1] - p[a + 1]) * u, p[a + 2] + (p[b + 2] - p[a + 2]) * u); }
          }
      };
      // First where the lower edge is, every half millimetre along the car; then what lies within the band above it.
      walk((x, y, z) => { const k = Math.round(x / STEP); if (!(lowest.get(k) <= z)) lowest.set(k, z); });
      const floorAt = new Map();
      for (const k of lowest.keys()) {
        let low = Infinity;
        for (let j = k - NEAR; j <= k + NEAR; j++) { const z = lowest.get(j); if (z < low) low = z; }
        floorAt.set(k, low);
      }
      // The body's edge is there on both sides of the car. Something on one side only (an exhaust pipe, a
      // filler cap, a tow hook) is not the edge: each side is measured on its own and the lesser one counts.
      const right = new Map(), left = new Map();
      walk((x, y, z) => {
        const k = Math.round(x / STEP);
        if (z > floorAt.get(k) + reach) return;
        if (y >= -0.25 && !(right.get(k) >= y)) right.set(k, Math.max(0, y));
        if (y <= 0.25 && !(left.get(k) >= -y)) left.set(k, Math.max(0, -y));
      });
      for (const [k, v] of right) if (left.has(k)) wide.set(k, Math.min(v, left.get(k)));
      if (wide.size < 4) throw Error('The body has nothing to trace in that band. Look at more of its height.');
      const keys = [...wide.keys()].sort((a, b) => a - b), k0 = keys[0], k1 = keys.at(-1);
      // Where the band is open (a wheel arch), carry the width across from either side.
      const prof = [];
      for (let k = k0, last = k0; k <= k1; k++) {
        if (wide.has(k)) { last = k; prof.push(wide.get(k)); continue; }
        let next = k;
        while (!wide.has(next)) next++;
        prof.push(wide.get(last) + ((wide.get(next) - wide.get(last)) * (k - last)) / (next - last));
      }
      // The widths jitter from one half millimetre to the next where the body's edge is faceted or stepped.
      // Each is replaced by the middle one of itself and its two neighbours either side: that takes the jitter
      // out and leaves straight and sloping edges exactly where they are.
      const calm = prof.map((w, i) => {
        if (i < 2 || i > prof.length - 3) return w;
        return prof.slice(i - 2, i + 3).sort((x, y) => x - y)[2];
      });
      const upper = calm.map((w, i) => [(k0 + i) * STEP, Math.max(w, 0.05)]);
      let shape = poly(upper.concat(upper.slice().reverse().map(([x, y]) => [x, -y])));
      // A body's lower edge is full of small steps (panel lines, vents, the facets of a curved corner).
      // The chassis should follow the body's line, not those: notches and teeth narrower than 2 mm are evened out.
      const even = 1;
      shape = K(K(K(shape.offset(even, 'Round')).offset(-2 * even, 'Round')).offset(even, 'Round'));
      // Under the body: the body stands on the plate, which follows its outer line and reaches out from
      // under it by `extend` (or stays that far inside it, when negative). Inside the body: a gap in from it.
      if (extend !== null) { if (Math.abs(extend) > 0.01) shape = K(shape.offset(extend, 'Round')); }
      else if (gap > 0.01) shape = K(shape.offset(-gap, 'Round'));
      // The body itself, as far up as the plate reaches: its walls have a thickness, and bumpers, sills
      // and whatever else hangs down inside take room too. The outline keeps the gap from all of it.
      if (plateTop !== null && extend === null) {
        const solid = [];
        for (let t = 0; t < idx.length; t += 3) {
          // The part of this triangle at or below that height, seen from above.
          const v = [0, 1, 2].map((e) => { const a = idx[t + e] * 3; return [p[a], p[a + 1], p[a + 2]]; });
          if (v.every((q) => q[2] > plateTop)) continue;
          const part = [];
          for (let e = 0; e < 3; e++) {
            const a = v[e], b = v[(e + 1) % 3];
            if (a[2] <= plateTop) part.push([a[0], a[1]]);
            if ((a[2] <= plateTop) !== (b[2] <= plateTop)) { const k = (plateTop - a[2]) / (b[2] - a[2]); part.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
          }
          let area = 0;
          for (let i = 0; i < part.length; i++) { const a = part[i], b = part[(i + 1) % part.length]; area += a[0] * b[1] - b[0] * a[1]; }
          if (Math.abs(area) < 2e-3) continue; // an upright face: it has no width from above
          solid.push(area > 0 ? part : part.reverse());
        }
        if (solid.length) {
          const taken = K(K(new CrossSection(solid, 'NonZero')).offset(gap, 'Round'));
          shape = K(shape.subtract(taken));
        }
      }
      // In at the wheels: nothing of the chassis beside a tyre, with some room around it.
      const wells = wheels.flatMap((w) => [1, -1].map((s) => {
        const y0 = Math.max(0, w.inner - wellSide);
        return rect(w.x - w.length / 2 - wellEnd, s > 0 ? y0 : -BIG, w.x + w.length / 2 + wellEnd, s > 0 ? BIG : -y0);
      }));
      // A wheel arch is open over its whole length: nothing of the chassis shows in it.
      for (const a of arches)
        for (const s of [1, -1]) {
          const y0 = Math.max(0, a.inner - wellSide);
          wells.push(rect(a.x - a.length / 2 - 0.5, s > 0 ? y0 : -BIG, a.x + a.length / 2 + 0.5, s > 0 ? BIG : -y0));
        }
      if (wells.length) shape = K(shape.subtract(u2(wells)));
      // The same on both sides, whatever the body does on one of them.
      shape = K(shape.intersect(K(shape.mirror([0, 1]))));
      const pieces = shape.decompose().map(K).sort((a, b) => b.area() - a.area());
      if (!pieces.length || pieces[0].area() < 50) throw Error('Nothing is left of the outline. Use a smaller gap, check that the body sits over the wheels, or raise the body: it may have a floor at the height of the chassis.');
      // Its outer line only: a post or boss standing free inside the body is not a hole in the chassis.
      const outer = pieces[0].toPolygons().sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
      pieces[0] = poly(outer);
      // Fewer points, as long as the shape stays within a fraction of a millimetre.
      let half = [];
      for (let tol = 0.15; tol < 3; tol *= 1.6) {
        const ring = K(pieces[0].simplify(tol)).toPolygons().sort((a, b) => b.length - a.length)[0] ?? [];
        half = halfOf(ring);
        if (half.length <= 48) break;
      }
      if (half.length < 3) throw Error('The traced outline came out too small to use.');
      const xs = half.map((q) => q[0]), ys = half.map((q) => q[1]);
      return { points: half, length: Math.max(...xs) - Math.min(...xs), width: 2 * Math.max(...ys) };
    } finally {
      for (const o of bin) try { o.delete(); } catch { /* already freed */ }
      bin = [];
    }
  }
  const ringArea = (ring) => ring.reduce((t, q, i) => t + q[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * q[1], 0) / 2;
  // The +Y half of a closed outline that is the same on both sides: from its nose (lowest X) to its tail.
  function halfOf(ring) {
    if (ring.length < 4) return [];
    const r1 = (v) => Math.round(v * 10) / 10;
    let nose = 0, tail = 0;
    ring.forEach(([x], i) => { if (x < ring[nose][0]) nose = i; if (x > ring[tail][0]) tail = i; });
    const walk = (dir) => { const out = []; for (let i = nose; ; i = (i + dir + ring.length) % ring.length) { out.push(ring[i]); if (i === tail) break; } return out; };
    const sum = (list) => list.reduce((t, q) => t + q[1], 0);
    const a = walk(1), b = walk(-1), side = sum(a) >= sum(b) ? a : b;
    const pts = [[r1(ring[nose][0]), 0]];
    for (const [x, y] of side) {
      const q = [r1(x), Math.max(0, r1(y))], last = pts.at(-1);
      if (q[1] > 0.05 && (Math.abs(q[0] - last[0]) > 0.05 || Math.abs(q[1] - last[1]) > 0.05)) pts.push(q);
    }
    pts.push([r1(ring[tail][0]), 0]);
    return pts;
  }

  // ------------------------------------------------------------ calibration coupon

  // A raised digit, drawn as the strokes of a seven-segment figure. (x, y) is its lower left corner.
  const STROKES = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function digit(n, x, y, z, w = 2.6, hgt = 4.6, s = 0.65, up = 0.5) {
    const m = hgt / 2, seg = {
      a: [0, hgt - s, w, hgt], g: [0, m - s / 2, w, m + s / 2], d: [0, 0, w, s],
      f: [0, m, s, hgt], b: [w - s, m, w, hgt], e: [0, 0, s, m], c: [w - s, 0, w, m],
    };
    return [...(STROKES[n] ?? '')].map((k) => box(x + seg[k][0], y + seg[k][1], z - 0.2, x + seg[k][2], y + seg[k][3], z + up));
  }

  // A small test piece: every upright hole size of the design in a row, six times, each 0.1 mm larger than
  // the one before (columns 0 to 5: +0.0 to +0.5 mm), with the bearing seats behind and the axle slots in front.
  function coupon(design) {
    bin = [];
    try {
      const spec = couponHoles(design), t = spec.thickness, cols = spec.steps.length;
      const widest = Math.max(4, ...spec.rows.map((r) => r.d), spec.seat ? spec.seat.d + 2 * spec.seat.wall - 3 : 0);
      const P = Math.max(7, widest + 4.5), R = Math.max(7, Math.max(3, ...spec.rows.map((r) => r.d)) + 4);
      const left = 6.5, W = left + cols * P + 2, rowsDeep = Math.max(1, spec.rows.length) * R, D = rowsDeep + 7.5;
      const colX = (i) => left + P * (i + 0.5);
      const front = 3, back = spec.seat ? spec.seat.thick : 0;
      const add = [box(0, -front, 0, W, D + back, t)], cut = [];
      // Column numbers along the back, row numbers down the left side.
      spec.steps.forEach((_, i) => add.push(...digit(i, colX(i) - 1.3, rowsDeep + 1.5, t)));
      spec.rows.forEach((row, r) => {
        const y = R * (r + 0.5);
        add.push(...digit(row.n, 1.5, y - 2.3, t));
        spec.steps.forEach((step, i) => cut.push(cylZ(colX(i), y, -1, t + 1, (row.d + step) / 2)));
      });
      // Axle slots in a low wall along the front: open at the top, as on the front axle brackets.
      const ad = spec.axle.d, az = t + 1.5 + ad / 2, aTop = az + ad / 2 + 2.5;
      add.push(box(left, -front, 0, W, 0, aTop));
      spec.steps.forEach((step, i) => {
        const r = (ad + 0.1 + step) / 2;
        cut.push(cylY(colX(i), az, -front - 1, 1, r), box(colX(i) - r, -front - 1, az, colX(i) + r, 1, aTop + 1));
      });
      // Bearing seats in a wall along the back, as thick as the pod's uprights and in the same holder style.
      if (spec.seat) {
        const s = spec.seat, sz = Math.max(s.d, s.flange?.d ?? 0), zc = t + s.wall + (sz + 0.5) / 2, zt = zc + (sz + 0.5) / 2 + s.wall;
        add.push(box(left, D, 0, W, D + back, zt));
        spec.steps.forEach((step, i) => {
          // A spherical socket: the ball and its opening both grow by the step; the slits open towards the front.
          if (s.sphere) return cut.push(...socket(colX(i), D + back / 2, zc, -1, { ballD: s.d, opening: s.opening, slits: s.slits, slitW: s.slitW, wall: s.wall }, back / 2, 0, step));
          const r = (s.d + step) / 2;
          cut.push(cylY(colX(i), zc, D - 1, D + back + 1, r));
          // A flange recess in the front face, growing with the seat.
          if (s.flange) cut.push(cylY(colX(i), zc, D - 1, D + Math.min(s.flange.t, back - 0.6), (s.flange.d + step) / 2));
          if (s.holder === 'snap') cut.push(box(colX(i) - r * 0.84, D - 1, zc, colX(i) + r * 0.84, D + back + 1, zt + 1));
          if (s.holder === 'clamp') cut.push(box(colX(i) - 0.4, D - 1, zc, colX(i) + 0.4, D + back + 1, zt + 1));
        });
      }
      const solid = K(u3(add).subtract(u3(cut)));
      if (solid.status() !== 'NoError' || solid.isEmpty()) throw Error('The calibration coupon could not be built.');
      const b = solid.boundingBox();
      return {
        mesh: meshOf(solid),
        pieces: solid.decompose().map(K).length,
        size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]],
        layout: { cols: spec.steps.map((_, i) => colX(i)), rows: spec.rows.map((_, r) => R * (r + 0.5)), width: W, depth: D + back, front, rowsDeep },
        spec,
      };
    } finally {
      for (const o of bin) try { o.delete(); } catch { /* already freed */ }
      bin = [];
    }
  }

  // A one-piece chassis, as it stands on the car: turned so it runs along x with the front axle at x = 0,
  // its underside as high above the track as the rear tyres and its axle height make it.
  function onePieceOnCar(d) {
    const P = d.onePiece, solid = onePieceSolid({ Manifold, CrossSection, K }, P);
    return K(K(solid.rotate([0, 0, -90])).translate([-P.front.at, 0, rideHeight(P, d.car.rear.tyreD)]));
  }
  function buildOnePiece(design) {
    const solid = onePieceOnCar(design);
    if (solid.status() !== 'NoError' || solid.isEmpty() || !(solid.volume() > 0.5)) throw Error('The chassis came out empty. One of its sizes leaves nothing to build; undo the last change.');
    const notes = onePieceChecks(design.onePiece, { nozzle: design.printer.nozzle, rearTyreD: design.car.rear.tyreD, minClearance: design.rules.minClearance, maxWidth: design.rules.maxWidth });
    const pieces = solid.decompose().map(K).filter((p) => p.volume() > 0.05).length;
    if (pieces > 1) notes.push({ ok: false, title: 'The chassis falls apart', text: `It comes out in ${pieces} pieces: a part no longer touches the rest.` });
    return { chassis: meshOf(solid), pod: null, split: null, top: { chassis: polysOf(K(solid.project())), pod: [], window: [] }, notes, volume: solid.volume() };
  }

  // A pod built into the chassis: the pod's opening closes round it (overlapping it a little), there are no lugs
  // and no screws, and the two are one part. The motor's and the gear's room is cut as for a pod.
  function buildBuiltIn(design) {
    const d = JSON.parse(JSON.stringify(design)), notes = [];
    const opening = find(d.chassis, 'podOpening'), mounts = find(d.chassis, 'podMounts'), lugs = find(d.pod, 'lugs'), split = find(d.chassis, 'split');
    opening.enabled = true;
    opening.params.gap = -0.1;
    mounts.enabled = false;
    lugs.enabled = false;
    if (on(split)) { split.enabled = false; notes.push({ ok: false, title: 'Not split', text: 'A chassis with its motor mount built in is printed in one piece: switch off Shape › Split part, or use a separate pod.', soft: true }); }
    const chassis = buildChassis(d, notes, null), pod = buildPod(d, notes);
    const solid = u3([chassis.solid, pod.solid]);
    if (solid.status() !== 'NoError' || solid.isEmpty() || !(solid.volume() > 0.5)) throw Error('The chassis came out empty. One of its sizes leaves nothing to build; undo the last change.');
    const pieces = solid.decompose().map(K).filter((p) => p.volume() > 0.05).length;
    notes.push(pieces > 1
      ? { ok: false, title: 'The motor mount does not join the chassis', text: `It comes out in ${pieces} pieces. Make the base plate wider, or the fill closed round the mount.` }
      : { ok: true, title: 'Motor mount built in', text: 'The chassis and its motor mount are one part.' });
    return { chassis: meshOf(solid), pod: null, split: null, top: { chassis: chassis.top, pod: pod.top, window: pod.window }, notes, volume: solid.volume() };
  }

  function build(design) {
    bin = [];
    try {
      if (design.onePiece) return buildOnePiece(design);
      if (builtIn(design)) return buildBuiltIn(design);
      const notes = [];
      const chassis = buildChassis(design, notes, podFootprint(design));
      const pod = buildPod(design, notes);
      for (const [name, part] of [['chassis', chassis], ['pod', pod]])
        if (part.solid.status() !== 'NoError' || part.solid.isEmpty() || !(part.solid.volume() > 0.5))
          throw Error(`The ${name} came out empty. One of its sizes leaves nothing to build; undo the last change.`);
      const overlap = K(chassis.solid.intersect(pod.solid)).volume();
      notes.push(overlap > 0.5
        ? { ok: false, title: 'Pod and chassis overlap', text: `${overlap.toFixed(1)} mm³ of the pod sits inside the chassis. Widen the pod opening or its gap.` }
        : { ok: true, title: 'Pod fits its opening', text: 'The pod and the chassis do not overlap.' });
      return {
        chassis: meshOf(chassis.solid),
        pod: meshOf(pod.solid),
        // When the chassis is split for printing: its two parts.
        split: chassis.split ? { front: meshOf(chassis.split.front), rear: meshOf(chassis.split.rear) } : null,
        top: { chassis: chassis.top, pod: pod.top, window: pod.window },
        notes,
      };
    } finally {
      for (const o of bin) try { o.delete(); } catch { /* already freed */ }
      bin = [];
    }
  }

  // ------------------------------------------------------------ body against chassis, in 3D

  // Does the body run into the chassis or the pod anywhere? Both are looked at as a field of heights:
  // for every half millimetre across the car, the lowest and highest point each has there. Where the
  // two spans overlap, they are in each other's way. Works on any mesh, closed or not.
  //   body, parts: { positions, indices }, as they stand on the car
  function bodyClash({ body, parts }) {
    const CELL = 0.5, TOL = 0.15;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of parts) for (let i = 0; i < m.positions.length; i += 3) {
      x0 = Math.min(x0, m.positions[i]); x1 = Math.max(x1, m.positions[i]);
      y0 = Math.min(y0, m.positions[i + 1]); y1 = Math.max(y1, m.positions[i + 1]);
    }
    if (!(x1 > x0)) return { area: 0, depth: 0, at: null };
    const nx = Math.ceil((x1 - x0) / CELL) + 1, ny = Math.ceil((y1 - y0) / CELL) + 1;
    const span = () => ({ lo: new Float32Array(nx * ny).fill(Infinity), hi: new Float32Array(nx * ny).fill(-Infinity) });
    const put = (f, x, y, z) => {
      const i = Math.round((x - x0) / CELL), j = Math.round((y - y0) / CELL);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return;
      const k = j * nx + i;
      if (z < f.lo[k]) f.lo[k] = z;
      if (z > f.hi[k]) f.hi[k] = z;
    };
    // Every triangle is sampled finely enough that no cell under it is missed.
    const fill = (f, m) => {
      const p = m.positions, t = m.indices;
      for (let q = 0; q < t.length; q += 3) {
        const a = t[q] * 3, b = t[q + 1] * 3, c = t[q + 2] * 3;
        if (Math.max(p[a], p[b], p[c]) < x0 - CELL || Math.min(p[a], p[b], p[c]) > x1 + CELL || Math.max(p[a + 1], p[b + 1], p[c + 1]) < y0 - CELL || Math.min(p[a + 1], p[b + 1], p[c + 1]) > y1 + CELL) continue;
        const ab = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]), ac = Math.hypot(p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]);
        const n = Math.min(400, Math.max(1, Math.ceil(Math.max(ab, ac) / (CELL * 0.7))));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n, w = 1 - u - v;
          put(f, w * p[a] + u * p[b] + v * p[c], w * p[a + 1] + u * p[b + 1] + v * p[c + 1], w * p[a + 2] + u * p[b + 2] + v * p[c + 2]);
        }
      }
    };
    const car = span(), shell = span();
    for (const m of parts) fill(car, m);
    fill(shell, body);
    let cells = 0, depth = 0, at = null;
    for (let k = 0; k < nx * ny; k++) {
      if (car.hi[k] === -Infinity || shell.hi[k] === -Infinity) continue;
      const over = Math.min(car.hi[k], shell.hi[k]) - Math.max(car.lo[k], shell.lo[k]);
      if (over <= TOL) continue;
      cells++;
      if (over > depth) { depth = over; at = [x0 + (k % nx) * CELL, y0 + Math.floor(k / nx) * CELL, Math.max(car.lo[k], shell.lo[k])]; }
    }
    return { area: cells * CELL * CELL, depth, at };
  }

  // ---------- wheel inserts
  // One insert as it prints: the back on the bed (z = 0), the face up. The 2D pattern is drawn as seen
  // from the front of the face (y down); in the solid +y is up, so it is turned over on the way in.
  // Ready-made models, unpacked once and kept: { id: Manifold }.
  const models = new Map();
  function modelBase(id) {
    if (!models.has(id)) {
      const packed = MESHES[id];
      if (!packed) throw Error('This ready-made insert is missing from this copy of the app.');
      const pb = base64ToBytes(packed.p), ib = base64ToBytes(packed.i);
      const q = new Int16Array(pb.buffer, pb.byteOffset, pb.byteLength / 2), idx = new Uint16Array(ib.buffer, ib.byteOffset, ib.byteLength / 2);
      models.set(id, analyser.solidOf({ positions: Float32Array.from(q, (v) => v / STEP), indices: Uint32Array.from(idx) }));
    }
    return models.get(id);
  }
  // A ready-made model: the face as drawn, on a back made deeper or shallower, then scaled across to
  // the insert's diameter. Its height is never scaled, so the face keeps its relief.
  function modelSolid(ins) {
    const b = ins.base, m = modelOf(ins), src = modelBase(m.id), { lo, hi } = cutsOf(m);
    const depth = Math.max(b.depth, minDepth(m)), mid = depth - lo - (m.H - hi), k = modelScale(m, b);
    const slab = (z0, z1) => K(src.intersect(K(K(Manifold.cube([4 * m.R0, 4 * m.R0, z1 - z0], true)).translate([0, 0, (z0 + z1) / 2]))));
    const parts = [slab(-1, lo), K(slab(hi, m.H + 1).translate([0, 0, lo + mid - hi]))];
    // The plain back between them: the model's own cross-section, as long as the depth needs (overlapping both a little).
    if (mid > -0.005) parts.push(ext(K(src.slice((lo + hi) / 2)), mid + 0.02, lo - 0.01));
    let solid = K(u3(parts).scale([k, k, 1]));
    if (b.hole > 0) solid = K(solid.subtract(cylZ(0, 0, -1, depth + 2, b.hole / 2)));
    return solid;
  }
  function insertSolid(ins) {
    if (modelOf(ins)) return modelSolid(ins);
    const b = ins.base, R = b.od / 2, back = b.form === 'cup' ? b.skirt : 0, top = back + b.thick;
    const rings = (list) => u2(list.map((r) => poly(r.map(([x, y]) => [x, -y]))));
    let solid = cylZ(0, 0, back, top, R);
    if (b.form === 'cup') solid = u3([solid, K(cylZ(0, 0, 0, back + 0.01, R).subtract(cylZ(0, 0, -1, back + 1, Math.max(0.1, R - b.wall))))]);
    // The face: flush with the outer ring, or sunk `sink` below it inside the ring.
    const sink = Math.min(Math.max(0, b.sink), b.thick - 0.4), face = top - sink;
    if (sink > 0.001) solid = K(solid.subtract(cylZ(0, 0, face, top + 1, Math.max(0.05, R - b.lip))));
    // The dish: a shallow spherical hollow in the face, inside the outer ring.
    const dish = Math.min(b.dish, b.thick - sink - 0.4);
    if (dish > 0.01) {
      const a = Math.max(0.1, R - b.lip), Rs = (a * a + dish * dish) / (2 * dish);
      solid = K(solid.subtract(K(K(Manifold.sphere(Rs, 192)).translate([0, 0, face - dish + Rs]))));
    }
    // The layers, in order: each is cut through, sunk into the face or raised from it, following its shape.
    const H = top + 10;
    for (const L of ins.layers) {
      const sh = layerShape(L, R);
      if (!sh.add.length) continue;
      let area = rings(sh.add);
      if (sh.sub.length) area = K(area.subtract(rings(sh.sub)));
      if (area.area() <= EPS) continue;
      const column = ext(area, H + 2, -1);
      if (L.mode === 'cut') solid = K(solid.subtract(column));
      else if (L.mode === 'recess') {
        // The top `h` of the face: the solid less itself moved down.
        const skin = K(solid.subtract(K(solid.translate([0, 0, -L.h]))));
        solid = K(solid.subtract(K(skin.intersect(column))));
      } else {
        const shell = K(K(solid.translate([0, 0, L.h])).subtract(solid));
        solid = u3([solid, K(shell.intersect(column))]);
      }
    }
    if (b.hole > 0) solid = K(solid.subtract(cylZ(0, 0, -1, H, b.hole / 2)));
    return solid;
  }
  // Faces down: turned over and back onto the bed. Only sensible for a flat face.
  const placed = (solid, faceDown) => {
    if (!faceDown) return solid;
    const t = K(solid.rotate([180, 0, 0]));
    return K(t.translate([0, 0, -t.boundingBox().min[2]]));
  };
  const pieceCount = (solid) => solid.decompose().map(K).filter((p) => p.volume() > 0.05).length;
  // One insert, for the views: its mesh, size and pieces, the notes, and its outline from the front.
  function insert(args) {
    bin = [];
    try {
      const ins = args.insert, solid = insertSolid(ins);
      if (solid.status() !== 'NoError' || solid.isEmpty()) throw Error('The insert could not be built. Check the sizes of its layers.');
      const pieces = pieceCount(solid), bb = solid.boundingBox();
      const notes = insertChecks(ins, { nozzle: args.nozzle, axleD: args.axleD });
      if (pieces > 1) notes.push({ ok: false, title: 'The insert falls apart', text: `The pattern cuts it into ${pieces} loose pieces. Make sure every spoke or bar reaches both the hub and the rim.` });
      return {
        mesh: meshOf(solid), volume: solid.volume(), pieces, notes,
        size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
        top: polysOf(K(solid.project())).map((ring) => ring.map(([x, y]) => [x, -y])),
      };
    } finally {
      for (const o of bin) try { o.delete(); } catch { /* already freed */ }
      bin = [];
    }
  }
  // The set to print: two rear and two front inserts on one plate. A pattern that bends one way is
  // mirrored for the left-hand wheels, so both sides of the car turn the same way.
  function insertSet(design) {
    bin = [];
    try {
      const list = [];
      for (const which of ['rear', 'front']) {
        const ins = insertOf(design, which), solid = insertSolid(ins);
        list.push({ ins, solid }, { ins, solid: mirrored(ins) ? K(solid.mirror([1, 0, 0])) : solid });
      }
      const gap = Math.max(...list.map((p) => p.ins.base.od)) + 4;
      const all = u3(list.map(({ ins, solid }, i) => K(placed(solid, ins.faceDown).translate([(i % 2) * gap, Math.floor(i / 2) * gap, 0]))));
      if (all.status() !== 'NoError' || all.isEmpty()) throw Error('The inserts could not be built.');
      return { mesh: meshOf(all), pieces: pieceCount(all), volume: all.volume() };
    } finally {
      for (const o of bin) try { o.delete(); } catch { /* already freed */ }
      bin = [];
    }
  }
  // A calibration ring: plain discs round the middle size you set, numbered from the smallest.
  // The one that presses in firmly and stays is the size to print.
  function insertRing(args) {
    bin = [];
    try {
      const sizes = ringSizes(args.ring), t = Math.min(1.2, args.insert.base.thick), gap = Math.max(...sizes) + 3;
      const parts = sizes.map((d, i) => {
        const x = i * gap;
        return u3([cylZ(x, 0, 0, t, d / 2), ...digit(i + 1, x - 0.9, -1.6, t, 1.8, 3.2, 0.5, 0.4)]);
      });
      const all = u3(parts);
      return { mesh: meshOf(all), sizes, pieces: sizes.length };
    } finally {
      for (const o of bin) try { o.delete(); } catch { /* already freed */ }
      bin = [];
    }
  }

  // ---------- rear wings
  // Built as it stands on the car: x along the car, y across it, z up from the body's surface under the
  // wing's leading edge. A side-view outline (x, z) is pushed across the car from y0 for `len`.
  const across = (cs, y0, len) => (len <= EPS || cs.area() <= EPS ? none3() : K(K(cs.extrude(len)).transform([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, y0, 0, 1])));
  const side2 = (pts) => poly(pts);
  // The wing in its parts: the wing with its flap, Gurney flap and endplates; and the legs with their pins.
  function wingParts(w) {
    const sd = wingSide(w), half = w.span / 2, T = w.plateT;
    // The wing reaches `tip` into each endplate: just touching when they are one piece, half the plate's
    // thickness into a pocket when the endplates print apart.
    const tip = w.printAs === 'parts' ? T / 2 : 0.01;
    const blade = [across(side2(sd.main.pts), -half - tip, w.span + 2 * tip)];
    if (sd.flap) blade.push(across(side2(sd.flap.pts), -half - tip, w.span + 2 * tip));
    if (sd.gurney) blade.push(across(side2(sd.gurney), -half - tip, w.span + 2 * tip));
    const plates = [1, -1].map((s) => across(side2(sd.plate), s > 0 ? half : -half - T, T));
    const wing = [...blade, ...plates];
    const legs = [], fx = sd.leg.foot[0];
    for (const y of legYs(w)) {
      legs.push(across(side2(sd.leg.outline), y - w.legW / 2, w.legW));
      // Pins down through the body's wall, from inside the leg's foot.
      for (const p of pinsOf(w, sd)) legs.push(cylZ(p.x, y, p.z - p.below, p.z + 0.6, w.pinD / 2));
      // A collar that sits on the body (melted pins), or a flat foot for the glue: 0.4 mm on the surface.
      if ((w.fix === 'melt' && w.collar) || w.fix === 'glue') {
        const h = w.legD / 2 + (w.fix === 'glue' ? 0.6 : 0.5), a = fx - h, b = fx + h;
        legs.push(across(side2([[a, deckZ(w, a)], [b, deckZ(w, b)], [b, deckZ(w, b) + 0.4], [a, deckZ(w, a) + 0.4]]), y - w.legW / 2 - 0.5, w.legW + 1));
      }
    }
    return { sd, wing: u3(wing), blade: u3(blade), plates, legs: u3(legs) };
  }
  const freeBin = () => { for (const o of bin) try { o.delete(); } catch { /* already freed */ } bin = []; };
  // The wing as it stands on the car, for the views: its mesh, weight, pieces, notes and side outline.
  function wing(args) {
    bin = [];
    try {
      const w = args.wing, { wing: top, legs } = wingParts(w), all = u3([top, legs]);
      if (all.status() !== 'NoError' || all.isEmpty()) throw Error('The wing could not be built. Check its sizes.');
      const pieces = pieceCount(all), notes = wingChecks(w, { nozzle: args.nozzle, maxWidth: args.maxWidth });
      if (pieces > 1) notes.push({ ok: false, title: 'The legs do not reach the wing', text: 'Some part stands on its own. Move where the legs hold the wing, or the legs themselves.' });
      const sideView = K(K(all.rotate([90, 0, 0])).project());
      return { mesh: meshOf(all), volume: all.volume(), pieces, notes, side: polysOf(sideView).map((r) => r.map(([x, y]) => [x, y])) };
    } finally { freeBin(); }
  }
  // The wing laid out to print. In one piece it lies upside down, the top of the wing towards the bed.
  // As a kit the legs come apart: they lie on their side, and the wing has sockets they fit into.
  function wingPrint(args) {
    bin = [];
    try {
      const w = args.wing, { wing: top, legs } = wingParts(w);
      const flip = (solid) => { const t = K(solid.rotate([180, 0, 0])); return K(t.translate([0, 0, -t.boundingBox().min[2]])); };
      if (w.printAs === 'one') {
        const one = flip(u3([top, legs]));
        return { mesh: meshOf(one), pieces: pieceCount(one) };
      }
      // Sockets: the legs, 0.1 mm larger all round, cut out of the wing where they meet it.
      const { blade, plates } = wingParts(w), sd = wingSide(w), grown = K(side2(sd.leg.outline).offset(0.1, 'Miter'));
      const sockets = u3(legYs(w).map((y) => across(grown, y - w.legW / 2 - 0.1, w.legW + 0.2)));
      let wingOnly, parts;
      if (w.printAs === 'parts' && w.flat !== 'none') {
        // All apart with a flat side: each element is turned level and laid on its flat side (the Gurney flap
        // goes with the last element), so that it prints flat on the bed.
        const half = w.span / 2, tip = w.plateT / 2;
        const el = (pts) => across(side2(pts), -half - tip, w.span + 2 * tip);
        const gur = sd.gurney ? el(sd.gurney) : null;
        const elems = [[u3([el(sd.main.pts), ...(gur && !sd.flap ? [gur] : [])]), w.angle], ...(sd.flap ? [[u3([el(sd.flap.pts), ...(gur ? [gur] : [])]), w.angle2]] : [])];
        let y = 0;
        parts = elems.map(([solid, angle]) => {
          let s = K(K(solid.subtract(sockets)).rotate([0, angle, 0]));
          if (w.flat === 'top') s = K(s.rotate([180, 0, 0]));
          const b = s.boundingBox(), out = K(s.translate([-b.min[0], y - b.min[1], -b.min[2]]));
          y += b.max[1] - b.min[1] + 3;
          return out;
        });
        wingOnly = u3(parts);
      } else {
        wingOnly = flip(K((w.printAs === 'parts' ? blade : top).subtract(sockets)));
        parts = [wingOnly];
      }
      const bb = wingOnly.boundingBox();
      // All apart: each endplate lies flat, with a pocket the wing's end fits into (0.1 mm larger all round).
      if (w.printAs === 'parts') {
        const ends = [side2(sd.main.pts), ...(sd.flap ? [side2(sd.flap.pts)] : []), ...(sd.gurney ? [side2(sd.gurney)] : [])];
        const pocket = K(u2(ends).offset(0.1, 'Miter')), T = w.plateT, half = w.span / 2;
        plates.forEach((plate, i) => {
          const s = i === 0 ? 1 : -1, cut = across(pocket, s > 0 ? half - 0.1 : -half - T / 2 - 0.05, T / 2 + 0.15);
          // On its outer face: the pocket faces up.
          const lay = K(K(plate.subtract(cut)).rotate([s > 0 ? -90 : 90, 0, 0])), lb = lay.boundingBox();
          parts.push(K(lay.translate([bb.max[0] + 3 - lb.min[0] + i * (lb.max[0] - lb.min[0] + 3), bb.min[1] - lb.min[1], -lb.min[2]])));
        });
      }
      // Each leg on its side, in a row behind the wing.
      legs.decompose().map(K).forEach((leg, i) => {
        const lay = K(leg.rotate([90, 0, 0])), lb = lay.boundingBox();
        parts.push(K(lay.translate([bb.min[0] - lb.min[0] + i * (lb.max[0] - lb.min[0] + 3), bb.max[1] + 3 - lb.min[1], -lb.min[2]])));
      });
      const all = u3(parts);
      return { mesh: meshOf(all), pieces: pieceCount(all) };
    } finally { freeBin(); }
  }
  // A drilling template: a thin strip with a hole for every pin, to lay on the body and drill through,
  // with a notch on the car's centre line at the front edge.
  function wingTemplate(args) {
    bin = [];
    try {
      const w = args.wing, sd = wingSide(w), pins = pinsOf(w, sd), ys = legYs(w), t = 0.8;
      // With no pins (glued), the template marks where each leg's foot goes instead: one small hole each.
      const xs = pins.length ? pins.map((p) => p.x) : [sd.leg.foot[0]], x0 = Math.min(...xs) - 4, x1 = Math.max(...xs) + 4, y0 = Math.min(...ys) - 5, y1 = Math.max(...ys) + 5;
      const cut = [];
      for (const y of ys) for (const x of xs) cut.push(cylZ(x, y, -1, t + 1, pins.length ? (w.pinD + 0.15) / 2 : 0.4));
      const notch = K(K(poly([[0, -0.8], [1.4, 0], [0, 0.8]]).extrude(t + 2)).translate([x0 - 0.01, 0, -1]));
      const strip = K(box(x0, y0, 0, x1, y1, t).subtract(u3([...cut, notch])));
      return { mesh: meshOf(strip), size: [x1 - x0, y1 - y0] };
    } finally { freeBin(); }
  }

  return { inspectClearance: createClearanceInspector(wasm), build, coupon, trace, bodyClash, setMesh, dropMesh, insert, insertSet, insertRing, wing, wingPrint, wingTemplate, analyse: (mesh) => analyser.analyse(mesh) };
}
