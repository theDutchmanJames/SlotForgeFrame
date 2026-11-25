'use strict';
// The parts library: one SQLite file in the user's data folder (library.sqlite),
// as in SlotForge Paddock and Timing. The page checks every item before it is
// stored (src/library-core.js); this file only keeps and returns them.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const SCHEMA = 1;
// Parts, then components (src/components.js).
const KINDS = ['chassis', 'pod', 'motor', 'gear', 'bearing', 'guide', 'printer', 'rules', 'car'];

class Library {
  constructor(folder, fileName = 'library.sqlite') {
    this.file = fileName === ':memory:' ? fileName : path.join(folder, fileName);
    this.db = new DatabaseSync(this.file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        scale TEXT NOT NULL,
        source TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated INTEGER NOT NULL,
        thumb TEXT,
        data TEXT NOT NULL,
        mesh TEXT
      );
      CREATE INDEX IF NOT EXISTS items_kind ON items (kind, updated DESC);`);
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema');
    if (row && Number(row.value) > SCHEMA) throw Error('This library was made by a newer SlotForge Frame.');
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema', String(SCHEMA));
  }

  static row(r, full) {
    const item = {
      id: r.id, kind: r.kind, name: r.name, scale: r.scale, source: r.source, note: r.note, updated: Number(r.updated),
      thumb: r.thumb ? JSON.parse(r.thumb) : null, data: JSON.parse(r.data),
    };
    if (full) item.mesh = r.mesh ? JSON.parse(r.mesh) : null;
    else item.hasMesh = !!r.has_mesh;
    return item;
  }

  list() {
    return this.db
      .prepare('SELECT id, kind, name, scale, source, note, updated, thumb, data, mesh IS NOT NULL AS has_mesh FROM items ORDER BY updated DESC')
      .all()
      .map((r) => Library.row(r, false));
  }
  get(id) {
    const r = this.db.prepare('SELECT * FROM items WHERE id = ?').get(String(id));
    return r ? Library.row(r, true) : null;
  }
  all() {
    return this.db.prepare('SELECT * FROM items ORDER BY updated DESC').all().map((r) => Library.row(r, true));
  }
  put(item) {
    if (!item || typeof item.id !== 'string' || !/^[\w-]{1,64}$/.test(item.id)) throw Error('The part has no valid id.');
    if (!KINDS.includes(item.kind)) throw Error('The part is not a kind this library keeps.');
    this.db
      .prepare(`INSERT OR REPLACE INTO items (id, kind, name, scale, source, note, updated, thumb, data, mesh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(item.id, item.kind, String(item.name).slice(0, 80), item.scale === '1/24' ? '1/24' : '1/32', item.source === 'imported' ? 'imported' : 'made',
        String(item.note ?? '').slice(0, 80), Number(item.updated) || Date.now(), item.thumb ? JSON.stringify(item.thumb) : null, JSON.stringify(item.data ?? {}),
        item.mesh ? JSON.stringify(item.mesh) : null);
    return { id: item.id };
  }
  remove(id) {
    return { removed: this.db.prepare('DELETE FROM items WHERE id = ?').run(String(id)).changes > 0 };
  }
  close() {
    this.db.close();
  }
}

module.exports = { Library };
