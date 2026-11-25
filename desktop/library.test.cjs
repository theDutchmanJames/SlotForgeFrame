'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Library } = require('./library.cjs');

const item = (over = {}) => ({ id: 'i1', kind: 'pod', name: 'Inline pod', scale: '1/32', source: 'made', note: '', updated: 1000, thumb: { vb: [0, 0, 10, 10], d: 'M0 0L1 1Z' }, data: { features: [] }, mesh: null, ...over });

test('parts are stored, listed newest first, read back whole and removed', () => {
  const lib = new Library('', ':memory:');
  lib.put(item());
  lib.put(item({ id: 'i2', kind: 'chassis', name: 'GT chassis', updated: 2000, source: 'imported', mesh: { p: 'AAAA', i: 'BBBB' } }));
  const list = lib.list();
  assert.deepEqual(list.map((x) => x.id), ['i2', 'i1']);
  assert.equal(list[0].hasMesh, true);
  assert.equal(list[0].mesh, undefined, 'the list leaves the heavy model out');
  assert.deepEqual(lib.get('i2').mesh, { p: 'AAAA', i: 'BBBB' });
  assert.deepEqual(lib.get('i1').thumb, { vb: [0, 0, 10, 10], d: 'M0 0L1 1Z' });
  assert.equal(lib.all().length, 2);
  lib.put(item({ name: 'Renamed', updated: 3000 }));
  assert.equal(lib.get('i1').name, 'Renamed');
  assert.equal(lib.list().length, 2, 'putting the same id again replaces the part');
  assert.equal(lib.remove('i1').removed, true);
  assert.equal(lib.remove('i1').removed, false);
  assert.equal(lib.get('i1'), null);
  lib.close();
});

test('bad parts are refused and odd values are tamed', () => {
  const lib = new Library('', ':memory:');
  assert.throws(() => lib.put(item({ id: "x'; DROP TABLE items; --" })), /valid id/);
  assert.throws(() => lib.put(item({ kind: 'spaceship' })), /not a kind this library keeps/);
  assert.throws(() => lib.put(null), /valid id/);
  lib.put(item({ id: 'ok-1', name: 'n'.repeat(500), scale: 'huge', source: 'stolen' }));
  const back = lib.get('ok-1');
  assert.equal(back.name.length, 80);
  assert.equal(back.scale, '1/32');
  assert.equal(back.source, 'made');
  assert.equal(lib.get("' OR 1=1 --"), null);
  lib.close();
});

test('the library is a file that is still there after reopening', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'slotforge-frame-lib-'));
  try {
    const a = new Library(folder);
    a.put(item());
    a.close();
    assert.ok(fs.existsSync(path.join(folder, 'library.sqlite')));
    const b = new Library(folder);
    assert.equal(b.get('i1').name, 'Inline pod');
    b.close();
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
