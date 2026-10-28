"""Deterministic smart-meter simulation. Python 3.10+, standard library only."""
import csv
import json
import math
import random
import statistics as st
from datetime import datetime, timedelta, timezone
from pathlib import Path
from anomaly_context import context_alerts, explain_alerts

ROOT = Path(__file__).parent
OUT = ROOT if ROOT.name == 'data' else ROOT.parents[1] / 'data'
OUT.mkdir(parents=True, exist_ok=True)
SEED = 20261023
rng = random.Random(SEED)
START = datetime(2026, 8, 24, tzinfo=timezone(timedelta(hours=-7)))
N = 56 * 96
BUILDINGS = [
    dict(id='ADM', name='Administration', kind='Office', base=27, occupied=62, cooling=5.2, pv=52, battery=60, ev=14, area=6400),
    dict(id='LAB', name='Research labs', kind='Laboratory', base=115, occupied=95, cooling=7.0, pv=82, battery=100, ev=10, area=9800),
    dict(id='LIB', name='Central library', kind='Library', base=39, occupied=74, cooling=4.5, pv=60, battery=60, ev=7, area=7800),
    dict(id='STU', name='Student center', kind='Mixed use', base=33, occupied=82, cooling=5.8, pv=72, battery=80, ev=18, area=7200),
    dict(id='REC', name='Recreation center', kind='Recreation', base=48, occupied=78, cooling=5.5, pv=65, battery=80, ev=12, area=8500),
    dict(id='EVH', name='Mobility hub', kind='EV charging', base=8, occupied=8, cooling=0.4, pv=95, battery=120, ev=120, area=2000),
]

def idx(day, hour):
    return day * 96 + round(hour * 4)

def event(eid, building, day, hour, hours, kind, title, delta, action, priority='Medium'):
    a = idx(day, hour)
    return dict(id=eid, building=building, start=a, end=a+round(hours*4), type=kind, title=title, magnitude=delta,
                action=action, priority=priority, split='validation' if day < 42 else 'test')

# Curated stress cases; exact times and magnitudes are hidden from detector fitting.
EVENTS = [
    event('E01','ADM',31,0,6,'after_hours','Overnight load persists',38,'Check the BMS schedule and verify whether an overnight activity was planned.'),
    event('E02','LIB',35,13,2,'dropout','Meter stops reporting',0,'Check gateway connectivity and missing interval backfill.'),
    event('E03','LAB',38,10,0.25,'spike','Isolated demand spike',155,'Compare the interval with equipment start logs and neighboring meters.'),
    event('E04','ADM',44,0,6,'after_hours','HVAC running after hours',46,'Review the HVAC schedule, overrides, and actual occupancy. Cause requires confirmation.','High'),
    event('E05','LAB',46,10,0.25,'spike','Sudden demand spike',180,'Correlate with large equipment starts. Inspect finer-resolution data if available.','High'),
    event('E06','LIB',47,11,3,'dropout','Telemetry gap',0,'Check the meter gateway and communications before attributing this to a power outage.'),
    event('E07','STU',48,12,4,'solar_loss','Expected solar output falls',58,'Compare inverter telemetry, cloud cover, and curtailment commands.'),
    event('E08','REC',49,8,7,'flatline','Unchanging meter readings',0,'Verify the meter timestamp and gateway cache; request a fresh reading.'),
    event('E09','EVH',50,17,3,'charging','Unexpected charging peak',90,'Review charger sessions and the managed charging schedule.','High'),
    event('E10','LAB',51,0,72,'drift','Baseload gradually rises',75,'Check persistent equipment loads and compare cooling demand with weather.'),
    event('E11','ADM',53,0,6,'after_hours','Overnight HVAC load returns',48,'Check recurring schedule overrides; confirm the change with the facility team.','High'),
    event('E12','LIB',54,10,4,'low_pf','Reactive demand increases',0,'Review reactive power and equipment state. Confirm with suitable power-quality measurements.'),
    event('E13','ADM',48,0,3,'after_hours','Small overnight increase, first recurrence',12,'Compare the same overnight window across multiple days.'),
    event('E14','ADM',49,0,3,'after_hours','Small overnight increase repeats',12,'Inspect repeated overnight operation; each reading remains below the point limit.'),
    event('E15','ADM',50,0,3,'after_hours','Third small overnight increase',12,'Review recurring schedule overrides across nights.'),
    event('E16','ADM',54,8,10,'persistent_load','Persistent modest daytime increase',12,'Inspect a sustained sequence that individual point limits miss.'),
    event('E17','REC',47,11,3,'dropout','Concurrent recreation meter gap',0,'Compare other meters before treating this as an isolated device problem.'),
    event('E18','STU',47,11,3,'dropout','Concurrent student center meter gap',0,'Check for a shared collection or communications problem.'),
]

rows_by_building = {}
for b in BUILDINGS:
    rows = []
    soc = b['battery'] * .5
    ar = 0
    for i in range(N):
        t = START + timedelta(minutes=15*i)
        day, slot = divmod(i,96)
        hour = slot/4
        weekend = t.weekday() >= 5
        cloud = .78 + .18*math.sin(day*.7) + .04*math.sin(i*.18)
        temp = 22.5 + 5.4*math.sin((hour-9)*math.pi/12) + 2.5*math.sin(day*.22) + rng.gauss(0,.22)
        occ = max(0, math.sin((hour-6)*math.pi/16)) if 6<=hour<=22 else 0
        if weekend: occ *= .42 if b['id'] not in ('REC','LIB') else .8
        cooling = max(0,temp-21)*b['cooling']*(.22+.78*occ)
        ar = .82*ar + rng.gauss(0,b['base']*.018)
        gross = max(2,b['base'] + b['occupied']*occ + cooling + ar)
        solar = max(0,math.sin((hour-6)*math.pi/12))*b['pv']*cloud if 6<=hour<=18 else 0
        ev = b['ev']*(math.exp(-((hour-10)/2.8)**2)+.6*math.exp(-((hour-17)/2)**2))*(.5 if weekend else 1)
        ev *= max(0,1+rng.gauss(0,.08))
        batt = 0.0  # Positive = charge, negative = discharge; AC side.
        rate = b['battery']/4
        if 10<=hour<14:
            batt=min(rate,(b['battery']*.9-soc)/(.95*.25))
        elif 16<=hour<20:
            batt=-min(rate,(soc-b['battery']*.1)*.95/.25)
        if batt>=0: soc += batt*.25*.95
        else: soc += batt*.25/.95
        clean = gross+ev+batt-solar
        q = (gross+ev)*math.tan(math.acos(.96))
        p = clean
        quality = 'ok'
        truth = ''
        # Injections act on loads / generation or observed meter channels.
        for e in EVENTS:
            if e['building']!=b['id'] or not e['start']<=i<e['end']: continue
            truth=e['id']
            k=e['type']
            if k in ('after_hours','spike','charging','persistent_load'):
                p += e['magnitude']; q += e['magnitude']*.3
                if k=='charging': ev += e['magnitude']
                else: gross += e['magnitude']
            elif k=='solar_loss':
                loss=min(solar,e['magnitude']); solar-=loss; p+=loss
            elif k=='drift':
                delta=e['magnitude']*(i-e['start']+1)/(e['end']-e['start'])
                p+=delta; gross+=delta; q+=delta*.3
            elif k=='low_pf': q=max(abs(p),30)*.95
            elif k=='dropout': quality='missing'
            elif k=='flatline': quality='stale'
        v=480 + rng.gauss(0,.8)-.004*(gross+ev)
        pf=abs(p)/math.hypot(p,q)
        current=math.hypot(p,q)*1000/(math.sqrt(3)*v)
        measured=dict(p=round(p,3),q=round(q,3),v=round(v,2),pf=round(pf,4),amps=round(current,3))
        if quality=='missing': measured={key:None for key in measured}
        if quality=='stale': measured={key:rows[-1][key] for key in measured}
        row=dict(i=i,t=t.isoformat(),building=b['id'],temp=round(temp,2),**measured,
                 gross=round(gross,3),solar=round(solar,3),ev=round(ev,3),battery=round(batt,3),soc=round(soc,3),
                 clean=round(clean,3),truth=truth,quality=quality,
                 split='train' if day<28 else 'validation' if day<42 else 'test')
        rows.append(row)
    rows_by_building[b['id']]=rows

def bucket(row):
    t=datetime.fromisoformat(row['t'])
    return (t.weekday()>=5,row['i']%96)

for b in BUILDINGS:
    rows=rows_by_building[b['id']]
    train=rows[:28*96]
    groups={}
    for r in train: groups.setdefault(bucket(r),[]).append(r)
    # Pooled within-bucket temperature coefficient learned from training observations.
    numerator=denominator=0
    for group in groups.values():
        mt=st.mean(r['temp'] for r in group); mp=st.mean(r['p'] for r in group)
        numerator+=sum((r['temp']-mt)*(r['p']-mp) for r in group)
        denominator+=sum((r['temp']-mt)**2 for r in group)
    beta=numerator/denominator
    centers={k:(st.median(r['p']-beta*r['temp'] for r in g)) for k,g in groups.items()}
    residuals={k:[abs(r['p']-(centers[k]+beta*r['temp'])) for r in g] for k,g in groups.items()}
    for r in rows:
        expected=centers[bucket(r)]+beta*r['temp']
        scale=max(1.4826*st.median(residuals[bucket(r)]),abs(expected)*.07,3)
        r.update(expected=round(expected,3),scale=round(scale,3),expected_q=round(st.median(x['q'] for x in groups[bucket(r)]),3))
        r['score']=round(abs(r['p']-expected)/scale,3) if r['p'] is not None else 0
    # Label-free calibration on chronological validation, including its injected contamination.
    val_scores=sorted(r['score'] for r in rows[28*96:42*96] if r['p'] is not None)
    b['threshold']=round(max(3,val_scores[int(.995*(len(val_scores)-1))]),3)
    b['temperature_coefficient']=round(beta,3)
    streak=0
    for j,r in enumerate(rows):
        streak=streak+1 if j and r['p'] is not None and r['p']==rows[j-1]['p'] else 1
        r['flat_streak']=streak
        r['flag']=('missing' if r['p'] is None else 'stale' if streak>=8 else
                   'reactive' if r['pf'] is not None and r['pf']<.75 and r['q']>1.6*r['expected_q'] else
                   'demand' if r['score']>=b['threshold'] else '')

# Adjacent detections per building become one operational alert; no truth is used here.
ALERTS=[]
for b in BUILDINGS:
    rows=rows_by_building[b['id']]
    active=None
    for r in rows[28*96:]:
        if r['flag']:
            if active and r['i']==active['end'] and r['flag']==active['kind']:
                active['end']+=1
            else:
                active=dict(id=f'A{len(ALERTS)+1:03}',building=b['id'],start=r['i'],end=r['i']+1,kind=r['flag'])
                ALERTS.append(active)
        else: active=None
    for a in [x for x in ALERTS if x['building']==b['id']]:
        segment=rows[a['start']:a['end']]
        peak=max(r['score'] for r in segment)
        a.update(peak_score=round(peak,2),excess_kwh=round(sum(max(0,r['p']-r['expected'])*.25 for r in segment if r['p'] is not None),1),
                 priority='High' if peak>=8 or a['kind']=='missing' else 'Medium',
                 title={'missing':'Meter not reporting','stale':'Meter readings are unchanged','reactive':'Reactive demand is elevated','demand':'Demand differs from the expected pattern'}[a['kind']],
                 split=segment[0]['split'])

CONTEXT_ALERTS=context_alerts(rows_by_building,BUILDINGS)
ALERTS=explain_alerts(ALERTS+CONTEXT_ALERTS,rows_by_building,BUILDINGS)

fields=list(next(iter(rows_by_building.values()))[0].keys())
with (OUT/'meter_readings.csv').open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
    for rows in rows_by_building.values(): writer.writerows(rows)
with (OUT/'injected_events.csv').open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f,fieldnames=list(EVENTS[0]));writer.writeheader();writer.writerows(EVENTS)
data=dict(seed=SEED,start=START.isoformat(),interval_minutes=15,days=56,buildings=BUILDINGS,events=EVENTS,alerts=ALERTS,revision=2,
          fields=fields,series={bid:[[r[k] for k in fields] for r in rows] for bid,rows in rows_by_building.items()})
(OUT/'simulation.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
metadata=dict(seed=SEED,rows=N*len(BUILDINGS),meters=len(BUILDINGS),interval_minutes=15,
              timezone='America/Los_Angeles; fixed UTC-07:00 during this date range',start=START.isoformat(),
              end=(START+timedelta(minutes=15*N)).isoformat(),end_exclusive=True,
              splits={'train_days':28,'validation_days':14,'test_days':14},injected_events=len(EVENTS),detected_alerts=len(ALERTS),context_alerts=len(CONTEXT_ALERTS),
              units={'p':'kW net import (negative export)','q':'kvar, positive inductive','v':'V line-to-line','amps':'A balanced three-phase equivalent','pf':'magnitude |P|/sqrt(P²+Q²)','temp':'deg C','battery':'kW, positive charge','soc':'kWh stored energy'},
              provenance='Entirely synthetic. Inspired by DERConnect asset types, not fitted to real DERConnect data.',
              detector='Training-only weekday/weekend slot medians plus within-slot temperature coefficient. Robust scale with 7%/3 kW floor. Validation 99.5th percentile threshold, minimum 3. Missing, 8 repeated intervals, and PF below 0.75 with Q above 1.6x the training slot median are separate illustrative rules.')
metadata['context_rules']='Causal four-reading overnight episodes repeated near the same time within 7 days; and rolling 12-reading daytime windows with mean signed score above a validation-calibrated 99.5th percentile (minimum 1.5) for 3 consecutive checks, at least 10 scores >=0.8, and no point flags. Sequence release uses 80% of the trigger threshold. Context detections start at the evidence trigger, never at the earlier evidence window. Simultaneous missing-data alerts are linked across meters using only detections already available.'
(OUT/'metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
print(json.dumps(metadata,indent=2))
