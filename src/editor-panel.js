import { ANCHOR_TYPES, COPY_TYPES, REFERENCES } from './feature-tools.js';
import { FEATURE_NAMES } from './model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function referencePanel(f) {
  if(!f||!ANCHOR_TYPES.includes(f.type))return '';
  const a=f.editor?.anchor;
  return `<div class="editor-card"><h3>Position reference</h3><label class="f">Feature name<input data-editor-name="${f.id}" maxlength="60" value="${esc(f.editor?.name||'')}"></label>
    <label class="f">Position along the car<select data-editor-ref="${f.id}"><option value="legacy" ${!a?'selected':''}>Existing resize behaviour</option>${Object.entries(REFERENCES).map(([id,name])=>`<option value="${id}" ${a?.reference===id?'selected':''}>${name}</option>`).join('')}</select></label>
    ${a?`<label class="f">Feature centre from reference (mm)<input type="number" step="0.1" min="-2000" max="2000" data-editor-offset="${f.id}" value="${a.offset}"></label>`:''}
    <div class="note">An explicit reference keeps the feature's size and offset when the wheelbase changes. Editing its position updates the offset. Paths use their bounding centre; body mounts use their mean position. In 3D, orange handles move along or across the car. Shift-click adds features to Arrange.</div></div>`;
}
export function arrangePanel(d,ids,form={dx:10,dy:0,name:'My assembly'}) {
  if(d.onePiece||d.chassis.imported)return '<div class="head"><div class="cond">Arrange features</div></div><p>Open an editable drawn chassis to arrange its features.</p>';
  const features=d.chassis.features.filter(f=>COPY_TYPES.includes(f.type)),groups=[...new Map(features.filter(f=>f.editor?.group).map(f=>[f.editor.group,f.editor.groupName])).entries()];
  return `<div class="head"><div class="cond">Arrange features</div></div><p>Select features below, or Shift-click features in 3D. All distances here are in millimetres.</p>
    <div class="editor-list">${features.map((f,i)=>`<label><input type="checkbox" data-editor-check="${f.id}" ${ids.includes(f.id)?'checked':''}>${esc(f.editor?.name||FEATURE_NAMES[f.type]+' '+(i+1))}${f.editor?.group?` <small>· ${esc(f.editor.groupName)}</small>`:''}</label>`).join('')||'<p>Add ribs, rails, pockets or other shaping features first.</p>'}</div>
    <p data-editor-count>${ids.filter(id=>features.some(f=>f.id===id)).length} selected</p>
    <div class="row">${groups.map(([id,name])=>`<button class="btn sm" data-act="editorgroupselect" data-group="${esc(id)}">${esc(name)}</button>`).join('')}</div>
    <div class="g2"><label class="f">Along Δ (mm)<input id="editor-dx" data-arrange="dx" type="number" value="${form.dx}" step="0.1"></label><label class="f">Side Δ (mm)<input id="editor-dy" data-arrange="dy" type="number" value="${form.dy}" step="0.1"></label></div>
    <div class="row"><button class="btn" data-act="editorop" data-op="move">Move selected</button><button class="btn" data-act="editorop" data-op="copy">Duplicate</button><button class="btn" data-act="editorop" data-op="mirror">Mirror copy</button></div>
    <div class="row"><button class="btn sm" data-act="editorop" data-op="align">Align along centres</button><button class="btn sm" data-act="editorop" data-op="distribute">Space along evenly</button></div>
    <label class="f">Group name<input id="editor-group-name" data-arrange="name" value="${esc(form.name)}" maxlength="60"></label><div class="row"><button class="btn" data-act="editorop" data-op="group">Group selected</button><button class="btn" data-act="editorop" data-op="ungroup">Ungroup selected</button></div>
    <div class="note">Groups keep their membership when saved or copied. Select a group to move it together. Outline-attached edge walls can be grouped; move their outline points in Draw. Mirror copy needs automatic Mirror off.</div>`;
}
export function inspectPanel(s,d) {
  const i=s.inspection,r=i.result;
  return `<div class="head"><div class="cond">Clearance inspection</div></div><p>Inspect assembled surfaces in 3D. Section cuts change only the view.</p>
    <label class="f">Section plane<select data-inspect="axis">${[['','No section'],['x','Across the car (X)'],['y','Along the car (Y)'],['z','Horizontal (Z)']].map(([v,n])=>`<option value="${v}" ${i.axis===v?'selected':''}>${n}</option>`).join('')}</select></label>
    <label class="f">Section position (mm)<input type="number" data-inspect="at" value="${i.at}" step="0.5"></label><label><input type="checkbox" data-inspect="flip" ${i.flip?'checked':''}> Show other side</label>
    <div class="note">Cut faces are open, not capped. Clearances use the full uncut meshes.</div>
    <label><input type="checkbox" data-inspect="pointMode" ${i.pointMode?'checked':''}> Measure between two clicked surfaces</label>
    <p data-measure-result>${Number.isFinite(i.distance)?i.distance.toFixed(3)+' mm · point-to-point distance':'Click two visible surfaces in 3D.'}</p><button class="btn sm" data-act="editorclearmeasure">Clear measurement</button>
    <label class="f">Minimum gap between<select data-inspect="pair">${[['pod','Chassis / pod'],...(d.body?[['body-chassis','Body / chassis'],['body-pod','Body / pod']]:[])].map(([v,n])=>`<option value="${v}" ${i.pair===v?'selected':''}>${n}</option>`).join('')}</select></label>
    <label class="f">Search distance (mm)<input type="number" min="0.1" max="100" step="0.1" data-inspect="range" value="${i.range}"></label>
    <button class="btn primary" data-act="editorinspect" ${s.busy||i.busy?'disabled':''}>${i.busy?'Measuring…':'Measure minimum gap'}</button>
    <p role="status" data-clearance-result>${i.error?esc(i.error):r?r.overlap>1e-6?`Overlap: ${r.overlap.toFixed(3)} mm³ · highlighted red`:r.beyondRange?`Gap is at least ${r.range} mm`:`Minimum surface gap: ${r.gap.toFixed(3)} mm`:'No current measurement.'}</p>
    <div class="note">Minimum-gap checks require closed solids. Intentional mating contact can give a zero gap. This is a static geometry check; it does not simulate flex, movement, or gear teeth.</div>`;
}
