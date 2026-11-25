// Binary STL, in millimetres, with a normal per face.
export function encodeSTL({ positions, indices }, header = 'SlotForge Frame') {
  const tris = indices.length / 3;
  const out = new DataView(new ArrayBuffer(84 + tris * 50));
  for (let i = 0; i < Math.min(80, header.length); i++) out.setUint8(i, header.charCodeAt(i) & 0x7f);
  out.setUint32(80, tris, true);
  let o = 84;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [nx, ny, nz]) { out.setFloat32(o, v, true); o += 4; }
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) { out.setFloat32(o, positions[i + k], true); o += 4; }
    o += 2;
  }
  return new Uint8Array(out.buffer);
}

// Lays a part flat for printing: underside on Z = 0, centred on X and Y.
export function layFlat({ positions, indices }) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] - (min[0] + max[0]) / 2;
    out[i + 1] = positions[i + 1] - (min[1] + max[1]) / 2;
    out[i + 2] = positions[i + 2] - min[2];
  }
  return { positions: out, indices };
}
