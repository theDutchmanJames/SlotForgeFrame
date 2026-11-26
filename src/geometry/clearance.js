import { createAnalyser } from './mesh-measure.js';
// Minimum surface distance between closed meshes, in their assembled coordinates.
export function createClearanceInspector(wasm) {
  const analyser=createAnalyser(wasm);
  return ({a,b,range=20})=>{
    if(!Number.isFinite(range)||range<=0||range>100)throw Error('Search range must be greater than zero and at most 100 mm.');
    let first,second,hit;
    try{
      first=analyser.solidOf(a);second=analyser.solidOf(b);hit=first.intersect(second);
      const overlap=hit.volume(),gap=overlap>1e-6?0:first.minGap(second,range);
      let intersection=null;
      if(overlap>1e-6){const m=hit.getMesh(),positions=new Float32Array(m.numVert*3);for(let i=0;i<m.numVert;i++)for(let k=0;k<3;k++)positions[i*3+k]=m.vertProperties[i*m.numProp+k];intersection={positions,indices:new Uint32Array(m.triVerts)};}
      return {gap,overlap,range,beyondRange:gap>=range-1e-6,intersection};
    }finally{hit?.delete();second?.delete();first?.delete();}
  };
}
