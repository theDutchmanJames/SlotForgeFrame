// Reads an STL file (binary or text) into a welded mesh, and turns a mesh to stand the right way up.

export const TRIANGLE_LIMIT = 1_000_000;

export function readSTL(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < 15) throw Error('This file is too small to be an STL model.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.length >= 84 ? view.getUint32(80, true) : 0;
  let tris;
  if (bytes.length >= 84 && bytes.length === 84 + count * 50 && count > 0) {
    if (count > TRIANGLE_LIMIT) throw Error(`This model has ${count.toLocaleString('en')} triangles; the limit is ${TRIANGLE_LIMIT.toLocaleString('en')}.`);
    tris = new Float64Array(count * 9);
    for (let t = 0, o = 84; t < count; t++, o += 50)
      for (let k = 0; k < 9; k++) tris[t * 9 + k] = view.getFloat32(o + 12 + k * 4, true);
  } else {
    const text = new TextDecoder('ascii').decode(bytes);
    if (!/^\s*solid\b/i.test(text) || !/\bvertex\b/i.test(text)) throw Error('This is not an STL model.');
    const nums = [];
    const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    for (let m; (m = re.exec(text)); ) {
      nums.push(+m[1], +m[2], +m[3]);
      if (nums.length > TRIANGLE_LIMIT * 9) throw Error(`This model has more than ${TRIANGLE_LIMIT.toLocaleString('en')} triangles.`);
    }
    tris = Float64Array.from(nums.slice(0, nums.length - (nums.length % 9)));
  }
  for (let i = 0; i < tris.length; i++) if (!Number.isFinite(tris[i])) throw Error('This STL holds numbers that are not valid.');
  const mesh = weld(tris);
  if (mesh.indices.length < 12) throw Error('This STL holds no solid shape.');
  return mesh;
}

// Joins corners that share a place, and drops triangles with no area.
export function weld(tris, tol = 1e-4) {
  const ids = new Map(), pos = [], idx = [];
  for (let t = 0; t < tris.length; t += 9) {
    const tri = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const x = tris[t + k * 3], y = tris[t + k * 3 + 1], z = tris[t + k * 3 + 2];
      const key = `${Math.round(x / tol)}_${Math.round(y / tol)}_${Math.round(z / tol)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        ids.set(key, id);
        pos.push(x, y, z);
      }
      tri[k] = id;
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(tri[0], tri[1], tri[2]);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

export function boundsOf({ positions }) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (positions[i + k] < min[k]) min[k] = positions[i + k];
      if (positions[i + k] > max[k]) max[k] = positions[i + k];
    }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

export const UPS = ['+z', '-z', '+y', '-y', '+x', '-x'];
// Rotations that bring the named axis of the file to point up (+Z). Each is a proper rotation.
const UP_MATRIX = {
  '+z': [1, 0, 0, 0, 1, 0, 0, 0, 1],
  '-z': [1, 0, 0, 0, -1, 0, 0, 0, -1],
  '+y': [1, 0, 0, 0, 0, -1, 0, 1, 0],
  '-y': [1, 0, 0, 0, 0, 1, 0, -1, 0],
  '+x': [0, 0, -1, 0, 1, 0, 1, 0, 0],
  '-x': [0, 0, 1, 0, 1, 0, -1, 0, 0],
};

// Stands the model up, turns it about the vertical (0, 90, 180 or 270°), optionally scales it,
// then puts its underside on Z = 0, its middle on Y = 0 and its front end on X = 0.
export function orient(mesh, { up = '+z', turn = 0, scale = 1 } = {}) {
  const m = UP_MATRIX[up] ?? UP_MATRIX['+z'];
  const q = ((Math.round(turn / 90) % 4) + 4) % 4, c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
  const src = mesh.positions, out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    const ux = m[0] * x + m[1] * y + m[2] * z, uy = m[3] * x + m[4] * y + m[5] * z, uz = m[6] * x + m[7] * y + m[8] * z;
    out[i] = (c * ux - s * uy) * scale;
    out[i + 1] = (s * ux + c * uy) * scale;
    out[i + 2] = uz * scale;
  }
  const b = boundsOf({ positions: out });
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= b.min[0];
    out[i + 1] -= (b.min[1] + b.max[1]) / 2;
    out[i + 2] -= b.min[2];
  }
  return { positions: out, indices: mesh.indices };
}

// A first guess at how the file lies: the thinnest direction is up, the flatter face is the underside,
// and the longest direction runs along the car.
export function guessOrientation(mesh) {
  const b = boundsOf(mesh), axis = b.size.indexOf(Math.min(...b.size)), name = 'xyz'[axis];
  // Area of faces lying on the lowest and on the highest plane along that axis.
  let low = 0, high = 0;
  const p = mesh.positions, idx = mesh.indices, eps = Math.max(0.02, b.size[axis] * 0.01);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, bb = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const va = p[a + axis], vb = p[bb + axis], vc = p[c + axis];
    const flatLow = va - b.min[axis] < eps && vb - b.min[axis] < eps && vc - b.min[axis] < eps;
    const flatHigh = b.max[axis] - va < eps && b.max[axis] - vb < eps && b.max[axis] - vc < eps;
    if (!flatLow && !flatHigh) continue;
    const ux = p[bb] - p[a], uy = p[bb + 1] - p[a + 1], uz = p[bb + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    if (flatLow) low += area;
    else high += area;
  }
  const up = (high > low * 1.05 ? '-' : '+') + name;
  const stood = boundsOf(orient(mesh, { up }));
  return { up, turn: stood.size[0] >= stood.size[1] ? 0 : 90 };
}
