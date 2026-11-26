import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {newDesign,newShape,newId,find,moveRear,cleanDesign,cleanPart,createHistory,encodeProject,decodeProject} from '../src/model.js';
import {setReference,featureCentre,operateSelection,translateFeature,syncReferences} from '../src/feature-tools.js';
import {featureRegions,pickRegion} from '../src/feature-regions.js';
import {createClearanceInspector} from '../src/geometry/clearance.js';
import {createEngine} from '../src/geometry/engine.js';
const wasm=await Module();wasm.setup();const engine=createEngine(wasm),inspect=createClearanceInspector(wasm);
const mesh=s=>{const m=s.getMesh();return {positions:m.vertProperties,indices:m.triVerts};};
test('rear/centre/front references preserve feature size across the old midpoint boundary',()=>{
  for(const reference of ['front','rear','centre']){
    const d=newDesign(),f=newShape('rib',d);f.params.points=[[35,20],[65,20]];d.chassis.features.push(f);
    setReference(d,f,reference);const old=d.car.wheelbase,x=featureCentre(f)[0];d.car.wheelbase+=20;moveRear(d,old,d.car.wheelbase);
    assert.equal(f.params.points[1][0]-f.params.points[0][0],30);
    assert.equal(featureCentre(f)[0],x+(reference==='rear'?20:reference==='centre'?10:0));
  }
});
test('unreferenced designs retain midpoint resizing and new offsets follow manual edits',()=>{
  const d=newDesign(),f=newShape('rib',d);f.params.points=[[35,20],[65,20]];d.chassis.features.push(f);const old=d.car.wheelbase;d.car.wheelbase+=20;moveRear(d,old,d.car.wheelbase);assert.equal(f.params.points[1][0]-f.params.points[0][0],50);
  setReference(d,f,'rear',-12);assert.equal(featureCentre(f)[0],d.car.wheelbase-12);translateFeature(f,3);syncReferences(d);assert.equal(f.editor.anchor.offset,-9);
});
test('group duplicate preserves relationships and creates independent membership and IDs',()=>{
  const d=newDesign(),a=newShape('rib',d),b=newShape('holder',d);d.chassis.features.push(a,b);setReference(d,a,'rear');
  const ids=[a.id,b.id];operateSelection(d,ids,'group',{name:'Rear structure',newId});
  const original=d.chassis.features.filter(f=>ids.includes(f.id));
  const copies=operateSelection(d,ids,'copy',{dx:7,dy:0,newId});const cloned=d.chassis.features.filter(f=>copies.includes(f.id));
  assert.equal(cloned.length,2);assert.notEqual(cloned[0].editor.group,original[0].editor.group);assert.equal(cloned[0].editor.group,cloned[1].editor.group);
  assert.equal(featureCentre(cloned[0])[0],featureCentre(original[0])[0]+7);assert.notEqual(cloned[0].params,original[0].params);
  const opened=decodeProject(encodeProject(d)),saved=opened.chassis.features.filter(f=>f.editor?.group===cloned[0].editor.group);assert.equal(saved.length,2);assert.equal(saved[0].editor.anchor.reference,'rear');
  const library=cleanPart('chassis',{scale:d.scale,car:d.car,features:d.chassis.features},false);assert.equal(library.features.filter(f=>f.editor?.group===cloned[0].editor.group).length,2);
});
test('arrangement is atomic on invalid mixed moves and duplication cap',()=>{
  const d=newDesign(),a=newShape('rib',d),b=newShape('wall',d);d.chassis.features.push(a,b);const before=JSON.stringify(d);
  assert.throws(()=>operateSelection(d,[a.id,b.id],'move',{dx:4,newId}),/outline/);assert.equal(JSON.stringify(d),before);
  assert.throws(()=>operateSelection(d,[a.id],'mirror',{newId}),/Mirror/);assert.equal(JSON.stringify(d),before);
  while(d.chassis.features.filter(f=>f.type==='rib').length<80)d.chassis.features.push(newShape('rib',d));assert.throws(()=>operateSelection(d,[a.id],'copy',{dx:2,newId}),/80/);
});
test('mirror, align and distribute change geometry coordinates and remain undoable',()=>{
  const d=newDesign(),fs=[newShape('holder',d),newShape('holder',d),newShape('holder',d)];d.chassis.features.push(...fs);fs.forEach((f,i)=>{f.params.along=[10,18,50][i];f.params.mirror=false;});
  const history=createHistory(),before=JSON.stringify(d);history.push(before);
  operateSelection(d,fs.map(f=>f.id),'distribute',{newId});assert.deepEqual(d.chassis.features.filter(f=>f.type==='holder').map(f=>f.params.along),[10,30,50]);
  const ids=operateSelection(d,[fs[0].id],'mirror',{newId});assert.equal(d.chassis.features.find(f=>ids.includes(f.id)).params.side,-fs[0].params.side);
  assert.equal(history.undo(JSON.stringify(d)),before);
  operateSelection(d,fs.map(f=>f.id),'align',{newId});assert.deepEqual(d.chassis.features.filter(f=>fs.some(s=>s.id===f.id)).map(f=>f.params.along),[10,10,10]);
});
test('malformed editor metadata is discarded without changing legacy geometry',()=>{
  const d=newDesign();find(d.chassis,'guide').editor={anchor:{reference:'__proto__',offset:NaN},group:'<script>',name:'  My guide  '};
  const clean=cleanDesign(d);assert.deepEqual(find(clean.chassis,'guide').editor,{name:'My guide'});
  assert.equal(engine.build(d).chassis.volume,engine.build(clean).chassis.volume);
});
test('3D feature regions choose the guide and bearing holder instead of the whole part',()=>{
  const d=newDesign(),built=engine.build(d),regions=featureRegions(d,built),guide=find(d.chassis,'guide');
  const g=regions.find(r=>r.id===guide.id);assert.equal(pickRegion(regions,g.min.map((v,k)=>(v+g.max[k])/2),'chassis').id,guide.id);
  const up=find(d.pod,'uprights'),u=regions.find(r=>r.id===up.id);assert.equal(pickRegion(regions,u.min.map((v,k)=>(v+u.max[k])/2),'pod').id,up.id);
});
test('minimum-gap inspector distinguishes separation, contact, containment and overlap',()=>{
  const a=wasm.Manifold.cube([10,10,10]),b=a.translate([12,0,0]),touch=a.translate([10,0,0]),over=a.translate([8,0,0]),inner=wasm.Manifold.cube([1,1,1]).translate([2,2,2]);
  try{
    assert.ok(Math.abs(inspect({a:mesh(a),b:mesh(b)}).gap-2)<1e-5);
    assert.equal(inspect({a:mesh(a),b:mesh(b),range:1}).beyondRange,true);
    assert.equal(inspect({a:mesh(a),b:mesh(touch)}).overlap,0);
    const hit=inspect({a:mesh(a),b:mesh(over)});assert.ok(Math.abs(hit.overlap-200)<1e-5);assert.ok(hit.intersection.positions.length);assert.equal(hit.gap,0);
    assert.ok(inspect({a:mesh(a),b:mesh(inner)}).overlap>.99);
    assert.throws(()=>inspect({a:mesh(a),b:mesh(b),range:Infinity}),/range/);
  }finally{for(const s of [a,b,touch,over,inner])s.delete();}
});
test('changed, referenced and duplicated features build valid geometry',()=>{
  const d=newDesign(),f=newShape('wire',d);d.chassis.features.push(f);setReference(d,f,'front',12);operateSelection(d,[f.id],'copy',{dx:7,newId});
  const b=engine.build(d);assert.ok(b.chassis.volume>0);assert.ok(b.pod.volume>0);const result=inspect({a:b.chassis,b:b.pod});assert.ok(result.overlap<.5);
});

test('oversized moves reject atomically and explicit references survive inches mode',()=>{
 const d=newDesign(),f=newShape('wire',d);d.chassis.features.push(f);d.units='in';setReference(d,f,'rear',-20);
 const before=JSON.stringify(f);assert.throws(()=>translateFeature(f,900),/600 mm/);assert.equal(JSON.stringify(f),before);
 const opened=decodeProject(encodeProject(d));assert.equal(opened.units,'in');const g=opened.chassis.features.find(q=>q.type==='wire');assert.equal(g.editor.anchor.offset,-20);
});
test('shifted and built-in bearing holders remain selectable',()=>{
 for(const builtIn of [false,true]){const d=newDesign();find(d.pod,'base').params.sideways=6;find(d.pod,'base').params.builtIn=builtIn;const r=featureRegions(d,engine.build(d)),up=find(d.pod,'uprights'),box=r.find(q=>q.id===up.id),part=builtIn?'chassis':'pod';assert.equal(box.part,part);assert.equal(pickRegion(r,box.min.map((v,k)=>(v+box.max[k])/2),part).id,up.id);}
});
