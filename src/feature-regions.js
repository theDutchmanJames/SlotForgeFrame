// Selection regions identify editable features after booleans have fused their faces.
// They are UI bounds, not collision geometry. Clearance checks use the actual meshes.
import { find, heights, motorOf, motorPlace, uprightSpread, podLayout, podShift, builtIn, holderSize, FEATURE_NAMES } from './model.js';
import { featureCentre, ANCHOR_TYPES, movesSideways } from './feature-tools.js';
export function meshBounds(m) {
  if(!m?.positions?.length)return null;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<m.positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],m.positions[i+k]);max[k]=Math.max(max[k],m.positions[i+k]);}
  return {min,max};
}
export function featureRegions(d,built) {
  if(d.onePiece)return [];
  const out=[], z=d.car.clearance, top=z+find(d.chassis,'outline').params.thickness, h=heights(d);
  const put=(f,part,min,max,rank=1)=>{if(!f||f.enabled===false)return;out.push({id:f.id,part,name:f.editor?.name||FEATURE_NAMES[f.type],min,max,rank,move:part==='chassis'&&ANCHOR_TYPES.includes(f.type),side:movesSideways(f)||f.type==='guide'});};
  const add=(f,part,x,y,w,l,z0,z1,rank=1)=>put(f,part,[x-w/2,y-l/2,z0],[x+w/2,y+l/2,z1],rank);
  const base=meshBounds(built?.chassis),pb=meshBounds(built?.pod);
  if(base)put(find(d.chassis,'outline'),'chassis',base.min,base.max,1000);
  if(pb)put(find(d.pod,'base'),'pod',pb.min,pb.max,1000);
  if(!d.chassis.imported)for(const f of d.chassis.features){const p=f.params;
    if(f.type==='guide')add(f,'chassis',p.along,p.side,p.bossD,p.bossD,z,top+p.bossH);
    else if(f.type==='frontAxle')for(const sign of [-1,1])add(f,'chassis',p.along,sign*p.spread/2,p.width+3,p.thick+3,z,z+h.frontAxle+5);
    else if(f.type==='bodyMounts')for(const q of p.posts)for(const sign of q.side?[-1,1]:[1])add(f,'chassis',q.along,sign*q.side,p.padD,p.padD,z,top+p.height);
    else if(['rib','rail','cutout','wall'].includes(f.type)){
      const pts=f.type==='wall'?find(d.chassis,'outline').params.points.slice(Math.min(p.from,p.to),Math.max(p.from,p.to)+1):p.points;
      if(!pts?.length)continue;const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]),pad=(p.width??p.thick??1)/2;
      for(const s of p.mirror?[-1,1]:[1])put(f,'chassis',[Math.min(...xs)-pad,Math.min(...ys.map(y=>y*s))-pad,z-2],[Math.max(...xs)+pad,Math.max(...ys.map(y=>y*s))+pad,top+Math.max(p.h0||0,p.h1||0,p.height||0,1)+8],2);
    }else if(['tunnel','panel','level','window','holder','wire','chip','tab'].includes(f.type)){
      let [x,y]=featureCentre(f),w=p.length??Math.abs(p.x1-p.x0),l=p.width??Math.abs(p.y1-p.y0);
      if(f.type==='holder'&&p.shape==='round')w=l=p.d+2*p.wall;
      if(f.type==='wire')l=p.gap+2*p.wall;
      if(f.type==='panel'){w=p.thick;l=p.width;}
      if(f.type==='tab'){y=Math.max(...find(d.chassis,'outline').params.points.map(q=>q[1]))+p.reach/2;l=p.reach+3;}
      for(const sign of p.mirror?[-1,1]:[1])add(f,'chassis',x,y*sign,w+1,l+1,z-2,top+Math.max(p.height||0,p.deep||0,p.offset||0,p.rise||0,1)+8,2);
    }
  }
  if(!d.pod.imported){
    const part=builtIn(d)?'chassis':'pod',shift=podShift(d),podZ=z-(find(d.pod,'base').params.drop||0);
    const seat=find(d.pod,'motorSeat'),m=motorOf(d),mp=motorPlace(d),a=mp.angle*Math.PI/180;
    add(seat,part,mp.x,mp.y,Math.abs(Math.cos(a))*m.length+Math.abs(Math.sin(a))*m.width+5,Math.abs(Math.sin(a))*m.length+Math.abs(Math.cos(a))*m.width+5,podZ,z+h.shaft+m.height/2+3,3);
    const up=find(d.pod,'uprights'),p=up.params;
    for(const sign of [-1,1])add(up,part,d.car.wheelbase,shift+sign*(uprightSpread(d)-p.thick)/2,holderSize(p)+2*p.wall,p.thick+2,podZ,z+h.axle+holderSize(p)/2+p.wall,1);
    const f=find(d.pod,'lugs');if(!builtIn(d))for(const [x,y]of podLayout(d).points)add(f,'pod',x,y,f.params.lugD,f.params.lugD,podZ,podZ+f.params.lugT+2,1);
  }
  return out.filter(r=>[...r.min,...r.max].every(Number.isFinite));
}
export function pickRegion(regions, point, part) {
  return regions.filter(r=>r.part===part&&point.every((v,k)=>v>=r.min[k]-0.7&&v<=r.max[k]+0.7)).sort((a,b)=>a.rank-b.rank||volume(a)-volume(b))[0]??null;
}
const volume=r=>r.max.reduce((v,n,k)=>v*Math.max(.1,n-r.min[k]),1);
