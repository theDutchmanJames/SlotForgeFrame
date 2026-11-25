// SlotForge Frame: the workspace. Layout and look follow docs/ui-reference/workspace.html.
import './theme.css';
import './style.css';
import './app.css';
import './update-basics.css';
import './update-window.css';
import EngineWorker from './geometry/engine.worker.js?worker&inline';
import { createViewport } from './viewport3d.js';
import { kickAreas } from './geometry/engine.js';
import { encodeSTL, layFlat } from './geometry/stl.js';
import { loadTheme, saveTheme, applyThemeState, toneOf } from './app-theme.js';
import { createDialogs } from './dialogs.js';
import { packMesh, unpackMesh } from './library-core.js';
import { encodeAnvilChassis, placeBody, hullOf, bodyFit, bodyGuess, findArches, archFit, archNote } from './anvil.js';
import { readSTL } from './geometry/stl-read.js';
import {
  newDesign, find, on, round, summary, heights, checks, partsLayout, podLayout, motorOf, gearOf, proposeCross, unconfirmed, uprightSpread, meshCentre, activeKicks, profileOf, pinionOut, motorAngle, gearAngle, traceWheels, traceArches, applyOutline, centreMounts, podShift, podSideways, podRide, rideClearance, balance,
  encodeProject, decodeProject, createHistory, MATERIALS, FEATURE_NAMES, MULTI, newShape, shapesOf, gearsFor, bearingOf, guideOf, choicesFor, moveRear, couponHoles,
} from './model.js';
// ?inline: the pictures are built into the page, which is the only file the desktop app ships.
import iconUrl from './assets/slotforge-frame.svg?inline';
import wordmarkDark from './assets/frame-dark.svg?inline';
import wordmarkLight from './assets/frame-light.svg?inline';
import markDark from './assets/slotforge-dark.svg?inline';
import markLight from './assets/slotforge-light.svg?inline';
// Kept last: the built page must not begin with this file's wrapper function, which the
// single-file build would mistake for Vite's module loader and cut away.
import './update-ui.js';

const VERSION = typeof __FRAME_VERSION__ === 'string' ? __FRAME_VERSION__ : 'dev';
const AUTOSAVE = 'slotforge-frame.current';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ico = (id, cls = '') => `<svg class="ico ${cls}"><use href="#i-${id}"/></svg>`;
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');
const f2 = (v) => (Number.isFinite(v) ? String(round(v, 2)) : '–');
// Lengths are kept in millimetres. With inches chosen, the fields you type in and the main sizes are shown in inches.
const inches = () => state.design.units === 'in';
const inch3 = (v) => (Number.isFinite(v) ? String(round(v / 25.4, 3)) : '–');
const len = (v, f = f1) => (inches() ? inch3(v) : f(v));
const lenUnit = () => (inches() ? 'in' : 'mm');
// A length field that is not built by num(): its value, marked when it is in inches.
const lv = (v) => (inches() ? `data-in="1" value="${inch3(v)}"` : `value="${f2(v)}"`);

// ------------------------------------------------------------ state

const state = {
  design: newDesign('1/32'),
  meshes: {}, // imported parts' models: { key: { positions, indices } }
  menu: 'fill',
  tool: 'fill',
  view: 'top',
  focus: 'both',
  show: { parts: true, track: true, body: true, solid: false },
  tab: 'chassis',
  pop: null,
  built: null,
  busy: false,
  error: null,
  saved: true,
  selPoint: 0,
  sel: {}, // the chosen one of each shaping feature: { rib: id, … }
  coupon: null, // the calibration coupon for this design, once built: { key, data }
  measure: { on: false, a: null, b: null }, // the measuring tool in the top view: two points
  ui: { trace: { mode: 'inside', extend: 0.5, edge: 1.5, gap: 1.5, band: 6, wellSide: 1, wellEnd: 1.5, headroom: 1 } }, // settings of tools that are not part of the design
  tracing: false,
  theme: loadTheme(),
};
const history = createHistory();
let lastSnap = JSON.stringify(state.design);
let viewport = null, dialogs = null;

// Menus and their tools. A tool edits one feature (or one part of the design).
const MENUS = [
  ['car', 'Car', 'car', [['wheels', 'Wheels and axles', 'axle'], ['rules', 'Rules', 'final']]],
  ['outline', 'Outline', 'outline', [['outline', 'Draw', 'pen'], ['trace', 'From body', 'body']]],
  ['shape', 'Shape', 'shape', [['kickup', 'Kick-up', 'kick'], ['kickfront', 'Front kick-up', 'kick'], ['profile', 'Side profile', 'profile'], ['rib', 'Rib / strake', 'rib'], ['wall', 'Edge wall', 'wall'], ['tunnel', 'Tunnel', 'tunnel'], ['panel', 'Upright panel', 'panel'], ['level', 'Level / pocket', 'level'], ['split', 'Split part', 'split']]],
  ['fill', 'Fill', 'fill', [['fill', 'Fill style', 'fill'], ['rail', 'Rail', 'pen'], ['window', 'Window', 'cut'], ['cutout', 'Cut-out', 'pen']]],
  ['features', 'Features', 'feature', [['guide', 'Guide holder', 'guide'], ['frontAxle', 'Front axle', 'axle'], ['bodyMounts', 'Body mounts', 'post'], ['tab', 'Body support', 'wall'], ['podMounts', 'Pod mounts', 'lug'], ['podOpening', 'Pod opening', 'cut'], ['holder', 'Magnet / ballast', 'pocket'], ['wire', 'Wire guide', 'wire'], ['chip', 'Chip mount', 'level']]],
  ['pod', 'Pod', 'pod', [['drivetrain', 'Drivetrain', 'gear'], ['base', 'Base plate', 'level'], ['motorSeat', 'Motor seat', 'motor'], ['uprights', 'Axle uprights', 'bearing'], ['lugs', 'Mount lugs', 'lug']]],
  ['body', 'Body', 'body', [['body', 'Body and Anvil', 'body']]],
  ['print', 'Print', 'print', [['printer', 'Printer', 'print'], ['coupon', 'Calibration coupon', 'coupon']]],
];
const POD_TOOLS = new Set(['drivetrain', 'base', 'motorSeat', 'uprights', 'lugs']);
// The shaping feature being edited: the chosen one, or the first of its kind.
function chosen(type) {
  const list = shapesOf(state.design, type);
  return list.find((f) => f.id === state.sel[type]) ?? list[0] ?? null;
}
const featureOf = (tool) => (MULTI.includes(tool) ? chosen(tool) : find(state.design.chassis, tool) ?? find(state.design.pod, tool) ?? null);
const menuOf = (tool) => MENUS.find((m) => m[3].some((t) => t[0] === tool))?.[0];

// ------------------------------------------------------------ engine

const worker = new EngineWorker();
const pending = new Map();
let callId = 0, engineReady = false;
worker.onmessage = ({ data }) => {
  if (data.ready) { engineReady = true; return; }
  if (data.failed) { state.error = 'The geometry engine could not start: ' + data.failed; renderView(); return; }
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  data.error ? p.reject(Error(data.error)) : p.resolve(data.value);
};
const call = (method, args) => new Promise((resolve, reject) => {
  const id = ++callId;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, method, args });
});

let buildToken = 0, buildTimer = 0;
function rebuild(delay = 60) {
  clearTimeout(buildTimer);
  state.busy = true;
  renderStatus();
  buildTimer = setTimeout(async () => {
    const token = ++buildToken;
    try {
      const value = await call('build', state.design);
      if (token !== buildToken) return;
      // With a body loaded: does it run into the chassis or the pod anywhere, in 3D?
      const shell = bodyPlaced().placed;
      const clash = shell ? await call('bodyClash', { body: { positions: shell.positions, indices: shell.indices }, parts: [value.chassis, value.pod] }).catch(() => null) : null;
      if (token !== buildToken) return;
      state.built = value;
      state.clash = clash;
      state.error = null;
    } catch (e) {
      if (token !== buildToken) return;
      state.error = e.message;
    }
    state.busy = false;
    syncViewport();
    renderView();
    renderPanel();
    renderStatus();
  }, delay);
}

// ------------------------------------------------------------ changes, undo, files

// The project as text: the design, plus the models of any imported parts it uses.
const packed = new Map(); // packed once per imported model, not on every change
function projectText() {
  const meshes = {};
  for (const key of [state.design.chassis.imported?.mesh, state.design.pod.imported?.mesh, state.design.body?.mesh]) {
    if (!key || !state.meshes[key]) continue;
    if (!packed.has(key)) packed.set(key, packMesh(state.meshes[key]));
    meshes[key] = packed.get(key);
  }
  return JSON.stringify({ ...JSON.parse(encodeProject(state.design)), meshes });
}
// Reads a project: checks the design, and hands the models of its imported parts to the engine.
// An imported part whose model is missing or damaged is dropped; `lost` names it.
async function readProject(text) {
  const design = decodeProject(text), lost = [];
  let packed = {};
  try { packed = JSON.parse(text).meshes ?? {}; } catch { /* decodeProject already refused bad text */ }
  for (const part of ['chassis', 'pod']) {
    const imp = design[part].imported;
    if (!imp) continue;
    try {
      await useMesh(imp.mesh, unpackMesh(packed[imp.mesh]));
    } catch {
      delete design[part].imported;
      lost.push(part);
    }
  }
  // The body is only looked at, never built with, so its model stays in the page.
  if (design.body) {
    try {
      state.meshes[design.body.mesh] = unpackMesh(packed[design.body.mesh]);
    } catch {
      delete design.body;
      lost.push('body');
    }
  }
  return { design, lost };
}
async function useMesh(key, mesh) {
  await call('setMesh', { key, positions: mesh.positions, indices: mesh.indices });
  state.meshes[key] = mesh;
}
let autosaveFailed = false;
function autosave() {
  try {
    localStorage.setItem(AUTOSAVE, projectText());
    autosaveFailed = false;
  } catch {
    // Storage is blocked or full (large imported models). Drop the stale copy and say so once.
    try { localStorage.removeItem(AUTOSAVE); } catch { /* nothing more to do */ }
    if (!autosaveFailed) toast('This design is too large to keep between sessions. Save it to a file before you close the app.', true);
    autosaveFailed = true;
  }
}
// Re-drawing replaces the buttons. While the mouse is down (a field just lost focus to a click),
// wait for the click to land first.
let pointerDown = false, renderDue = false;
function renderSoon() {
  if (pointerDown) renderDue = true;
  else render();
}
// Models no design can reach any more are handed back.
function dropUnusedMeshes() {
  const used = new Set([state.design.chassis.imported?.mesh, state.design.pod.imported?.mesh, state.design.body?.mesh].filter(Boolean));
  for (const key of Object.keys(state.meshes))
    if (!used.has(key)) {
      delete state.meshes[key];
      packed.delete(key);
      call('dropMesh', { key }).catch(() => {});
    }
}

function commit() {
  history.push(lastSnap);
  lastSnap = JSON.stringify(state.design);
  state.saved = false;
  autosave();
  renderSoon();
  rebuild();
}
function clampSelection() {
  const pts = find(state.design.chassis, 'outline').params.points;
  state.selPoint = Math.max(0, Math.min(state.selPoint, pts.length - 1));
}
function restore(snap) {
  if (!snap) return;
  state.design = JSON.parse(snap);
  lastSnap = snap;
  state.saved = false;
  clampSelection();
  autosave();
  render();
  rebuild();
}
function replaceDesign(design) {
  state.design = design;
  lastSnap = JSON.stringify(design);
  state.built = null;
  state.saved = true;
  state.selPoint = 0;
  state.sel = {};
  history.clear(); // undo never reaches back into another design
  dropUnusedMeshes();
  autosave();
  render();
  rebuild(0);
}

function download(bytes, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileBase = () => state.design.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'chassis';

function toast(text, bad = false) {
  const el = Object.assign(document.createElement('div'), { className: 'toast' + (bad ? ' bad' : ''), textContent: text });
  $('#toasts').append(el);
  setTimeout(() => el.remove(), bad ? 7000 : 3500);
}

// ------------------------------------------------------------ paths into the design

function resolvePath(path) {
  const keys = path.split('.');
  let node;
  if (keys[0] === 'f') {
    const id = keys[1];
    const feat = [...state.design.chassis.features, ...state.design.pod.features].find((x) => x.id === id);
    node = feat?.params;
    keys.splice(0, 2);
  } else if (keys[0] === 'ui') node = state; // a tool's own settings, kept out of the design
  else node = state.design;
  for (let i = 0; i < keys.length - 1 && node; i++) node = node[keys[i]];
  return [node, keys[keys.length - 1]];
}
const getPath = (path) => {
  const [node, key] = resolvePath(path);
  return node?.[key];
};
function setPath(path, value) {
  const [node, key] = resolvePath(path);
  if (node) node[key] = value;
}

// ------------------------------------------------------------ small HTML pieces

const P = (feat, key) => `f.${feat.id}.${key}`;
function num(label, path, unit = 'mm', o = {}) {
  let v = getPath(path);
  if (o.neg) v = -v;
  if (o.one) v += 1; // shown counting from 1, kept counting from 0
  const inch = inches() && (unit === 'mm' || o.len);
  if (inch) return `<label class="fx">${label}${o.tag ?? ''}<span class="num"><input data-path="${path}" data-in="1" ${o.neg ? 'data-neg="1"' : ''} ${o.max !== undefined ? `data-max="${o.max}"` : ''} ${o.min !== undefined ? `data-min="${o.min}"` : ''} value="${inch3(v)}" inputmode="decimal" spellcheck="false">${unit ? '<small>in</small>' : ''}</span></label>`;
  return `<label class="fx">${label}${o.tag ?? ''}<span class="num"><input data-path="${path}" ${o.neg ? 'data-neg="1"' : ''} ${o.int ? 'data-int="1"' : ''} ${o.one ? 'data-one="1"' : ''} ${o.max !== undefined ? `data-max="${o.max}"` : ''} ${o.min !== undefined ? `data-min="${o.min}"` : ''} value="${f2(v)}" inputmode="decimal" spellcheck="false">${unit ? `<small>${unit}</small>` : ''}</span></label>`;
}
const chk = (label, path) => `<label class="chk"><input type="checkbox" data-path="${path}" ${getPath(path) ? 'checked' : ''}>${label}</label>`;
function sel(label, path, options) {
  const cur = getPath(path);
  return `<label class="f">${label}<select class="num" data-path="${path}">${Object.entries(options).map(([v, t]) => `<option value="${esc(v)}" ${v === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function tiles(path, list, cols = 4) {
  const cur = getPath(path);
  return `<div class="tiles ${cols === 3 ? 't3' : ''}">${list.map(([v, label, svg]) => `<button class="tile ${v === cur ? 'on' : ''}" data-act="tile" data-path="${path}" data-v="${v}"><svg viewBox="0 0 34 24">${svg}</svg>${label}</button>`).join('')}</div>`;
}
const head = (eyebrow, title, text = '') => `<div class="head"><span class="eyebrow">${eyebrow}</span><div class="cond">${title}</div>${text ? `<div class="muted">${text}</div>` : ''}</div>`;
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
const srcTag = (ok) => `<span class="src ${ok ? '' : 'un'}">${ok ? 'published' : 'unconfirmed'}</span>`;
function enable(feat, text) {
  return `<label class="chk"><input type="checkbox" data-act="toggle" data-f="${feat.id}" ${on(feat) ? 'checked' : ''}>${text}</label>`;
}

// ------------------------------------------------------------ the body from Anvil

// The body where it sits on the car, and its outline from above; worked out again only when something moved.
let bodyCache = { key: null, placed: null, hull: [], arches: null };
function bodyPlaced() {
  const b = state.design.body, mesh = b && state.meshes[b.mesh];
  if (!mesh) return (bodyCache = { key: null, placed: null, hull: [], arches: null });
  const key = JSON.stringify([b, state.design.car.wheelbase]);
  if (bodyCache.key !== key) {
    const placed = placeBody(mesh, b, state.design.car.wheelbase);
    bodyCache = { key, placed, hull: hullOf(placed.positions), arches: findArches(placed) };
  }
  return bodyCache;
}
const bodyNotes = () => {
  const { hull, arches } = bodyPlaced();
  if (!hull.length || !state.built) return [];
  const axles = archNote(state.design, arches);
  // A body that stands on the chassis is meant to have the plate under its edge, or beyond it.
  const fit = bodyFit(hull, state.built.top.chassis, state.design).filter((r) => !(state.design.body?.onPlate && /^The chassis (sticks out of|stays inside) the body/.test(r.title)));
  if (state.design.body?.onPlate) fit.unshift({ ok: true, title: 'The body stands on the chassis', text: 'The plate was traced to lie under the body. Its edge may show beside the body, as you set it.' });
  const hit = state.clash, where = hit?.at ? `${f1(Math.abs(hit.at[0]))} mm ${hit.at[0] < 0 ? 'ahead of' : 'behind'} the front axle, ${f1(Math.abs(hit.at[1]))} mm ${Math.abs(hit.at[1]) < 0.3 ? 'from' : hit.at[1] > 0 ? 'right of' : 'left of'} the centre line, ${f1(hit.at[2])} mm above the track` : '';
  const solid = !hit ? [] : hit.area >= 1
    ? [{ ok: false, title: 'The body runs into the chassis', text: `Body and chassis are in each other's way over ${f1(hit.area)} mm², by up to ${f1(hit.depth)} mm. The worst place is ${where}. Lower or switch off what stands there (a kick-up, a post, a wall), pull the outline in, or raise the body.` }]
    : [{ ok: true, title: 'The body clears the chassis', text: 'Checked in 3D: nothing of the chassis or the pod reaches into the body.' }];
  return [...fit, ...solid, ...(axles ? [axles] : [])];
};

// ------------------------------------------------------------ skeleton

function skeleton() {
  $('#app').innerHTML = `
    <header class="pb" id="top"></header>
    <nav class="tools" id="menus"></nav>
    <div class="sub" id="sub"></div>
    <div class="ws">
      <div class="view" id="view">
        <div class="grid"></div>
        <div id="gl" hidden></div>
        <svg class="draw" id="topview"></svg>
        <div class="float views" id="viewbar"></div>
        <div class="float errbar" id="err" hidden></div>
        <div class="float checks" id="lights"></div>
      </div>
      <aside class="side">
        <div class="panel" id="panel"></div>
        <div class="parttabs" id="tabs"></div>
        <div class="stepsbox"><div class="steps" id="steps"></div></div>
      </aside>
    </div>
    <footer class="status" id="status"></footer>`;
  viewport = createViewport($('#gl'));
}

// ------------------------------------------------------------ settings

// Settings (desktop app): Updates, the shared SlotForge update card (update-ui.js).
// The update window itself opens by itself when a newer version is published.
let settingsBox = null;
const updatesHolder = Object.assign(document.createElement('div'), { className: 'st-updates' });
function settingsDialog() {
  if (settingsBox) return settingsBox;
  settingsBox = document.createElement('dialog');
  settingsBox.className = 'update-dialog settings-dialog';
  settingsBox.setAttribute('aria-labelledby', 'settings-title');
  settingsBox.innerHTML = `<div class="dialog-heading"><div><p class="help-crumb">SlotForge Frame</p><h2 id="settings-title">Settings</h2></div>
    <button type="button" class="btn quiet" aria-label="Close">✕</button></div><div class="settings-body"></div>`;
  settingsBox.querySelector('.btn.quiet').onclick = () => settingsBox.close();
  settingsBox.querySelector('.settings-body').append(updatesHolder);
  document.body.append(settingsBox);
  return settingsBox;
}

// ------------------------------------------------------------ top bar, menus

function renderTop() {
  const d = state.design, tone = toneOf(state.theme);
  $('#top').innerHTML = `
    <div class="brand" aria-label="SlotForge Frame">
      <img class="brand-icon" src="${iconUrl}" alt="">
      <span class="brand-copy"><span class="brand-wordmark"><img class="wm-dark" src="${wordmarkDark}" width="446" height="87" alt=""><img class="wm-light" src="${wordmarkLight}" width="446" height="87" alt=""></span><small>BUILT FROM THE GROUND UP</small></span>
    </div>
    <span class="vline"></span>
    <div class="who">
      <span class="eyebrow">${esc(d.scale)} · Chassis + pod</span>
      <input class="name" id="name" value="${esc(d.name)}" aria-label="Design name" spellcheck="false">
      <span class="note">${d.pod.imported ? 'Imported pod: ' + esc(d.pod.imported.name) : esc(layoutName(d)) + ' · ' + esc(motorOf(d).name)}${d.chassis.imported ? ' · imported chassis: ' + esc(d.chassis.imported.name) : ''}</span>
    </div>
    <div class="end">
      <span class="state ${state.saved ? '' : 'busy'}">${state.saved ? ico('check') + 'Saved' : 'Not saved to a file'}</span>
      <span class="pop"><button class="btn ghost" data-act="pop" data-pop="new">${ico('file')}New</button>${state.pop === 'new' ? `<div class="popmenu"><button data-act="new" data-scale="1/32">${ico('car')}1/32 chassis</button><button data-act="new" data-scale="1/24">${ico('car')}1/24 chassis</button></div>` : ''}</span>
      <button class="btn ghost" data-act="open">${ico('open')}Open</button>
      <button class="btn ghost" data-act="save">${ico('save')}Save</button>
      <span class="vline"></span>
      <button class="btn icon" data-act="undo" title="Undo (Ctrl+Z)" ${history.canUndo ? '' : 'disabled'}>${ico('undo')}</button>
      <button class="btn icon" data-act="redo" title="Redo (Ctrl+Y)" ${history.canRedo ? '' : 'disabled'}>${ico('redo')}</button>
      <span class="vline"></span>
      <button class="btn" data-act="tool" data-tool="check">${ico('final')}Final check</button>
      <button class="btn icon ghost" data-act="settings" title="Settings" ${globalThis.slotforgeDesktop?.updateCheck ? '' : 'hidden'}>${ico('settings')}</button>
      <div class="tone-switch" role="group" aria-label="Theme">
        <button data-act="tone" data-tone="light" aria-pressed="${tone === 'light'}">${ico('sun')}<span>Light</span></button>
        <button data-act="tone" data-tone="dark" aria-pressed="${tone === 'dark'}">${ico('moon')}<span>Dark</span></button>
      </div>
      <span class="pop"><button class="btn primary" data-act="pop" data-pop="export">${ico('export')}Export</button>${state.pop === 'export' ? `<div class="popmenu">
        <button data-act="export" data-what="chassis">${ico('outline')}Chassis STL<small>${weight('chassis')}</small></button>
        <button data-act="export" data-what="pod">${ico('pod')}Pod STL<small>${weight('pod')}</small></button>
        <button data-act="export" data-what="both">${ico('export')}Both, as two files</button></div>` : ''}</span>
    </div>`;
}
const layoutName = (d) => ({ inline: 'Inline', sidewinder: 'Sidewinder', anglewinder: 'Anglewinder' })[d.drivetrain.layout];
function weight(part) {
  const v = state.built?.[part]?.volume;
  return v ? `${((v / 1000) * MATERIALS[state.design.printer.material].density).toFixed(1)} g` : '';
}

function renderMenus() {
  $('#menus').innerHTML = MENUS.map(([id, name, icon], i) => `${i === 1 || i === 5 || i === 6 ? '<span class="vline"></span>' : ''}<button class="tbtn ${state.menu === id ? 'on' : ''}" data-act="menu" data-menu="${id}">${ico(icon)}${name}</button>`).join('') +
    `<div class="end"><button class="tbtn" data-act="importstl">${ico('import')}Import STL</button><span class="vline"></span><button class="tbtn" data-act="library" data-kind="pod">${ico('library')}Library</button></div>`;
  const menu = MENUS.find((m) => m[0] === state.menu);
  $('#sub').innerHTML = menu
    ? `<span class="gl">${menu[1]}</span>` + menu[3].map(([id, name, icon]) => `<button class="tbtn ${state.tool === id ? 'on' : ''}" data-act="tool" data-tool="${id}">${ico(icon)}${name}</button>`).join('') +
      (menu[0] === 'pod' ? `<span class="vline"></span><button class="tbtn" data-act="library" data-kind="pod">${ico('library')}Use a library pod</button>` : '') +
      (menu[0] === 'outline' ? `<span class="vline"></span><button class="tbtn" data-act="library" data-kind="chassis">${ico('library')}Use a library chassis</button>` : '')
    : `<span class="gl">Final check</span><span class="hint">What to look at before you print.</span>`;
}

// ------------------------------------------------------------ panels

const PANELS = {
  wheels(d) {
    const h = heights(d);
    return head('Car', 'Wheels and axles', 'The bought parts the chassis is built around. They show as the blue preview.') + `
      <div class="g2">${num('Wheelbase', 'car.wheelbase', 'mm', { min: 30, max: 300 })}${num('Ground clearance', 'car.clearance', 'mm', { min: 0 })}${num('Axle diameter', 'car.axleD', 'mm', { min: 1 })}</div>
      <div class="pair"><div class="ph">${ico('axle')}<b>Front</b></div><div class="g3">${num('Tyre Ø', 'car.front.tyreD', '', { min: 5, len: 1 })}${num('Tyre width', 'car.front.tyreW', '', { min: 1, len: 1 })}${num('Centre to side', 'car.front.inOut', '', { min: 5, len: 1 })}</div></div>
      <div class="pair"><div class="ph">${ico('axle')}<b>Rear</b></div><div class="g3">${num('Tyre Ø', 'car.rear.tyreD', '', { min: 5, len: 1 })}${num('Tyre width', 'car.rear.tyreW', '', { min: 1, len: 1 })}${num('Centre to side', 'car.rear.inOut', '', { min: 5, len: 1 })}</div></div>
      ${kv([['Front axle above underside', f2(h.frontAxle)], ['Rear axle above underside', f2(h.axle)], ['Overall width', f1(summary(d).width)]])}
      <div class="note">Axle heights follow from tyre size and ground clearance: half the tyre diameter, less the clearance.</div>
      <button class="btn sm ghost" data-act="library" data-kind="car">${ico('library')}Car presets in the library</button>`;
  },
  rules(d) {
    return head('Car', 'Rules', 'Limits the Final check compares this design with.') + `
      <div class="g2">${num('Widest allowed', 'rules.maxWidth')}${num('Longest guide lead', 'rules.guideLeadMax')}${num('Least clearance', 'rules.minClearance')}</div>
      <div class="note">The starting values are the ${d.scale} defaults. Type in your own club's limits, or pick a rule set from the library.</div>
      <button class="btn sm ghost" data-act="library" data-kind="rules">${ico('library')}Rule sets in the library</button>`;
  },
  outline(d) {
    const f = find(d.chassis, 'outline'), s = summary(d), pts = f.params.points;
    return head('Outline', 'Draw the outline', 'Top view. You shape one side; the other side mirrors it. Drag the points, or type them in.') + `
      <div class="g2">${num('Plate thickness', P(f, 'thickness'), 'mm', { min: 0.6 })}${num('Corner round', P(f, 'round'), 'mm', { min: 0 })}${num('Bevel, top edge', P(f, 'bevelTop'), 'mm', { min: 0, max: 1.5 })}${num('Bevel, bottom edge', P(f, 'bevelBottom'), 'mm', { min: 0, max: 1.5 })}</div>
      <div class="lst"><div class="hdr pt"><span></span><span>Along, from front axle</span><span>Side, from centre</span><span></span><span></span></div>
      ${pts.map((p, i) => `<div class="li pt ${i === state.selPoint ? 'sel' : ''}"><span class="n">${i + 1}</span>
        <span class="num"><input data-path="${P(f, `points.${i}.0`)}" data-point="${i}" ${lv(p[0])}></span>
        <span class="num"><input data-path="${P(f, `points.${i}.1`)}" data-point="${i}" data-min="0" ${lv(p[1])}></span>
        <button class="iconbtn ${p[2] ? 'on' : ''}" data-act="curvepoint" data-i="${i}" title="${p[2] ? 'Curved: the outline bends past this point. Click for a corner.' : 'A corner. Click to curve the outline past this point.'}" aria-pressed="${p[2] ? 'true' : 'false'}">${ico('round')}</button>
        <button class="iconbtn" data-act="delpoint" data-i="${i}" title="Remove this point" ${pts.length <= 3 ? 'disabled' : ''}>${ico('x')}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="addpoint">${ico('plus')}Add a point after point ${state.selPoint + 1}</button><button class="btn sm ghost" data-act="curveall" data-v="${pts.every((q) => q[2]) ? 0 : 1}">${ico('round')}${pts.every((q) => q[2]) ? 'All corners' : 'Curve all'}</button></div>
      <div class="note">A <b>curved</b> point is not a corner: the outline bends past it, between the middles of the two lines that meet there. Move the point to shape the curve. A curved outline never reaches further than its points.</div>
      ${kv([['Overall length', f1(s.length)], ['Plate width', f1(s.plateWidth)], ['Width limit', f1(d.rules.maxWidth)]])}`;
  },
  trace(d) {
    const b = d.body, placed = bodyPlaced().placed, s = summary(d);
    const intro = head('Outline', 'From body', 'Traces the underside of the body from Anvil: its sides and both bumpers, drawn in at the wheels. The result is an outline you can go on shaping by hand.');
    if (!b || !placed) return intro + `
      <div class="note">Load the body first: export it from Anvil as an STL. It shows as a ghost over the chassis.</div>
      <button class="btn primary" data-act="bodyload">${ico('open')}Load a body STL</button>`;
    return intro + `
      ${kv([['Body', esc(b.name)]])}
      ${sel('The chassis goes', 'ui.trace.mode', { inside: 'Inside the body', under: 'Under the body: the body stands on it' })}
      <div class="g2">${state.ui.trace.mode === 'under' ? num('Reaches out from under the body', 'ui.trace.extend', 'mm', { min: -10, max: 10 }) : num('Gap to the body', 'ui.trace.gap', 'mm', { min: 0, max: 10 })}${state.ui.trace.mode === 'under' ? num('Height of the lower edge to follow', 'ui.trace.edge', 'mm', { min: 0.3, max: 80 }) : num('Height of body to look at', 'ui.trace.band', 'mm', { min: 0.5, max: 80 })}${num('Room beside the tyres', 'ui.trace.wellSide', 'mm', { min: 0, max: 10 })}${num('Room ahead of and behind the tyres', 'ui.trace.wellEnd', 'mm', { min: 0, max: 15 })}${state.ui.trace.mode === 'under' ? '' : num('Keep clear above the plate', 'ui.trace.headroom', 'mm', { min: 0, max: 30 })}</div>
      <button class="btn primary" data-act="tracebody" ${state.tracing ? 'disabled' : ''}>${ico('body')}${state.tracing ? 'Tracing…' : 'Trace the body'}</button>
      ${kv([['Outline now', `${f1(s.length)} × ${f1(s.plateWidth)} mm, ${find(d.chassis, 'outline').params.points.length} points`]])}
      ${state.ui.trace.mode === 'under' ? `<div class="note">The plate follows the body's <b>lower edge</b>, where body and chassis meet, and reaches out from under it by the amount you set: 0 is flush with that edge, a negative amount keeps it that far inside. Only the lowest part of the body counts (the height you set, measured up from its lower edge at each place), so a bumper or wing that juts out higher up is not followed. Tracing also sets the body down on the plate (its underside ${f2(rideClearance(d) + find(d.chassis, 'outline').params.thickness)} mm above the track). The wheel arches are left open.</div>` : ''}
      <div class="note" ${state.ui.trace.mode === 'under' ? 'hidden' : ''}>The outline stays the gap away from the body's <b>inside</b>: its walls, sills and bumpers, as far up as the plate reaches plus what you <b>keep clear above the plate</b>. Raise that when a kick-up or a rib runs into the body. The wheel arches are left open over their whole length.</div>
      <div class="note">The <b>height to look at</b> is measured up from the body's lower edge at each place along the car. Keep it low to follow the sills and bumpers; raise it when the body's lower edge is not level, or to take in the widest part of the sides.</div>
      <div class="note">Tracing replaces the outline you have drawn; <b>Undo</b> brings it back. The guide holder, the kick-up folds and the cross rails move along when they would fall off the new shape. The body must sit right first: see <b>Body › Body and Anvil</b>.</div>
      <div class="row"><button class="btn sm ghost" data-act="tool" data-tool="outline">${ico('pen')}Edit the points</button><button class="btn sm ghost" data-act="tool" data-tool="body">${ico('body')}Place the body</button></div>`;
  },
  kickup(d) { return kickPanel(d, 'kickup'); },
  kickfront(d) { return kickPanel(d, 'kickfront'); },
  profile(d) {
    const f = find(d.chassis, 'profile'), lift = profileOf(d);
    const s2 = summary(d), pts = f.params.points.slice().sort((a, b) => a[0] - b[0]);
    const top = Math.max(1, ...pts.map((q) => q[1])), low = Math.min(0, ...pts.map((q) => q[1]));
    // A small side view of the height line, stretched upward so that a few millimetres show.
    const k = 14 / Math.max(1, top - low), y = (v) => 18 - (v - low) * k;
    const line = [[s2.minX, pts[0]?.[1] ?? 0], ...pts, [s2.maxX, pts.at(-1)?.[1] ?? 0]].map((q) => `${q[0]},${y(q[1])}`).join(' ');
    return head('Shape', 'Side profile', 'The plate follows a height line along the car: a stepped or rising floor. What stands on it stays upright.') + enable(f, 'Use a side profile') + `
      <svg viewBox="${s2.minX - 2} 0 ${s2.maxX - s2.minX + 4} 22" style="width:100%;border:1px solid var(--line);border-radius:9px;background:var(--inset)"><line class="track" x1="${s2.minX}" y1="${y(low) + 2}" x2="${s2.maxX}" y2="${y(low) + 2}"/><polyline class="shp cur" stroke-width="1.2" points="${line}"/>${pts.map((q) => `<circle class="hd" cx="${q[0]}" cy="${y(q[1])}" r="1.2"/>`).join('')}</svg>
      ${pointList(f, 'Along, from front axle', 'Lift above the flat plate')}
      ${lift.points.length ? '' : '<div class="note">Give at least two points, with a lift on one of them. Ahead of the first point and behind the last, the plate keeps the lift it has there.</div>'}
      <div class="note warn"><b>Needs support when printed</b>, or print it as split parts: a plate that rises leaves the print bed.</div>
      <div class="note">The pod stays where it is. Raise the plate only ahead of or behind the pod, unless the pod should sit proud of it.</div>`;
  },
  split(d) {
    const f = find(d.chassis, 'split'), parts = state.built?.split;
    const grams = (m) => (m ? `${((m.volume / 1000) * MATERIALS[d.printer.material].density).toFixed(1)} g` : '–');
    return head('Shape', 'Split part', 'Cuts the chassis across into two print parts that key together with dovetails. Each part can then print in its own best position.') + enable(f, 'Split the chassis for printing') + `
      <div class="g2">${num('Cut, from front axle', P(f, 'along'))}${num('Keys', P(f, 'tabs'), '', { int: 1, min: 1, max: 8 })}${num('Keys spread, each side of centre', P(f, 'spread'), 'mm', { min: 0 })}${num('Key depth', P(f, 'depth'), 'mm', { min: 1 })}
        ${num('Key width at the cut', P(f, 'neck'), 'mm', { min: 1 })}${num('Key width at its head', P(f, 'head'), 'mm', { min: 1 })}${num('Play in the joint', P(f, 'play'), 'mm', { min: 0, max: 1 })}</div>
      ${on(f) ? kv([['Front part', grams(parts?.front)], ['Rear part', grams(parts?.rear)]]) : ''}
      <div class="note">The rear part carries the keys; the front part has the sockets. A frame or lattice gets a closed band at the cut to hold them. <b>Export › Chassis STL</b> then writes two files. Glue the joint.</div>
      <div class="note">Drag the handle in the top view to move the cut. A key wider at its head than at the cut cannot pull out lengthwise.</div>`;
  },
  fill(d) {
    const f = find(d.chassis, 'fill'), p = f.params;
    const frame = p.style === 'frame', lat = p.style === 'lattice';
    return head('Fill', 'Fill style', 'How the plate is filled between its outline and its features.') + tiles(P(f, 'style'), [
      ['closed', 'Closed', '<rect x="3" y="4" width="28" height="16" rx="2" fill="currentColor" stroke="none" opacity=".5"/>'],
      ['frame', 'Frame', '<rect x="3" y="4" width="28" height="16" rx="2"/><path d="M3 12h28M12 4v16M22 4v16"/>'],
      ['lattice', 'Lattice', '<rect x="3" y="4" width="28" height="16" rx="2"/><path d="M5 4l12 16M17 4l12 16M17 4L5 20M29 4L17 20"/>'],
    ], 3) + (frame || lat ? `
      <div class="g2">${num('Rail width', P(f, 'railWidth'), 'mm', { min: 0.4 })}${num('Outer rail', P(f, 'outerRail'), 'mm', { min: 0.4 })}${num('Pad around features', P(f, 'pad'), 'mm', { min: 0 })}${lat ? num('Cell size', P(f, 'latticeCell'), 'mm', { min: 3 }) : ''}</div>` : '') + (frame ? `
      ${chk('Centre rail', P(f, 'spine'))}
      ${chk('Rail under the front axle, between the brackets', P(f, 'axleRail'))}
      ${chk('Rail across the nose, from the guide holder to both sides', P(f, 'guideRail'))}
      ${chk('Closed plate behind the rear wheels', P(f, 'tail'))}
      ${sel('Nose struts, from the guide', P(f, 'struts'), { none: 'None', axle: 'To the front axle brackets', fan: 'To the brackets and the pod opening' })}
      <div class="lst"><div class="hdr" style="grid-template-columns:18px 1fr 26px"><span></span><span>Cross rails: along, from front axle</span><span></span></div>
        ${p.cross.map((x, i) => `<div class="li one"><span class="n">${i + 1}</span><span class="num"><input data-path="${P(f, `cross.${i}`)}" value="${f2(x)}"><small>mm</small></span><button class="iconbtn" data-act="dellist" data-path="${P(f, 'cross')}" data-i="${i}" title="Remove">${ico('x')}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="addcross">${ico('plus')}Cross rail</button><button class="btn sm ghost" data-act="propose">${ico('fill')}Propose again</button></div>
      <div class="lst"><div class="hdr" style="grid-template-columns:18px 1fr 26px"><span></span><span>Length rails: side, from centre (both sides)</span><span></span></div>
        ${p.length.map((y, i) => `<div class="li one"><span class="n">${i + 1}</span><span class="num"><input data-path="${P(f, `length.${i}`)}" data-min="0" value="${f2(y)}"><small>mm</small></span><button class="iconbtn" data-act="dellist" data-path="${P(f, 'length')}" data-i="${i}" title="Remove">${ico('x')}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="addlength">${ico('plus')}Length rail</button></div>
      <div class="note">Drag a cross rail's handle in the top view to slide it. Every mount keeps a solid pad, joined to the rails.</div>` : '') + (p.style === 'closed' ? `<div class="note">A completely filled plate: the stiffest and the simplest to print.</div>` : '') +
      (state.built ? kv([['Chassis weight', weight('chassis') + ' in ' + MATERIALS[d.printer.material].name]]) : '');
  },
  guide(d) {
    const f = find(d.chassis, 'guide'), p = f.params, s = summary(d);
    return head('Features', 'Guide holder', 'Where the guide turns. Every value is yours to set.') + enable(f, 'Use a guide holder') +
      sel('Guide', P(f, 'guide'), choicesFor(d, 'guide')) + `
      <div class="g2">${num('Ahead of the front axle', P(f, 'along'), 'mm', { neg: 1 })}${num('Side, from centre', P(f, 'side'))}
        ${num('Hole', P(f, 'hole'), 'mm', { min: 1, tag: ' ' + srcTag(guideOf(d, p.guide)?.confirmed !== false) })}${num('Boss diameter', P(f, 'bossD'), 'mm', { min: 2 })}
        ${num('Boss height', P(f, 'bossH'), 'mm', { min: 0 })}${num('Pad diameter', P(f, 'padD'), 'mm', { min: 2 })}</div>
      ${kv([['Guide lead', f1(s.guideLead)], ['Limit', f1(d.rules.guideLeadMax)]])}
<button class="btn sm ghost" data-act="library" data-kind="guide">${ico('library')}Guides in the library</button>
      <div class="note">The hole size comes with the guide you pick. It stays marked <b>unconfirmed</b> until someone has measured that guide. Drag the handle in the top view to move the holder.</div>`;
  },
  frontAxle(d) {
    const f = find(d.chassis, 'frontAxle'), h = heights(d);
    return head('Features', 'Front axle bracket', 'Two uprights that carry the front axle.') + enable(f, 'Use front axle brackets') + `
      <div class="g2">${num('Along, from front axle', P(f, 'along'))}${num('Spread, centre to centre', P(f, 'spread'), 'mm', { min: 4 })}${num('Upright length', P(f, 'width'), 'mm', { min: 2 })}${num('Upright thickness', P(f, 'thick'), 'mm', { min: 1 })}${num('Grub screw hole', P(f, 'grub'), 'mm', { min: 0 })}</div>
      ${chk('Open slot, so the axle drops in from above', P(f, 'slot'))}
      <div class="g2">${num('Axle travel, up and down', P(f, 'travel'), 'mm', { min: 0, max: 6 })}</div>
      ${chk('A second grub screw from above (closes the slot)', P(f, 'grubTop'))}
      ${chk('Each front wheel on its own stub axle', P(f, 'independent'))}
      ${f.params.grubTop && f.params.slot ? '<div class="note">With a grub screw from above the uprights are closed at the top: the axle goes in from the side.</div>' : ''}
      ${f.params.independent ? `<div class="note">The uprights are at least 5 mm thick to hold a stub axle. Each stub ends ${f1(f.params.spread / 2 - Math.max(f.params.thick, 5) / 2 - 1)} mm from the centre line.</div>` : ''}
      ${kv([['Axle above underside', f2(h.frontAxle)], ['Axle diameter', f2(d.car.axleD)]])}
      <div class="note">The grub screw hole runs up from underneath to the axle, for setting ride height with an M2 grub screw.</div>`;
  },
  bodyMounts(d) {
    const f = find(d.chassis, 'bodyMounts'), p = f.params;
    return head('Features', 'Body mounts', 'Where the body screws on. A spot off the centre line makes a pair.') + enable(f, 'Use body mounts') + `
      <div class="lst"><div class="hdr"><span></span><span>Along, from front axle</span><span>Side, from centre</span><span></span></div>
      ${p.posts.map((q, i) => `<div class="li"><span class="n">${i + 1}</span><span class="num"><input data-path="${P(f, `posts.${i}.along`)}" value="${f2(q.along)}"></span><span class="num"><input data-path="${P(f, `posts.${i}.side`)}" data-min="0" value="${f2(q.side)}"></span><button class="iconbtn" data-act="dellist" data-path="${P(f, 'posts')}" data-i="${i}" title="Remove">${ico('x')}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="addpost">${ico('plus')}Add a mount</button><button class="btn sm ghost" data-act="centreposts" title="One mount between the guide and the front axle, one behind the rear axle">${ico('post')}Two on the centre line</button></div>
      <div class="g2">${num('Post diameter', P(f, 'padD'), 'mm', { min: 2 })}${num('Post height above plate', P(f, 'height'), 'mm', { min: 0 })}${num('Screw hole', P(f, 'hole'), 'mm', { min: 0.5 })}${num('Head recess', P(f, 'recessD'), 'mm', { min: 0 })}${num('Recess depth', P(f, 'recessDepth'), 'mm', { min: 0 })}</div>
      <div class="note">Drag the handles in the top view to move a mount. These spots are what SlotForge Anvil will build its body posts on.</div>`;
  },
  podMounts(d) {
    const f = find(d.chassis, 'podMounts'), l = find(d.pod, 'lugs').params;
    return head('Features', 'Pod mounts', 'The screw points the pod sits on. Their positions come from the pod.') + enable(f, 'Use pod mounts') + `
      <div class="g2">${num('Screw hole', P(f, 'hole'), 'mm', { min: 0.5 })}${num('Pad diameter', P(f, 'padD'), 'mm', { min: 2 })}</div>
      ${kv([['Pattern', `${f2(l.patternX)} × ${f2(l.patternY)}`], ['Screws', '4']])}
      <div class="note">Change the pattern under <b>Pod › Mount lugs</b>. The hole is a pilot for a 2.2 mm self-tapping screw.</div>`;
  },
  podOpening(d) {
    const f = find(d.chassis, 'podOpening'), lay = podLayout(d);
    return head('Features', 'Pod opening', 'The cut-out the pod drops into. It follows the pod.') + enable(f, 'Cut the pod opening') + `
      <div class="g2">${num('Gap around the pod', P(f, 'gap'), 'mm', { min: 0 })}</div>
      ${kv([['Opening', `${f1(lay.x1 - lay.x0 + 2 * f.params.gap)} × ${f1((lay.widest ?? lay.width) + 2 * f.params.gap)}`]])}
      <div class="note">The gap lets the pod float. More gap gives more movement.</div>`;
  },
  drivetrain(d) {
    const h = heights(d), dt = d.drivetrain, g = gearOf(d);
    const inline = dt.layout === 'inline';
    return head('Pod', 'Drivetrain', 'Sets where the motor and rear axle sit. The pod is built around them.') + `<label class="f">Layout</label>` + tiles('drivetrain.layout', [
      ['inline', 'Inline', '<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M19 12h6M27 3v18"/>'],
      ['sidewinder', 'Sidewinder', '<rect x="8" y="5" width="16" height="8" rx="2"/><path d="M24 9h4M4 19h26"/>'],
      ['anglewinder', 'Anglewinder', '<rect x="7" y="5" width="16" height="8" rx="2" transform="rotate(-22 15 9)"/><path d="M4 20h26"/>'],
    ], 3) + sel(inline ? 'Gear beside the pinion, on the' : 'The motor drives the', 'drivetrain.drives', inline ? { right: 'Right', left: 'Left' } : { right: 'Right rear wheel', left: 'Left rear wheel' }) +
      sel('Motor', 'drivetrain.motor', choicesFor(d, 'motor')) + chk('Motor turned end for end: the shaft comes out of its endbell', 'drivetrain.reverse') +
      sel('Gear set', 'drivetrain.gear', choicesFor(d, 'gear')) + `
      <div class="g2">${num('Offset (axle above shaft)', 'drivetrain.offset')}
        ${inline ? num('Motor face to axle', 'drivetrain.faceGap', 'mm', { min: 2, tag: ' ' + srcTag(false) }) : num(dt.layout === 'sidewinder' ? 'Shaft to axle' : 'Pinion ahead of the axle', 'drivetrain.centre', 'mm', { min: 2, tag: ' ' + srcTag(false) })}
        ${num('Move motor along', 'drivetrain.shiftX')}${num('Move motor sideways', 'drivetrain.shiftY')}
        ${dt.layout === 'anglewinder' ? `<label class="fx">Motor angle to the rear axle<span class="num"><input data-path="drivetrain.angle" data-min="0" data-max="45" value="${f2(motorAngle(d))}" inputmode="decimal" spellcheck="false"><small>°</small></span></label>` : ''}</div>
      ${dt.layout === 'anglewinder' && Math.abs(motorAngle(d) - gearAngle(d)) > 0.5 ? `<div class="note warn">These gears are cut for <b>${gearAngle(d)}°</b>; the motor is set at ${f2(motorAngle(d))}°. <button class="btn sm ghost" data-act="gearangle">Follow the gears</button></div>` : ''}
      ${kv([['Rear axle above underside', f2(h.axle)], ['Motor shaft above underside', f2(h.shaft)], ['Motor above underside', f2(h.motorBottom)], ['Gear ratio', `${(g.gearT / g.pinionT).toFixed(2)} : 1`], ['Pinion Ø + gear Ø', f2(g.pinionD + g.gearD)], ...(inline ? [] : [['These gears ask for', f2(meshCentre(g, dt.layout))]]), ...(dt.layout === 'anglewinder' ? [['Angle the gears are cut for', gearAngle(d) + '°'], ['Pinion on the shaft, from the can', f2(pinionOut(d))]] : [])])}
<div class="row"><button class="btn sm ghost" data-act="library" data-kind="motor">${ico('library')}Motors in the library</button><button class="btn sm ghost" data-act="library" data-kind="gear">${ico('library')}Gear sets</button></div>
      <div class="note warn">${inline ? 'The motor-face distance' : 'The shaft-to-axle distance'} is <b>unconfirmed</b>: no maker publishes it. Measure a real pod if you can, and test-fit before racing.</div>`;
  },
  base(d) {
    const f = find(d.pod, 'base'), lay = podLayout(d);
    return head('Pod', 'Base plate', 'The floor of the pod.') + `
      <div class="g2">${num('Width', P(f, 'width'), 'mm', { min: 8 })}${num('Thickness', P(f, 'thickness'), 'mm', { min: 0.6 })}${num('Move the pod sideways', P(f, 'sideways'), 'mm', { min: -15, max: 15 })}</div>
      ${(() => { const want = podSideways(d); return Math.abs(want - (f.params.sideways || 0)) > 0.05 ? `<div class="note warn">The gear runs free of the rear tyre with the pod moved <b>${f1(Math.abs(want))} mm to the ${want < 0 ? 'left' : 'right'}</b>${want === 0 ? ' (back on the centre line)' : ''}. <button class="btn sm ghost" data-act="podfit">Move it there</button></div>` : ''; })()}
      ${chk('The pod sits on top of the chassis', P(f, 'onTop'))}
      ${f.params.onTop ? `<div class="g2">${num('Rests on the chassis by', P(f, 'rest'), 'mm', { min: 0, max: 10 })}${num('Motor and axle, up or down in the pod', P(f, 'drop'), 'mm', { min: -10, max: 10 })}</div>
      ${kv([['The chassis rides above the track', f2(rideClearance(d))], ['Ground clearance asked for', f2(d.car.clearance)]])}
      ${Math.abs(podRide(d)) > 0.005 ? `<div class="note warn">With the motor and axle at <b>${f2(f.params.drop)} mm</b> the chassis rides ${f2(Math.abs(podRide(d)))} mm ${podRide(d) > 0 ? 'lower' : 'higher'} than the ground clearance you asked for. Set them to <b>${f2(-find(d.chassis, 'outline').params.thickness)} mm</b> (the plate's thickness, downward) to keep it. <button class="btn sm ghost" data-act="podlevel">Do that</button></div>` : ''}
      <div class="note">On top, the pod rests on the chassis rails instead of dropping into its opening, as on the makers' chassis: the rails beside and behind the pod are wider by what it rests on. The motor and the axle then go down through the pod's floor by the plate's thickness, with the motor's screw holes and the bearing seats, so that they sit where they did.</div>` : ''}
      <div class="note">Sideways moves the whole pod with its motor, gear, bearing holders and screws: to the right (+) or the left (−) of the car. Use it when the gear comes too close to the rear tyre.</div>
      ${kv([['Length', f1(lay.x1 - lay.x0)], ['Width used', f1(lay.width)], ...(lay.seatFoot ? [['Widest, at the motor', f1(lay.widest)]] : [])])}
      <div class="note">The base is never narrower than the bearing holders or the motor need. Its length follows the screw pattern.</div>`;
  },
  motorSeat(d) {
    const f = find(d.pod, 'motorSeat'), m = motorOf(d);
    return head('Pod', 'Motor seat', 'Two bulkheads hold the motor by its bosses; the shaft-side one takes the motor screws.') + enable(f, 'Build the motor seat') + `
      <div class="g2">${num('Wall thickness', P(f, 'wall'), 'mm', { min: 0.8 })}${num('Play around the motor', P(f, 'clear'), 'mm', { min: 0 })}</div>
      ${kv([['Motor', m.name], ['Screw spacing', f2(m.pitch)], ['Front boss', 'Ø' + f2(m.bossD)]])}`;
  },
  uprights(d) {
    const f = find(d.pod, 'uprights'), p = f.params, b = bearingOf(d, p.bearing);
    const ball = p.form === 'sphere';
    const spreadRow = p.tube
      ? kv([['Spread, outside (set by the tube)', f2(uprightSpread(d))]])
      : `<div class="g2">${num('Spread, outside', P(f, 'spread'), 'mm', { min: 8 })}</div>${Math.abs(uprightSpread(d) - p.spread) > 0.01 ? kv([['Spread used (the motor lies between the holders)', f2(uprightSpread(d))]]) : ''}`;
    return head('Pod', 'Axle uprights', 'The two holders for the rear axle. Both seats are cut in one pass, so they are always in line.') + enable(f, 'Build the axle uprights') +
      `<label class="f">Seat</label>` + tiles(P(f, 'form'), [
        ['straight', 'Straight', '<path d="M8 21V11a9 9 0 0 1 18 0v10M5 21h24"/><path d="M13 7h8v8h-8z"/>'],
        ['sphere', 'Spherical', '<path d="M8 21V11a9 9 0 0 1 18 0v10M5 21h24"/><circle cx="17" cy="11" r="4.5"/><path d="M14.5 11h5"/>'],
      ], 2) +
      (ball ? `
      <div class="g2">${num('Ball diameter', P(f, 'ballD'), 'mm', { min: 1.5, tag: ' ' + srcTag(false) })}${num('Ball width (flat to flat)', P(f, 'ballW'), 'mm', { min: 0.5, tag: ' ' + srcTag(false) })}${num('Opening in the lip', P(f, 'opening'), 'mm', { min: 0.5 })}${num('Slits in the outer lip', P(f, 'slits'), '', { min: 0, int: true })}${num('Slit width', P(f, 'slitW'), 'mm', { min: 0.2 })}${num('Wall around the ball', P(f, 'wall'), 'mm', { min: 0.8 })}${num('Upright thickness', P(f, 'thick'), 'mm', { min: 1 })}</div>
      <div class="note">A <b>spherical bushing</b> (Slot.it CH14, Sloting Plus SP053025 and the like: a ball with flat sides) snaps into a round socket from the wheel side and tilts with the axle, so the two can never bind. The lip holds the ball: its opening is smaller than the ball, larger than the axle. 3.8 × 2 mm is Sloting Plus's published size; measure your own.</div>`
      : sel('Bearing', P(f, 'bearing'), choicesFor(d, 'bearing')) + `<label class="f">Holder</label>` + tiles(P(f, 'holder'), [
        ['closed', 'Closed', '<path d="M8 21V11a9 9 0 0 1 18 0v10M5 21h24"/><circle cx="17" cy="11" r="4"/>'],
        ['snap', 'Snap-in', '<path d="M8 21V11a9 9 0 0 1 5-8M26 21V11a9 9 0 0 0-5-8M5 21h24"/><path d="M13.5 8a4 4 0 1 0 7 0"/>'],
        ['clamp', 'Clamp', '<path d="M8 21V11a9 9 0 0 1 18 0v10M5 21h24"/><circle cx="17" cy="11" r="4"/><path d="M17 2v5"/>'],
      ], 3) + `
      <div class="g2">${num(p.tube ? 'Seat for the tube ends' : 'Seat diameter', P(f, 'seat'), 'mm', { min: 2, tag: ' ' + srcTag(b?.confirmed !== false && Math.abs((b?.seat ?? 0) - p.seat) < 0.011) })}${num('Wall around seat', P(f, 'wall'), 'mm', { min: 0.8 })}${num('Upright thickness', P(f, 'thick'), 'mm', { min: 1 })}</div>
      <div class="note ${p.holder === 'closed' ? 'ok' : 'warn'}">${p.holder === 'closed' ? '<b>Closed holders</b> are the strongest. Ream to fit and add a drop of glue.' : p.holder === 'snap' ? '<b>Snap-in holders</b> are only advised for PETG or nylon; they tend to crack in PLA.' : '<b>Clamp holders</b> are split at the top so they can be pinched or glued shut.'}</div>`) + `
      ${chk('One axle tube through both uprights', P(f, 'tube'))}
      ${p.tube ? `<div class="g2">${num('Tube length', P(f, 'tubeLen'), 'mm', { min: 8, tag: ' ' + srcTag(false) })}${num('Tube diameter', P(f, 'tubeD'), 'mm', { min: 0.5, tag: ' ' + srcTag(false) })}</div>
      <div class="note">An <b>axle tube</b> (Sloting Plus Combi Plus, or brass tubing) runs through both uprights, so they stand as far apart as the tube is long (end to end). Its diameter is what runs between them. ${ball ? 'Ball ends (Combi Plus Monoblock) sit in the spherical sockets; the length is taken over the balls.' : 'Straight ends (Combi Plus EVO: a Ø4.6–5 mm seat) sit flush with the outside of the uprights; glue them in.'} It cannot be used with an inline motor, whose crown gear sits between the uprights.</div>` : ''}
      ${spreadRow}
      ${chk('Cross brace under the axle', P(f, 'brace'))}${chk('Buttress on the motor side', P(f, 'buttress'))}${chk('Lube hole under each seat', P(f, 'lube'))}
      <div class="note">The printer's fix for sideways holes (${f2(d.printer.boreFix ?? d.printer.holeFix)} mm) is added to the seat when the part is built.</div>
      ${ball ? '' : `<button class="btn sm ghost" data-act="library" data-kind="bearing">${ico('library')}Bearings in the library</button>`}`;
  },
  lugs(d) {
    const f = find(d.pod, 'lugs');
    return head('Pod', 'Mount lugs', 'The four screw points of the pod. The chassis takes its pod mounts from these.') + enable(f, 'Build the lugs') + `
      <div class="g2">${num('Pattern, along', P(f, 'patternX'), 'mm', { min: 10 })}${num('Pattern, across', P(f, 'patternY'), 'mm', { min: 4 })}${num('Rear screws behind the axle', P(f, 'rearBehindAxle'))}${num('Lug diameter', P(f, 'lugD'), 'mm', { min: 2 })}${num('Lug thickness', P(f, 'lugT'), 'mm', { min: 0.8 })}${num('Screw hole', P(f, 'hole'), 'mm', { min: 0.5 })}</div>
      <div class="g2">${num('Float: play on the screws', P(f, 'float'), 'mm', { min: 0, max: 2 })}</div>
      <div class="note">Float makes the pod's screw holes that much larger, so a pod on loosened screws can move. The pod opening's gap must leave half of it all round.</div>
      <div class="note">The default 63.2 × 20 pattern was measured on printed Slot.it-compatible chassis and pods.</div>`;
  },
  rib(d) {
    return multi('rib', 'Shape', 'Ribs and strakes', 'A fin along a line you set, with its own height at each end. On top it stiffens; underneath it is a strake.', (f) => `
      ${pointList(f, 'Along, from front axle', 'Side, from centre')}
      <div class="seg">${segBtn(P(f, 'side'), 'top', 'On top')}${segBtn(P(f, 'side'), 'under', 'Underneath')}</div>
      <div class="g2">${num('Height at the start', P(f, 'h0'), 'mm', { min: 0 })}${num('Height at the end', P(f, 'h1'), 'mm', { min: 0 })}${num('Thickness', P(f, 'width'), 'mm', { min: 0.4 })}${num('Rounded root', P(f, 'root'), 'mm', { min: 0, max: 5 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}
      ${f.params.side === 'under' ? '<div class="note warn">A rib underneath hangs below the plate and takes away ground clearance. Behind a kick-up fold it turns upward with the plate.</div>' : ''}`);
  },
  wall(d) {
    const n = find(d.chassis, 'outline').params.points.length;
    return multi('wall', 'Shape', 'Edge walls', 'A wall standing on part of the outline: flared sides, lips and end plates.', (f) => `
      <div class="g2">${num('From outline point', P(f, 'from'), '', { int: 1, min: 1, max: n, one: 1 })}${num('To outline point', P(f, 'to'), '', { int: 1, min: 1, max: n, one: 1 })}
        ${num('Height', P(f, 'height'), 'mm', { min: 0.4 })}${num('Thickness', P(f, 'thick'), 'mm', { min: 0.4 })}${num('Lean outward', P(f, 'lean'), '°', { min: -45, max: 60 })}${num('Rounded root', P(f, 'root'), 'mm', { min: 0, max: 5 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}
      <div class="note">The outline's points are numbered under <b>Outline › Draw</b>. A wall leaning outward past ${f2(d.printer.overhang)}° needs support when printed.</div>`);
  },
  tunnel() {
    return multi('tunnel', 'Shape', 'Tunnels', 'A hollow box duct along the car, open at both ends.', (f) => `
      <div class="g2">${num('Starts, from front axle', P(f, 'x0'))}${num('Ends, from front axle', P(f, 'x1'))}${num('Side, from centre', P(f, 'side'), 'mm', { min: 0 })}${num('Width', P(f, 'width'), 'mm', { min: 2 })}${num('Height', P(f, 'height'), 'mm', { min: 2 })}${num('Wall', P(f, 'wall'), 'mm', { min: 0.4 })}</div>
      ${chk('Open floor (cut the plate away inside)', P(f, 'openFloor'))}${chk('Mirrored to the other side', P(f, 'mirror'))}
      <div class="note warn">The roof is a bridge of ${f2(Math.max(0, f.params.width - 2 * f.params.wall))} mm. Your printer's longest bridge is set to ${f2(state.design.printer.bridge)} mm.</div>`);
  },
  panel() {
    return multi('panel', 'Shape', 'Upright panels', 'A wall across the car with windows in it: a rear frame or a fence.', (f) => `
      <div class="g2">${num('Along, from front axle', P(f, 'along'))}${num('Width across the car', P(f, 'width'), 'mm', { min: 2 })}${num('Height', P(f, 'height'), 'mm', { min: 1 })}${num('Thickness', P(f, 'thick'), 'mm', { min: 0.4 })}${num('Windows', P(f, 'windows'), '', { int: 1, min: 0, max: 20 })}${num('Bar width', P(f, 'bar'), 'mm', { min: 0.4 })}${num('Lean back', P(f, 'lean'), '°', { min: -45, max: 60 })}</div>
      <div class="note">Print a chassis with a tall panel with supports, or lean the panel to ease the overhang.</div>`);
  },
  level() {
    return multi('level', 'Shape', 'Levels and pockets', 'An area raised above the plate, or sunk into it for a magnet or ballast.', (f) => `
      ${boxFields(f)}
      <div class="g2">${num('Raise (+) or sink (−)', P(f, 'offset'))}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}
      <div class="note">A pocket always leaves 0.4 mm of floor. Only the part that lies on the plate is used.</div>`);
  },
  holder(d) {
    const b = state.built ? balance(d, state.built) : null;
    return multi('holder', 'Features', 'Magnet and ballast holders', 'A walled pocket on the plate for a magnet or a weight.', (f) => `
      <div class="seg">${segBtn(P(f, 'shape'), 'round', 'Round')}${segBtn(P(f, 'shape'), 'bar', 'Bar')}</div>
      <div class="g2">${num('Along, from front axle', P(f, 'along'))}${num('Side, from centre', P(f, 'side'))}
        ${f.params.shape === 'bar' ? num('Length', P(f, 'length'), 'mm', { min: 1 }) + num('Width', P(f, 'width'), 'mm', { min: 1 }) : num('Diameter', P(f, 'd'), 'mm', { min: 1 })}
        ${num('Height of the magnet or weight', P(f, 'deep'), 'mm', { min: 0.2 })}${num('Wall', P(f, 'wall'), 'mm', { min: 0.4 })}${num('Plate left under it (0 = open)', P(f, 'floor'), 'mm', { min: 0, max: 5 })}${num('What goes in it weighs', P(f, 'mass'), 'g', { min: 0, max: 200 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}
      <div class="note">Open underneath, a magnet sits closest to the rails. Give its weight and it counts in the centre of gravity.</div>`) + (b ? `<div class="hr"></div>${balanceRows(d, b)}` : '');
  },
  wire(d) {
    return multi('wire', 'Features', 'Wire guides', 'Two small posts that hold a lead wire between them.', (f) => `
      <div class="g2">${num('Along, from front axle', P(f, 'along'))}${num('Side, from centre', P(f, 'side'))}${num('Gap for the wire', P(f, 'gap'), 'mm', { min: 0.5 })}${num('Height', P(f, 'height'), 'mm', { min: 0.5 })}${num('Length', P(f, 'length'), 'mm', { min: 1 })}${num('Post thickness', P(f, 'wall'), 'mm', { min: 0.4 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}`);
  },
  chip(d) {
    return multi('chip', 'Features', 'Chip mounts', 'A low tray that a digital chip lies in, open at the sides for its wires.', (f) => `
      <div class="g2">${num('Along, from front axle', P(f, 'along'))}${num('Side, from centre', P(f, 'side'))}${num('Chip length', P(f, 'length'), 'mm', { min: 4 })}${num('Chip width', P(f, 'width'), 'mm', { min: 4 })}${num('Wall height', P(f, 'height'), 'mm', { min: 0.5 })}${num('Wall thickness', P(f, 'wall'), 'mm', { min: 0.4 })}${num('Play round the chip', P(f, 'clear'), 'mm', { min: 0 })}</div>
      <div class="note">Type in the size of your own chip; none is built in, because the makers' sizes differ.</div>`);
  },
  tab(d) {
    return multi('tab', 'Features', 'Body supports', 'A tab that reaches out from the edge of the plate for the body to rest on.', (f) => `
      <div class="g2">${num('Along, from front axle', P(f, 'along'))}${num('Length', P(f, 'length'), 'mm', { min: 1 })}${num('Reaches past the edge by', P(f, 'reach'), 'mm', { min: 0, max: 20 })}${num('Block on it, high', P(f, 'rise'), 'mm', { min: 0, max: 30 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}
      <div class="note">The tab follows the edge of the plate where you put it. Keep it clear of the tyres: the tyre check covers it.</div>`);
  },
  cutout(d) {
    return multi('cutout', 'Fill', 'Cut-outs', 'Any closed shape, cut through the plate or sunk into it.', (f) => `
      ${pointList(f, 'Along, from front axle', 'Side, from centre')}
      <div class="g2">${num('Sunk in (0 = right through)', P(f, 'sink'), 'mm', { min: 0, max: 20 })}${num('Corner round', P(f, 'round'), 'mm', { min: 0 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}`);
  },
  rail(d) {
    const style = find(d.chassis, 'fill').params.style;
    return multi('rail', 'Fill', 'Rails', 'A rail along a line you set, added to a frame or lattice.', (f) => `
      ${pointList(f, 'Along, from front axle', 'Side, from centre')}
      <div class="g2">${num('Width', P(f, 'width'), 'mm', { min: 0.4 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}`) + (style === 'closed' ? '<div class="note warn">The fill is <b>closed</b>, so rails make no difference. Choose Frame or Lattice under Fill style.</div>' : '');
  },
  window() {
    return multi('window', 'Fill', 'Windows', 'An opening cut through the plate, whatever the fill.', (f) => `
      ${boxFields(f)}
      <div class="g2">${num('Corner round', P(f, 'round'), 'mm', { min: 0 })}</div>
      ${chk('Mirrored to the other side', P(f, 'mirror'))}`);
  },
  body(d) {
    const b = d.body, mounts = find(d.chassis, 'bodyMounts');
    const fit = bodyNotes(), arches = bodyPlaced().arches, want = arches && archFit(d, arches);
    return head('Body', 'Body and Anvil', 'Chassis and SlotForge Anvil share the body-mount spots: the chassis owns them, Anvil builds the posts on them.') + `
      <div class="pair"><div class="ph">${ico('send')}<b>To Anvil</b></div>
        ${kv([['Body-mount spots', on(mounts) ? mounts.params.posts.length : 0], ['Wheelbase', f1(d.car.wheelbase)], ['Posts end at, above the track', f2(rideClearance(d) + find(d.chassis, 'outline').params.thickness + (on(mounts) ? mounts.params.height : 0))]])}
        <button class="btn primary" data-act="toanvil">${ico('export')}Export for Anvil</button>
        <div class="note">In Anvil, open <b>Chassis › Chassis</b> and load the file. Anvil shows this chassis and pod inside the body and offers <b>Use the chassis's spots</b> under Posts.</div>
        <button class="btn sm ghost" data-act="tool" data-tool="bodyMounts">${ico('post')}Edit the body mounts</button></div>
      <div class="pair"><div class="ph">${ico('import')}<b>From Anvil</b></div>
        ${b ? `${kv([['Body', esc(b.name)]])}
          <div class="g2">${num('Move along the car', 'body.shift')}${num('Underside above the track', 'body.lift', 'mm', { min: 0 })}</div>
          ${sel('Up in the file', 'body.up', { '+z': 'Z up', '-z': 'Z down (lies on its roof)', '+y': 'Y up', '-y': 'Y down', '+x': 'X up', '-x': 'X down' })}
          <div class="row"><button class="btn sm ghost" data-act="bodyquarter">Quarter turn</button><button class="btn sm ghost" data-act="bodyturn">Turn it around</button><button class="btn sm danger" data-act="bodyremove">${ico('trash')}Remove</button></div>
          ${arches ? `${kv([['Front arch, from the front axle', f1(arches[0].x)], ['Rear arch, from the rear axle', f1(arches[1].x - d.car.wheelbase)], ['Arches apart', f1(arches[1].x - arches[0].x)], ['Arch lengths, front and rear', `${f1(arches[0].length)} · ${f1(arches[1].length)}`]])}
          <button class="btn ${Math.abs(want.wheelbase - d.car.wheelbase) > 0.05 || Math.abs(want.shift - b.shift) > 0.05 ? 'primary' : 'ghost'}" data-act="fitarches">${ico('axle')}Fit the axles to the arches</button>
          <div class="note">Sets the wheelbase to ${f1(want.wheelbase)} mm and moves the body, so both axles sit in the middle of their arch. The rear of the chassis moves along with the rear axle.</div>`
            : '<div class="note">No two wheel arches were found on this body. Set the wheelbase under <b>Car</b> and move the body by hand.</div>'}
          ${fit.length ? `<div class="crows">${fit.map((r) => `<div class="crow">${ico(r.ok ? 'check' : 'warn', r.ok ? 'ok' : 'wa')}<b>${esc(r.title)}</b><span>${esc(r.text)}</span></div>`).join('')}</div>` : ''}`
          : `<div class="note">Export the body from Anvil as an STL and load it here. It shows as a ghost over the chassis, so you can see what fits.</div>`}
        <button class="btn ${b ? 'ghost' : ''}" data-act="bodyload">${ico('open')}${b ? 'Load another body' : 'Load a body STL'}</button></div>`;
  },
  printer(d) {
    return head('Print', 'Printer', 'Sizes holes, rails and walls for your printer and material.') +
      sel('Material', 'printer.material', Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, m.name]))) + `
      <div class="g2">${num('Nozzle', 'printer.nozzle', 'mm', { min: 0.1 })}${num('Fix for upright holes', 'printer.holeFix', 'mm', { min: -0.5, max: 1 })}${num('Fix for sideways holes', 'printer.boreFix', 'mm', { min: -0.5, max: 1 })}${num('Minimum wall', 'printer.minWall', 'mm', { min: 0.2 })}</div>
      ${kv([['Chassis', weight('chassis') || '–'], ['Pod', weight('pod') || '–']])}
      ${state.built ? balanceRows(d, balance(d, state.built)) : ''}
<button class="btn sm ghost" data-act="library" data-kind="printer">${ico('library')}Printers in the library</button>
      <div class="note">Small holes print undersize. The fix is added to every hole's diameter: one value for holes that stand upright in the print (screws, guide), one for holes that lie sideways (bearing seats, axle slots). The <b>calibration coupon</b> tells you both.</div>
      <button class="btn sm ghost" data-act="tool" data-tool="coupon">${ico('coupon')}Calibration coupon</button>`;
  },
  coupon(d) {
    const spec = couponHoles(d), key = JSON.stringify(spec);
    // The coupon is built on request, and again when the design's holes change.
    if (state.coupon?.key !== key && state.coupon?.asked !== key) {
      state.coupon = { asked: key };
      call('coupon', d).then((data) => { state.coupon = { key, data }; }, (e) => { state.coupon = { key, error: e.message }; }).then(() => { if (state.tool === 'coupon') renderPanel(); });
    }
    const c = state.coupon?.key === key ? state.coupon : null, lay = c?.data?.layout, t = spec.thickness;
    const fixRow = (path, value) => `<div class="seg">${spec.steps.map((s, i) => `<button class="${Math.abs((value ?? 0) - s) < 0.005 ? 'on' : ''}" data-act="setfix" data-path="${path}" data-v="${s}" title="Add ${s.toFixed(1)} mm">${i}</button>`).join('')}</div>`;
    let picture = `<div class="note">${c?.error ? esc(c.error) : 'Building the coupon…'}</div>`;
    if (lay) {
      const out = [`<rect class="plate fill" x="0" y="${-lay.front}" width="${lay.width}" height="${lay.depth + lay.front}" rx="1"/>`];
      spec.rows.forEach((row, r) => {
        out.push(`<text class="dimt" x="3.2" y="${lay.rows[r] + 1.2}">${row.n}</text>`);
        spec.steps.forEach((s, i) => out.push(`<circle class="hole" cx="${lay.cols[i]}" cy="${lay.rows[r]}" r="${(row.d + s) / 2}"/>`));
      });
      spec.steps.forEach((s, i) => out.push(`<text class="dimt" x="${lay.cols[i]}" y="${lay.rowsDeep + 5}">${i}</text>`, `<rect class="pad" x="${lay.cols[i] - (spec.axle.d + s) / 2}" y="${-lay.front}" width="${spec.axle.d + s}" height="${lay.front}"/>`));
      if (spec.seat) spec.steps.forEach((s, i) => out.push(`<rect class="pad" x="${lay.cols[i] - (spec.seat.d + s) / 2}" y="${lay.depth - spec.seat.thick}" width="${spec.seat.d + s}" height="${spec.seat.thick}"/>`));
      // Drawn as you look down on it, back wall at the top.
      picture = `<svg viewBox="-2 ${-lay.depth - 2} ${lay.width + 4} ${lay.depth + lay.front + 4}" style="width:100%;border:1px solid var(--line);border-radius:9px;background:var(--inset)"><g transform="scale(1,-1)">${out.filter((x) => !x.startsWith('<text')).join('')}</g>${out.filter((x) => x.startsWith('<text')).map((x) => x.replace(/ y="([-\d.]+)"/, (m, y) => ` y="${-y + 2.4}"`)).join('')}</svg>`;
    }
    return head('Print', 'Calibration coupon', 'A small test piece with every hole size this design uses. Print it once per printer and material, try your parts in it, and tell the app what fitted.') + picture + `
      ${c?.data ? kv([['Size', `${f1(c.data.size[0])} × ${f1(c.data.size[1])} × ${f1(c.data.size[2])} mm`], ['Weight', `${((c.data.mesh.volume / 1000) * MATERIALS[d.printer.material].density).toFixed(1)} g`]]) : ''}
      <div class="crows">
        ${spec.rows.map((r) => `<div class="crow"><b class="mono">${r.n}</b><b>${esc(r.name)}</b><span>Ø${f2(r.d)} mm, upright</span></div>`).join('')}
        ${spec.seat ? `<div class="crow"><b class="mono">↑</b><b>Back wall: bearing seat</b><span>Ø${f2(spec.seat.d)} mm, sideways, ${spec.seat.holder === 'closed' ? 'closed holder' : spec.seat.holder === 'snap' ? 'snap-in holder' : 'clamp holder'}</span></div>` : ''}
        <div class="crow"><b class="mono">↓</b><b>Front wall: axle slot</b><span>Ø${f2(spec.axle.d)} mm, sideways</span></div>
      </div>
      <div class="note">Each hole is printed six times. The number above a column is the tenths of a millimetre added: column <b>0</b> is the size as typed, column <b>3</b> is 0.3 mm larger. The plate is as thick as the chassis (${f2(t)} mm).</div>
      <button class="btn primary" data-act="exportcoupon" ${c?.data ? '' : 'disabled'}>${ico('export')}Export the coupon</button>
      <div class="hr"></div>
      <label class="f">Upright holes: the column where screws and the guide fit best</label>${fixRow('printer.holeFix', d.printer.holeFix)}
      <label class="f">Sideways holes: the column that takes the bearing with a firm push</label>${fixRow('printer.boreFix', d.printer.boreFix ?? d.printer.holeFix)}
      ${kv([['Fix for upright holes', f2(d.printer.holeFix) + ' mm'], ['Fix for sideways holes', f2(d.printer.boreFix ?? d.printer.holeFix) + ' mm']])}
      <div class="note">The fixes belong to this design's printer settings. Save them as a printer under <b>Library › Printers</b> to use them in other designs.</div>`;
  },
  check(d) {
    const rows = [...checks(d), ...(state.built?.notes ?? []), ...bodyNotes()];
    const bad = rows.filter((r) => !r.ok && !r.soft).length;
    return `<div class="head"><span class="eyebrow">Final check</span><div class="verdict">${state.error ? 'Cannot be built' : bad ? `${bad} thing${bad > 1 ? 's' : ''} to fix` : 'Ready to print'}</div></div>
      ${state.error ? `<div class="note bad">${esc(state.error)}</div>` : ''}
      <div class="crows">${rows.map((r) => `<div class="crow">${ico(r.ok ? 'check' : 'warn', r.ok ? 'ok' : 'wa')}<b>${esc(r.title)}</b><span>${esc(r.text)}</span></div>`).join('')}</div>
      <div class="kinds"><div class="kind"><b>Chassis</b>${weight('chassis') || '–'} in ${MATERIALS[d.printer.material].name}</div><div class="kind"><b>Pod</b>${weight('pod') || '–'} in ${MATERIALS[d.printer.material].name}</div></div>`;
  },
};

// The panel of a kick-up: the rear one or the front one.
function kickPanel(d, type) {
  const f = find(d.chassis, type), p = f.params, front = type === 'kickfront', s2 = summary(d);
  const reach = front ? p.fold - s2.minX : s2.maxX - p.fold;
  const rise = Math.max(0, reach) * Math.sin((Math.min(80, p.angle) * Math.PI) / 180);
  return head('Shape', front ? 'Front kick-up' : 'Kick-up', front ? 'Tilts what lies ahead of a fold line upward: a raised nose or splitter.' : 'Tilts what lies behind a fold line upward: a raised rear or diffuser.') + enable(f, front ? 'Use a front kick-up' : 'Use a kick-up') + `
    <div class="g2">${num('Fold line, from front axle', P(f, 'fold'))}${num('Angle', P(f, 'angle'), '°', { min: 0, max: 80 })}</div>
    <label class="f">What rises</label>
    <div class="seg">${segBtn(P(f, 'zone'), 'full', 'Full width')}${segBtn(P(f, 'zone'), 'centre', 'Centre only')}${segBtn(P(f, 'zone'), 'sides', 'Sides only')}</div>
    ${p.zone === 'full' ? '' : `<div class="g2">${num('Centre zone, each side of centre', P(f, 'zoneHalf'), 'mm', { min: 0.5 })}</div>`}
    ${kv([[front ? 'Rise at the nose' : 'Rise at the tail', f2(rise)]])}
    ${chk('Strakes underneath, filled to floor level', P(f, 'fillFloor'))}
    <div class="g2">${num('Strakes', P(f, 'strakes'), '', { int: 1, min: 0, max: 40 })}${num('Strake thickness', P(f, 'strakeT'), 'mm', { min: 0.4 })}</div>
    <div class="note warn"><b>Needs support when printed.</b> The raised plate leaves the print bed. Strakes filled to floor level reach the bed and carry it.</div>
    <div class="note">Body mounts on the raised part stay upright and end at the same height as the others. Other holes there turn with the plate. Drag the handle in the top view to move the fold.</div>`;
}

// Tools that shape a drawn chassis; an imported chassis keeps its own shape.
const FIXED_TOOLS = new Set(['outline', 'trace', 'fill', 'kickup', 'kickfront', 'profile', 'rail']);
function importedPodPanel(d) {
  const imp = d.pod.imported, h = heights(d);
  return head('Pod', 'Imported pod', esc(imp.name)) + `
    <div class="g2">${num('Rear axle, from the pod\'s front', 'pod.imported.axleX')}${num('Axle above the underside', 'pod.imported.axleZ', 'mm', { min: 0 })}${num('Screw hole', 'pod.imported.holeD', 'mm', { min: 0.3 })}</div>
    <div class="lst"><div class="hdr"><span></span><span>Screw point, from the pod's front</span><span>Side, from centre</span><span></span></div>
    ${imp.mounts.map((m, i) => `<div class="li"><span class="n">${i + 1}</span><span class="num"><input data-path="pod.imported.mounts.${i}.0" value="${f2(m[0])}"></span><span class="num"><input data-path="pod.imported.mounts.${i}.1" value="${f2(m[1])}"></span><button class="iconbtn" data-act="dellist" data-path="pod.imported.mounts" data-i="${i}" title="Remove">${ico('x')}</button></div>`).join('')}</div>
    <button class="btn sm ghost" data-act="addmount">${ico('plus')}Add a screw point</button>
    ${kv([['Axle height the car gives', f2(h.axle)], ['Pod size', `${f1(imp.box[1] - imp.box[0])} × ${f1(imp.box[2])}`]])}
    <div class="note">The pod sits with its rear axle on the car's rear axle. The chassis opening follows its shape, and the chassis gets a mount at every screw point.</div>
    <button class="btn ghost" data-act="dropimport" data-part="pod">Use a generated pod instead</button>`;
}
function importedChassisPanel(d) {
  const imp = d.chassis.imported, f = find(d.chassis, 'outline');
  return head('Chassis', 'Imported chassis', esc(imp.name)) + `
    <div class="g2">${num('Front axle, from the chassis\'s front', 'chassis.imported.frontX')}${num('Plate thickness, for added features', P(f, 'thickness'), 'mm', { min: 0.4 })}</div>
    ${kv([['Size', `${f1(imp.size[0])} × ${f1(imp.size[1])} × ${f1(imp.size[2])}`]])}
    <div class="note">An imported chassis keeps its shape: outline, fill and kick-up do not apply. You can still add a guide holder, axle brackets, mounts, ribs, walls, tunnels and panels, and cut the pod opening and windows.</div>
    <button class="btn primary" data-act="editimport" ${state.tracing ? 'disabled' : ''}>${ico('pen')}${state.tracing ? 'Working…' : 'Make it editable'}</button>
    <div class="note"><b>Make it editable</b> takes this chassis's shape from above as your own outline, which you then change like any other: points, curves, fill, kick-up. Its thickness is taken over. What stands on it (holes, posts, ribs, brackets) is not carried over: the app builds its own, where you set them. Undo brings the imported chassis back.</div>
    <button class="btn ghost" data-act="dropimport" data-part="chassis">Use a drawn chassis instead</button>`;
}

// How thick the plate of an imported chassis is: the height most of its upward faces lie at.
function tallestPlate(mesh) {
  const p = mesh.positions, t = mesh.indices, heights = new Map();
  let low = Infinity;
  for (let i = 2; i < p.length; i += 3) low = Math.min(low, p[i]);
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    if (Math.abs(p[a + 2] - p[b + 2]) > 0.02 || Math.abs(p[a + 2] - p[c + 2]) > 0.02 || p[a + 2] - low < 0.3) continue;
    const area = Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2, key = Math.round((p[a + 2] - low) * 10) / 10;
    heights.set(key, (heights.get(key) ?? 0) + area);
  }
  let best = 1.5, most = 0;
  for (const [h, area] of heights) if (area > most) { most = area; best = h; }
  return best;
}

// The panel of a shaping tool: the list of its features, and the chosen one's settings.
function multi(type, eyebrow, title, text, body) {
  const list = shapesOf(state.design, type), cur = chosen(type);
  return head(eyebrow, title, text) + `
    <div class="plist">${list.map((f, i) => `<div class="prow lrow ${f === cur ? 'cur' : ''}" data-act="selshape" data-type="${type}" data-id="${f.id}"><span>${FEATURE_NAMES[type]} ${i + 1}<small>${on(f) ? esc(describe(f, state.design)) : 'switched off'}</small></span><button class="iconbtn" data-act="toggle" data-f="${f.id}" title="${on(f) ? 'Switch off' : 'Switch on'}">${ico('eye')}</button><button class="iconbtn" data-act="delshape" data-id="${f.id}" title="Delete">${ico('trash')}</button></div>`).join('') || '<div class="prow muted">None yet.</div>'}</div>
    <button class="btn sm ghost" data-act="addshape" data-type="${type}">${ico('plus')}Add ${FEATURE_NAMES[type].toLowerCase()}</button>
    ${cur ? '<div class="hr"></div>' + body(cur) : ''}`;
}
function pointList(f, a, b) {
  const pts = f.params.points;
  return `<div class="lst"><div class="hdr"><span></span><span>${a}</span><span>${b}</span><span></span></div>
    ${pts.map((p, i) => `<div class="li"><span class="n">${i + 1}</span><span class="num"><input data-path="${P(f, `points.${i}.0`)}" ${lv(p[0])}></span><span class="num"><input data-path="${P(f, `points.${i}.1`)}" ${lv(p[1])}></span><button class="iconbtn" data-act="dellist" data-path="${P(f, 'points')}" data-i="${i}" title="Remove this point" ${pts.length <= 2 ? 'disabled' : ''}>${ico('x')}</button></div>`).join('')}</div>
    <button class="btn sm ghost" data-act="addshapept" data-id="${f.id}">${ico('plus')}Add a point at the end</button>`;
}
// Weight of the printed parts, and where the centre of gravity lies.
const balanceRows = (d, b) => kv([['Printed parts', `${b.printed.toFixed(1)} g`], ...(b.added > 0 ? [['Magnets and weights', `${b.added.toFixed(1)} g`]] : []), ['Centre of gravity, behind the front axle', `${f1(b.x)} mm · ${b.share.toFixed(0)} % of the wheelbase`], ['Centre of gravity, above the track', `${f1(b.z)} mm`], ...(Math.abs(b.y) > 0.05 ? [['Centre of gravity, to the side', `${f1(Math.abs(b.y))} mm ${b.y > 0 ? 'right' : 'left'}`]] : [])]) +
  '<div class="note">Counts the chassis, the pod and the weights you give. The bought parts are not in it: motor, wheels, axles, gears, guide and body.</div>';
const boxFields = (f) => `<div class="g2">${num('From, along', P(f, 'x0'))}${num('To, along', P(f, 'x1'))}${num('From, side', P(f, 'y0'))}${num('To, side', P(f, 'y1'))}</div>`;
const segBtn = (path, v, label) => `<button class="${getPath(path) === v ? 'on' : ''}" data-act="tile" data-path="${path}" data-v="${v}">${label}</button>`;

function renderPanel() {
  const active = state.focusNext ?? (document.activeElement?.closest?.('#panel') ? document.activeElement.dataset.path : null);
  state.focusNext = null;
  const d = state.design;
  const panel = d.pod.imported && POD_TOOLS.has(state.tool) ? importedPodPanel
    : d.chassis.imported && FIXED_TOOLS.has(state.tool) ? importedChassisPanel
    : PANELS[state.tool] ?? PANELS.check;
  $('#panel').innerHTML = `<section>${panel(d)}</section>`;
  if (active) $(`#panel [data-path="${active}"]`)?.focus();
}

// ------------------------------------------------------------ feature list, status

function describe(f, d) {
  const p = f.params;
  switch (f.type) {
    case 'outline': return `${p.points.length} points · plate ${f2(p.thickness)}`;
    case 'podOpening': return `from pod · gap ${f2(p.gap)}`;
    case 'fill': return p.style === 'frame' ? `frame · ${p.cross.length} cross · ${p.length.length} length` : p.style;
    case 'guide': return `${guideOf(d, p.guide)?.name ?? ''} · hole ${f2(p.hole)}`;
    case 'frontAxle': return `spread ${f2(p.spread)}`;
    case 'podMounts': return `4 screws · hole ${f2(p.hole)}`;
    case 'bodyMounts': return `${p.posts.length} spot${p.posts.length === 1 ? '' : 's'}`;
    case 'kickup':
    case 'kickfront': return `${f2(p.angle)}° · ${p.zone === 'full' ? 'full width' : p.zone === 'centre' ? 'centre only' : 'sides only'} · ${p.strakes} strakes`;
    case 'profile': return `${p.points.length} points · up to ${f2(Math.max(...p.points.map((q) => q[1])))} lift`;
    case 'split': return `cut at ${f2(p.along)} · ${p.tabs} key${p.tabs === 1 ? '' : 's'}`;
    case 'base': return `width ${f2(p.width)} · ${f2(p.thickness)} thick`;
    case 'motorSeat': return motorOf(d).name;
    case 'uprights': return `${p.form === 'sphere' ? `spherical · ball ${f2(p.ballD)} × ${f2(p.ballW)}` : `${p.holder} · seat ${f2(p.seat)}`}${p.tube ? ` · tube ${f2(p.tubeLen)}` : ''}`;
    case 'lugs': return `${f2(p.patternX)} × ${f2(p.patternY)}`;
    case 'rib': return `${p.side === 'under' ? 'underneath' : 'on top'} · ${f2(p.h0)} to ${f2(p.h1)} high`;
    case 'wall': return `points ${Math.min(p.from, p.to) + 1} to ${Math.max(p.from, p.to) + 1} · ${f2(p.height)} high`;
    case 'tunnel': return `${f2(Math.abs(p.x1 - p.x0))} long · ${f2(p.width)} × ${f2(p.height)}`;
    case 'panel': return `${f2(p.width)} × ${f2(p.height)} · ${p.windows} windows`;
    case 'level': return p.offset >= 0 ? `raised ${f2(p.offset)}` : `pocket ${f2(-p.offset)} deep`;
    case 'window': return `${f2(Math.abs(p.x1 - p.x0))} × ${f2(Math.abs(p.y1 - p.y0))}`;
    case 'rail': return `${p.points.length} points · ${f2(p.width)} wide`;
    case 'holder': return `${p.shape === 'bar' ? `${f2(p.length)} × ${f2(p.width)}` : `Ø${f2(p.d)}`} · ${f2(p.deep)} deep${p.mass > 0 ? ` · ${f2(p.mass)} g` : ''}`;
    case 'wire': return `for a ${f2(p.gap)} mm wire · ${f2(p.height)} high`;
    case 'chip': return `${f2(p.length)} × ${f2(p.width)} · wall ${f2(p.height)} high`;
    case 'tab': return `${f2(p.length)} long · reaches ${f2(p.reach)}${p.rise > 0 ? ` · block ${f2(p.rise)} high` : ''}`;
    case 'cutout': return `${p.points.length} points · ${p.sink > 0 ? `sunk ${f2(p.sink)}` : 'through'}`;
    default: return '';
  }
}
function renderSteps() {
  const d = state.design;
  $('#tabs').innerHTML = ['chassis', 'pod'].map((t) => `<button class="${state.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}">${t === 'chassis' ? 'Chassis' : 'Pod'} · ${d[t].features.length}</button>`).join('');
  $('#steps').innerHTML = d[state.tab].features.map((f, i) => `
    <div class="sp ${state.tool === f.type && (!MULTI.includes(f.type) || chosen(f.type) === f) ? 'cur' : ''} ${on(f) ? '' : 'off'}" data-act="tool" data-tool="${f.type}" data-id="${f.id}">
      <span class="n">${i + 1}</span><span class="t">${FEATURE_NAMES[f.type]}<small>${on(f) ? esc(describe(f, d)) : 'switched off'}</small></span><span></span>
      ${['outline', 'fill', 'base'].includes(f.type) ? '<span></span>' : `<button data-act="toggle" data-f="${f.id}" title="${on(f) ? 'Switch off' : 'Switch on'}">${ico('eye')}</button>`}
    </div>`).join('');
}

function renderStatus() {
  const d = state.design, s = summary(d);
  const rows = [...checks(d), ...(state.built?.notes ?? []), ...bodyNotes()], bad = rows.filter((r) => !r.ok && !r.soft).length;
  $('#status').innerHTML = `
    <span class="sb"><b>${d.scale}</b></span>
    <span class="sb">Wheelbase <b class="mono">${len(s.wheelbase)}</b></span>
    <span class="sb">Guide lead <b class="mono">${len(s.guideLead)}</b></span>
    <span class="sb">Width <b class="mono">${len(s.width)}</b></span>
    <span class="sb">Clearance <b class="mono">${len(s.clearance, f2)}</b></span>
    <span class="sb"><i class="dot ${state.error ? 'bad' : bad ? 'w' : 'ok'}"></i>${state.error ? 'Cannot be built' : state.busy ? 'Building…' : bad ? `${bad} note${bad > 1 ? 's' : ''}` : 'All checks pass'}</span>
    <span class="sb">${MATERIALS[d.printer.material].name} · ${f2(d.printer.nozzle)} nozzle</span>
    <span class="sb end units" role="group" aria-label="Units"><button class="${inches() ? '' : 'on'}" data-act="units" data-v="mm">mm</button><button class="${inches() ? 'on' : ''}" data-act="units" data-v="in">in</button></span>
    <span class="sb end">v${VERSION}</span>
    <span class="sf-footer-brand"><img class="wm-dark" src="${markDark}" alt="SlotForge"><img class="wm-light" src="${markLight}" alt="SlotForge"></span>`;
  const notes = state.built?.notes ?? [];
  $('#lights').innerHTML = state.error
    ? `<span><i class="dot bad"></i>Cannot be built</span>`
    : notes.slice(-2).map((n) => `<span><i class="dot ${n.ok ? 'ok' : 'bad'}"></i>${esc(n.title)}</span>`).join('') + `<span><i class="dot ${bad ? 'w' : 'ok'}"></i>${bad ? `${bad} note${bad > 1 ? 's' : ''}` : 'Ready'}</span>`;
  const err = $('#err');
  err.hidden = !state.error;
  err.textContent = state.error ?? '';
}

// ------------------------------------------------------------ the top view

const ringPath = (rings) => rings.map((r) => 'M' + r.map((p) => `${round(p[0], 3)} ${round(p[1], 3)}`).join('L') + 'Z').join('');
function fullOutline(pts) {
  return pts.concat(pts.slice().reverse().filter((p) => p[1] > 1e-6).map(([x, y]) => [x, -y]));
}
function rotRect(cx, cy, w, h, angle, cls) {
  return `<rect class="${cls}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${Math.min(2, h / 4)}" transform="rotate(${angle} ${cx} ${cy})"/>`;
}

function topSVG() {
  const d = state.design, c = d.chassis, s = summary(d), built = state.built?.top, tool = state.tool;
  const outline = find(c, 'outline').params, pts = outline.points;
  const fixed = !!c.imported, podIn = d.pod.imported;
  const minX = s.minX, maxX = s.maxX, half = Math.max(s.width / 2, s.plateWidth / 2);
  const vb = [minX - 16, -half - 20, maxX - minX + 32, 2 * half + 40];
  const guide = find(c, 'guide'), axle = find(c, 'frontAxle'), mounts = find(c, 'podMounts'), posts = find(c, 'bodyMounts'), kick = find(c, 'kickup'), fill = find(c, 'fill');
  const up = find(d.pod, 'uprights'), lugs = find(d.pod, 'lugs'), lay = podLayout(d), parts = partsLayout(d);
  const wb = d.car.wheelbase;
  const out = [];
  const selCls = (type) => (tool === type ? ' selon' : '');

  const bodyHull = state.show.body ? bodyPlaced().hull : [];
  if (bodyHull.length) {
    out.push(`<path class="bodyghost" pointer-events="none" d="${ringPath([bodyHull])}"/><text class="lbl" x="${Math.min(...bodyHull.map((q) => q[0]))}" y="${Math.min(...bodyHull.map((q) => q[1])) - 1.5}">Body: ${esc(d.body.name)}</text>`);
    const bx = bodyHull.map((q) => q[0]), by = bodyHull.map((q) => Math.abs(q[1]));
    const right = Math.max(vb[0] + vb[2], Math.max(...bx) + 8);
    vb[0] = Math.min(vb[0], Math.min(...bx) - 8);
    vb[2] = right - vb[0];
    const hh = Math.max(vb[3] / 2, Math.max(...by) + 14);
    vb[1] = -hh;
    vb[3] = 2 * hh;
  }
  // chassis
  out.push('<g class="lay-chassis">');
  // What a kick-up lifts, tinted; clipped to the drawing.
  for (const [x0, y0, x1, y1] of kickAreas(d, 9999)) {
    const ax = Math.max(x0, minX), bx = Math.min(x1, maxX), ay = Math.max(y0, -half), by = Math.min(y1, half);
    if (bx > ax && by > ay) out.push(`<rect class="kick" x="${ax}" y="${ay}" width="${bx - ax}" height="${by - ay}"/>`);
  }
  if (built) out.push(`<path class="plate fill" d="${ringPath(built.chassis)}"/>`);
  else if (!fixed) out.push(`<path class="plate fill" d="${ringPath([fullOutline(pts)])}"/>`);
  if (on(guide)) {
    const p = guide.params;
    out.push(`<g data-pick="guide"><circle class="pad" cx="${p.along}" cy="${p.side}" r="${p.bossD / 2}"/><circle class="hole" cx="${p.along}" cy="${p.side}" r="${p.hole / 2}"/></g>`);
    if (tool === 'guide') out.push(`<circle class="selmark" cx="${p.along}" cy="${p.side}" r="${p.padD / 2}"/>`);
  }
  if (on(axle)) {
    const p = axle.params;
    for (const sg of [1, -1]) {
      out.push(`<rect data-pick="frontAxle" class="pad" x="${p.along - p.width / 2}" y="${(sg * p.spread) / 2 - p.thick / 2}" width="${p.width}" height="${p.thick}" rx=".5"/>`);
      if (tool === 'frontAxle') out.push(`<rect class="selmark" x="${p.along - p.width / 2 - 0.8}" y="${(sg * p.spread) / 2 - p.thick / 2 - 0.8}" width="${p.width + 1.6}" height="${p.thick + 1.6}" rx=".8"/>`);
    }
  }
  if (on(posts)) for (const q of posts.params.posts) for (const sg of Math.abs(q.side) > 0.01 ? [1, -1] : [1]) {
    out.push(`<g data-pick="bodyMounts"><circle class="pad" cx="${q.along}" cy="${sg * q.side}" r="${posts.params.padD / 2}"/><circle class="hole" cx="${q.along}" cy="${sg * q.side}" r="${posts.params.hole / 2}"/></g>`);
    if (tool === 'bodyMounts') out.push(`<circle class="selmark" cx="${q.along}" cy="${sg * q.side}" r="${posts.params.padD / 2 + 0.9}"/>`);
  }
  if (on(mounts)) for (const [x, y] of lay.points) {
    out.push(`<circle data-pick="podMounts" class="hole" cx="${x}" cy="${y}" r="${mounts.params.hole / 2}"/>`);
    if (tool === 'podMounts') out.push(`<circle class="selmark" cx="${x}" cy="${y}" r="${mounts.params.padD / 2}"/>`);
  }
  // shaping features
  for (const f of c.features.filter((x) => MULTI.includes(x.type) && on(x))) {
    const p = f.params, cur = tool === f.type && chosen(f.type) === f, pick = `data-pick="${f.type}" data-id="${f.id}"`;
    const sides = p.mirror ? [1, -1] : [1];
    const line = (pts, sg) => pts.map((q) => `${q[0]},${sg * q[1]}`).join(' ');
    for (const sg of sides) {
      if (f.type === 'rib') out.push(`<polyline ${pick} class="shp ${cur ? 'cur' : ''}" stroke-width="${p.width}" points="${line(p.points, sg)}"/>`);
      if (f.type === 'rail') out.push(`<polyline ${pick} class="shp ghost ${cur ? 'cur' : ''}" stroke-width="${p.width}" points="${line(p.points, sg)}"/>`);
      if (f.type === 'wall') out.push(`<polyline ${pick} class="shp ${cur ? 'cur' : ''}" stroke-width="${p.thick}" points="${line(pts.slice(Math.min(p.from, p.to), Math.max(p.from, p.to) + 1), sg)}"/>`);
      if (f.type === 'tunnel') {
        const x0 = Math.min(p.x0, p.x1), w = Math.abs(p.x1 - p.x0);
        out.push(`<rect ${pick} class="shp area ${cur ? 'cur' : ''}" x="${x0}" y="${sg * p.side - p.width / 2}" width="${w}" height="${p.width}"/>`);
      }
      if (f.type === 'cutout') out.push(`<polygon ${pick} class="shp area ghost ${cur ? 'cur' : ''}" points="${line(p.points, sg)}"/>`);
      if (f.type === 'holder' && (sg > 0 || Math.abs(p.side) > 0.01)) out.push(p.shape === 'bar' ? `<rect ${pick} class="shp area ${cur ? 'cur' : ''}" x="${p.along - p.length / 2}" y="${sg * p.side - p.width / 2}" width="${p.length}" height="${p.width}"/>` : `<circle ${pick} class="shp area ${cur ? 'cur' : ''}" cx="${p.along}" cy="${sg * p.side}" r="${p.d / 2}"/>`);
      if (f.type === 'wire' && (sg > 0 || Math.abs(p.side) > 0.01)) out.push(`<rect ${pick} class="shp area ${cur ? 'cur' : ''}" x="${p.along - p.length / 2}" y="${sg * p.side - p.gap / 2 - p.wall}" width="${p.length}" height="${p.gap + 2 * p.wall}"/>`);
      if (f.type === 'level' || f.type === 'window') {
        const x0 = Math.min(p.x0, p.x1), y0 = Math.min(sg * p.y0, sg * p.y1);
        out.push(`<rect ${pick} class="shp area ${f.type === 'window' ? 'ghost' : ''} ${cur ? 'cur' : ''}" x="${x0}" y="${y0}" width="${Math.abs(p.x1 - p.x0)}" height="${Math.abs(p.y1 - p.y0)}"/>`);
      }
    }
    if (f.type === 'chip') out.push(`<rect ${pick} class="shp area ${cur ? 'cur' : ''}" x="${p.along - p.length / 2}" y="${p.side - p.width / 2}" width="${p.length}" height="${p.width}"/>`);
    if (f.type === 'panel') out.push(`<rect ${pick} class="shp solid ${cur ? 'cur' : ''}" x="${p.along}" y="${-p.width / 2}" width="${Math.max(0.8, p.thick)}" height="${p.width}"/>`);
  }
  for (const { f: kf, front } of activeKicks(d)) out.push(`<line class="fold" x1="${kf.params.fold}" y1="${-half}" x2="${kf.params.fold}" y2="${half}"/><text class="lbl" x="${kf.params.fold + (front ? -1.5 : 1.5)}" y="${-half - 1.5}" ${front ? 'text-anchor="end"' : ''} style="fill:var(--warn-text)">Kick-up ${f2(kf.params.angle)}°</text>`);
  const cut = find(c, 'split');
  if (on(cut)) out.push(`<line class="splitline" x1="${cut.params.along}" y1="${-half - 2}" x2="${cut.params.along}" y2="${half + 2}"/><text class="lbl" x="${cut.params.along + 1.5}" y="${half + 4.5}">Split</text>`);
  out.push('</g>');

  // pod
  out.push('<g class="lay-pod">');
  if (built) out.push(`<path data-pick="base" class="pod shape" d="${ringPath(built.pod)}"/><path data-pick="motorSeat" class="podwin" d="${ringPath(built.window)}"/>`);
  if (podIn) for (const [x, y] of lay.points) out.push(`<circle data-pick="lugs" class="hole" cx="${x}" cy="${y}" r="${podIn.holeD / 2}"/>`);
  if (on(up) && !podIn) for (const sg of [1, -1]) {
    const p = up.params, hw = p.seat / 2 + p.wall, y0 = (sg > 0 ? p.spread / 2 - p.thick : -p.spread / 2) + podShift(d);
    out.push(`<rect data-pick="uprights" class="pod solid" x="${wb - hw}" y="${y0}" width="${2 * hw}" height="${p.thick}" rx=".5"/>`);
    if (tool === 'uprights') out.push(`<rect class="selmark" x="${wb - hw - 0.8}" y="${y0 - 0.8}" width="${2 * hw + 1.6}" height="${p.thick + 1.6}" rx=".8"/>`);
  }
  if (on(lugs) && !podIn) for (const [x, y] of lay.points) {
    out.push(`<circle data-pick="lugs" class="hole" cx="${x}" cy="${y}" r="${lugs.params.hole / 2}"/>`);
    if (tool === 'lugs') out.push(`<circle class="selmark" cx="${x}" cy="${y}" r="${lugs.params.lugD / 2 + 0.6}"/>`);
  }
  out.push('</g>');

  // bought parts
  if (state.show.parts) {
    out.push('<g class="lay-parts" pointer-events="none">');
    for (const a of parts.axles) out.push(a.inner == null ? `<line class="part line" x1="${a.x}" y1="${-a.half}" x2="${a.x}" y2="${a.half}"/>` : [1, -1].map((s) => `<line class="part line" x1="${a.x}" y1="${s * a.inner}" x2="${a.x}" y2="${s * a.half}"/>`).join(''));
    for (const w of parts.wheels) out.push(`<rect class="part" x="${w.x - w.d / 2}" y="${w.y - w.w / 2}" width="${w.d}" height="${w.w}" rx="2"/>`);
    out.push(rotRect(parts.motor.x, parts.motor.y, parts.motor.length, parts.motor.width, parts.motor.angle, 'part'));
    out.push(`<line class="part line" x1="${parts.shaft.x0}" y1="${parts.shaft.y0}" x2="${parts.shaft.x1}" y2="${parts.shaft.y1}"/>`);
    out.push(rotRect(parts.pinion.x, parts.pinion.y, parts.pinion.length, parts.pinion.d, parts.pinion.angle, 'part'));
    out.push(`<rect class="part" x="${parts.gear.x - parts.gear.d / 2}" y="${parts.gear.y - parts.gear.width / 2}" width="${parts.gear.d}" height="${parts.gear.width}" rx=".6"/>`);
    for (const b of parts.bushes ?? []) out.push(`<rect class="part" x="${b.x - b.d / 2}" y="${b.y - b.w / 2}" width="${b.d}" height="${b.w}" rx="${Math.min(b.d, b.w) / 2.5}"/>`);
    if (parts.gearBoss) out.push(`<rect class="part" x="${parts.gearBoss.x - parts.gearBoss.d / 2}" y="${parts.gearBoss.y - parts.gearBoss.width / 2}" width="${parts.gearBoss.d}" height="${parts.gearBoss.width}" rx=".4"/>`);
    if (parts.guide) out.push(`<rect class="part" x="${parts.guide.x - parts.guide.length / 2 - 2}" y="${parts.guide.y - 0.9}" width="${parts.guide.length}" height="1.8" rx=".5"/>`);
    out.push('</g>');
  }

  // centre line and dimensions
  out.push(`<line class="mirror" x1="${vb[0]}" y1="0" x2="${vb[0] + vb[2]}" y2="0"/>`);
  const dy = half + 9;
  out.push(`<path class="dim" d="M0 ${dy - 2}V${dy + 2}M${wb} ${dy - 2}V${dy + 2}M0 ${dy}H${wb}"/><text class="dimt" x="${wb / 2}" y="${dy + 5}">wheelbase ${len(wb)}${inches() ? ' in' : ''}</text>`);
  if (on(guide)) out.push(`<path class="dim" d="M${guide.params.along} ${-dy - 2}V${-dy + 2}M${wb} ${-dy - 2}V${-dy + 2}M${guide.params.along} ${-dy}H${wb}"/><text class="dimt" x="${(guide.params.along + wb) / 2}" y="${-dy - 2.5}">guide lead ${f1(s.guideLead)}</text>`);

  // handles for the active tool
  if (tool === 'outline' && !fixed) {
    out.push(`<path class="live" d="${ringPath([fullOutline(pts)])}"/>`);
    pts.forEach((p, i) => out.push(`<rect class="hd ${i === state.selPoint ? 'on' : ''}" data-drag="point" data-i="${i}" x="${p[0] - 1.3}" y="${p[1] - 1.3}" width="2.6" height="2.6"/>`));
  }
  if (tool === 'guide' && on(guide)) out.push(`<circle class="hd" data-drag="guide" cx="${guide.params.along}" cy="${guide.params.side}" r="1.4"/>`);
  if (tool === 'bodyMounts' && on(posts)) posts.params.posts.forEach((q, i) => out.push(`<circle class="hd" data-drag="post" data-i="${i}" cx="${q.along}" cy="${q.side}" r="1.4"/>`));
  if (tool === 'fill' && on(fill) && fill.params.style === 'frame') fill.params.cross.forEach((x, i) => out.push(`<rect class="hd rail" data-drag="cross" data-i="${i}" x="${x - 1.2}" y="${half + 1.5}" width="2.4" height="3.4" rx=".6"/>`));
  if (MULTI.includes(tool)) {
    const f = chosen(tool), p = f?.params;
    if (f && on(f)) {
      const hd = (x, y, extra) => out.push(`<circle class="hd" data-drag="shape" data-f="${f.id}" ${extra} cx="${x}" cy="${y}" r="1.3"/>`);
      if (p.points) p.points.forEach((q, i) => hd(q[0], q[1], `data-k="pt" data-i="${i}"`));
      else if (tool === 'tunnel') { hd(p.x0, p.side, 'data-k="x0"'); hd(p.x1, p.side, 'data-k="x1"'); }
      else if (tool === 'panel') hd(p.along, 0, 'data-k="along"');
      else if (tool === 'level' || tool === 'window') { hd(p.x0, p.y0, 'data-k="c0"'); hd(p.x1, p.y1, 'data-k="c1"'); }
      else if (tool === 'wall') for (const i of [p.from, p.to]) if (pts[i]) out.push(`<rect class="selmark" x="${pts[i][0] - 1.4}" y="${pts[i][1] - 1.4}" width="2.8" height="2.8"/>`);
    }
  }
  for (const type of ['kickup', 'kickfront', 'split']) {
    const hf = find(c, type);
    if (tool === type && on(hf)) out.push(`<rect class="hd rail" data-drag="line" data-type="${type}" x="${(type === 'split' ? hf.params.along : hf.params.fold) - 1.2}" y="${half + 1.5}" width="2.4" height="3.4" rx=".6"/>`);
  }

  const svg = $('#topview');
  svg.setAttribute('viewBox', vb.join(' '));
  // The measuring tool: its two places and the line between them.
  if (state.measure.on && state.measure.a) {
    const { a, b } = state.measure;
    out.push(`<g class="measure" pointer-events="none"><circle class="hd" cx="${a[0]}" cy="${a[1]}" r="0.9"/>${b ? `<circle class="hd" cx="${b[0]}" cy="${b[1]}" r="0.9"/><path class="dim" d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/><text class="dimt" x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2 - 2}">${len(Math.hypot(b[0] - a[0], b[1] - a[1]), f2)} ${lenUnit()}</text>` : ''}</g>`);
  }
  svg.innerHTML = out.join('');
}

function renderView() {
  const view = $('#view'), top = state.view === 'top';
  view.classList.toggle('focus-pod', state.focus === 'pod');
  view.classList.toggle('focus-chassis', state.focus === 'chassis');
  $('#topview').toggleAttribute('hidden', !top);
  $('#gl').hidden = top;
  $('.grid', view).hidden = !top;
  if (top) topSVG();
  else viewport.resize();
  viewport.show({ chassis: state.focus !== 'pod', pod: state.focus !== 'chassis', parts: state.show.parts, track: state.show.track, body: state.show.body, solid: state.show.solid });
  const placedBody = bodyPlaced();
  if (viewport.bodyKey !== placedBody.key) {
    viewport.bodyKey = placedBody.key;
    viewport.setBody(placedBody.placed);
  }
  $('#viewbar').innerHTML = `
    <div class="seg"><button class="${top ? 'on' : ''}" data-act="view" data-view="top">Top</button><button class="${top ? '' : 'on'}" data-act="view" data-view="3d">${ico('cube')}3D</button></div>
    <div class="seg">${[['chassis', 'Chassis'], ['pod', 'Pod'], ['both', 'Both']].map(([v, t]) => `<button class="${state.focus === v ? 'on' : ''}" data-act="focus" data-focus="${v}">${t}</button>`).join('')}</div>
    <span class="gap"></span>
    ${state.busy ? '<span class="pill">Building…</span>' : ''}
    ${top && state.measure.on ? `<span class="pill" id="measured">${measuredText()}</span>` : ''}
    ${top ? `<div class="seg"><button class="${state.measure.on ? 'on' : ''}" data-act="measure" title="Measure a distance in the top view: click two places">${ico('ruler')}Measure</button></div>` : ''}
    <div class="seg"><button class="${state.show.parts ? 'on' : ''}" data-act="show" data-show="parts">${ico('eye')}Parts</button>${state.design.body ? `<button class="${state.show.body ? 'on' : ''}" data-act="show" data-show="body">Body</button>${state.view === '3d' && state.show.body ? `<button class="${state.show.solid ? 'on' : ''}" data-act="show" data-show="solid" title="Show the body solid, not see-through">Solid</button>` : ''}` : ''}${top ? '' : `<button class="${state.show.track ? 'on' : ''}" data-act="show" data-show="track">Track</button>`}</div>`;
}
// What the measuring tool has, in words.
function measuredText() {
  const { a, b } = state.measure;
  if (!a) return 'Click the first place';
  if (!b) return 'Click the second place';
  return `${len(Math.hypot(b[0] - a[0], b[1] - a[1]), f2)} ${lenUnit()} · along ${len(Math.abs(b[0] - a[0]), f2)} · across ${len(Math.abs(b[1] - a[1]), f2)}`;
}
function syncViewport() {
  if (!state.built) return;
  viewport.set({ chassis: state.built.chassis, pod: state.built.pod, parts: partsLayout(state.design), target: state.design.car.wheelbase / 2 });
}

function render() {
  renderTop();
  renderMenus();
  renderPanel();
  renderSteps();
  renderStatus();
  renderView();
}

// ------------------------------------------------------------ actions

function setTool(tool) {
  state.tool = tool;
  state.menu = tool === 'check' ? null : menuOf(tool) ?? state.menu;
  const feat = featureOf(tool);
  if (feat) state.tab = state.design.pod.features.includes(feat) ? 'pod' : 'chassis';
  else if (POD_TOOLS.has(tool)) state.tab = 'pod';
}

const ACTIONS = {
  menu(el) {
    const menu = MENUS.find((m) => m[0] === el.dataset.menu);
    setTool(menu[3][0][0]);
    render();
  },
  tool(el) {
    if (el.dataset.id && MULTI.includes(el.dataset.tool)) state.sel[el.dataset.tool] = el.dataset.id;
    setTool(el.dataset.tool);
    render();
  },
  selshape(el) { state.sel[el.dataset.type] = el.dataset.id; render(); },
  library(el) { dialogs.openLibrary(el.dataset.kind || 'pod'); },
  setfix(el) { setPath(el.dataset.path, +el.dataset.v); commit(); },
  gearangle() { state.design.drivetrain.angle = null; commit(); },
  settings() { const box = settingsDialog(); if (!box.open) box.showModal(); },
  async tracebody() {
    const placed = bodyPlaced().placed, design = state.design;
    if (!placed || state.tracing) return;
    state.tracing = true;
    renderPanel();
    try {
      const t = state.ui.trace, under = t.mode === 'under';
      const out = await call('trace', { body: { positions: placed.positions, indices: placed.indices }, gap: t.gap, band: under ? t.edge : t.band, wellSide: t.wellSide, wellEnd: t.wellEnd, wheels: traceWheels(design), arches: traceArches(design, bodyPlaced().arches), extend: under ? t.extend : null, plateTop: rideClearance(design) + find(design.chassis, 'outline').params.thickness + t.headroom });
      if (state.design !== design) return; // another design was opened meanwhile
      applyOutline(design, out.points);
      // Under the body, the body stands on the plate; inside it, the body stays where it was put.
      // A body that stood on the plate comes back down over the chassis when it is traced inside again.
      if (!under && design.body.onPlate) design.body.lift = rideClearance(design);
      design.body.onPlate = under;
      // A body that stands on the plate needs it flat: a kicked-up nose or tail would rise into the body.
      const kicks = under ? ['kickup', 'kickfront'].map((type) => find(design.chassis, type)).filter((f) => on(f)) : [];
      for (const f of kicks) f.enabled = false;
      if (under) design.body.lift = round(rideClearance(design) + find(design.chassis, 'outline').params.thickness, 2);
      state.selPoint = 0;
      commit();
      toast(`Outline traced from the body: ${f1(out.length)} × ${f1(out.width)} mm, ${out.points.length} points.${kicks.length ? ' The kick-up is switched off: the body stands on a flat plate.' : ''}`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      state.tracing = false;
      renderPanel();
    }
  },
  exportcoupon() {
    const c = state.coupon?.data;
    if (!c) return toast('The coupon is still being built. Try again in a moment.', true);
    download(encodeSTL(layFlat(c.mesh), 'SlotForge Frame calibration coupon'), `${fileBase()} calibration coupon.stl`, 'model/stl');
    toast('Exported the calibration coupon. Print it flat, as it is.');
  },
  toanvil() {
    if (state.error) return toast('This design cannot be built yet: ' + state.error, true);
    if (!state.built || state.busy) return toast('The parts are still being built. Try again in a moment.', true);
    const { text, warnings, posts } = encodeAnvilChassis(state.design, state.built);
    download(text, fileBase() + '.anvilchassis', 'application/json');
    toast(`Exported for Anvil, with ${posts} body-mount spot${posts === 1 ? '' : 's'}.` + (warnings.length ? ' ' + warnings[0] : ''), warnings.length > 0);
  },
  bodyload() { $('#bodyfile').click(); },
  bodyturn() { state.design.body.turn = ((state.design.body.turn || 0) + 180) % 360; commit(); },
  fitarches() {
    const d = state.design, arches = bodyPlaced().arches;
    if (!arches || !d.body) return;
    const want = archFit(d, arches);
    d.car.wheelbase = want.wheelbase;
    afterChange('car.wheelbase'); // carries the rear of the chassis along
    d.body.shift = want.shift;
    commit();
    toast(`Wheelbase ${f1(want.wheelbase)} mm: the axles sit in the arches.`);
  },
  bodyquarter() { state.design.body.turn = ((state.design.body.turn || 0) + 90) % 360; commit(); },
  bodyremove() { delete state.design.body; commit(); },
  importstl() { dialogs.importSTL(); },
  // An imported chassis becomes a drawn one: its shape from above is traced into the outline.
  async editimport() {
    const design = state.design, imp = design.chassis.imported, mesh = imp && state.meshes[imp.mesh];
    if (!mesh || state.tracing) return;
    state.tracing = true;
    renderPanel();
    try {
      const positions = Float32Array.from(mesh.positions);
      for (let i = 0; i < positions.length; i += 3) positions[i] -= imp.frontX;
      const out = await call('trace', { body: { positions, indices: mesh.indices }, band: 1000, gap: 0, wheels: [] });
      if (state.design !== design) return;
      delete design.chassis.imported;
      find(design.chassis, 'outline').params.thickness = round(Math.min(20, Math.max(0.6, tallestPlate(mesh))), 2);
      applyOutline(design, out.points);
      state.selPoint = 0;
      state.tool = 'outline';
      state.menu = 'outline';
      commit();
      toast(`The chassis is now an outline of ${out.points.length} points, ${f1(out.length)} × ${f1(out.width)} mm.`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      state.tracing = false;
      render();
    }
  },
  dropimport(el) { delete state.design[el.dataset.part].imported; commit(); },
  addmount() { state.design.pod.imported?.mounts.push([round(state.design.pod.imported.axleX), 10]); commit(); },
  addshape(el) {
    const f = newShape(el.dataset.type, state.design);
    state.design.chassis.features.push(f);
    state.sel[f.type] = f.id;
    commit();
  },
  delshape(el) {
    const list = state.design.chassis.features, i = list.findIndex((f) => f.id === el.dataset.id);
    if (i >= 0) list.splice(i, 1);
    commit();
  },
  addshapept(el) {
    const pts = state.design.chassis.features.find((f) => f.id === el.dataset.id)?.params.points;
    if (!pts) return;
    const a = pts.at(-2) ?? [0, 0], b = pts.at(-1);
    pts.push([round(b[0] + (b[0] - a[0]) / 2 || b[0] + 6), round(b[1] + (b[1] - a[1]) / 2)]);
    commit();
  },
  tab(el) { state.tab = el.dataset.tab; renderSteps(); },
  view(el) { state.view = el.dataset.view; renderView(); },
  focus(el) { state.focus = el.dataset.focus; renderView(); },
  show(el) { state.show[el.dataset.show] = !state.show[el.dataset.show]; renderView(); },
  pop(el) { state.pop = state.pop === el.dataset.pop ? null : el.dataset.pop; renderTop(); },
  tone(el) {
    state.theme = { ...state.theme, theme: el.dataset.tone };
    applyThemeState(state.theme);
    saveTheme(state.theme);
    viewport.colours();
    renderTop();
  },
  undo() { restore(history.undo(lastSnap)); },
  redo() { restore(history.redo(lastSnap)); },
  new(el) {
    state.pop = null;
    if (!state.saved && !confirm('Start a new design? Changes that are not saved to a file will be lost.')) return renderTop();
    replaceDesign(newDesign(el.dataset.scale));
  },
  open() { $('#file').click(); },
  save() {
    download(projectText(), fileBase() + '.frame', 'application/json');
    state.saved = true;
    renderTop();
  },
  export(el) {
    state.pop = null;
    renderTop();
    if (state.error) return toast('This design cannot be built yet: ' + state.error, true);
    if (!state.built || state.busy) return toast('The parts are still being built. Try again in a moment.', true);
    const what = el.dataset.what;
    // A split chassis is written as its two parts.
    const cutParts = state.built.split;
    for (const part of what === 'both' ? ['chassis', 'pod'] : [what]) {
      const files = part === 'chassis' && cutParts ? [['chassis front', cutParts.front], ['chassis rear', cutParts.rear]] : [[part, state.built[part]]];
      for (const [name, mesh] of files) download(encodeSTL(layFlat(mesh), `SlotForge Frame ${name}`), `${fileBase()} ${name}.stl`, 'model/stl');
    }
    const chassisText = cutParts ? 'the chassis in two parts' : 'the chassis';
    toast(what === 'both' ? `Exported ${chassisText} and the pod, each laid flat for printing.` : what === 'chassis' ? `Exported ${chassisText}, laid flat for printing.` : 'Exported the pod, laid flat for printing.');
  },
  toggle(el) {
    const f = [...state.design.chassis.features, ...state.design.pod.features].find((x) => x.id === el.dataset.f);
    if (!f) return;
    f.enabled = !on(f);
    commit();
  },
  tile(el) {
    setPath(el.dataset.path, el.dataset.v);
    afterChange(el.dataset.path);
    commit();
  },
  addpoint() {
    clampSelection();
    const pts = find(state.design.chassis, 'outline').params.points, i = state.selPoint, a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    pts.splice(i + 1, 0, [round((a[0] + b[0]) / 2), round(a === b ? a[1] : (a[1] + b[1]) / 2)]);
    shiftWalls(i, 1);
    state.selPoint = i + 1;
    commit();
  },
  curvepoint(el) {
    const q = find(state.design.chassis, 'outline').params.points[+el.dataset.i];
    if (!q) return;
    if (q[2]) q.length = 2; else q[2] = 1;
    commit();
  },
  curveall(el) {
    for (const q of find(state.design.chassis, 'outline').params.points) { if (+el.dataset.v) q[2] = 1; else q.length = 2; }
    commit();
  },
  delpoint(el) {
    const pts = find(state.design.chassis, 'outline').params.points;
    if (pts.length <= 3) return;
    pts.splice(+el.dataset.i, 1);
    shiftWalls(+el.dataset.i, -1);
    clampSelection();
    commit();
  },
  dellist(el) { getPath(el.dataset.path).splice(+el.dataset.i, 1); commit(); },
  addcross() { const p = find(state.design.chassis, 'fill').params; p.cross.push(round((p.cross.at(-1) ?? state.design.car.wheelbase / 2) + 8)); commit(); },
  addlength() { const p = find(state.design.chassis, 'fill').params; p.length.push(round((p.length.at(-1) ?? 12) + 4)); commit(); },
  propose() { const p = find(state.design.chassis, 'fill').params; p.cross = proposeCross(state.design, Math.max(2, p.cross.length)); commit(); },
  measure() { Object.assign(state.measure, { on: !state.measure.on, a: null, b: null }); renderView(); },
  units(el) { if (state.design.units === el.dataset.v) return; state.design.units = el.dataset.v === 'in' ? 'in' : 'mm'; commit(); render(); },
  podlevel() { find(state.design.pod, 'base').params.drop = -find(state.design.chassis, 'outline').params.thickness; commit(); },
  podfit() { find(state.design.pod, 'base').params.sideways = podSideways(state.design); commit(); },
  centreposts() { find(state.design.chassis, 'bodyMounts').params.posts = centreMounts(state.design); commit(); },
  addpost() { find(state.design.chassis, 'bodyMounts').params.posts.push({ along: round(state.design.car.wheelbase / 2), side: 20 }); commit(); },
};

// Edge walls name outline points by number; keep them on the same points when one is added or removed.
function shiftWalls(at, by) {
  const last = find(state.design.chassis, 'outline').params.points.length - 1;
  for (const f of shapesOf(state.design, 'wall'))
    for (const k of ['from', 'to']) {
      if (f.params[k] > at || (by < 0 && f.params[k] === at && at > 0)) f.params[k] += by;
      f.params[k] = Math.max(0, Math.min(last, f.params[k]));
    }
}

// Choices that bring other values with them.
function afterChange(path) {
  const d = state.design;
  if (path === 'drivetrain.layout') d.drivetrain.gear = gearsFor(d)[0].id;
  // New gears bring their own shaft-to-axle distance.
  if (path === 'drivetrain.layout' || path === 'drivetrain.gear') {
    d.drivetrain.centre = round(meshCentre(gearOf(d), d.drivetrain.layout));
    d.drivetrain.angle = null; // and their own angle
  }
  // A pod put on top of the chassis: its motor and axle go down through it by the plate's thickness, so the car rides as before.
  if (path.endsWith('.onTop')) { const b = find(d.pod, 'base').params; b.drop = b.onTop ? -find(d.chassis, 'outline').params.thickness : 0; }
  // A gear that would run into the rear tyre: the pod moves over as far as it takes to free it.
  // (An axle tube sets the spread of the uprights, and the gear sits outside them: it is placed again too.)
  const tubeMoved = /\.(tube|tubeLen|form|ballW)$/.test(path) && find(d.pod, 'uprights').params.tube;
  if ((path === 'drivetrain.layout' || path === 'drivetrain.gear' || path === 'drivetrain.drives' || tubeMoved) && !d.pod.imported) find(d.pod, 'base').params.sideways = podSideways(d);
  if (path.endsWith('.guide')) { const f = find(d.chassis, 'guide'); f.params.hole = guideOf(d, f.params.guide)?.hole ?? f.params.hole; }
  if (path.endsWith('.bearing')) { const f = find(d.pod, 'uprights'); f.params.seat = bearingOf(d, f.params.bearing)?.seat ?? f.params.seat; }
  // The rear of the car moves with the rear axle.
  if (path === 'car.wheelbase') moveRear(d, JSON.parse(lastSnap).car.wheelbase, d.car.wheelbase);
}

function onChange(e) {
  const el = e.target;
  if (el.id === 'name') { state.design.name = el.value.trim() || 'New chassis'; return commit(); }
  if (el.id === 'file') return openFile(el);
  const path = el.dataset.path;
  if (!path) return;
  if (el.type === 'checkbox') setPath(path, el.checked);
  else if (el.tagName === 'SELECT') setPath(path, el.value);
  else {
    let v = parseFloat(el.value.replace(',', '.'));
    if (!Number.isFinite(v)) return renderPanel();
    if (el.dataset.in) v = round(v * 25.4, 3); // typed in inches, kept in millimetres
    if (el.dataset.int) v = Math.round(v);
    if (el.dataset.neg) v = -v;
    if (el.dataset.min !== undefined) v = Math.max(+el.dataset.min, v);
    if (el.dataset.max !== undefined) v = Math.min(+el.dataset.max, v);
    if (el.dataset.one) v -= 1;
    setPath(path, v);
  }
  if (path.startsWith('ui.')) return renderPanel(); // not a change to the design
  afterChange(path);
  commit();
}

async function openFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!state.saved && !confirm('Open another design? Changes that are not saved to a file will be lost.')) return;
  try {
    const { design, lost } = await readProject(await file.text());
    replaceDesign(design);
    toast(lost.length ? `Opened ${file.name}, but the imported ${lost.join(' and ')} had no usable model and was left out.` : `Opened ${file.name}.`, lost.length > 0);
  } catch (e) {
    toast(e.message, true);
  }
}

// Dragging handles in the top view.
function startDrag(e, el) {
  const svg = $('#topview'), d = state.design, kind = el.dataset.drag, i = +el.dataset.i;
  const at = (ev) => {
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return [round(p.x, 1), round(p.y, 1)];
  };
  if (kind === 'point') { state.selPoint = i; renderPanel(); }
  let moved = false;
  const move = (ev) => {
    const [x, y] = at(ev);
    moved = true;
    if (kind === 'point') {
      const pts = find(d.chassis, 'outline').params.points, last = i === 0 || i === pts.length - 1;
      pts[i] = [x, last ? 0 : Math.max(0, y)];
    } else if (kind === 'guide') Object.assign(find(d.chassis, 'guide').params, { along: x, side: Math.abs(y) < 0.6 ? 0 : y });
    else if (kind === 'post') Object.assign(find(d.chassis, 'bodyMounts').params.posts[i], { along: x, side: Math.abs(y) < 0.6 ? 0 : Math.abs(y) });
    else if (kind === 'cross') find(d.chassis, 'fill').params.cross[i] = x;
    else if (kind === 'line') find(d.chassis, el.dataset.type).params[el.dataset.type === 'split' ? 'along' : 'fold'] = x;
    else if (kind === 'shape') {
      const p = d.chassis.features.find((f) => f.id === el.dataset.f)?.params, k = el.dataset.k;
      if (!p) return;
      if (k === 'pt') p.points[i] = [x, y];
      else if (k === 'x0' || k === 'x1') { p[k] = x; p.side = Math.abs(y) < 0.6 ? 0 : Math.abs(y); }
      else if (k === 'along') p.along = x;
      else if (k === 'c0') { p.x0 = x; p.y0 = y; }
      else if (k === 'c1') { p.x1 = x; p.y1 = y; }
    }
    topSVG();
  };
  const up = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    if (moved) commit();
    else topSVG();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  e.preventDefault();
}

function wire() {
  const app = $('#app');
  app.addEventListener('click', (e) => {
    // Measuring: a click in the top view sets a place, and does nothing else.
    if (state.measure.on && e.target.closest('#topview')) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform($('#topview').getScreenCTM().inverse()), at = [round(p.x, 1), round(p.y, 1)];
      if (!state.measure.a || state.measure.b) Object.assign(state.measure, { a: at, b: null });
      else state.measure.b = at;
      return renderView();
    }
    const el = e.target.closest('[data-act]');
    if (!el) {
      const pick = e.target.closest('[data-pick]');
      if (pick) { if (pick.dataset.id) state.sel[pick.dataset.pick] = pick.dataset.id; setTool(pick.dataset.pick); render(); }
      if (state.pop) { state.pop = null; renderTop(); }
      return;
    }
    if (el.matches('input[type=checkbox]')) return; // handled on change
    if (el.dataset.act !== 'pop' && state.pop && !el.closest('.popmenu')) { state.pop = null; renderTop(); }
    ACTIONS[el.dataset.act]?.(el);
  });
  app.addEventListener('change', (e) => {
    if (e.target.matches('input[type=checkbox][data-act=toggle]')) return ACTIONS.toggle(e.target);
    onChange(e);
  });
  app.addEventListener('focusin', (e) => {
    if (e.target.dataset?.point !== undefined && state.selPoint !== +e.target.dataset.point) {
      state.selPoint = +e.target.dataset.point;
      if (state.view === 'top') topSVG();
    }
  });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) e.target.blur();
    // Tab out of a changed field re-draws the panel; remember which field comes next.
    if (e.key === 'Tab' && e.target.closest('#panel')) {
      const fields = [...document.querySelectorAll('#panel [data-path]')], i = fields.indexOf(e.target);
      state.focusNext = fields[i + (e.shiftKey ? -1 : 1)]?.dataset.path ?? null;
    }
  });
  addEventListener('pointerdown', () => { pointerDown = true; }, true);
  addEventListener('pointerup', () => {
    pointerDown = false;
    setTimeout(() => {
      if (!renderDue) return;
      renderDue = false;
      render();
    }, 0);
  }, true);
  $('#file').addEventListener('change', onChange);
  const bodyFile = Object.assign(document.createElement('input'), { type: 'file', id: 'bodyfile', accept: '.stl', hidden: true });
  document.body.append(bodyFile);
  bodyFile.addEventListener('change', async () => {
    const file = bodyFile.files?.[0];
    bodyFile.value = '';
    if (!file) return;
    try {
      const mesh = readSTL(new Uint8Array(await file.arrayBuffer()));
      const key = 'b' + Date.now().toString(36);
      state.meshes[key] = mesh;
      state.design.body = { mesh: key, name: file.name.replace(/\.stl$/i, '').slice(0, 80), shift: 0, lift: rideClearance(state.design), ...bodyGuess(mesh) };
      state.show.body = true;
      commit();
      toast('Body loaded. If it lies wrong, set "Up in the file" or turn it.');
    } catch (e) {
      toast(`That body could not be read: ${e.message}`, true);
    }
  });
  app.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('[data-drag]');
    if (el && !state.measure.on) startDrag(e, el);
  });
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ACTIONS.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); ACTIONS.redo(); }
    else if (k === 's') { e.preventDefault(); ACTIONS.save(); }
  });
}

applyThemeState(state.theme);
// The tab's icon, from the picture built into the page (a link in index.html would leave a loose file).
document.head.append(Object.assign(document.createElement('link'), { rel: 'icon', href: iconUrl }));
skeleton();
dialogs = createDialogs({ state, call, commit, toast, download, useMesh });
globalThis.UpdateUI?.start({ settings: updatesHolder, say: (message, bad) => toast(message, !!bad), appName: 'Frame', keeps: 'your designs, library and settings stay where they are' });
wire();
render();
// Pick up where the last session stopped.
(async () => {
  try {
    const text = localStorage.getItem(AUTOSAVE);
    if (text) {
      const { design } = await readProject(text);
      state.design = design;
      lastSnap = JSON.stringify(design);
      render();
    }
  } catch { /* a damaged autosave is ignored; the default design stays */ }
  rebuild(0);
})();
// For the desktop start-up test and for debugging.
window.slotforgeFrame = { state, ready: () => engineReady };
