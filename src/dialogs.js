// The Library window and the Import STL window (Workshop Windows, as in the design preview).
import { library } from './library.js';
import { cleanItem, encodeShare, decodeShare, packMesh, unpackMesh, thumbOf, newItemId } from './library-core.js';
import { readSTL, orient, guessOrientation, UPS } from './geometry/stl-read.js';
import { pickMounts } from './geometry/mesh-measure.js';
import { cleanInsert, LAYER_NAMES } from './inserts.js';
import { cleanPart, round, motorOf, gearOf, find, adopt, moveRear, meshCentre, useBearing, FEATURE_NAMES } from './model.js';
import { KINDS as COMPONENTS, COMPONENT_KINDS, builtins } from './components.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ico = (id) => `<svg class="ico"><use href="#i-${id}"/></svg>`;
const f2 = (v) => (Number.isFinite(v) ? String(round(v, 2)) : '–');
const when = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// ctx: { state, call, commit, toast, download, useMesh(key, mesh), insertKey() }
export function createDialogs(ctx) {
  const host = Object.assign(document.createElement('div'), { id: 'dialog' });
  document.body.append(host);
  const libFile = Object.assign(document.createElement('input'), { type: 'file', accept: '.framelib,.json', hidden: true });
  const stlFile = Object.assign(document.createElement('input'), { type: 'file', accept: '.stl', hidden: true });
  document.body.append(libFile, stlFile);
  let dlg = null; // { type: 'library' | 'import', … }

  const close = () => { dlg = null; host.innerHTML = ''; };
  const fail = (e) => ctx.toast(e?.message ?? String(e), true);

  // ------------------------------------------------------------ library

  const isComponent = (kind) => COMPONENT_KINDS.includes(kind);

  async function openLibrary(kind = 'pod') {
    dlg = { type: 'library', kind, sel: null, items: [], filter: 'all' };
    await refresh();
  }
  async function refresh() {
    if (dlg?.type !== 'library') return;
    try {
      dlg.items = await library.list();
    } catch (e) {
      fail(e);
    }
    const shown = visible();
    if (!shown.some((x) => x.id === dlg.sel)) dlg.sel = shown[0]?.id ?? null;
    drawLibrary();
  }
  // What the list shows: your own entries, and for components the built-in ones after them.
  function visible() {
    const mine = dlg.items.filter((x) => x.kind === dlg.kind);
    if (!isComponent(dlg.kind)) return mine.filter((x) => dlg.filter === 'all' || x.source === dlg.filter);
    const built = builtins(dlg.kind).map(({ id, ...data }) => ({ id: 'builtin:' + id, kind: dlg.kind, name: data.name, builtin: true, data }));
    return dlg.filter === 'made' ? mine : dlg.filter === 'builtin' ? built : [...mine, ...built];
  }
  const current = () => visible().find((x) => x.id === dlg.sel) ?? null;

  const KIND_NAME = { pod: 'Pod', chassis: 'Chassis', insert: 'Wheel insert' };
  function thumb(item) {
    const t = item.thumb;
    if (!t) return `<svg viewBox="0 0 70 30"><text x="35" y="18" text-anchor="middle" class="lbl">No picture</text></svg>`;
    return `<svg viewBox="${t.vb.map(Number).join(' ')}" preserveAspectRatio="xMidYMid meet"><path class="${item.kind === 'pod' ? 'pod shape' : 'plate fill'}" fill-rule="evenodd" d="${esc(t.d)}"/></svg>`;
  }
  function details(item) {
    const d = item.data, rows = [['Kind', KIND_NAME[item.kind]], ['Scale', item.scale], ['Source', item.source === 'imported' ? 'Imported STL' : 'Made here']];
    if (item.kind === 'insert') {
      const b = d.insert.base;
      rows.push(['Diameter', `Ø${f2(b.od)} × ${f2(b.thick)}`], ['For a wheel of', `Ø${f2(b.wheelD)}, pocket Ø${f2(b.pocketD)}`], ['Pattern', d.insert.layers.map((l) => LAYER_NAMES[l.type]).join(', ') || 'plain']);
    } else if (d.imported) {
      if (item.kind === 'pod') rows.push(['Screw points', d.imported.mounts.length], ['Axle from front', f2(d.imported.axleX)], ['Axle height', f2(d.imported.axleZ)]);
      else rows.push(['Size', `${f2(d.imported.size[0])} × ${f2(d.imported.size[1])}`], ['Front axle from front', f2(d.imported.frontX)]);
    } else if (item.kind === 'pod') {
      const fake = { drivetrain: d.drivetrain, custom: d.custom };
      rows.push(['Layout', d.drivetrain.layout], ['Motor', motorOf(fake).name], ['Gears', `${gearOf(fake).gearT} / ${gearOf(fake).pinionT}`], ['Offset', f2(d.drivetrain.offset)]);
    } else rows.push(['Wheelbase', f2(d.car.wheelbase)], ['Features', d.features.length], ['Shaping', d.features.filter((f) => !['outline', 'podOpening', 'fill', 'guide', 'frontAxle', 'podMounts', 'bodyMounts', 'kickup', 'profile', 'kickfront', 'split'].includes(f.type)).map((f) => FEATURE_NAMES[f.type]).join(', ') || 'none']);
    rows.push(['Changed', when(item.updated)]);
    return rows.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('');
  }

  // The right-hand column for a component: its values, to read (built in) or to edit (your own).
  function componentDetail(cur) {
    const k = COMPONENTS[cur.kind], c = cur.data;
    const tag = k.noConfirm ? '' : `<span class="pill ${c.confirmed ? 'ok' : 'un'}">${c.confirmed ? 'Published or measured' : 'Unconfirmed'}</span>`;
    if (cur.builtin)
      return `<div><span class="eyebrow">${k.one} · built in</span><div class="cond">${esc(c.name)}</div></div>
        <div class="kv">${Object.entries(k.choices ?? {}).map(([key, opts]) => `<span>${key === 'layout' ? 'Layout' : key === 'material' ? 'Material' : 'Scale'}</span><b>${esc(opts[c[key]] ?? '')}</b>`).join('')}${k.fields.map(([key, label, , unit]) => `<span>${label}</span><b>${f2(c[key] ?? 0)}${unit ? ' ' + unit : ''}</b>`).join('')}</div>
        <div class="row">${tag}</div>
        <div class="note">Built-in entries cannot be changed. <b>Duplicate to edit</b> makes a copy of your own that you can.</div>`;
    return `<div><span class="eyebrow">${k.one} · yours</span>
        <input class="name" data-d="cname" value="${esc(c.name)}" aria-label="Name" spellcheck="false" style="font: italic 700 20px/1.1 var(--font-title); text-transform: uppercase; width: 100%; background: none; border: 0; border-bottom: 1px dashed var(--line); color: var(--ink); padding: 2px 0"></div>
      ${Object.entries(k.choices ?? {}).map(([key, opts]) => `<label class="fx">${key === 'layout' ? 'Layout' : key === 'material' ? 'Material' : 'Scale'}<select class="num" data-d="cchoice" data-key="${key}">${Object.entries(opts).map(([v, t]) => `<option value="${esc(v)}" ${v === c[key] ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`).join('')}
      <div class="g2">${k.fields.map(([key, label, , unit]) => `<label class="fx">${label}<span class="num"><input data-d="cfield" data-key="${key}" value="${f2(c[key])}" inputmode="decimal">${unit ? `<small>${unit}</small>` : ''}</span></label>`).join('')}</div>
      ${k.noConfirm ? '' : `<label class="chk"><input type="checkbox" data-d="cconfirm" ${c.confirmed ? 'checked' : ''}>I measured these, or the maker publishes them</label><div class="row">${tag}</div>`}
      <div class="note">Changes are kept as you make them. A design that already uses this ${k.one.toLowerCase()} keeps its own copy until you use it again.</div>`;
  }

  function drawLibrary() {
    const shown = visible(), cur = current(), comp = isComponent(dlg.kind), k = comp ? COMPONENTS[dlg.kind] : null;
    const count = (kind) => dlg.items.filter((x) => x.kind === kind).length + (isComponent(kind) ? builtins(kind).length : 0);
    const design = ctx.state.design;
    const cat = (kind, label) => `<button class="${dlg.kind === kind ? 'on' : ''}" data-d="kind" data-kind="${kind}">${label}<small>${count(kind)}</small></button>`;
    const filters = comp ? [['all', 'All'], ['made', 'Yours'], ['builtin', 'Built in']] : [['all', 'All'], ['made', 'Made here'], ['imported', 'Imported']];
    const list = !shown.length
      ? `<div class="note">${comp ? `None of your own yet. <b>New ${k.one.toLowerCase()}</b> starts one, or duplicate a built-in one to change it.` : `No ${{ pod: 'pods', chassis: 'chassis', insert: 'wheel inserts' }[dlg.kind]} here yet. Add this design's ${dlg.kind}${dlg.kind === 'insert' ? '' : ', import an STL'}, or open a library file someone shared with you.`}</div>`
      : comp
        ? `<div class="plist tall">${shown.map((x) => `<div class="prow ${x.id === dlg.sel ? 'cur' : ''}" data-d="sel" data-id="${esc(x.id)}"><span>${esc(x.data.name)}<small>${esc(k.line(x.data))}</small></span>${x.builtin ? '<span class="pill">Built in</span>' : '<span class="pill ok">Yours</span>'}${k.noConfirm || x.data.confirmed ? '' : '<span class="pill un">Unconfirmed</span>'}</div>`).join('')}</div>`
        : `<div class="cards">${shown.map((x) => `<div class="card2 ${x.id === dlg.sel ? 'on' : ''}" data-d="sel" data-id="${esc(x.id)}"><div class="thumb">${thumb(x)}</div><b>${esc(x.name)}</b><small>${x.source === 'imported' ? 'Imported STL' : 'Made here'} · ${esc(x.scale)}</small></div>`).join('')}</div>`;
    const detail = !cur ? '<div class="muted">Nothing chosen.</div>'
      : comp ? componentDetail(cur) + (dlg.kind === 'car' && cur.data.scale !== design.scale ? `<div class="note warn">This car is ${esc(cur.data.scale)}; the design is ${esc(design.scale)}. Only the wheelbase is taken over.</div>` : '')
      : `<div><span class="eyebrow">${KIND_NAME[cur.kind]}</span>
            <input class="name" data-d="rename" value="${esc(cur.name)}" aria-label="Name" spellcheck="false" style="font: italic 700 20px/1.1 var(--font-title); text-transform: uppercase; width: 100%; background: none; border: 0; border-bottom: 1px dashed var(--line); color: var(--ink); padding: 2px 0"></div>
          <div class="kv">${details(cur)}</div>
          ${cur.kind === 'insert' ? `<div class="note">Using this insert replaces the one you are editing in Inserts (the ${ctx.insertKey()} insert). The chassis and the pod stay.</div>` : cur.kind === 'chassis' ? `<div class="note">Using this chassis replaces the current chassis and the car's sizes. The pod stays.</div>` : `<div class="note">Using this pod replaces the current pod${cur.data.imported ? '' : ' and drivetrain'}. The chassis follows it.</div>`}
          ${cur.scale !== design.scale ? `<div class="note warn">This part is ${esc(cur.scale)}; the design is ${esc(design.scale)}.</div>` : ''}`;
    const own = cur && !cur.builtin;
    host.innerHTML = `<div class="scrim" data-d="scrim"><div class="win" role="dialog" aria-label="Library">
      <header><div><span class="eyebrow">Parts library · ${library.where() === 'file' ? 'kept in a file on this computer' : 'kept in this browser'}</span><h2 class="sf-title">Library</h2></div>
        <span style="margin-left:auto"></span><button class="btn icon" data-d="close" title="Close">${ico('x')}</button></header>
      <div class="body">
        <div class="cats">
          <span class="eyebrow" style="padding:4px 9px">Made and imported</span>
          ${cat('pod', 'Pods')}${cat('chassis', 'Chassis')}${cat('insert', 'Wheel inserts')}
          <span class="eyebrow" style="padding:10px 9px 4px">Components</span>
          ${COMPONENT_KINDS.filter((c) => COMPONENTS[c].group === 'Components').map((c) => cat(c, COMPONENTS[c].many)).join('')}
          <span class="eyebrow" style="padding:10px 9px 4px">Setup</span>
          ${COMPONENT_KINDS.filter((c) => COMPONENTS[c].group === 'Setup').map((c) => cat(c, COMPONENTS[c].many)).join('')}
          <span class="eyebrow" style="padding:10px 9px 4px">Add</span>
          <button data-d="save" data-kind="pod">${ico('plus')}<span style="flex:1;margin-left:6px">This design's pod</span></button>
          <button data-d="save" data-kind="chassis">${ico('plus')}<span style="flex:1;margin-left:6px">This design's chassis</span></button>
          <button data-d="save" data-kind="insert">${ico('plus')}<span style="flex:1;margin-left:6px">This design's ${ctx.insertKey()} insert</span></button>
          <button data-d="stl">${ico('import')}<span style="flex:1;margin-left:6px">Import an STL</span></button>
          <span class="eyebrow" style="padding:10px 9px 4px">Share</span>
          <button data-d="importfile">${ico('open')}<span style="flex:1;margin-left:6px">Open a library file</span></button>
          <button data-d="exportall" ${dlg.items.length ? '' : 'disabled'}>${ico('export')}<span style="flex:1;margin-left:6px">Export the whole library</span></button>
        </div>
        <div class="list">
          <div class="row"><div class="seg">${filters.map(([v, t]) => `<button class="${dlg.filter === v ? 'on' : ''}" data-d="filter" data-filter="${v}">${t}</button>`).join('')}</div>
            ${comp ? `<button class="btn sm ghost" data-d="newcomp" style="margin-left:auto">${ico('plus')}New ${k.one.toLowerCase()}</button>` : ''}</div>
          ${list}
        </div>
        <div class="detail">${detail}</div>
      </div>
      <footer>
        <button class="btn danger" data-d="delete" ${own ? '' : 'disabled'}>${ico('trash')}Delete</button>
        <span class="sp2"></span>
        ${comp ? `<button class="btn ghost" data-d="dup" ${cur ? '' : 'disabled'}>Duplicate to edit</button>` : ''}
        <button class="btn ghost" data-d="export" ${own ? '' : 'disabled'}>${ico('export')}Export this ${comp ? 'entry' : 'part'}</button>
        <button class="btn primary" data-d="use" ${cur ? '' : 'disabled'}>Use in this design</button>
      </footer></div></div>`;
  }

  // Makes a library item from the open design.
  function itemFromDesign(kind) {
    const { design, built, meshes } = ctx.state;
    if (kind === 'insert') {
      const key = ctx.insertKey(), built = ctx.state.insBuilt;
      const top = built?.key === JSON.stringify([design.inserts[key], design.printer.nozzle, design.car.axleD]) ? built.data?.top : null;
      return cleanItem({ kind, name: `${design.name} ${key} insert`, scale: design.scale, updated: Date.now(), thumb: top?.length ? thumbOf(top) : null, data: { insert: design.inserts[key] } }, cleanPart);
    }
    const part = design[kind], imp = part.imported;
    const data = kind === 'pod'
      ? (imp ? { imported: imp } : { scale: design.scale, drivetrain: design.drivetrain, features: part.features, custom: design.custom })
      : { scale: design.scale, car: design.car, rules: design.rules, features: part.features, custom: design.custom, ...(imp ? { imported: imp } : {}) };
    const top = built?.top?.[kind];
    return cleanItem({
      kind, name: imp ? imp.name : `${design.name} ${kind}`, scale: design.scale, updated: Date.now(),
      thumb: top?.length ? thumbOf(top) : null, data, mesh: imp && meshes[imp.mesh] ? packMesh(meshes[imp.mesh]) : null,
    }, cleanPart);
  }

  async function useItem(id) {
    const stored = await library.get(id);
    if (!stored) throw Error('This part is no longer in the library.');
    const item = cleanItem(stored, cleanPart), d = ctx.state.design, data = item.data;
    let key = null;
    if (data.imported) {
      key = 'm' + newItemId();
      await ctx.useMesh(key, unpackMesh(item.mesh));
    }
    // Components the part brings with it become the design's own.
    for (const [kind, set] of Object.entries(data.custom ?? {})) for (const [cid, c] of Object.entries(set)) adopt(d, kind, cid, c);
    if (item.kind === 'insert') d.inserts[ctx.insertKey()] = cleanInsert(data.insert, d.scale);
    else if (item.kind === 'pod') {
      if (data.imported) d.pod.imported = { ...data.imported, mesh: key };
      else {
        delete d.pod.imported;
        d.drivetrain = data.drivetrain;
        d.pod.features = data.features;
      }
    } else {
      d.car = data.car;
      d.rules = data.rules;
      d.scale = item.scale;
      d.chassis = { features: data.features };
      if (data.imported) d.chassis.imported = { ...data.imported, mesh: key };
    }
    close();
    ctx.commit();
    ctx.toast(`Now using "${item.name}".`);
  }

  // Puts a component to work in the open design. Your own ones are copied into the design.
  function useComponent(row) {
    const d = ctx.state.design, kind = row.kind, c = cleanPart(kind, row.data), id = row.builtin ? row.id.slice(8) : row.id;
    if (!row.builtin) adopt(d, kind, id, c);
    if (kind === 'motor') d.drivetrain.motor = id;
    else if (kind === 'gear') Object.assign(d.drivetrain, { layout: c.layout, gear: id, centre: round(meshCentre(c, c.layout)), angle: null });
    else if (kind === 'bearing') { const p = find(d.pod, 'uprights').params; p.bearing = id; useBearing(p, c); }
    else if (kind === 'guide') Object.assign(find(d.chassis, 'guide').params, { guide: id, hole: c.hole });
    else if (kind === 'printer') d.printer = { name: c.name, material: c.material, nozzle: c.nozzle, holeFix: c.holeFix, boreFix: c.boreFix, minWall: c.minWall, bridge: c.bridge, overhang: c.overhang };
    else if (kind === 'rules') d.rules = { maxWidth: c.maxWidth, guideLeadMax: c.guideLeadMax, minClearance: c.minClearance };
    else if (kind === 'car') {
      const from = d.car.wheelbase;
      d.car.wheelbase = c.wheelbase;
      moveRear(d, from, c.wheelbase);
    }
    close();
    ctx.commit();
    ctx.toast(`Now using "${c.name}".`);
  }
  // Stores a component of your own and shows it.
  async function keepComponent(kind, data, id = newItemId()) {
    const item = cleanItem({ kind, data, updated: Date.now() }, cleanPart);
    item.id = id;
    await library.put(item);
    dlg.kind = kind;
    dlg.sel = id;
    if (dlg.filter === 'builtin') dlg.filter = 'all';
    await refresh();
    return item;
  }
  // Changes one value of the chosen component of your own.
  async function editComponent(change) {
    const cur = current();
    if (!cur || cur.builtin) return;
    const stored = await library.get(cur.id);
    if (!stored) return;
    const data = { ...stored.data };
    change(data);
    await keepComponent(cur.kind, data, cur.id);
  }

  const LIB = {
    close,
    scrim(el, e) { if (e.target === el) close(); },
    kind(el) { dlg.kind = el.dataset.kind; dlg.sel = null; dlg.filter = 'all'; refresh(); },
    filter(el) { dlg.filter = el.dataset.filter; refresh(); },
    sel(el) { dlg.sel = el.dataset.id; drawLibrary(); },
    async save(el) {
      const item = itemFromDesign(el.dataset.kind);
      await library.put(item);
      dlg.kind = item.kind;
      dlg.sel = item.id;
      dlg.filter = 'all';
      await refresh();
      ctx.toast(`Added "${item.name}" to the library.`);
    },
    async newcomp() { await keepComponent(dlg.kind, COMPONENTS[dlg.kind].fresh); },
    async dup() {
      const cur = current();
      if (cur) await keepComponent(cur.kind, { ...cur.data, name: `${cur.data.name} (copy)`.slice(0, 80), confirmed: false });
    },
    async delete() {
      const cur = current();
      if (!cur || cur.builtin || !confirm(`Delete "${cur.name}" from the library? This cannot be undone.`)) return;
      await library.remove(cur.id);
      await refresh();
    },
    async export() {
      const item = await library.get(dlg.sel);
      if (item) ctx.download(encodeShare([item]), `${item.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'part'}.framelib`, 'application/json');
    },
    async exportall() {
      const all = await library.all();
      ctx.download(encodeShare(all), 'SlotForge Frame library.framelib', 'application/json');
      ctx.toast(`Exported ${all.length} part${all.length === 1 ? '' : 's'}.`);
    },
    importfile() { libFile.click(); },
    stl() { stlFile.click(); },
    use() {
      const cur = current();
      if (!cur) return;
      return isComponent(cur.kind) ? useComponent(cur) : useItem(cur.id);
    },
  };

  libFile.addEventListener('change', async () => {
    const file = libFile.files?.[0];
    libFile.value = '';
    if (!file) return;
    try {
      const { items, skipped } = decodeShare(await file.text(), cleanPart);
      for (const item of items) await library.put(item);
      if (dlg?.type === 'library') { dlg.kind = items[0].kind; dlg.sel = items[0].id; dlg.filter = 'all'; }
      await refresh();
      ctx.toast(`Added ${items.length} part${items.length === 1 ? '' : 's'} from ${file.name}.` + (skipped.length ? ` ${skipped.length} could not be read.` : ''), skipped.length > 0);
    } catch (e) {
      fail(e);
    }
  });

  // ------------------------------------------------------------ import STL

  stlFile.addEventListener('change', async () => {
    const file = stlFile.files?.[0];
    stlFile.value = '';
    if (!file) return;
    try {
      const raw = readSTL(new Uint8Array(await file.arrayBuffer()));
      const guess = guessOrientation(raw);
      dlg = {
        type: 'import', raw, fileName: file.name, name: file.name.replace(/\.stl$/i, '').slice(0, 80), kind: /chassis/i.test(file.name) ? 'chassis' : 'pod',
        up: guess.up, turn: guess.turn, scale: 1, info: null, mesh: null, mounts: [], holeD: 1.8, axleX: 0, axleZ: 7.5, frontX: 0, busy: true, error: null, fresh: true,
      };
      drawImport();
      await analyse();
    } catch (e) {
      fail(e);
    }
  });

  async function analyse() {
    const d = dlg;
    d.busy = true;
    d.error = null;
    drawImport();
    try {
      const stood = orient(d.raw, { up: d.up, turn: d.turn, scale: d.scale });
      const info = await ctx.call('analyse', { positions: stood.positions, indices: stood.indices });
      if (dlg !== d) return;
      // Put the screw points' middle on the centre line, when four were found.
      const picked = pickMounts(info.holes);
      const shift = d.kind === 'pod' && picked.length === 4 ? -picked.reduce((a, h) => a + h.y, 0) / 4 : 0;
      if (Math.abs(shift) > 0.01) {
        for (let i = 1; i < stood.positions.length; i += 3) stood.positions[i] += shift;
        for (const h of info.holes) h.y = round(h.y + shift);
        info.outline = info.outline.map((ring) => ring.map(([x, y]) => [x, round(y + shift)]));
      }
      d.mesh = stood;
      d.info = info;
      const chosen = new Set(pickMounts(info.holes));
      d.mounts = info.holes.map((h) => ({ x: h.x, y: h.y, d: h.d, on: chosen.has(h) }));
      const rear = Math.max(...d.mounts.filter((m) => m.on).map((m) => m.x), -Infinity);
      d.holeD = d.mounts.find((m) => m.on)?.d ?? 1.8;
      d.axleX = round(Number.isFinite(rear) ? rear - 6.6 : info.tallestX);
      d.frontX = round(info.size[0] * 0.2);
      d.fresh = false;
    } catch (e) {
      if (dlg !== d) return;
      d.info = null;
      d.mesh = null;
      d.error = e.message;
    }
    d.busy = false;
    drawImport();
  }

  function drawImport() {
    const d = dlg, info = d.info, pod = d.kind === 'pod';
    let picture = `<div class="note">${d.busy ? 'Reading the model…' : esc(d.error ?? '')}</div>`;
    if (info) {
      const [L, W] = info.size, pad = 6;
      const path = info.outline.map((ring) => 'M' + ring.map((p) => p.join(' ')).join('L') + 'Z').join('');
      const marks = pod
        ? d.mounts.map((m) => `<circle class="${m.on ? 'pod solid' : 'hole'}" cx="${m.x}" cy="${m.y}" r="${Math.max(0.9, m.d / 2)}"/>`).join('') + `<line class="part line" x1="${d.axleX}" y1="${-W / 2 - 3}" x2="${d.axleX}" y2="${W / 2 + 3}"/><text class="lbl" x="${d.axleX + 1}" y="${-W / 2 - 3.5}">rear axle</text>`
        : `<line class="part line" x1="${d.frontX}" y1="${-W / 2 - 3}" x2="${d.frontX}" y2="${W / 2 + 3}"/><text class="lbl" x="${d.frontX + 1}" y="${-W / 2 - 3.5}">front axle</text>`;
      picture = `<svg class="imp" viewBox="${-pad} ${-W / 2 - pad - 4} ${L + 2 * pad} ${W + 2 * pad + 6}"><path class="${pod ? 'pod shape' : 'plate fill'}" fill-rule="evenodd" d="${path}"/>${marks}<text class="lbl" x="${-pad + 1}" y="${W / 2 + pad}">front</text><text class="lbl" x="${L + pad - 1}" y="${W / 2 + pad}" text-anchor="end">rear</text></svg>`;
    }
    const numf = (label, key, unit = 'mm') => `<label class="fx">${label}<span class="num"><input data-d="num" data-key="${key}" value="${f2(d[key])}" inputmode="decimal">${unit ? `<small>${unit}</small>` : ''}</span></label>`;
    host.innerHTML = `<div class="scrim" data-d="scrim"><div class="win imp" role="dialog" aria-label="Import an STL">
      <header><div><span class="eyebrow">Import · ${esc(d.fileName)}</span><h2 class="sf-title">Import an STL</h2></div><span style="margin-left:auto"></span><button class="btn icon" data-d="close" title="Close">${ico('x')}</button></header>
      <div class="body two">
        <div class="list">
          <div class="thumb big">${picture}</div>
          ${info ? `<div class="kv">${[['Size', `${f2(info.size[0])} × ${f2(info.size[1])} × ${f2(info.size[2])} mm`], ['Triangles', info.triangles.toLocaleString('en')], ['Round holes found', info.holes.length]].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>` : ''}
          <div class="note">The picture shows the part from above, front to the left. If it lies wrong, change <b>Up</b> or turn it.</div>
        </div>
        <div class="detail">
          <label class="f">Name<input data-d="text" data-key="name" value="${esc(d.name)}" style="height:30px;padding:0 8px" spellcheck="false"></label>
          <label class="f">This is a</label>
          <div class="seg"><button class="${pod ? 'on' : ''}" data-d="set" data-key="kind" data-v="pod">Motor pod</button><button class="${pod ? '' : 'on'}" data-d="set" data-key="kind" data-v="chassis">Chassis</button></div>
          <div class="g2">
            <label class="fx">Up in the file<select class="num" data-d="pick" data-key="up">${UPS.map((u) => `<option ${u === d.up ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
            <label class="fx">Units of the file<select class="num" data-d="pick" data-key="scale"><option value="1" ${d.scale === 1 ? 'selected' : ''}>Millimetres</option><option value="25.4" ${d.scale === 25.4 ? 'selected' : ''}>Inches</option></select></label>
          </div>
          <div class="row"><button class="btn sm ghost" data-d="turn" data-by="90">Quarter turn</button><button class="btn sm ghost" data-d="turn" data-by="180">Swap front and rear</button></div>
          <div class="hr"></div>
          ${info && pod ? `
            <label class="f">Screw points (ticked ones are used)</label>
            <div class="plist">${d.mounts.map((m, i) => `<label class="prow"><input type="checkbox" data-d="mount" data-i="${i}" ${m.on ? 'checked' : ''}><span>${f2(m.x)} from front · ${f2(m.y)} to the side<small>hole Ø${f2(m.d)}</small></span></label>`).join('') || '<div class="prow muted">No round holes found. Add the screw points by hand.</div>'}</div>
            <button class="btn sm ghost" data-d="addmount">${ico('plus')}Add a screw point by hand</button>
            <div class="g2">${numf('Rear axle, from the front', 'axleX')}${numf('Axle above the underside', 'axleZ')}${numf('Screw hole', 'holeD')}</div>
            <div class="note">The pod is placed with its rear axle on the car's rear axle. The chassis opening follows the pod's shape, and the chassis gets a mount at every ticked screw point.</div>` : ''}
          ${info && !pod ? `
            <div class="g2">${numf('Front axle, from the front', 'frontX')}</div>
            <div class="note">An imported chassis keeps its shape. You can add features to it and cut openings, windows and holes in it; its outline and fill cannot be changed.</div>` : ''}
        </div>
      </div>
      <footer><span class="sp2"></span><button class="btn ghost" data-d="add" ${info ? '' : 'disabled'}>Add to the library</button><button class="btn primary" data-d="adduse" ${info ? '' : 'disabled'}>Add and use in this design</button></footer></div></div>`;
  }

  function importedItem() {
    const d = dlg, info = d.info, pod = d.kind === 'pod';
    const placed = pod
      ? { mesh: 'lib', name: d.name, mounts: d.mounts.filter((m) => m.on).map((m) => [m.x, m.y]), holeD: d.holeD, axleX: d.axleX, axleZ: d.axleZ, box: [0, info.size[0], info.size[1]] }
      : { mesh: 'lib', name: d.name, frontX: d.frontX, size: info.size };
    const design = ctx.state.design;
    const data = pod ? { imported: placed } : { scale: design.scale, car: design.car, rules: design.rules, imported: placed, features: design.chassis.features.map((f) => (['guide', 'frontAxle', 'podMounts', 'bodyMounts', 'podOpening', 'kickup'].includes(f.type) ? { ...f, enabled: false } : f)).filter((f) => !['rib', 'wall', 'tunnel', 'panel', 'level', 'window', 'rail'].includes(f.type)) };
    return cleanItem({ kind: d.kind, name: d.name, scale: design.scale, updated: Date.now(), thumb: thumbOf(info.outline), data, mesh: packMesh(d.mesh) }, cleanPart);
  }

  const IMP = {
    close,
    scrim(el, e) { if (e.target === el) close(); },
    set(el) { dlg[el.dataset.key] = el.dataset.v; return analyse(); },
    turn(el) { dlg.turn = (dlg.turn + +el.dataset.by) % 360; return analyse(); },
    addmount() { dlg.mounts.push({ x: round(dlg.info.size[0] / 2), y: 10, d: dlg.holeD, on: true, hand: true }); drawImport(); },
    async add() { const item = importedItem(); await library.put(item); close(); ctx.toast(`Added "${item.name}" to the library.`); },
    async adduse() { const item = importedItem(); await library.put(item); await useItem(item.id); },
  };

  host.addEventListener('click', (e) => {
    const el = e.target.closest('[data-d]');
    if (!el || !dlg || el.matches('input, select')) return;
    Promise.resolve((dlg.type === 'library' ? LIB : IMP)[el.dataset.d]?.(el, e)).catch(fail);
  });
  host.addEventListener('change', (e) => {
    const el = e.target, d = dlg;
    if (!d) return;
    const run = async () => {
      if (d.type === 'library' && el.dataset.d === 'rename') {
        const item = await library.get(d.sel);
        if (!item) return;
        item.name = el.value.trim().slice(0, 80) || item.name;
        item.updated = Date.now();
        await library.put(item);
        return refresh();
      }
      if (d.type === 'library') {
        const what = el.dataset.d, key = el.dataset.key;
        if (what === 'cname') return editComponent((c) => { c.name = el.value; });
        if (what === 'cchoice') return editComponent((c) => { c[key] = el.value; });
        if (what === 'cconfirm') return editComponent((c) => { c.confirmed = el.checked; });
        if (what === 'cfield') {
          const v = parseFloat(el.value.replace(',', '.'));
          return Number.isFinite(v) ? editComponent((c) => { c[key] = v; }) : drawLibrary();
        }
        return;
      }
      if (d.type !== 'import') return;
      if (el.dataset.d === 'text') d[el.dataset.key] = el.value.trim().slice(0, 80) || d.name;
      else if (el.dataset.d === 'num') {
        const v = parseFloat(el.value.replace(',', '.'));
        if (Number.isFinite(v)) d[el.dataset.key] = v;
        drawImport();
      } else if (el.dataset.d === 'mount') { d.mounts[+el.dataset.i].on = el.checked; drawImport(); }
      else if (el.dataset.d === 'pick') { d[el.dataset.key] = el.dataset.key === 'scale' ? +el.value : el.value; await analyse(); }
    };
    run().catch(fail);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dlg) close();
  });

  return { openLibrary, importSTL: () => stlFile.click(), isOpen: () => !!dlg };
}
