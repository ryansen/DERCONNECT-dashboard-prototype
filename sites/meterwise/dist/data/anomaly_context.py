"""Observable-only contextual rules and explanations. No injection labels are read."""
import statistics as st


def residual(row):
    return (row['p']-row['expected'])/row['scale'] if row['p'] is not None else 0


def evidence(rows, start, end, label, threshold):
    values=rows[start:end]
    valid=[r for r in values if r['p'] is not None]
    return dict(start=start,end=end,label=label,
                mean_kw=round(st.mean(r['p'] for r in valid),1) if valid else None,
                expected_kw=round(st.mean(r['expected'] for r in valid),1) if valid else None,
                mean_score=round(st.mean(residual(r) for r in valid),2) if valid else 0,
                point_threshold=threshold,point_flags=sum(bool(r['flag']) for r in values))


def context_alerts(series, buildings):
    """Causal triggers: only current and earlier observations contribute to detection."""
    alerts=[]
    for b in buildings:
        rows=series[b['id']]
        calibration=[]
        for j in range(28*96+11,min(42*96,len(rows))):
            w=rows[j-11:j+1]
            if 8<=j%96/4<20 and all(x['p'] is not None and not x['flag'] for x in w):
                calibration.append(st.mean(residual(x) for x in w))
        calibration.sort()
        sequence_limit=max(1.5,calibration[int(.995*(len(calibration)-1))] if calibration else 1.5)
        b['sequence_threshold']=round(sequence_limit,3)
        history=[]
        night_start=None
        recurrent=None
        sustained=None
        sequence_streak=0
        for r in rows:
            i=r['i']; hour=(i%96)/4
            r['context_flag']=''
            if i<28*96: continue
            eligible=r['p'] is not None and r['flag'] not in ('missing','stale')
            night=eligible and hour<6 and residual(r)>=1.35 and r['p']-r['expected']>max(4,abs(r['expected'])*.12)
            if night:
                if night_start is None: night_start=i
                # Reset at midnight, even if a run crosses the boundary.
                if i%96==0 and night_start<i:
                    if i-night_start>=4: history.append((night_start,i))
                    night_start=i;recurrent=None
                if i-night_start+1>=4:
                    candidates=[(a,z) for a,z in history if z<=i and i-a<=7*96 and a//96<i//96 and abs(a%96-night_start%96)<=4]
                    by_night={}
                    for a,z in candidates:
                        day=a//96
                        if day not in by_night or abs(a%96-night_start%96)<abs(by_night[day][0]%96-night_start%96):
                            by_night[day]=(a,z)
                    prior=sorted(by_night.values())
                    if prior and not r['flag']:
                        if recurrent is None:
                            sources=prior[-3:]
                            recurrent=dict(id=f'C{len(alerts)+1:03}',building=b['id'],start=i,end=i+1,kind='context',
                                context_type='repeated_night',title='Repeated after-hours load',split=r['split'],
                                evidence_start=night_start,detected_at=i,trigger_evidence=evidence(rows,night_start,i+1,'Current episode at first detection',b['threshold']),
                                evidence_events=[evidence(rows,a,z,'Earlier after-hours episode',b['threshold']) for a,z in sources],
                                related_ids=[],priority='High' if len(prior)>=2 else 'Medium')
                            alerts.append(recurrent)
                        recurrent['end']=i+1
                        recurrent['current_evidence']=evidence(rows,night_start,i+1,'Current repeated episode',b['threshold'])
                        r['context_flag']='repeated_night'
                    else: recurrent=None
            else:
                if night_start is not None and i-night_start>=4: history.append((night_start,i))
                night_start=None;recurrent=None
            # A 3-hour sequence can be unusual even though every point is under its limit.
            window=rows[i-11:i+1] if i>=11 else []
            sequence_ready=(8<=hour<20 and len(window)==12 and all(x['p'] is not None and not x['flag'] for x in window)
                and sum(residual(x)>=.8 for x in window)>=10)
            window_mean=st.mean(residual(x) for x in window) if sequence_ready else 0
            sequence_streak=sequence_streak+1 if sequence_ready and window_mean>=sequence_limit else 0
            persistent=sequence_ready and (sequence_streak>=3 or sustained is not None and window_mean>=sequence_limit*.8)
            if persistent and not r['context_flag']:
                if sustained is None:
                    sustained=dict(id=f'C{len(alerts)+1:03}',building=b['id'],start=i,end=i+1,kind='context',
                        context_type='persistent_shift',title='Sustained moderate load increase',split=r['split'],
                        evidence_start=i-13,detected_at=i,trigger_evidence=evidence(rows,i-13,i+1,'Sequence evidence at first detection',b['threshold']),evidence_events=[],related_ids=[],priority='Medium',sequence_threshold=round(sequence_limit,3))
                    alerts.append(sustained)
                sustained['end']=i+1
                sustained['current_evidence']=evidence(rows,sustained['evidence_start'],i+1,'Accumulated load evidence',b['threshold'])
                if i+1-sustained['evidence_start']>=24: sustained['priority']='High'
                r['context_flag']='persistent_shift'
            else: sustained=None
        for a in [a for a in alerts if a['building']==b['id']]:
            current=rows[a['start']:a['end']]
            a['peak_score']=round(max(x['score'] for x in current),2)
            a['excess_kwh']=round(sum(max(0,x['p']-x['expected'])*.25 for x in current),1)
    return alerts


def explain_alerts(alerts, series, buildings):
    """Interpret measured patterns; never use latent components or known injected causes."""
    thresholds={b['id']:b['threshold'] for b in buildings}
    for a in alerts:
        rows=series[a['building']];rr=rows[a['start']:a['end']]
        valid=[r for r in rr if r['p'] is not None]
        delta=st.mean(r['p']-r['expected'] for r in valid) if valid else 0
        hours=(a['end']-a['start'])*.25
        a.setdefault('detected_at',a['start']);a.setdefault('evidence_start',a['start'])
        a.setdefault('evidence_events',[]);a.setdefault('related_ids',[])
        a['detection_layer']='History / sequence' if a['kind']=='context' else 'Interval / electrical rule'
        a['context_notes']=[]
        if a['kind']=='context':
            ev=a['trigger_evidence']
            a['evidence_events']=a['evidence_events']+[ev]
            if a['context_type']=='repeated_night':
                a['likely_type']='Recurring after-hours operation'
                a['explanation']=f"An overnight load increase has returned on {len(a['evidence_events'])} separate nights within seven days. The current sequence was detected after four readings; its mean demand is {ev['mean_kw']:.1f} kW versus {ev['expected_kw']:.1f} kW expected."
                a['hypothesis']='A repeated schedule override or equipment left operating after hours is possible.'
                a['next_step']='Compare BMS overrides and occupancy logs across the listed nights. Confirm whether the repeated operation was planned.'
            else:
                a['likely_type']='Persistent contextual load shift'
                a['explanation']=f"Three consecutive rolling 3-hour windows stayed above the calibrated sequence limit ({a['sequence_threshold']:.2f}), with at least ten of twelve signed scores above 0.8 in each window. Every individual reading in the 3.5-hour trigger evidence stayed under its point limit."
                a['hypothesis']='A persistent extra load or a change in operating schedule may be developing.'
                a['next_step']='Compare equipment schedules and BMS trends with the 3.5-hour lead-in. Check whether an operational change explains the increase.'
            a['context_notes'].append(f"The demand detector's per-meter point threshold is {thresholds[a['building']]:.2f}. This alert accumulates multiple observations rather than lowering that point threshold.")
            a['alternatives']='Planned occupancy, a legitimate operating change, or baseline model error can create a similar pattern.'
        elif a['kind']=='missing':
            a['likely_type']='Telemetry / communications gap'
            a['explanation']=f"{len(rr)} consecutive readings are missing ({hours:g} hours). There is no observed zero-demand measurement in this gap."
            a['hypothesis']='Meter or gateway communications may have failed.'
            a['alternatives']='A meter power loss or collection-system problem can also cause missing telemetry.'
            a['next_step']='Check the gateway, meter heartbeat, and backfill status before inferring a building outage.'
        elif a['kind']=='stale':
            a['likely_type']='Frozen or cached meter readings'
            a['explanation']=f"Active-power readings repeat exactly for at least eight intervals. The unchanged sequence is flagged for {hours:g} hours after the repetition rule triggers."
            a['hypothesis']='A meter value may be frozen or repeatedly served from a gateway cache.'
            a['alternatives']='An exceptionally steady load can also repeat values; compare other channels and device timestamps.'
            a['next_step']='Check acquisition timestamps, compare other channels, and request a fresh meter reading.'
        elif a['kind']=='reactive':
            a['likely_type']='Unexpected reactive-power behavior'
            a['explanation']='Power factor is below 0.75 while reactive demand is above 1.6 times its training-period slot median. Both conditions are required.'
            a['hypothesis']='A change in inductive equipment or reactive compensation is possible.'
            a['alternatives']='Changed generation or a metering/configuration issue may affect these values.'
            a['next_step']='Compare equipment states and reactive compensation status; verify with appropriate power-quality measurements.'
        else:
            night=sum(r['i']%96<24 for r in rr)>=len(rr)*.75
            upward=delta>=0
            if len(rr)<=2: kind='Short demand spike' if upward else 'Short demand drop'
            elif night and upward: kind='Unusual after-hours operation'
            elif len(valid)>=12 and valid[-1]['p']-valid[-1]['expected']>valid[0]['p']-valid[0]['expected']+2*valid[0]['scale']: kind='Rising demand / possible drift'
            else: kind='Unexpected net-demand increase' if upward else 'Unexpected net-demand decrease'
            a['likely_type']=kind
            a['explanation']=f"Net demand averages {abs(delta):.1f} kW {'above' if upward else 'below'} its time- and temperature-aware expectation across {len(rr)} flagged intervals ({hours:g} hours). Peak residual score is {a['peak_score']:.1f}; the point threshold is {thresholds[a['building']]:.2f}."
            a['hypothesis']=('Equipment may have started unexpectedly or briefly changed state.' if len(rr)<=2 else 'A schedule override, extra equipment load, or unplanned occupancy is possible.' if night else 'An added load or reduced behind-the-meter generation is possible.' if upward else 'Load shedding, changed occupancy, or additional local generation is possible.')
            a['alternatives']='A planned operational change or baseline model error may explain the deviation.'
            a['next_step']='Compare BMS schedules, occupancy, equipment starts, and available inverter/charger telemetry before assigning a cause.'
        # Related episodes only use detections available by this alert's trigger time.
        if a['kind']=='missing':
            related=[other for other in alerts if other['kind']=='missing' and other['building']!=a['building'] and abs(other['start']-a['start'])<=1 and other['start']<=a['start']]
            if related:
                a['related_ids']=[other['id'] for other in related]
                a['context_notes'].append(f"{len(related)+1} meters have missing-data detections within one interval by this detection time. A shared gateway or upstream collection issue is a stronger possibility than an isolated meter problem; topology is unverified.")
                a['hypothesis']='A shared communications or collection problem may be affecting multiple meters.'
        if a['kind']=='demand':
            earlier=[o for o in alerts if o['kind']=='demand' and o['building']==a['building'] and 0<a['start']-o['start']<=7*96 and o['end']<=a['start'] and abs(o['start']%96-a['start']%96)<=4]
            if earlier:
                a['related_ids']=[o['id'] for o in earlier[-3:]]
                a['context_notes'].append(f"{len(earlier)} earlier demand episode(s) started near the same time of day in the preceding week. Review them together when checking operating schedules.")
        if a['priority']=='High':
            if a['kind']=='missing': reason='Meter telemetry is absent, limiting visibility into building demand.'
            elif a.get('context_type')=='repeated_night': reason=f"The after-hours pattern appears on {len(a['evidence_events'])} separate nights within a week."
            elif a.get('context_type')=='persistent_shift': reason='The accumulated load evidence spans at least six hours.'
            else: reason=f"Peak residual score {a['peak_score']:.1f} exceeds the high-priority cutoff of 8."
        else:
            reason='A smaller deviation, a repeated sequence, or an electrical/data-quality pattern warrants investigation.'
        a['severity_reason']=a['priority']+': '+reason+' Priority indicates prototype review urgency, not a confirmed fault or electrical safety rating.'
    return alerts
