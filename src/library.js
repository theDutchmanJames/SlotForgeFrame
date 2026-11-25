// The parts library as the page sees it. In the desktop app it is a SQLite file
// kept by the shell (desktop/library.cjs); in a browser (development) it is kept in the page's own storage.
import { summaryOf } from './library-core.js';

const KEY = 'slotforge-frame.library';

const desktop = () => (typeof window !== 'undefined' && typeof window.slotforgeDesktop?.library === 'function' ? window.slotforgeDesktop.library : null);

async function viaDesktop(action, payload) {
  const res = await desktop()(action, payload);
  if (res?.error) throw Error(res.error);
  return res.value;
}

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function writeLocal(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw Error('The library is full. Delete a part, or use the desktop app, which keeps the library in a file.');
  }
}

export const library = {
  where: () => (desktop() ? 'file' : 'browser'),
  async list() {
    if (desktop()) return viaDesktop('list');
    return readLocal().sort((a, b) => b.updated - a.updated).map(summaryOf);
  },
  async get(id) {
    if (desktop()) return viaDesktop('get', { id });
    return readLocal().find((x) => x.id === id) ?? null;
  },
  async all() {
    if (desktop()) return viaDesktop('all');
    return readLocal();
  },
  async put(item) {
    if (desktop()) return viaDesktop('put', { item });
    const list = readLocal().filter((x) => x.id !== item.id);
    list.push(item);
    writeLocal(list);
    return { id: item.id };
  },
  async remove(id) {
    if (desktop()) return viaDesktop('remove', { id });
    writeLocal(readLocal().filter((x) => x.id !== id));
    return { removed: true };
  },
};
