const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../../insights-data.js');
const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../../data/simulation.json'),'utf8'));
const s=Object.fromEntries(Object.entries(d.series).map(([b,rs])=>[b,rs.map(r=>Object.fromEntries(d.fields.map((k,i)=>[k,r[i]])))]));
const key=a=>[a.building,a.kind,a.context_type||'',a.start,a.end].join(':');
test('default recomputation reproduces every original episode and per-event delay',()=>{
 const actual=M.detect(d,s);assert.deepEqual(actual.map(key).sort(),d.alerts.map(key).sort());
 assert.deepEqual(M.evaluate(d,actual),M.evaluate(d,d.alerts));
});
test('sensitivity reruns readings without labels, stored flags, alerts, or input mutation',()=>{
 const before=JSON.stringify(s),clean={...d,alerts:[],events:[]};
 const poisoned=Object.fromEntries(Object.entries(s).map(([bid,rs])=>[bid,rs.map(r=>({...r,truth:'poison',clean:-999,flag:'poison',context_flag:'poison'}))]));
 assert.deepEqual(M.detect(clean,poisoned).map(key),M.detect(d,s).map(key));
 const base=M.evaluate(d,M.detect(d,s)),changed=M.evaluate(d,M.detect(d,s,{threshold:2,duration:4,nights:3}));
 assert.notDeepEqual(changed,base);assert.equal(JSON.stringify(s),before);
});
test('duration triggers on the Nth reading and never backdates demand detections',()=>{
 const actual=M.detect(d,s,{duration:4});
 for(const a of actual.filter(a=>a.kind==='demand')){
  const b=d.buildings.find(b=>b.id===a.building),rs=s[a.building];
  assert.ok(rs.slice(a.start-3,a.start+1).every(r=>r.p!==null&&r.flat_streak<8&&!(r.pf<.75&&r.q>1.6*r.expected_q)&&r.score>=b.threshold));
 }
 const spike=d.events.find(e=>e.id==='E05');assert.ok(!actual.some(a=>a.kind==='demand'&&a.building===spike.building&&a.start<spike.end&&a.end>spike.start));
});
test('recurrence control changes history detections while leaving point rules unchanged',()=>{
 const base=M.detect(d,s),changed=M.detect(d,s,{nights:5});
 assert.deepEqual(base.filter(a=>a.kind!=='context').map(key),changed.filter(a=>a.kind!=='context').map(key));
 assert.notDeepEqual(base.filter(a=>a.context_type==='repeated_night').map(key),changed.filter(a=>a.context_type==='repeated_night').map(key));
});
test('configuration rejects invalid and nonfinite inputs',()=>{
 for(const c of [{threshold:NaN},{threshold:0},{duration:0},{duration:1.2},{nights:1},{nights:6}])assert.throws(()=>M.detect(d,s,c));
});
test('test-period detections do not change when later observations are unavailable',()=>{
 const cutoff=50*96,short=Object.fromEntries(Object.entries(s).map(([id,rs])=>[id,rs.slice(0,cutoff)]));
 const expected=M.detect(d,s).filter(a=>a.start<cutoff).map(a=>({...a,end:Math.min(a.end,cutoff)}));
 assert.deepEqual(M.detect(d,short).map(key).sort(),expected.map(key).sort());
});
test('groups have stable IDs independent of input order and preserve originals without mutation',()=>{
 const before=JSON.stringify(d.alerts),a=M.investigations(d,s),b=M.investigations({...d,alerts:[...d.alerts].reverse()},s);
 assert.deepEqual(a.map(x=>x.id).sort(),b.map(x=>x.id).sort());
 const gap=a.find(x=>x.type==='gaps');assert.deepEqual(gap.members.map(a=>a.building).sort(),['LIB','REC','STU']);
 assert.equal(new Set(a.flatMap(g=>g.members.map(a=>a.id))).size,a.flatMap(g=>g.members).length);
 assert.equal(JSON.stringify(d.alerts),before);assert.equal(M.evaluate(d,d.alerts).total,26);
});
test('coincident gaps require different meters, start tolerance and actual overlap',()=>{
 const alert=(id,building,start,end)=>({id,building,start,end,kind:'missing',priority:'High'});
 const g=M.investigations({...d,alerts:[alert('x','ADM',100,101),alert('y','LAB',101,102),alert('z','LIB',103,105)]},s);
 assert.equal(g.length,0);
});
test('comparisons use only earlier complete periods with matching schedule and temperature',()=>{
 const a=d.alerts.find(a=>a.id==='A006'),c=M.comparisons(a,s.ADM);
 assert.ok(c.periods.length);assert.equal(c.end,a.start+1);
 for(const p of c.periods){assert.ok(p.end<=c.start);assert.ok(p.sameSchedule);assert.ok(Math.abs(p.temp-c.summary.temp)<=2);assert.equal(p.valid,p.count);}
 const later=s.ADM.map(r=>r.i>a.start?{...r,p:999999,temp:-999}:r);
 assert.deepEqual(M.comparisons(a,later),c);
});
test('calendar closures, occupancy exceptions, conflicts and half-open boundaries affect schedule',()=>{
 const r=s.ADM.find(r=>M.local(r.t).hour==='12'),end=new Date(Date.parse(r.t)+900000).toISOString();
 const entry={scope:'ADM',start:r.t,end,type:'closure'};
 assert.equal(M.schedule(r,'ADM',[entry]).on,false);
 assert.equal(M.schedule({...r,t:end},'ADM',[entry]).on,true);
 assert.equal(M.schedule(r,'LAB',[entry]).on,true);
 assert.equal(M.schedule(r,'ADM',[entry,{...entry,type:'occupancy'}]).conflict,true);
 assert.equal(M.schedule(r,'ADM',[entry,{...entry,type:'occupancy'}]).on,false);
 const a=d.alerts.find(a=>a.id==='A006'),c=M.comparisons(a,s.ADM),p=c.periods[0];
 const closure={scope:'ADM',type:'closure',start:s.ADM[p.start].t,end:s.ADM[p.end].t};
 assert.ok(!M.comparisons(a,s.ADM,[closure]).periods.some(x=>x.start===p.start));
});
test('missing, stale and absent weather are not silently treated as valid zeros',()=>{
 assert.equal(M.stats([{p:null,temp:null}]).p,null);assert.equal(M.stats([{p:8,expected:9,temp:20,flat_streak:8}]).valid,0);
 const a=d.alerts.find(a=>a.id==='A006'),broken=s.ADM.map(r=>({...r,p:null,temp:null}));
 const c=M.comparisons(a,broken);assert.equal(c.delta,null);assert.equal(c.summary.temp,null);assert.equal(c.periods.length,0);
 assert.equal(M.comparisons({start:2,building:'ADM'},s.ADM).periods.length,0);
});
test('previous-week comparison follows Los Angeles wall time across DST',()=>{
 const start=Date.parse('2026-10-25T00:00:00-07:00'),rs=Array.from({length:12*96},(_,i)=>({i,t:new Date(start+i*900000).toISOString(),p:10,expected:10,temp:20,flat_streak:1}));
 const i=rs.findIndex(r=>r.t==='2026-11-02T16:45:00.000Z'),c=M.comparisons({start:i,building:'ADM'},rs,[],'week');
 assert.equal(c.periods.length,1);assert.equal(M.local(rs[c.start].t).hour,M.local(rs[c.periods[0].start].t).hour);
 assert.equal(c.start-c.periods[0].start,7*96+4);
});
test('evidence ranges stop at first detection and do not use injected cause labels',()=>{
 for(const a of d.alerts){
  const e=M.checklist(a,d,s);assert.ok(e.some(x=>x.category==='unavailable'));
  assert.ok(e.every(x=>!x.range||x.range.end<=a.start+1));
  assert.ok(!JSON.stringify(e).includes('E11'));
 }
});
