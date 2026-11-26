// Editor metadata is optional. Geometry continues to use resolved millimetre coordinates.
export const COPY_TYPES = ['rib', 'wall', 'tunnel', 'panel', 'level', 'window', 'rail', 'holder', 'wire', 'chip', 'tab', 'cutout'];
export const MOVE_TYPES = COPY_TYPES.filter(t => t !== 'wall');
export const ANCHOR_TYPES = [...MOVE_TYPES, 'guide', 'frontAxle', 'bodyMounts', 'kickup', 'kickfront', 'profile', 'split'];
export const REFERENCES = { front: 'Front axle', rear: 'Rear axle', centre: 'Wheelbase centre' };
const rounded = n => Math.round(n * 1000) / 1000;
export const featuresOf = d => [...d.chassis.features, ...d.pod.features];
export const referenceX = (d, ref, wb = d.car.wheelbase) => ref === 'rear' ? wb : ref === 'centre' ? wb / 2 : 0;
export function featureCentre(f) {
  const p = f.params;
  if (p.points?.length) return [(Math.min(...p.points.map(q=>q[0])) + Math.max(...p.points.map(q=>q[0]))) / 2,
    f.type === 'profile' ? 0 : (Math.min(...p.points.map(q=>q[1])) + Math.max(...p.points.map(q=>q[1]))) / 2];
  if (p.posts?.length) return [p.posts.reduce((s,q)=>s+q.along,0)/p.posts.length, 0];
  return [p.along ?? p.fold ?? (p.x0 + p.x1) / 2, typeof p.side === 'number' ? p.side : Number.isFinite(p.y0) ? (p.y0+p.y1)/2 : 0];
}
export const movesSideways = f => MOVE_TYPES.includes(f.type) && !['panel','tab'].includes(f.type);
export function translateFeature(f, dx, dy = 0) {
  if (!ANCHOR_TYPES.includes(f.type)) throw Error('This feature follows its outline or drivetrain; edit its own settings.');
  if (![dx,dy].every(Number.isFinite) || Math.abs(dx)>1000 || Math.abs(dy)>1000) throw Error('Move by finite distances up to 1000 mm.');
  if (dy && !movesSideways(f) && f.type !== 'guide') throw Error('This feature can only move along the car.');
  const p = structuredClone(f.params);
  if (p.points) for (const q of p.points) { q[0]=rounded(q[0]+dx); if(f.type!=='profile')q[1]=rounded(q[1]+dy); }
  else if (p.posts) for (const q of p.posts) q.along=rounded(q.along+dx);
  else {
    for(const k of ['along','fold','x0','x1']) if(Number.isFinite(p[k]))p[k]=rounded(p[k]+dx);
    for(const k of ['side','y0','y1']) if(Number.isFinite(p[k]))p[k]=rounded(p[k]+dy);
  }
  const coordinates=[...(p.points??[]).flatMap(q=>f.type==='profile'?[q[0]]:q.slice(0,2)),...(p.posts??[]).map(q=>q.along),...['along','fold','x0','x1','side','y0','y1'].map(k=>p[k]).filter(v=>typeof v==='number')];
  if(coordinates.some(v=>!Number.isFinite(v)||Math.abs(v)>600))throw Error('Feature positions must stay between -600 and 600 mm.');
  f.params=p;
}
export function cleanEditor(raw, type) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  if(typeof raw.name==='string' && raw.name.trim())out.name=raw.name.trim().slice(0,60);
  if(COPY_TYPES.includes(type) && typeof raw.group==='string' && /^[\w-]{1,64}$/.test(raw.group)) {
    out.group=raw.group;
    out.groupName=typeof raw.groupName==='string'?raw.groupName.trim().slice(0,60):'Group';
  }
  const a=raw.anchor;
  if(ANCHOR_TYPES.includes(type) && a && Object.hasOwn(REFERENCES,a.reference) && Number.isFinite(a.offset) && Math.abs(a.offset)<=2000)
    out.anchor={reference:a.reference,offset:a.offset};
  return Object.keys(out).length?out:undefined;
}
export function setReference(d, f, reference, offset) {
  if(!ANCHOR_TYPES.includes(f.type))throw Error('This feature cannot use a position reference.');
  f.editor ??= {};
  if(reference==='legacy'){delete f.editor.anchor;return;}
  if(!Object.hasOwn(REFERENCES,reference))throw Error('Choose a reference from the list.');
  const base=referenceX(d,reference);
  offset ??= featureCentre(f)[0]-base;
  if(!Number.isFinite(offset)||Math.abs(offset)>2000)throw Error('Use an offset between -2000 and 2000 mm.');
  translateFeature(f,base+offset-featureCentre(f)[0]);
  f.editor.anchor={reference,offset:rounded(offset)};
}
export function syncReferences(d) {
  for(const f of featuresOf(d))if(f.editor?.anchor)f.editor.anchor.offset=rounded(featureCentre(f)[0]-referenceX(d,f.editor.anchor.reference));
}
// Capture before the legacy midpoint-based resizing; restore and translate as rigid features.
export const captureAnchored = (d, wheelbase = d.car.wheelbase) => d.chassis.features.filter(f=>f.editor?.anchor).map(f=>{const copy=structuredClone(f),a=f.editor.anchor;translateFeature(copy,referenceX(d,a.reference,wheelbase)+a.offset-featureCentre(copy)[0]);return {f,params:copy.params};});
export function restoreAnchored(d, saved, wheelbase) {
  for(const {f,params} of saved){f.params=params;const a=f.editor.anchor;translateFeature(f,referenceX(d,a.reference,wheelbase)+a.offset-featureCentre(f)[0]);}
}
export function operateSelection(d, ids, operation, {dx=0,dy=0,name='Group',newId}={}) {
  const selected=d.chassis.features.filter(f=>ids.includes(f.id));
  if(!selected.length)throw Error('Select at least one chassis feature.');
  if(selected.some(f=>!COPY_TYPES.includes(f.type)))throw Error('Select repeatable shaping features.');
  // Work on copies, so any rejected operation is atomic.
  const copies=selected.map(f=>structuredClone(f));
  if(['copy','mirror'].includes(operation) && d.chassis.features.filter(f=>COPY_TYPES.includes(f.type)).length+copies.length>80)throw Error('A design can contain at most 80 repeatable features.');
  if(operation==='group') {
    const group=newId();for(const f of copies)f.editor={...f.editor,group,groupName:name.trim().slice(0,60)||'Group'};
  } else if(operation==='ungroup') {
    for(const f of copies)if(f.editor){delete f.editor.group;delete f.editor.groupName;}
  } else if(operation==='mirror') {
    if(copies.some(f=>!movesSideways(f)||f.params.mirror))throw Error('Mirror-copy needs sideways-movable features with automatic Mirror switched off.');
    for(const f of copies){const p=f.params;if(p.points)for(const q of p.points)q[1]=-q[1];else if(Number.isFinite(p.side))p.side=-p.side;else [p.y0,p.y1]=[-p.y1,-p.y0];}
  } else if(operation==='align') {
    const x=featureCentre(copies[0])[0];for(const f of copies)translateFeature(f,x-featureCentre(f)[0]);
  } else if(operation==='distribute') {
    if(copies.length<3)throw Error('Select at least three features to distribute.');
    copies.sort((a,b)=>featureCentre(a)[0]-featureCentre(b)[0]);const a=featureCentre(copies[0])[0],b=featureCentre(copies.at(-1))[0];
    copies.forEach((f,i)=>translateFeature(f,a+(b-a)*i/(copies.length-1)-featureCentre(f)[0]));
  } else if(['move','copy'].includes(operation))for(const f of copies)translateFeature(f,dx,dy);
  else throw Error('Unknown arrangement operation.');
  if(['copy','mirror'].includes(operation)) {
    const groups=new Map();for(const f of copies){f.id=newId();if(f.editor?.group){if(!groups.has(f.editor.group))groups.set(f.editor.group,newId());f.editor.group=groups.get(f.editor.group);}}
    d.chassis.features.push(...copies);
  }else for(const f of copies)d.chassis.features[d.chassis.features.findIndex(q=>q.id===f.id)]=f;
  syncReferences(d);return copies.map(f=>f.id);
}
