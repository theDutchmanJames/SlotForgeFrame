import * as THREE from 'three';
import { pickRegion } from './feature-regions.js';

export function installViewportTools({scene,camera,renderer,controls,groups,draw,onPick,onMove,onMeasure}) {
  const overlay=new THREE.Group();scene.add(overlay);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let config={regions:[],selected:null,enabled:false},handles=[],down=null,drag=null,points=[];
  const free=()=>{for(const c of [...overlay.children]){overlay.remove(c);c.geometry?.dispose();if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material?.dispose();}handles=[];};
  const material=color=>new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.9});
  function update(){
    free();
    const selected=config.enabled?config.regions.filter(r=>r.id===config.selected):[];
    for(const r of selected){
      const box=new THREE.Box3(new THREE.Vector3(...r.min),new THREE.Vector3(...r.max));
      const outline=new THREE.Box3Helper(box,0xffbb55);outline.material.depthTest=false;outline.renderOrder=20;overlay.add(outline);
    }
    const r=selected[0];
    if(r?.move&&!config.pointMode){
      const c=r.min.map((v,k)=>(v+r.max[k])/2);
      for(const axis of r.side?[0,1]:[0]){
        const at=[...c];at[axis]=r.max[axis]+5;
        const sphere=new THREE.Mesh(new THREE.SphereGeometry(1.5,12,8),material(0xffaa33));sphere.position.set(...at);sphere.userData.axis=axis;sphere.renderOrder=21;overlay.add(sphere);handles.push(sphere);
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...c),new THREE.Vector3(...at)]),new THREE.LineBasicMaterial({color:0xffaa33,depthTest:false}));overlay.add(line);
      }
    }
    if(config.intersection){const m=config.intersection,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.positions,3));g.setIndex(new THREE.BufferAttribute(m.indices,1));overlay.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xff3355,depthTest:false,transparent:true,opacity:.8,side:THREE.DoubleSide})));}
    for(const p of points){const s=new THREE.Mesh(new THREE.SphereGeometry(.65,10,6),material(0x56e0df));s.position.set(...p);overlay.add(s);}
    if(points.length===2)overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:0x56e0df,depthTest:false})));
    const section=config.section;
    renderer.clippingPlanes=section?.axis&&config.enabled?[new THREE.Plane(new THREE.Vector3(...[0,1,2].map(k=>k==='xyz'.indexOf(section.axis)?(section.flip?-1:1):0)),(section.flip?1:-1)*section.at)]:[];
    draw();
  }
  const aim=e=>{const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);};
  const hit=()=>{
    const candidates=['chassis','pod',...(config.pointMode?['body','parts']:[])].filter(k=>groups[k].visible).flatMap(k=>groups[k].children);
    return ray.intersectObjects(candidates,true).find(h=>renderer.clippingPlanes.every(p=>p.distanceToPoint(h.point)>=0));
  };
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{
    if(!config.enabled||e.button!==0)return;
    down=[e.clientX,e.clientY];aim(e);
    const h=ray.intersectObjects(handles)[0];
    if(!h)return;
    const plane=new THREE.Plane(new THREE.Vector3(0,0,1),-h.object.position.z),start=ray.ray.intersectPlane(plane,new THREE.Vector3());
    if(!start)return;
    drag={plane,start,axis:h.object.userData.axis,id:config.selected,delta:0};controls.enabled=false;canvas.setPointerCapture(e.pointerId);e.stopImmediatePropagation();e.preventDefault();
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;aim(e);const p=ray.ray.intersectPlane(drag.plane,new THREE.Vector3());if(!p)return;
    drag.delta=Math.round((p.getComponent(drag.axis)-drag.start.getComponent(drag.axis))*10)/10;
    overlay.position.set(drag.axis===0?drag.delta:0,drag.axis===1?drag.delta:0,0);draw();
  });
  canvas.addEventListener('pointerup',e=>{
    if(drag){const saved=drag;drag=null;down=null;controls.enabled=true;overlay.position.set(0,0,0);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(saved.delta)onMove?.(saved.id,saved.axis===0?saved.delta:0,saved.axis===1?saved.delta:0);update();return;}
    if(!config.enabled||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4){down=null;return;}
    down=null;aim(e);const h=hit();if(!h)return;
    if(config.pointMode){if(points.length===2)points=[];points.push(h.point.toArray());onMeasure?.(points.length===2?points[0].reduce((n,v,k)=>n+(v-points[1][k])**2,0)**.5:null);update();return;}
    const part=groups.pod.children.includes(h.object)?'pod':'chassis',r=pickRegion(config.regions,h.point.toArray(),part);if(r)onPick?.(r.id,e.shiftKey);
  });
  canvas.addEventListener('pointercancel',()=>{drag=null;down=null;controls.enabled=true;overlay.position.set(0,0,0);update();});
  return {
    set(next){if(!next.pointMode||next.reset!==config.reset)points=[];config=next;update();},
    project(p){const v=new THREE.Vector3(...p).project(camera),b=canvas.getBoundingClientRect();return {x:b.left+(v.x+1)*b.width/2,y:b.top+(1-v.y)*b.height/2};},
  };
}
