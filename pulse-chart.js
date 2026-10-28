/* Display geometry only: no averaging, resampling, or detector changes. */
(function(root){
 const defaults={expected:false,band:false,high:true,medium:true,calendar:false,smooth:true};
 const visibleAlerts=(alerts,layers)=>alerts.filter(a=>a.priority==='High'?layers.high:layers.medium);
 function linePath(rows,key,x,y,smooth=true){
  const segments=[];let current=[],previous=null;
  for(let j=0;j<rows.length;j++){
   const r=rows[j],v=r[key];
   if(!Number.isFinite(v)||(previous!==null&&Number.isFinite(r.i)&&r.i!==previous+1)){
    if(current.length)segments.push(current);current=[];
   }
   if(Number.isFinite(v))current.push([x(j),y(v)]);
   previous=Number.isFinite(r.i)?r.i:null;
  }
  if(current.length)segments.push(current);
  const point=p=>p.map(v=>v.toFixed(3)).join(',');
  return segments.map(ps=>{
   let path='M'+point(ps[0]);
   if(!smooth||ps.length<3)return path+ps.slice(1).map(p=>'L'+point(p)).join(' ');
   const slopes=ps.slice(1).map((p,i)=>(p[1]-ps[i][1])/(p[0]-ps[i][0]));
   const tangents=ps.map((_,i)=>i===0?slopes[0]:i===ps.length-1?slopes.at(-1):slopes[i-1]*slopes[i]<=0?0:2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]));
   for(let i=0;i<slopes.length;i++){
    if(slopes[i]===0){tangents[i]=0;tangents[i+1]=0;continue;}
    const length=Math.hypot(tangents[i]/slopes[i],tangents[i+1]/slopes[i]);
    if(length>3){tangents[i]*=3/length;tangents[i+1]*=3/length;}
   }
   for(let i=0;i<ps.length-1;i++){
    const a=ps[i],b=ps[i+1],dx=(b[0]-a[0])/3;
    path+=' C'+point([a[0]+dx,a[1]+tangents[i]*dx])+' '+point([b[0]-dx,b[1]-tangents[i+1]*dx])+' '+point(b);
   }
   return path;
  }).join(' ');
 }
 const api={defaults,visibleAlerts,linePath};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PulseChart=api;
})(typeof globalThis!=='undefined'?globalThis:this);
