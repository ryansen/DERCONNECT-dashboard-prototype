"""Meaningful checks of the generated dataset and its alert evaluation."""
import json
import math
from datetime import datetime
from pathlib import Path

root=Path(__file__).parent
d=json.loads((root/'dist/data/simulation.json').read_text())
s={bid:[dict(zip(d['fields'],row)) for row in rows] for bid,rows in d['series'].items()}
assert sum(map(len,s.values()))==32256
assert len(d['events'])==18
for b in d['buildings']:
    rows=s[b['id']]
    assert len(rows)==56*96
    assert all((datetime.fromisoformat(y['t'])-datetime.fromisoformat(x['t'])).total_seconds()==900 for x,y in zip(rows,rows[1:]))
    assert not any(r['truth'] for r in rows[:28*96])
    assert all(r['split']=='test' for r in rows[42*96:])
    for j,r in enumerate(rows):
        assert b['battery']*.1-.002<=r['soc']<=b['battery']*.9+.002
        assert abs(r['battery'])<=b['battery']/4+.001
        previous_soc=rows[j-1]['soc'] if j else b['battery']*.5
        delta=r['battery']*.25*(.95 if r['battery']>=0 else 1/.95)
        assert abs((r['soc']-previous_soc)-delta)<.002
        if r['quality']=='ok':
            assert abs(r['p']-(r['gross']+r['ev']+r['battery']-r['solar']))<.004
            assert abs(r['pf']-abs(r['p'])/math.hypot(r['p'],r['q']))<.0002
            assert abs(r['amps']-1000*math.hypot(r['p'],r['q'])/(math.sqrt(3)*r['v']))<.01
        if r['quality']=='missing':
            assert r['p'] is None and r['q'] is None and r['flag']=='missing'
        assert r['scale']>=3
        assert not (r['flag']=='reactive' and (r['pf']>=.75 or r['q']<=1.6*r['expected_q']))
    for e in [e for e in d['events'] if e['building']==b['id']]:
        assert all(r['truth']==e['id'] for r in rows[e['start']:e['end']])
for a in d['alerts']:
    if a['kind']=='context':
        assert a['start']==a['detected_at']>=a['evidence_start']
        assert all(r['context_flag']==a['context_type'] for r in s[a['building']][a['start']:a['end']])
        assert all(e['end']<=a['start'] for e in a['evidence_events'][:-1])
    else:
        assert all(r['flag']==a['kind'] for r in s[a['building']][a['start']:a['end']])
    assert a['priority'] in ('High','Medium') and a['hypothesis'] and a['explanation']

events=[e for e in d['events'] if e['split']=='test']
alerts=[a for a in d['alerts'] if a['split']=='test']
def overlap(a,e): return a['building']==e['building'] and a['start']<e['end'] and a['end']>e['start']
matches=[(e,[a for a in alerts if overlap(a,e)]) for e in events]
correct=sum(any(overlap(a,e) for e in events) for a in alerts)
metrics=dict(test_events=len(events),detected_events=sum(bool(h) for e,h in matches),alert_episodes=len(alerts),
             matching_alert_episodes=correct,false_alerts_per_meter_day=(len(alerts)-correct)/84,
             delays_minutes={e['id']:max(0,min(a['start'] for a in h)-e['start'])*15 if h else None for e,h in matches})
point_alerts=[a for a in alerts if a['kind']!='context']
rescued=[e['id'] for e in events if any(overlap(a,e) for a in alerts) and not any(overlap(a,e) for a in point_alerts)]
assert {'E13','E14','E15','E16'}<=set(rescued), rescued
metrics['context_only_events']=rescued
metrics['point_alert_episodes']=len(point_alerts)
metrics['context_alert_episodes']=len(alerts)-len(point_alerts)
(root/'dist/data/verification.json').write_text(json.dumps(metrics,indent=2))
print('PASS: chronology, row count, labels, battery limits/energy, electrical relationships, nulls, and alert segments')
print(json.dumps(metrics,indent=2))
