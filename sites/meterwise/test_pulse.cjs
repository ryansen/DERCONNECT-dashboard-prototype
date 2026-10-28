const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../../pulse-chart.js');
const rows=values=>values.map((p,i)=>({p,i}));
const path=(rs,smooth=true)=>P.linePath(rs,'p',j=>j*10,v=>v,smooth);
test('smooth curve visits every reading and retains isolated peaks',()=>{
 const rs=rows([5,5,100,5,5]),before=JSON.stringify(rs),d=path(rs);
 assert.equal((d.match(/ C/g)||[]).length,4);assert.ok(d.includes('20.000,100.000'));
 assert.equal(JSON.stringify(rs),before);
});
test('curve controls cannot overshoot any pair of neighboring readings',()=>{
 for(const values of [[0,1,100,101,0,-80,0],[1,1,1,1],[0,100,0,100,0]]){
  const parts=path(rows(values)).split(' C').slice(1);
  parts.forEach((part,i)=>{const nums=part.match(/-?\d+\.\d+/g).map(Number),lo=Math.min(values[i],values[i+1])-.001,hi=Math.max(values[i],values[i+1])+.001;
   for(let step=0;step<=100;step++){const t=step/100,v=(1-t)**3*values[i]+3*(1-t)**2*t*nums[1]+3*(1-t)*t*t*nums[3]+t**3*nums[5];assert.ok(v>=lo&&v<=hi);}
  });
 }
});
test('missing/nonfinite readings and discontinuous intervals break the curve',()=>{
 assert.equal((path(rows([0,2,null,4,5,6,NaN,8])).match(/M/g)||[]).length,3);
 assert.equal((path([{i:1,p:2},{i:3,p:4},{i:4,p:5}]).match(/M/g)||[]).length,2);
 assert.equal(path(rows([null,NaN])), '');
});
test('straight mode and short segments retain exact points',()=>{
 assert.equal(path(rows([1,2,3]),false),'M0.000,1.000L10.000,2.000 L20.000,3.000');
 assert.equal(path(rows([5])),'M0.000,5.000');
 assert.equal(path(rows([5,8])),'M0.000,5.000L10.000,8.000');
});
test('layer filters change only visible priorities, not source episodes',()=>{
 const as=[{id:'a',priority:'High'},{id:'b',priority:'Medium'}],before=JSON.stringify(as);
 assert.equal(P.defaults.expected,false);assert.equal(P.defaults.band,false);assert.equal(P.defaults.calendar,false);
 assert.deepEqual(P.visibleAlerts(as,{high:false,medium:true}),[as[1]]);
 assert.deepEqual(P.visibleAlerts(as,{high:false,medium:false}),[]);assert.equal(JSON.stringify(as),before);
});
