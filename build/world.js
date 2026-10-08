const NM=require('path').join(__dirname,'node_modules')+require('path').sep;
const t=require('topojson-client');
const topo=require('world-atlas/countries-50m.json');
const codes=require('i18n-iso-countries/codes.json');const n2a={};for(const r of codes)n2a[r[2]]=r[0];const iso={numericToAlpha2:n=>n2a[n]};
const fs=require('fs');

const fc=t.feature(topo, topo.objects.countries);
const R=(n,d)=>Math.round(n*10**d)/10**d;

function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++){a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]);}return Math.abs(a/2);}
function centroid(r){let x=0,y=0,a=0;for(let i=0,j=r.length-1;i<r.length;j=i++){const f=r[j][0]*r[i][1]-r[i][0]*r[j][1];a+=f;x+=(r[j][0]+r[i][0])*f;y+=(r[j][1]+r[i][1])*f;}
  if(!a)return r[0]; a*=0.5; return [x/(6*a), y/(6*a)];}

const DEC=2, MINAREA=0.05, TOL=0.06;
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const d=dx*dx+dy*dy;if(!d)return Math.hypot(p[0]-a[0],p[1]-a[1]);
 let tt=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d; tt=Math.max(0,Math.min(1,tt));
 return Math.hypot(p[0]-(a[0]+tt*dx), p[1]-(a[1]+tt*dy));}
function dpSimplify(pts,tol){ if(pts.length<4)return pts;
 const keep=new Array(pts.length).fill(false); keep[0]=keep[pts.length-1]=true;
 const stack=[[0,pts.length-1]];
 while(stack.length){const [s,e]=stack.pop(); let max=0,idx=-1;
  for(let i=s+1;i<e;i++){const d=perp(pts[i],pts[s],pts[e]); if(d>max){max=d;idx=i;}}
  if(max>tol&&idx>0){keep[idx]=true;stack.push([s,idx],[idx,e]);}}
 return pts.filter((_,i)=>keep[i]); }
 // drop very small islands at 110m res
const out=[];
let missing=[];
for(const f of fc.features){
  const num=String(f.id).padStart(3,'0');
  const a2=iso.numericToAlpha2(num);
  let a2x=a2; const NM={'Kosovo':'XK'};
  if(!a2x){ a2x=NM[f.properties.name]; if(!a2x){ missing.push([f.id,f.properties.name]); continue; } }
  let polys = f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  // keep outer rings only (holes are negligible visually at this scale, except Lesotho/Vatican)
  let rings = polys.map(p=>p[0]).filter(r=>r&&r.length>3);
  rings = rings.filter(r=>ringArea(r)>=MINAREA || rings.length===1);
  if(!rings.length) continue;
  rings.sort((a,b)=>ringArea(b)-ringArea(a));
  const main=rings[0];
  const c=centroid(main);
  const simplified=rings.map(r0=>{
    const r=dpSimplify(r0,TOL);
    const o=[]; let last=null;
    for(const pt of r){ const p=[R(pt[0],DEC),R(pt[1],DEC)];
      if(!last||p[0]!==last[0]||p[1]!==last[1]){o.push(p);last=p;} }
    return o;
  }).filter(r=>r.length>3);
  // angular radius from the centroid, for cheap far-side culling on the globe
  const DEG=Math.PI/180;
  let maxA=0;
  for(const r of simplified) for(const pt of r){
    const a=Math.sin(c[1]*DEG)*Math.sin(pt[1]*DEG)+Math.cos(c[1]*DEG)*Math.cos(pt[1]*DEG)*Math.cos((pt[0]-c[0])*DEG);
    const d=Math.acos(Math.max(-1,Math.min(1,a)))/DEG;
    if(d>maxA) maxA=d;
  }
  out.push({c:a2x, n:f.properties.name, g:simplified, k:[R(c[0],2),R(c[1],2)], r:Math.ceil(maxA)});
}
// merge duplicates (e.g. same alpha2 emitted twice)
const by={}; for(const o of out){ if(by[o.c]) by[o.c].g=by[o.c].g.concat(o.g); else by[o.c]=o; }
const out2=Object.values(by); out2.sort((a,b)=>a.c.localeCompare(b.c));
const have=new Set(out2.map(o=>o.c));
const allIso=codes.map(r=>r[0]);
console.log('ISO codes with no geometry:', allIso.filter(c=>!have.has(c)).join(' '));
out.length=0; out.push(...out2);
out.sort((a,b)=>a.c.localeCompare(b.c));
fs.writeFileSync(require('path').join(__dirname,'world.json'), JSON.stringify(out));
console.log('countries:',out.length,'bytes:',fs.statSync(require('path').join(__dirname,'world.json')).size);
console.log('unmapped numeric ids:',JSON.stringify(missing));
console.log('sample:',out.find(x=>x.c==='CR').n, out.find(x=>x.c==='CR').k);
