import copy
import unittest
from anomaly_context import context_alerts, explain_alerts


def fixture():
    return {'X':[dict(i=i,p=100.,expected=100.,scale=10.,score=0.,flag='',split='test' if i>=42*96 else 'validation' if i>=28*96 else 'train') for i in range(56*96)]},[dict(id='X',threshold=3.)]


def add(rows, day, hour, count, amount=20):
    for r in rows[day*96+hour*4:day*96+hour*4+count]:
        r['p']+=amount;r['score']=abs(r['p']-r['expected'])/r['scale']


class ContextRules(unittest.TestCase):
    def test_one_moderate_night_is_insufficient(self):
        series,b=fixture();add(series['X'],43,0,8)
        self.assertFalse(context_alerts(series,b))

    def test_repeated_night_needs_previous_episode_and_four_readings(self):
        series,b=fixture();add(series['X'],43,0,8);add(series['X'],44,0,8)
        full=context_alerts(copy.deepcopy(series),copy.deepcopy(b))
        self.assertEqual(len(full),1)
        a=full[0];self.assertEqual(a['start'],44*96+3)
        self.assertTrue(all(not r['flag'] for r in series['X'][a['start']:a['end']]))
        prefix={'X':copy.deepcopy(series['X'][:44*96+3])}
        self.assertFalse(context_alerts(prefix,copy.deepcopy(b)))
        prefix={'X':copy.deepcopy(series['X'][:44*96+4])}
        self.assertEqual(context_alerts(prefix,copy.deepcopy(b))[0]['start'],a['start'])

    def test_fragments_on_one_night_do_not_count_as_multiple_nights(self):
        series,b=fixture();add(series['X'],43,0,4)
        for r in series['X'][43*96+5:43*96+9]:r.update(p=120.,score=2.)
        for r in series['X'][44*96+2:44*96+8]:r.update(p=120.,score=2.)
        found=context_alerts(series,b)
        self.assertEqual(len(found),1)
        self.assertEqual(found[0]['priority'],'Medium')
        self.assertEqual(len(found[0]['evidence_events']),1)
        self.assertEqual(found[0]['trigger_evidence']['end'],found[0]['start']+1)

    def test_history_expires_after_seven_days(self):
        series,b=fixture();add(series['X'],43,0,8);add(series['X'],51,0,8)
        self.assertFalse(context_alerts(series,b))

    def test_persistent_subthreshold_load_detected_without_backdating(self):
        series,b=fixture();add(series['X'],44,8,32)
        found=context_alerts(series,b)
        self.assertEqual(len(found),1);a=found[0]
        self.assertEqual(a['context_type'],'persistent_shift')
        self.assertEqual(a['start'],44*96+32+11)  # 10/12 elevated points, then 3 qualifying checks
        self.assertLess(a['evidence_start'],a['start'])
        self.assertTrue(all(r['score']<3 for r in series['X']))

    def test_gap_breaks_sequence_evidence(self):
        series,b=fixture();add(series['X'],44,8,20)
        series['X'][44*96+32+10].update(p=None,flag='missing')
        self.assertFalse(context_alerts(series,b))

    def test_injected_labels_cannot_change_detection_or_hypotheses(self):
        series,b=fixture();add(series['X'],43,0,8);add(series['X'],44,0,8)
        clean=context_alerts(copy.deepcopy(series),copy.deepcopy(b))
        changed=copy.deepcopy(series)
        for r in changed['X']: r.update(truth='arbitrary false label',quality='invented',solar=999999,clean=-999999)
        other=context_alerts(changed,copy.deepcopy(b))
        self.assertEqual(clean,other)
        first=explain_alerts(copy.deepcopy(clean),series,b)
        second=explain_alerts(copy.deepcopy(other),changed,b)
        self.assertEqual(first,second)

    def test_simultaneous_missing_alerts_link_but_future_alert_does_not(self):
        series,b=fixture();at=44*96
        for r in series['X'][at:at+4]:r.update(p=None,flag='missing')
        series['Y']=copy.deepcopy(series['X']);b.append(dict(id='Y',threshold=3.))
        series['Z']=copy.deepcopy(series['X']);b.append(dict(id='Z',threshold=3.))
        alerts=[dict(id='A',building='X',start=at,end=at+4,kind='missing',priority='High',peak_score=0),dict(id='B',building='Y',start=at,end=at+4,kind='missing',priority='High',peak_score=0),dict(id='C',building='Z',start=at+1,end=at+4,kind='missing',priority='High',peak_score=0)]
        out=explain_alerts(alerts,series,b)
        self.assertEqual(out[0]['related_ids'],['B'])
        self.assertEqual(set(out[2]['related_ids']),{'A','B'})


if __name__=='__main__': unittest.main()
