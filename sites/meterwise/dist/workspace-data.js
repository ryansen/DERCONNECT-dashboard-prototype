/* Browser-local records and pure validation shared by the UI and regression tests. */
(function(root){
 const FORMAT='meterwise-investigations',VERSION=1,ZONE='America/Los_Angeles';
 const TYPES={hours:'Normal operating hours',closure:'Holiday or closure',maintenance:'Planned maintenance',occupancy:'Special occupancy event'};
 const OUTCOMES={confirmed_issue:'Confirmed operational issue',expected_operation:'Expected operation',data_problem:'Meter or data-quality problem',needs_investigation:'Needs more investigation'};
 const CAUSES={hvac:'HVAC or scheduling',occupancy:'Occupancy change',solar:'Solar generation',battery:'Battery operation',ev:'EV charging',meter:'Meter or communications',other:'Other / unknown'};
 const wallFormat=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function isoToWall(iso){const p=Object.fromEntries(wallFormat.formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
 function wallToIso(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Enter a complete local date and time.');
  const [y,m,d,h,n]=value.match(/\d+/g).map(Number),utc=Date.UTC(y,m-1,d,h,n);
  const matches=[-7,-8].map(offset=>new Date(utc-offset*3600000).toISOString()).filter(iso=>isoToWall(iso)===value);
  if(matches.length===2)throw Error('This Los Angeles time occurs twice during the daylight-saving transition. Choose an unambiguous time.');
  if(!matches.length)throw Error('Invalid Los Angeles date/time, or a time skipped during daylight saving.');
  return matches[0];
 }
 function object(x){if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Expected a record object.');}
 function text(x,label,max=2000,required=false){if(typeof x!=='string')throw Error(`${label} must be text.`);x=x.trim();if(required&&!x)throw Error(`${label} is required.`);if(x.length>max)throw Error(`${label} must be ${max} characters or fewer.`);return x;}
 function id(x,label){x=text(x,label,100,true);if(!/^[A-Za-z0-9_-]+$/.test(x))throw Error(`${label} contains unsupported characters.`);return x;}
 function timestamp(x,label){
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)||!Number.isFinite(Date.parse(x)))throw Error(`${label} must be an ISO timestamp with a timezone offset.`);
  const date=x.slice(0,10);if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error(`${label} has an invalid date.`);
  return new Date(x).toISOString();
 }
 function calendarRecord(x,ctx){
  object(x);const result={id:id(x.id,'Calendar ID'),scope:text(x.scope,'Building scope',100,true),type:text(x.type,'Context type',50,true),title:text(x.title,'Title',120,true),start:timestamp(x.start,'Start'),end:timestamp(x.end,'End'),notes:text(x.notes??'','Notes'),isExample:x.isExample===true};
  if(result.scope!=='ALL'&&!ctx.buildingIds.includes(result.scope))throw Error('Choose a known building or campus-wide scope.');
  if(!Object.hasOwn(TYPES,result.type))throw Error('Choose a supported context type.');
  if(Date.parse(result.end)<=Date.parse(result.start))throw Error('End must be later than start.');
  return result;
 }
 function feedbackKey(x){return JSON.stringify([x.datasetRevision,x.alertId]);}
 function feedbackRecord(x,ctx){
  object(x);const result={alertId:id(x.alertId,'Alert ID'),datasetRevision:text(x.datasetRevision,'Dataset revision',100,true),outcome:text(x.outcome,'Outcome',60,true),cause:text(x.cause??'','Cause',50),notes:text(x.notes??'','Notes'),createdAt:timestamp(x.createdAt,'Created time'),updatedAt:timestamp(x.updatedAt,'Updated time')};
  if(!/^r\d+:[a-f0-9]{64}$/.test(result.datasetRevision))throw Error('Dataset revision must include its fingerprint.');
  if(result.datasetRevision===ctx.datasetRevision&&!ctx.alertIds.includes(result.alertId))throw Error('Alert ID is not present in this dataset.');
  if(!Object.hasOwn(OUTCOMES,result.outcome))throw Error('Choose an investigation outcome.');
  if(result.cause&&!Object.hasOwn(CAUSES,result.cause))throw Error('Choose a supported cause category.');
  if(Date.parse(result.updatedAt)<Date.parse(result.createdAt))throw Error('Updated time cannot precede created time.');
  return result;
 }
 function emptyState(){return {schemaVersion:VERSION,timeZone:ZONE,calendar:[],feedback:[]};}
 function previewImport(payload,current,ctx){
  object(payload);if(payload.format!==FORMAT||payload.schemaVersion!==VERSION||payload.timeZone!==ZONE)throw Error('Use a Meterwise records export with schema version 1 and America/Los_Angeles timezone.');
  if(!Array.isArray(payload.calendar)||!Array.isArray(payload.feedback))throw Error('The export must contain calendar and feedback arrays.');
  if(payload.calendar.length+payload.feedback.length>10000)throw Error('Import up to 10,000 records at a time.');
  const result={calendar:[],feedback:[],conflicts:[],invalid:[]};
  for(const kind of ['calendar','feedback']){
   const normalize=kind==='calendar'?calendarRecord:feedbackRecord,key=kind==='calendar'?x=>x.id:feedbackKey;
   const existing=new Map(current[kind].map(r=>[key(r),r])),records=[];
   payload[kind].forEach((r,index)=>{try{const incoming=normalize(r,ctx);records.push({incoming,key:key(incoming),index:index+1});}catch(e){result.invalid.push({kind,index:index+1,error:e.message});}});
   const counts=new Map();records.forEach(r=>counts.set(r.key,(counts.get(r.key)||0)+1));
   for(const r of records){if(counts.get(r.key)>1)result.invalid.push({kind,index:r.index,error:'Duplicate record key within this file.'});else if(existing.has(r.key))result.conflicts.push({kind,key:r.key,incoming:r.incoming,existing:existing.get(r.key)});else result[kind].push(r.incoming);}
  }
  return result;
 }
 function mergeImport(current,preview,replace=false){
  const result=emptyState();for(const kind of ['calendar','feedback']){
   const key=kind==='calendar'?x=>x.id:feedbackKey,map=new Map(current[kind].map(r=>[key(r),r]));
   for(const r of preview[kind])map.set(key(r),r);
   if(replace)for(const r of preview.conflicts.filter(x=>x.kind===kind))map.set(r.key,r.incoming);
   result[kind]=[...map.values()];
  }return result;
 }
 function exportRecords(current){return {format:FORMAT,schemaVersion:VERSION,timeZone:ZONE,exportedAt:new Date().toISOString(),calendar:current.calendar,feedback:current.feedback};}
 function overlappingCalendar(entries,scopes,ranges){return entries.map(entry=>({entry,matchTypes:[...new Set(ranges.filter(r=>(entry.scope==='ALL'||scopes.includes(entry.scope))&&Date.parse(entry.start)<r.end&&Date.parse(entry.end)>r.start).map(r=>r.type))]})).filter(x=>x.matchTypes.length);}
 function alertsAt(alerts,index){return alerts.filter(a=>a.id&&a.start<=index&&a.end>index);}
 function zoomBounds(a,mode,total){
  let start=a.start-8,end=a.end+8;
  if(mode==='day'){start=Math.floor(a.start/96)*96;end=Math.max(start+96,Math.ceil(a.end/96)*96);}
  if(mode==='history'){start=Math.min(a.start,a.evidence_start??a.start,...(a.evidence_events||[]).map(e=>e.start))-8;end=Math.max(a.end,...(a.evidence_events||[]).map(e=>e.end))+8;}
  return {start:Math.max(0,start),end:Math.min(total,end)};
 }
 async function revisionFor(data,raw,cryptoProvider=globalThis.crypto){const digest=await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(raw));return `r${data.revision||1}:`+[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
 const api={FORMAT,VERSION,ZONE,TYPES,OUTCOMES,CAUSES,wallToIso,isoToWall,calendarRecord,feedbackRecord,feedbackKey,emptyState,previewImport,mergeImport,exportRecords,overlappingCalendar,alertsAt,zoomBounds,revisionFor};
 root.MeterwiseData=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
