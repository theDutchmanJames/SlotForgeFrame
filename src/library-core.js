// Library items and share files. Pure functions, so they run in the page, in the desktop shell and in tests.
//
// An item is a chassis or a pod: either made in SlotForge Frame (its features) or imported from an STL (its mesh).
// A share file (.framelib) carries one or more items between SlotForge Frame users.
// Everything read from a file is treated as untrusted and is checked or rebuilt here.

export const LIB_FORMAT = 'slotforge-frame-library';
export const LIB_VERSION = 1;
import { COMPONENT_KINDS } from './components.js';

export const PART_KINDS = ['chassis', 'pod', 'insert'];
export const KINDS = [...PART_KINDS, ...COMPONENT_KINDS];
const MAX_ITEMS = 500, MAX_VERTS = 3_000_000, MAX_TEXT = 80;

let counter = 0;
export const newItemId = () => `i${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// ------------------------------------------------------------ meshes as text

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(text) {
  const s = atob(text), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const packMesh = (mesh) => ({
  p: bytesToBase64(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength)),
  i: bytesToBase64(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength)),
});
// Unpacks and checks a mesh: whole triangles, finite numbers, every corner pointing at a real point.
export function unpackMesh(packed) {
  if (!packed || typeof packed.p !== 'string' || typeof packed.i !== 'string') throw Error('The part holds no model.');
  let pb, ib;
  try {
    pb = base64ToBytes(packed.p);
    ib = base64ToBytes(packed.i);
  } catch {
    throw Error('The model in this part is damaged.');
  }
  if (pb.length % 12 || ib.length % 12 || !pb.length || !ib.length) throw Error('The model in this part is damaged.');
  if (pb.length / 12 > MAX_VERTS || ib.length / 12 > MAX_VERTS) throw Error('The model in this part is too large.');
  const positions = new Float32Array(pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.byteLength));
  const indices = new Uint32Array(ib.buffer.slice(ib.byteOffset, ib.byteOffset + ib.byteLength));
  const count = positions.length / 3;
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) throw Error('The model in this part is damaged.');
  for (let i = 0; i < indices.length; i++) if (indices[i] >= count) throw Error('The model in this part is damaged.');
  return { positions, indices };
}

// ------------------------------------------------------------ items

const text = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : fallback);

// A thumbnail is a drawing of the part from above: a view box and one SVG path made of straight lines.
export function cleanThumb(t) {
  if (!t || !Array.isArray(t.vb) || t.vb.length !== 4 || !t.vb.every(Number.isFinite) || typeof t.d !== 'string') return null;
  if (t.d.length > 200_000 || !/^[MLZ0-9eE .,\-]*$/.test(t.d)) return null;
  return { vb: t.vb.map(Number), d: t.d };
}
export function thumbOf(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const r2 = (v) => Math.round(v * 100) / 100;
  const d = rings.map((ring) => 'M' + ring.map(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    return `${r2(x)} ${r2(y)}`;
  }).join('L') + 'Z').join('');
  if (!Number.isFinite(minX)) return null;
  return { vb: [r2(minX - 2), r2(minY - 2), r2(maxX - minX + 4), r2(maxY - minY + 4)], d };
}

// Checks one item and returns a clean copy with a fresh id.
// `cleanData(kind, data)` is the design model's own check of the part's settings (model.js › cleanPart).
export function cleanItem(raw, cleanData) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.kind)) throw Error('An entry in this file is not a kind of part this app knows.');
  const part = PART_KINDS.includes(raw.kind);
  const mesh = part && raw.mesh ? packMesh(unpackMesh(raw.mesh)) : null;
  const data = cleanData(raw.kind, raw.data, !!mesh);
  if (data.imported && !mesh) throw Error(`"${text(raw.name, 'A part')}" is an imported part without its model.`);
  return {
    id: newItemId(),
    kind: raw.kind,
    // A component's name lives with its values.
    name: part ? text(raw.name, { pod: 'Pod', chassis: 'Chassis', insert: 'Wheel insert' }[raw.kind]) : data.name,
    scale: raw.scale === '1/24' ? '1/24' : '1/32',
    source: data.imported ? 'imported' : 'made',
    note: text(raw.note, ''),
    updated: Number.isFinite(raw.updated) ? raw.updated : Date.now(),
    thumb: cleanThumb(raw.thumb),
    data,
    mesh,
  };
}

// ------------------------------------------------------------ share files

export function encodeShare(items) {
  return JSON.stringify({
    format: LIB_FORMAT,
    version: LIB_VERSION,
    exported: new Date().toISOString(),
    items: items.map(({ kind, name, scale, source, note, updated, thumb, data, mesh }) => ({ kind, name, scale, source, note, updated, thumb, data, mesh })),
  });
}
export function decodeShare(textIn, cleanData) {
  let file;
  try {
    file = JSON.parse(textIn);
  } catch {
    throw Error('This is not a SlotForge Frame library file.');
  }
  if (file?.format !== LIB_FORMAT || !Array.isArray(file.items)) throw Error('This is not a SlotForge Frame library file.');
  if (file.version > LIB_VERSION) throw Error('This library file was made by a newer SlotForge Frame.');
  if (file.items.length > MAX_ITEMS) throw Error(`This file holds more than ${MAX_ITEMS} parts.`);
  const items = [], skipped = [];
  for (const raw of file.items) {
    try {
      items.push(cleanItem(raw, cleanData));
    } catch (e) {
      skipped.push(e.message);
    }
  }
  if (!items.length) throw Error(skipped[0] ?? 'This library file holds no parts.');
  return { items, skipped };
}

// The row shown in a list: everything but the heavy model.
export const summaryOf = ({ mesh, ...rest }) => ({ ...rest, hasMesh: !!mesh });
