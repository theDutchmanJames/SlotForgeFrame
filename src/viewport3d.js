// The 3D view: the printed parts as solids, the bought parts as a see-through preview.
import { installViewportTools } from './viewport-tools.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
// Colours may be written as color-mix(); let the browser resolve them.
function resolve(value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.append(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  const m = /rgba?\(([^)]+)\)/.exec(out);
  if (m) {
    const [r, g, b] = m[1].split(/[ ,/]+/).map(Number);
    return new THREE.Color(r / 255, g / 255, b / 255);
  }
  const c = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(out);
  return c ? new THREE.Color(+c[1], +c[2], +c[3]) : new THREE.Color('#888');
}

export function createViewport(host, { onPick, onMove, onMeasure } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 4000);
  camera.up.set(0, 0, 1);
  camera.position.set(-70, -150, 110);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(40, 0, 6);
  controls.enableDamping = false;
  controls.addEventListener('change', draw);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555560, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-80, -120, 220);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.6);
  back.position.set(120, 140, 60);
  scene.add(back);

  const mats = {
    chassis: new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.05 }),
    pod: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
    part: new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, opacity: 0.34, depthWrite: false }),
    body: new THREE.MeshStandardMaterial({ roughness: 0.7, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    insert: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 }),
    // On the car: the inserts in their wheels, and the aluminium wheels round them.
    carInsert: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }),
    rim: new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.75, side: THREE.DoubleSide }),
  };
  const groups = { chassis: new THREE.Group(), pod: new THREE.Group(), parts: new THREE.Group(), body: new THREE.Group(), track: new THREE.Group(), insert: new THREE.Group(), wheels: new THREE.Group() };
  for (const g of Object.values(groups)) scene.add(g);
  let grid = null;
  let shown = 'car', saved = null;
  groups.insert.visible = false;

  function colours() {
    mats.chassis.color = resolve(css('--c-plate', '#9aa3ad'));
    mats.pod.color = resolve(css('--accent', '#e5484d'));
    mats.insert.color = resolve(css('--c-plate', '#9aa3ad'));
    mats.carInsert.color = resolve(css('--accent', '#e5484d'));
    mats.rim.color = new THREE.Color('#b9bec6');
    mats.part.color = resolve(css('--c-part', '#6fb6ff'));
    mats.body.color = resolve(css('--ink', '#e8e6e1'));
    if (grid) { groups.track.remove(grid); grid.geometry.dispose(); }
    const line = resolve(css('--line', '#343b47'));
    grid = new THREE.GridHelper(300, 30, line, line);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.rotation.x = Math.PI / 2;
    grid.position.set(40, 0, 0);
    groups.track.add(grid);
    draw();
  }

  function clear(group) {
    for (const child of [...group.children]) {
      if (child === grid) continue;
      group.remove(child);
      child.geometry?.dispose();
    }
  }
  function setMesh(group, mesh, material) {
    clear(group);
    if (!mesh) return;
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo = toCreasedNormals(geo, (32 * Math.PI) / 180);
    group.add(new THREE.Mesh(geo, material));
  }

  // A cylinder whose axis lies along the car's Y (wheels, axles, gear) or at an angle in the XY plane.
  function cyl(d, len, x, y, z, angle = 90) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, len, 40), mats.part);
    mesh.rotation.z = ((angle - 90) * Math.PI) / 180; // three's cylinder runs along Y
    mesh.position.set(x, y, z);
    return mesh;
  }

  function setParts(p) {
    clear(groups.parts);
    if (!p) return;
    const g = groups.parts;
    for (const w of p.wheels) g.add(cyl(w.d, w.w, w.x, w.y, w.z));
    for (const a of p.axles) {
      if (a.inner == null) g.add(cyl(a.d, a.half * 2, a.x, 0, a.z));
      else for (const s of [1, -1]) g.add(cyl(a.d, a.half - a.inner, a.x, (s * (a.half + a.inner)) / 2, a.z));
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.motor.length, p.motor.width, p.motor.height), mats.part);
    m.rotation.z = (p.motor.angle * Math.PI) / 180;
    m.position.set(p.motor.x, p.motor.y, p.motor.z);
    g.add(m);
    const sl = Math.hypot(p.shaft.x1 - p.shaft.x0, p.shaft.y1 - p.shaft.y0);
    g.add(cyl(p.shaft.d, sl, (p.shaft.x0 + p.shaft.x1) / 2, (p.shaft.y0 + p.shaft.y1) / 2, p.shaft.z, p.motor.angle));
    g.add(cyl(p.pinion.d, p.pinion.length, p.pinion.x, p.pinion.y, p.pinion.z, p.pinion.angle));
    g.add(cyl(p.gear.d, p.gear.width, p.gear.x, p.gear.y, p.gear.z));
    if (p.gearBoss) g.add(cyl(p.gearBoss.d, p.gearBoss.width, p.gearBoss.x, p.gearBoss.y, p.gearBoss.z));
    for (const b of p.bushes ?? []) g.add(cyl(b.d, b.w, b.x, b.y, b.z));
    if (p.guide) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(p.guide.length, 1.8, 7), mats.part);
      blade.position.set(p.guide.x - 2, p.guide.y, -3.5);
      g.add(blade);
    }
  }

  // The wheels with their inserts, as they stand on the car. Each: { x, y, z, side (+1 right, -1 left), tyreW,
  // wheelD, pocketD, pocketDepth, mesh (the insert, back at z = 0 and face up), mirror }.
  function setWheels(list) {
    clear(groups.wheels);
    for (const w of list ?? []) {
      // The aluminium wheel: a disc as wide as the tyre with a pocket in its outer face, turned about the axle (three's Y).
      const R = w.wheelD / 2, P = Math.min(w.pocketD / 2, R - 0.1), half = w.tyreW / 2, pd = Math.min(w.pocketDepth, w.tyreW - 0.2);
      const prof = [[0.01, -half], [R, -half], [R, half], [P, half], [P, half - pd], [0.01, half - pd]].map(([r, y]) => new THREE.Vector2(r, y));
      const rim = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mats.rim);
      rim.scale.y = w.side;
      rim.position.set(w.x, w.y, w.z);
      groups.wheels.add(rim);
      if (!w.mesh) continue;
      // The insert: its back on the bottom of the pocket, its face out.
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(w.mesh.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(w.mesh.indices, 1));
      geo = toCreasedNormals(geo, (32 * Math.PI) / 180);
      const ins = new THREE.Mesh(geo, mats.carInsert);
      if (w.mirror) ins.scale.x = -1;
      ins.rotation.x = w.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      ins.position.set(w.x, w.y + w.side * (half - pd), w.z);
      groups.wheels.add(ins);
    }
    draw();
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  }
  function draw() {
    renderer.render(scene, camera);
  }
  const editor = installViewportTools({scene,camera,renderer,controls,groups,draw,onPick,onMove,onMeasure});
  new ResizeObserver(resize).observe(host);
  colours();

  return {
    canvas: renderer.domElement,
    setEditor: editor.set,
    projectPoint: editor.project,
    set({ chassis, pod, parts, target }) {
      setMesh(groups.chassis, chassis, mats.chassis);
      setMesh(groups.pod, pod, mats.pod);
      setParts(parts);
      // While an insert is shown, the car's camera is kept for when the car comes back.
      if (target && shown === 'insert' && saved) saved.target.set(target, 0, 6);
      else if (target) controls.target.set(target, 0, 6), controls.update();
      draw();
    },
    // The body from Anvil, see-through, or nothing.
    setBody(mesh) {
      setMesh(groups.body, mesh, mats.body);
      draw();
    },
    show({ chassis = true, pod = true, parts = true, track = true, body = true, solid = false }) {
      groups.body.visible = body;
      // The body as a see-through ghost, or solid, to judge how chassis and body fit.
      if (mats.body.transparent === solid) {
        Object.assign(mats.body, { transparent: !solid, opacity: solid ? 1 : 0.22, depthWrite: solid });
        mats.body.needsUpdate = true;
      }
      groups.chassis.visible = chassis;
      groups.pod.visible = pod;
      groups.parts.visible = parts;
      groups.track.visible = track;
      draw();
    },
    setWheels,
    showWheels(on) { groups.wheels.visible = on && shown === 'car'; draw(); },
    // A wheel insert, shown on its own (mode 'insert') with the camera close in; 'car' brings the car back.
    setInsert(mesh) {
      setMesh(groups.insert, mesh, mats.insert);
      draw();
    },
    mode(m) {
      if (m === shown) return;
      if (m === 'insert') {
        saved = { pos: camera.position.clone(), target: controls.target.clone(), vis: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.visible])) };
        for (const [k, g] of Object.entries(groups)) g.visible = k === 'insert';
      } else {
        groups.insert.visible = false;
        if (saved) {
          camera.position.copy(saved.pos);
          controls.target.copy(saved.target);
          for (const [k, g] of Object.entries(groups)) if (k !== 'insert') g.visible = saved.vis[k];
        }
      }
      shown = m;
      controls.update();
      draw();
    },
    // Puts the camera round a part of radius `r` centred at `c`, from the same side as for an insert.
    frame(r, c) {
      const k = r / 6;
      controls.target.set(c[0], c[1], c[2]);
      camera.position.set(c[0] - 9 * k, c[1] - 16 * k, c[2] + 15 * k);
      controls.update();
      draw();
    },
    colours,
    resize,
  };
}
