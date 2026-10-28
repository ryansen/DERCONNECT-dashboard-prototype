const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const M=require('../../workspace-data.js');
const rev='r2:'+'a'.repeat(64),other='r2:'+'b'.repeat(64),ctx={buildingIds:['ADM','LIB'],alertIds:['A001','A002'],datasetRevision:rev};
const cal=(extra={})=>({id:'cal-one',scope:'ADM',type:'maintenance',title:'Overnight work',start:'2026-10-16T07:00:00.000Z',end:'2026-10-16T13:00:00.000Z',notes:'Check work log',...extra});
const feedback=(extra={})=>({alertId:'A001',datasetRevision:rev,outcome:'expected_operation',cause:'hvac',notes:'Work was scheduled',createdAt:'2026-10-27T12:00:00.000Z',updatedAt:'2026-10-27T13:00:00.000Z',...extra});
function payload(calendar=[],feedback=[]){return {format:M.FORMAT,schemaVersion:1,timeZone:M.ZONE,calendar,feedback};}

test('Los Angeles wall times are independent of browser timezone and handle daylight saving',()=>{
 assert.equal(M.wallToIso('2026-10-16T00:00'),'2026-10-16T07:00:00.000Z');
 assert.equal(M.wallToIso('2026-12-16T00:00'),'2026-12-16T08:00:00.000Z');
 assert.equal(M.isoToWall('2026-10-16T07:00:00Z'),'2026-10-16T00:00');
 assert.throws(()=>M.wallToIso('2026-03-08T02:30'),/skipped/);
 assert.throws(()=>M.wallToIso('2026-11-01T01:30'),/twice/);
 assert.throws(()=>M.wallToIso('2026-02-30T00:00'),/Invalid/);
});
test('calendar validates required fields, scopes, types, and half-open ranges',()=>{
 assert.equal(M.calendarRecord(cal(),ctx).scope,'ADM');
 for(const change of [{title:''},{scope:'other'},{type:'secret'},{end:cal().start},{end:'2026-10-15T07:00:00Z'},{start:'2026-02-30T07:00:00Z'}])assert.throws(()=>M.calendarRecord(cal(change),ctx));
});
test('calendar matches alert or evidence only for its building or campus-wide scope',()=>{
 const from=Date.parse(cal().start),to=Date.parse(cal().end);
 const entries=[cal(),cal({id:'global',scope:'ALL'}),cal({id:'other-building',scope:'LIB'})];
 assert.equal(M.overlappingCalendar(entries,['ADM'],[{start:to,end:to+900000,type:'alert'}]).length,0);
 const matches=M.overlappingCalendar(entries,['ADM'],[{start:from,end:to,type:'support'}]);
 assert.deepEqual(matches.map(m=>m.entry.id),['cal-one','global']);
 assert.deepEqual(matches[0].matchTypes,['support']);
});
test('click hits preserve every overlapping alert and use end-exclusive boundaries',()=>{
 const alerts=[{id:'A001',start:10,end:12},{id:'A002',start:11,end:13}];
 assert.deepEqual(M.alertsAt(alerts,11).map(a=>a.id),['A001','A002']);
 assert.deepEqual(M.alertsAt(alerts,12).map(a=>a.id),['A002']);
 assert.equal(M.alertsAt(alerts,13).length,0);
});
test('zoom includes padding, whole long alerts, or supporting history without editing detection',()=>{
 const a={start:100,end:300,evidence_start:99,evidence_events:[{start:20,end:24}]},snapshot=JSON.stringify(a);
 assert.deepEqual(M.zoomBounds(a,'event',1000),{start:92,end:308});
 assert.deepEqual(M.zoomBounds(a,'day',1000),{start:96,end:384});
 assert.deepEqual(M.zoomBounds(a,'history',1000),{start:12,end:308});
 assert.deepEqual(M.zoomBounds({start:2,end:9},'event',12),{start:0,end:12});
 assert.equal(JSON.stringify(a),snapshot);
});
test('feedback requires outcome and valid chronology but permits optional cause and notes',()=>{
 assert.equal(M.feedbackRecord(feedback({cause:'',notes:''}),ctx).outcome,'expected_operation');
 for(const change of [{outcome:''},{cause:'fake'},{datasetRevision:'2'},{alertId:'unknown'},{updatedAt:'2026-10-26T13:00:00Z'}])assert.throws(()=>M.feedbackRecord(feedback(change),ctx));
 assert.equal(M.feedbackRecord(feedback({datasetRevision:other,alertId:'old-alert'}),ctx).alertId,'old-alert');
 assert.notEqual(M.feedbackKey(feedback()),M.feedbackKey(feedback({datasetRevision:other})));
});
test('regenerated datasets with reused alert IDs receive different fingerprints',async()=>{
 const a=await M.revisionFor({revision:2},'{"id":"A001","reading":1}',crypto);
 const b=await M.revisionFor({revision:2},'{"id":"A001","reading":2}',crypto);
 assert.notEqual(a,b);assert.match(a,/^r2:[a-f0-9]{64}$/);
});
test('export/import JSON round trip preserves normalized calendar and feedback records',()=>{
 const current={...M.emptyState(),calendar:[M.calendarRecord(cal(),ctx)],feedback:[M.feedbackRecord(feedback(),ctx)]};
 const exported=JSON.parse(JSON.stringify(M.exportRecords(current)));
 const preview=M.previewImport(exported,M.emptyState(),ctx);
 assert.equal(preview.invalid.length,0);assert.equal(preview.conflicts.length,0);
 assert.deepEqual(M.mergeImport(M.emptyState(),preview),current);
});
test('imports preview new, invalid, and conflicting records; overwrite is opt-in',()=>{
 const current={...M.emptyState(),calendar:[M.calendarRecord(cal(),ctx)],feedback:[]},snapshot=JSON.stringify(current);
 const p=M.previewImport(payload([cal({title:'Replacement'}),cal({id:'new'}),cal({id:'bad',end:cal().start})]),current,ctx);
 assert.equal(p.calendar.length,1);assert.equal(p.invalid.length,1);assert.equal(p.conflicts.length,1);
 assert.equal(M.mergeImport(current,p).calendar.find(c=>c.id==='cal-one').title,'Overnight work');
 assert.equal(M.mergeImport(current,p,true).calendar.find(c=>c.id==='cal-one').title,'Replacement');
 assert.equal(JSON.stringify(current),snapshot);
});
test('duplicate keys inside one file are invalid instead of silently choosing a winner',()=>{
 const p=M.previewImport(payload([cal(),cal({title:'Different title'})],[feedback(),feedback({notes:'Different notes'})]),M.emptyState(),ctx);
 assert.equal(p.invalid.length,4);assert.equal(p.calendar.length,0);assert.equal(p.feedback.length,0);
});
test('malformed or unsupported import envelopes do not change existing records',()=>{
 const current={...M.emptyState(),calendar:[cal()],feedback:[]},snapshot=JSON.stringify(current);
 for(const p of [null,[],{...payload(),schemaVersion:99},{...payload(),timeZone:'UTC'},{...payload(),feedback:{}}])assert.throws(()=>M.previewImport(p,current,ctx));
 assert.equal(JSON.stringify(current),snapshot);
});
test('imported markup remains plain text and unknown properties are not copied',()=>{
 const source=JSON.parse(JSON.stringify(cal({title:'<img src=x onerror=alert(1)>',notes:'<script>bad()</script>'})));source.extra='unused';
 const clean=M.calendarRecord(source,ctx);assert.equal(clean.title,source.title);assert.equal(clean.extra,undefined);assert.equal({}.polluted,undefined);
});
