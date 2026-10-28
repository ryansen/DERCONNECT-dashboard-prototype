/* Observable-only evidence and detection. Injection labels are read only by evaluate(). */
(function(root){
 const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
 const signed=r=>r.p===null?0:(r.p-r.expected)/r.scale;
 const overlap=(a,b)=>a.building===b.building&&a.start<b.end&&a.end>b.start;
 const defaults={threshold:1,duration:1,nights:2};
 const localFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'});
 function local(t){return Object.fromEntries(localFormat.formatToParts(new Date(t)).map(p=>[p.type,p.value]));}
 function schedule(r,bid,calendar=[]){
  const p=local(r.t),hour=Number(p.hour)+Number(p.minute)/60,weekend=['Sat','Sun'].includes(p.weekday);
  const entries=calendar.filter(e=>(e.scope==='ALL'||e.scope===bid)&&Date.parse(e.start)<Date.parse(r.t)+900000&&Date.parse(e.end)>Date.parse(r.t));
  const closed=entries.some(e=>e.type==='closure'),special=entries.some(e=>['hours','occupancy'].includes(e.type));
  const on=!closed&&(special||(hour>=6&&hour<22));
  return {on,key:closed?'closure':special?'calendar-occupied':on?'scheduled-'+(weekend?(['REC','LIB'].includes(bid)?'.8':'.42'):'1'):'off-hours',entries,conflict:closed&&special};
 }
 function stats(rows){
  const good=rows.filter(r=>Number.isFinite(r.p)&&!(r.flat_streak>=8));
  const temp=rows.filter(r=>Number.isFinite(r.temp));
  return {count:rows.length,valid:good.length,p:mean(good.map(r=>r.p)),expected:mean(good.map(r=>r.expected)),temp:mean(temp.map(r=>r.temp)),tempCount:temp.length};
 }
 function comparisons(a,rows,calendar=[],mode='similar'){
  // One hour ending at the first detection: every target observation was available then.
  const start=Math.max(0,a.start-3),end=a.start+1,target=rows.slice(start,end),summary=stats(target);
  if(!target.length)return {start,end,summary,periods:[],reason:'No target readings.'};
  const p=local(target[0].t),date=`${p.year}-${p.month}-${p.day}`,clock=p.hour+':'+p.minute;
  const lastWeek=new Date(Date.parse(date+'T12:00:00Z')-7*86400000).toISOString().slice(0,10);
  const pattern=target.map(r=>schedule(r,a.building,calendar).key).join('|');
  const periods=[];
  for(let i=0;i+target.length<=start;i++){
   const q=local(rows[i].t),day=`${q.year}-${q.month}-${q.day}`;
   if(q.hour+':'+q.minute!==clock||day>=date)continue;
   if(mode==='week'&&day!==lastWeek)continue;
   const slice=rows.slice(i,i+target.length),s=stats(slice);
   const sameSchedule=slice.map(r=>schedule(r,a.building,calendar).key).join('|')===pattern;
   const usable=s.valid===s.count&&s.tempCount===s.count;
   if(mode==='similar'&&(!usable||!sameSchedule||summary.tempCount!==summary.count||Math.abs(s.temp-summary.temp)>2))continue;
   periods.push({start:i,end:i+target.length,...s,sameSchedule,usable});
  }
  const usable=periods.filter(x=>x.usable),reference=mean(usable.map(x=>x.p));
  const delta=summary.valid===summary.count&&reference!==null?summary.p-reference:null;
  const percent=delta!==null&&Math.abs(reference)>=1?delta/Math.abs(reference)*100:null;
  return {start,end,summary,periods,reference,delta,percent,schedule:target.map(r=>schedule(r,a.building,calendar)),reason:!usable.length?'No usable historical comparison periods.':mode==='similar'&&usable.length<3?'Fewer than three comparison periods; interpret cautiously.':''};
 }
 function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16).padStart(8,'0');}
 function investigations(d,series){
  const eligible=d.alerts.filter(a=>a.kind==='missing'||a.context_type==='repeated_night'||(a.kind==='demand'&&a.start%96<24&&signed(series[a.building][a.start])>0));
  const parent=eligible.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const night=a=>a.evidence_start??a.start;
  const windows=a=>[{start:night(a),end:a.start+1},...(a.evidence_events||[])];
  for(let i=0;i<eligible.length;i++)for(let j=0;j<i;j++){
   const a=eligible[i],b=eligible[j];let related=false;
   if(a.kind==='missing'&&b.kind==='missing')related=a.building!==b.building&&Math.abs(a.start-b.start)<=1&&a.start<b.end&&b.start<a.end;
   else if(a.kind!=='missing'&&b.kind!=='missing'&&a.building===b.building){
    related=windows(a).some(x=>windows(b).some(y=>Math.abs(Math.floor(x.start/96)-Math.floor(y.start/96))<=7&&Math.abs(x.start%96-y.start%96)<=4&&(Math.floor(x.start/96)!==Math.floor(y.start/96)||x.start<y.end&&y.start<x.end)));
   }
   if(related)parent[find(i)]=find(j);
  }
  const sets=new Map();eligible.forEach((a,i)=>{const key=find(i);if(!sets.has(key))sets.set(key,[]);sets.get(key).push(a);});
  return [...sets.values()].filter(as=>as.some(a=>a.context_type==='repeated_night')||as.length>=2).map(as=>{
   as.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));const missing=as[0].kind==='missing';
   const support=[...new Map(as.flatMap(a=>(a.evidence_events||[]).filter(e=>e.end<=a.start+1).map(e=>[a.building+':'+e.start+':'+e.end,{...e,building:a.building}]))).values()];
   return {id:'INV-'+hash([d.seed,d.start,d.revision,...as.map(a=>a.id).sort()].join('|')),type:missing?'gaps':'nights',title:missing?'Coincident telemetry gaps':'Recurring overnight demand',members:as,support,start:Math.min(...as.map(a=>a.start)),end:Math.max(...as.map(a=>a.end)),buildings:[...new Set(as.map(a=>a.building))],priority:as.some(a=>a.priority==='High')?'High':'Medium',hypothesis:missing?'A shared communications or collection problem is possible.':'A repeated scheduling override or planned overnight activity is possible.',alternatives:missing?'Independent meter failures, meter power loss, or collection delays could look similar.':'Legitimate occupancy, equipment operation, weather effects, or baseline error could look similar.',missing:missing?'Gateway topology, meter heartbeats, and collection logs are unavailable.':'Actual occupancy, equipment logs, and confirmed BMS schedules are unavailable.'};
  }).sort((a,b)=>b.start-a.start);
 }
 function checklist(a,d,series,calendar=[]){
  const rows=series[a.building],start=Math.max(0,a.evidence_start??a.start),end=a.start+1,rs=rows.slice(start,end),s=stats(rs),first=rows[a.start],b=d.buildings.find(b=>b.id===a.building),e=[];
  const add=(category,title,text,range)=>e.push({category,title,text,range});
  if(a.kind==='missing')add('supports','Missing measurements',`${rs.filter(r=>r.p===null).length} of ${rs.length} readings absent by first detection. Missing is not zero demand.`,{start,end});
  else if(a.kind==='stale')add('supports','Repeated measurements',`${first.flat_streak} consecutive identical active-power readings by first detection; observed ${first.p} kW.`,{start:Math.max(0,a.start-first.flat_streak+1),end});
  else if(a.kind==='reactive')add('supports','Reactive-power rule',`At first detection: power factor ${first.pf}; reactive power ${first.q} kvar versus ${first.expected_q} kvar slot expectation. Requires PF < 0.75 and Q > 1.6 × expectation.`,{start:a.start,end});
  else add('supports','Demand and expectation',`${s.valid}/${s.count} usable readings: mean ${s.p?.toFixed(1)??'unavailable'} kW versus ${s.expected?.toFixed(1)??'unavailable'} kW expected. First-detection demand band ${ (first.expected-b.threshold*first.scale).toFixed(1)} to ${(first.expected+b.threshold*first.scale).toFixed(1)} kW. A history alert can remain inside the point band.`,{start,end});
  const load=a.kind==='demand'||a.kind==='context',scheduled=rs.map(r=>schedule(r,a.building,calendar)),off=scheduled.filter(x=>!x.on).length;
  if(load)add(off?'supports':'challenges','Operating schedule',`${off}/${rs.length} evidence intervals outside the assumed schedule after dated calendar overrides. The generator assumes 06:00–22:00 operation with reduced weekend activity; this is not measured occupancy. Operating hours alone do not establish whether a load is expected.`,{start,end});
  const earlier=(a.evidence_events||[]).filter(x=>x.end<=a.start);
  const priorAlerts=d.alerts.filter(o=>o.building===a.building&&o.end<=a.start&&a.start-o.start<=7*96&&(o.context_type==='repeated_night'||o.kind==='demand'&&o.start%96<24&&signed(rows[o.start])>0));
  const nights=[...new Map([...earlier,...priorAlerts].filter(x=>x.start%96<24).map(x=>[Math.floor(x.start/96),x])).values()];
  if(load&&nights.length)add('supports','Prior overnight evidence',`${nights.length} distinct earlier night(s) have sequence evidence or recorded demand episodes completed within the preceding seven days. These observations do not confirm why equipment operated.`,{start:Math.min(...nights.map(x=>x.start)),end});
  const peers=d.buildings.filter(x=>x.id!==a.building).map(x=>({id:x.id,r:series[x.id][a.start]}));
  const gaps=peers.filter(x=>x.r.p===null),normal=peers.filter(x=>x.r.p!==null&&!x.r.flag&&!x.r.context_flag);
  add(a.kind==='missing'&&gaps.length?'supports':'unavailable','Other campus meters',`${gaps.length}/${peers.length} other campus meters have missing readings at first detection; ${normal.length}/${peers.length} have no active detector flag. Comparable equipment states and electrical/gateway relationships are unavailable, so this does not establish normal operation or a shared cause.`,{start:a.start,end});
  const maintenance=scheduled.flatMap(x=>x.entries).filter(x=>x.type==='maintenance');
  if(load&&maintenance.length)add('challenges','Planned work may explain the signal',`Calendar context lists ${[...new Set(maintenance.map(x=>x.title))].join('; ')}. Verify the work log before concluding the behavior was expected.`,{start,end});
  const c=comparisons(a,rows,calendar);
  if(load)add(c.delta===null?'unavailable':Math.abs(c.delta)>=first.scale&&Math.sign(c.delta)===Math.sign(signed(first))?'supports':'challenges','Weather and schedule comparison',c.delta===null?'No complete comparable demand window is available.':`In the one-hour window ending at detection, mean demand differs by ${c.delta.toFixed(1)} kW from ${c.periods.length} prior periods with matching schedule and mean temperature within 2 °C. This ${Math.abs(c.delta)>=first.scale&&Math.sign(c.delta)===Math.sign(signed(first))?'agrees with the first interval’s direction and exceeds one learned scale':'is within one learned scale or does not agree with the first interval’s direction'}. This descriptive check is not a significance test and does not establish a fault.`,{start:c.start,end:c.end});
  add('unavailable','Confirmatory context',`Actual occupancy, equipment/BMS logs, maintenance confirmation, and gateway topology are unavailable. Outdoor temperature is simulated; no measured occupancy channel exists.`);
  return e;
 }
 function configuration(x={}){
  const c={...defaults,...x};
  if(!Number.isFinite(c.threshold)||c.threshold<.5||c.threshold>2||!Number.isInteger(c.duration)||c.duration<1||c.duration>16||!Number.isInteger(c.nights)||c.nights<2||c.nights>5)throw Error('Use threshold 0.5–2×, duration 1–16 intervals, and recurrence 2–5 nights.');
  return c;
 }
 function detect(d,input,config={}){
  const c=configuration(config),alerts=[];
  for(const b of d.buildings){
   const rows=input[b.id].map(r=>({...r,flag:'',context_flag:''}));let flat=0,demand=0,active=null;
   for(let j=0;j<rows.length;j++){
    const r=rows[j];flat=j&&r.p!==null&&r.p===rows[j-1].p?flat+1:1;
    const reactive=r.pf!==null&&r.pf<.75&&r.q>1.6*r.expected_q;
    demand=r.p!==null&&flat<8&&!reactive&&r.score>=b.threshold*c.threshold?demand+1:0;
    r.flag=r.p===null?'missing':flat>=8?'stale':reactive?'reactive':demand>=c.duration?'demand':'';
    if(j<28*96)continue;
    if(r.flag){if(active&&active.end===j&&active.kind===r.flag)active.end=j+1;else{active={building:b.id,start:j,end:j+1,kind:r.flag,split:r.split};alerts.push(active);}}else active=null;
   }
   const calibration=[];
   for(let j=28*96+11;j<Math.min(42*96,rows.length);j++){
    const w=rows.slice(j-11,j+1);if(j%96/4>=8&&j%96/4<20&&w.every(r=>r.p!==null&&!r.flag))calibration.push(mean(w.map(signed)));
   }
   calibration.sort((a,b)=>a-b);const limit=Math.max(1.5,calibration.length?calibration[Math.floor(.995*(calibration.length-1))]:1.5);
   const history=[];let nightStart=null,recurrent=null,sustained=null,streak=0;
   for(let i=28*96;i<rows.length;i++){
    const r=rows[i],hour=i%96/4,eligible=r.p!==null&&!['missing','stale'].includes(r.flag);
    const night=eligible&&hour<6&&signed(r)>=1.35&&r.p-r.expected>Math.max(4,Math.abs(r.expected)*.12);
    if(night){
     if(nightStart===null)nightStart=i;
     if(i%96===0&&nightStart<i){if(i-nightStart>=4)history.push([nightStart,i]);nightStart=i;recurrent=null;}
     if(i-nightStart+1>=4){
      const byNight=new Map();
      for(const [a,z] of history)if(z<=i&&i-a<=7*96&&Math.floor(a/96)<Math.floor(i/96)&&Math.abs(a%96-nightStart%96)<=4){const day=Math.floor(a/96);if(!byNight.has(day)||Math.abs(a%96-nightStart%96)<Math.abs(byNight.get(day)[0]%96-nightStart%96))byNight.set(day,[a,z]);}
      if(byNight.size>=c.nights-1&&!r.flag){if(!recurrent){recurrent={building:b.id,start:i,end:i+1,kind:'context',context_type:'repeated_night',split:r.split};alerts.push(recurrent);}recurrent.end=i+1;r.context_flag='repeated_night';}else recurrent=null;
     }
    }else{if(nightStart!==null&&i-nightStart>=4)history.push([nightStart,i]);nightStart=null;recurrent=null;}
    const w=rows.slice(Math.max(0,i-11),i+1),ready=hour>=8&&hour<20&&w.length===12&&w.every(r=>r.p!==null&&!r.flag)&&w.filter(r=>signed(r)>=.8).length>=10;
    const avg=ready?mean(w.map(signed)):0;streak=ready&&avg>=limit?streak+1:0;
    const persistent=ready&&(streak>=3||sustained&&avg>=limit*.8);
    if(persistent&&!r.context_flag){if(!sustained){sustained={building:b.id,start:i,end:i+1,kind:'context',context_type:'persistent_shift',split:r.split};alerts.push(sustained);}sustained.end=i+1;r.context_flag='persistent_shift';}else sustained=null;
   }
  }
  return alerts;
 }
 function evaluate(d,alerts){
  const events=d.events.filter(e=>e.split==='test'),as=alerts.filter(a=>a.split==='test');
  const results=events.map(e=>{const hits=as.filter(a=>overlap(a,e));return {id:e.id,detected:!!hits.length,delay:hits.length?Math.max(0,Math.min(...hits.map(a=>a.start))-e.start)*15:null};});
  const delays=results.filter(x=>x.detected).map(x=>x.delay).sort((a,b)=>a-b),mid=Math.floor(delays.length/2);
  const meterDays=d.buildings.length*(d.days-42),unmatched=as.filter(a=>!events.some(e=>overlap(a,e))).length;
  return {events:events.length,detected:results.filter(x=>x.detected).length,missed:results.filter(x=>!x.detected).length,unmatched,total:as.length,perMeterDay:as.length/meterDays,falsePerMeterDay:unmatched/meterDays,medianDelay:delays.length?(delays.length%2?delays[mid]:(delays[mid-1]+delays[mid])/2):null,results};
 }
 const api={defaults,stats,schedule,comparisons,investigations,checklist,configuration,detect,evaluate,local};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MeterwiseInsights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
