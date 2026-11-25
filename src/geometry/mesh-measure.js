// Looks at an imported part that already stands the right way up (see stl-read.js › orient):
// is it a closed solid, what is its outline from above, and where are its vertical holes.

export function createAnalyser(wasm) {
  const { Manifold, Mesh } = wasm;

  // A kernel solid from a welded mesh. Throws when the mesh is not a closed solid.
  function solidOf(mesh) {
    const m = new Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices });
    m.merge();
    let solid;
    try {
      solid = new Manifold(m);
    } catch {
      throw Error('This model is not a closed solid, so it cannot be used. Repair it first (SlotForge Anvil and Foundry can).');
    }
    if (solid.isEmpty() || solid.volume() <= 0) {
      solid.delete();
      throw Error('This model is not a closed solid, so it cannot be used. Repair it first (SlotForge Anvil and Foundry can).');
    }
    return solid;
  }

  // Round holes that run straight down: found as round inner loops of horizontal cuts.
  function holesOf(solid, height) {
    const found = [];
    for (const f of [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92]) {
      const cut = solid.slice(height * f);
      for (const ring of cut.toPolygons()) {
        const n = ring.length;
        if (n < 8) continue;
        let area = 0, cx = 0, cy = 0;
        for (let i = 0; i < n; i++) {
          const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % n];
          area += x0 * y1 - x1 * y0;
          cx += x0;
          cy += y0;
        }
        if (area >= 0) continue; // an outer loop, not a hole
        cx /= n;
        cy /= n;
        let r = 0;
        for (const [x, y] of ring) r += Math.hypot(x - cx, y - cy);
        r /= n;
        let dev = 0;
        for (const [x, y] of ring) dev = Math.max(dev, Math.abs(Math.hypot(x - cx, y - cy) - r));
        if (r < 0.4 || r > 6 || dev > Math.max(0.06, r * 0.06)) continue;
        const hit = found.find((h) => Math.hypot(h.x - cx, h.y - cy) < 0.3 && Math.abs(h.d - 2 * r) < 0.3);
        if (hit) hit.seen++;
        else found.push({ x: cx, y: cy, d: 2 * r, seen: 1 });
      }
      cut.delete();
    }
    return found.map((h) => ({ x: round(h.x), y: round(h.y), d: round(h.d) })).sort((a, b) => a.x - b.x || a.y - b.y);
  }
  const round = (v) => Math.round(v * 100) / 100;
  const polys = (cs) => cs.toPolygons().map((ring) => ring.map((p) => [round(p[0]), round(p[1])]));

  function analyse(mesh) {
    const solid = solidOf(mesh);
    try {
      const b = solid.boundingBox(), height = b.max[2] - b.min[2];
      const shadow = solid.project();
      const out = {
        size: [round(b.max[0] - b.min[0]), round(b.max[1] - b.min[1]), round(height)],
        volume: solid.volume(),
        triangles: mesh.indices.length / 3,
        outline: polys(shadow),
        holes: holesOf(solid, height),
        // Where the part is tallest: on a pod that is the axle uprights.
        tallestX: tallest(mesh, height),
      };
      shadow.delete();
      return out;
    } finally {
      solid.delete();
    }
  }
  function tallest(mesh, height) {
    let sum = 0, n = 0;
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3)
      if (p[i + 2] > height * 0.93) {
        sum += p[i];
        n++;
      }
    return n ? round(sum / n) : 0;
  }

  return { analyse, solidOf };
}

// The four holes most likely to be a pod's screw points: small holes that form
// the largest rectangle about the centre line.
export function pickMounts(holes) {
  const small = holes.filter((h) => h.d >= 1.2 && h.d <= 3.2);
  let best = null;
  for (const a of small)
    for (const b of small) {
      if (b.x - a.x < 8 || a.y < 2 || b.y < 2) continue; // a: front, +Y; b: rear, +Y
      const am = small.find((h) => Math.abs(h.x - a.x) < 0.6 && Math.abs(h.y + a.y) < 0.6);
      const bm = small.find((h) => Math.abs(h.x - b.x) < 0.6 && Math.abs(h.y + b.y) < 0.6);
      if (!am || !bm) continue;
      const score = (b.x - a.x) * (a.y + b.y);
      if (!best || score > best.score) best = { score, list: [a, am, b, bm] };
    }
  return best ? best.list : small.slice(0, 6);
}
