# Meterwise: smart-meter anomaly prototype

A working, dependency-free dashboard with synthetic data, built for building managers and electrical engineers. All readings, building names, assets, and events are invented. This is a DERConnect-inspired simulation, not a DERConnect dataset or a validated digital twin.

## Open locally in Opera

Double-click `Start-Meterwise.cmd` in the top-level **Dashboard Demos** folder, then paste **http://127.0.0.1:8765** into Opera. The server runs in the background and only listens on this computer. Use `Stop-Meterwise.cmd` in that same folder to stop it. Running the start launcher again reuses an already-running copy.

## Run and regenerate

Requires Python 3.10+; no third-party packages. From this folder:

```powershell
python generate.py
python verify.py
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8765`. Open through HTTP, because the browser fetches a JSON file. `dist/` is the complete static website. The generator is deterministic with seed **20261023**. Copies of this guide and the generator are supplied in `dist/data/` for download.

## Severity and contextual anomalies

High priority is **red**, medium priority is **yellow**, with explicit labels and different symbols throughout the overview banner, building cards, chart highlights, inbox, and investigation. Filters select priority and detection layer. A working hypothesis is shown separately from measured evidence, alternatives, and suggested checks.

The interval demand detector remains unchanged. A second layer uses observable history without injection labels, simulator components, or future test observations:

- **Repeated after-hours operation:** an overnight run needs at least four readings with signed residual score >= 1.35 and excess demand > max(4 kW, 12% of expected magnitude). It becomes a contextual alert only when an earlier qualifying run began within one hour of the same time of day in the preceding seven days. The alert begins at the fourth qualifying reading (45 minutes after the first interval timestamp), never at the earlier run. Three observed nights raise its review priority to High. Current context detections occur only on intervals that do not already have a point-rule flag.
- **Persistent modest increase:** use rolling twelve-reading (3-hour) windows with no point-rule flags, at least 10 signed scores >= 0.8, and a mean above the validation 99.5th percentile (minimum 1.5). Require three consecutive qualifying checks before detection, using 3.5 hours of evidence in total. Maintain an episode while the sequence stays eligible and the mean remains above 80% of the trigger level. Stop on a missing/flagged reading or a failed continuity condition. Six hours of accumulated evidence raises priority to High.
- **Coincident missing telemetry:** missing-data alerts from different meters starting within one interval are linked only when those other detections are already available. The UI suggests a shared gateway/collection issue as a possibility. Meter topology and an electrical outage are not established.

Point-rule alerts still use score >= 8 for High, or High for missing telemetry. Other point/electrical/quality rules are Medium. Severity expresses investigation urgency for this prototype; it is not a validated equipment risk or electrical safety rating.

Six new stress cases demonstrate context: three modest overnight load increases, one sustained daytime increase (all four have no point-rule detections in their injection windows), and two additional missing-meter streams that coincide with the existing library gap. The benchmark compares point-only and combined layers, including unmatched alert counts. Event overlap metrics do not imply precise fault boundaries.

Detection delay is computed using interval-start timestamp differences. A real deployment must add the interval's reporting/availability time and processing latency. Validation-period detections are retrospective because thresholds are calibrated on the full validation split; only the test period is used for held-out metrics. The UI defaults to the complete test period so all contextual cases are visible.

The generator now requires `anomaly_context.py` in the same directory; both scripts are downloadable from the Data & methodology screen. Eight regression tests cover a single benignly ambiguous episode, repeated-event triggers, distinct-night counting, history expiry, subthreshold persistence, gaps, label independence, and causal cross-meter links. Run `python -m unittest test_context.py`.

## Three connected dashboard ideas

1. **Manager: daily attention queue.** Filter building and dates, see unusual consumption and telemetry quality, review the evidence, and mark an alert reviewed or dismissed. Suggested checks are hypotheses, not diagnoses. Review states persist only in the current browser.
2. **Engineer: signal investigation.** Switch to Electrical engineer, open an alert, compare demand with a learned expectation, and inspect reactive power, power factor, voltage, equivalent current, temperature, score, and the exact detection rule. The expected band is a heuristic alert band, not a calibrated confidence interval.
3. **Scenario lab: controlled experiments.** Inject after-hours load, a spike, drift, missing values, or flatlined readings into a clean synthetic day. Change magnitude, duration, and start time. Export the resulting scenario. Separately inspect the actual held-out test metrics and event outcomes.

## Dataset

- Six invented main meters: administration, research labs, library, student center, recreation center, and mobility hub.
- 56 days, 96 intervals/day: **32,256 rows**, August 24 through October 18, 2026. End is October 19 at 00:00, exclusive.
- All times carry `-07:00`. This date range is entirely within daylight saving time in America/Los_Angeles; there is no DST transition to resolve in this sample.
- Daily occupancy, weekday/weekend differences, correlated load noise, temperature-sensitive cooling, solar production, EV profiles, and battery operation.
- Eighteen labeled event windows: 3 in validation, 15 in test. Training is deliberately injection-free. This differs from many real unsupervised settings with contaminated training data.
- The date filter intentionally covers only the held-out test period. The time window clips at its beginning. Full history remains available through the dataset export.

### Fields and units

| Field | Meaning |
|---|---|
| `i` | Zero-based 15-minute interval index shared by all meters |
| `t`, `building` | ISO timestamp with offset; stable building ID |
| `p` | Observed interval-average active power, kW; positive import, negative export |
| `q` | Observed interval-average reactive power, kvar; positive inductive |
| `v` | Observed line-to-line RMS voltage, V; nominal value assumed 480 V |
| `pf` | Magnitude power factor: `abs(P)/hypot(P,Q)`; import/export sign is retained in `p` |
| `amps` | Balanced three-phase equivalent current: `1000*hypot(P,Q)/(sqrt(3)*V)`, A |
| `temp` | Synthetic outdoor air temperature, degrees C |
| `gross` | Simulator-only building load, kW, excluding separately modeled EV/battery/PV |
| `solar`, `ev` | Simulator-only PV generation and EV load, kW |
| `battery` | Simulator-only battery AC power, kW; positive charge, negative discharge |
| `soc` | Simulator-only stored energy at interval end, kWh |
| `clean` | Simulator-only net power before anomaly injection; the counterfactual |
| `truth` | Injected event ID, or empty string; evaluation only |
| `quality` | Simulator truth: `ok`, `missing`, or `stale`; evaluation only |
| `split` | Chronological partition: `train`, `validation`, `test` |
| `expected`, `scale` | Learned expected net kW and robust residual scale in kW |
| `expected_q` | Training weekday/weekend slot median reactive power, kvar |
| `score` | Absolute demand residual / scale; dimensionless, not a probability |
| `flat_streak` | Number of consecutively repeated observed active-power readings |
| `flag` | Independent detector output: demand, missing, stale, reactive, or empty |

Missing electrical fields are empty in CSV and `null` in JSON. A missing interval has score 0 as a serialization convention, but is explicitly classified as a data-quality alert; do not interpret 0 as a normal reading. `quality`, `truth`, `clean`, and the simulated components must not enter model fitting. `context_flag` is the additional history-rule output (`repeated_night` or `persistent_shift`), separate from the point-rule `flag`. Only active power, time, and temperature enter the demand model. The additional observed electrical fields support separate quality/reactive rules.

For valid telemetry, net import is building load + EV + battery charge - PV. For missing or stale telemetry, observed values intentionally diverge from the physical simulator. `clean` remains the pre-injection counterfactual while component columns incorporate injected physical load/generation changes. The components are not claims about real submeter availability.

The battery uses 10–90% capacity bounds, a 4-hour power rating, and 95% one-way efficiency. Positive AC charging changes SOC by `power * 0.25 * 0.95`; negative AC discharge changes SOC by `power * 0.25 / 0.95`.

### Detector and split discipline

1. **Train: Aug 24–Sep 20 (28 days).** Group observations by weekday/weekend and quarter-hour slot. Estimate a pooled temperature coefficient after subtracting each group's mean. Use medians of temperature-adjusted demand for slot centers.
2. For each slot, scale residuals using `1.4826 * median(abs(training residual))`, with a floor of 7% of absolute expected demand or 3 kW. This is an illustrative robust scale and threshold band, not a formal predictive distribution.
3. **Validate: Sep 21–Oct 4 (14 days).** Freeze the threshold at each meter's 99.5th percentile demand score, minimum 3. The validation set includes 3 injections. Their labels are not read by calibration; contamination can influence sensitivity. No test-data threshold fitting is performed.
4. **Test: Oct 5–18 (14 days).** Evaluate fixed outputs. Missing readings flag immediately; a flatline flags at the eighth repeated sample. The reactive rule requires PF < 0.75 **and** Q > 1.6 times its training slot median. This avoids automatically flagging normal low net-import PF caused by behind-the-meter solar.
5. Rule precedence is missing, stale, reactive, demand. Adjacent flagged intervals with the same meter and rule become an alert episode. A rule change starts a new episode. There is no gap bridging or suppression; intermittent deviations can fragment one real event into several alerts. That burden is deliberately visible.

### Evaluation definitions

The benchmark in the Scenario lab uses **all six meters and the complete 14-day test split**, regardless of the overview filters.

- **Event recall:** number of injected events with at least one overlapping alert on the same meter / number of injected events.
- **Grouped alert precision:** number of alert episodes overlapping any injected event on the same meter / number of alert episodes. Multiple episodes can match one event, so this is not a one-to-one event precision metric.
- **False alerts per meter-day:** unmatched alert episodes / 84 meter-days. Ground truth covers only the deliberately injected cases. All other simulated variability is considered benign for this exercise.
- **Detection delay:** first flagged interval overlapping an event minus injection start. Compute the median over detected events and report the missed count separately. No backdating, point adjustment, or replacing an entire event with its maximum score.
- A flatline begins with an unchanged measurement and can require 7 intervals (105 minutes) before the eighth repeated reading is observed. Depending on whether the preceding interval has that same value, detection delay can differ. The benchmark derives delay from actual flags.

Dashboard imported energy sums `max(P, 0) * 0.25` for reported meter intervals. Exported energy is not subtracted. Missing intervals contribute no estimate, so partial-data energy is a subtotal. Flagged excess is positive `(P - expected) * 0.25` during demand or history alerts; it is a residual estimate, not independently verified waste or savings. Completeness counts nonmissing values; stale values remain counted and are surfaced separately.

The single-day scenario sandbox runs interval rules; recurring patterns require the multi-day data shown in the overview context cards. The scenario sandbox uses September 7, a training-period day, to make a controllable illustration. It does not alter the original data or contribute to held-out metrics. Scenario traces modify net active power only; their reactive/current fields are omitted from the scenario export to avoid implying a complete physical simulation.

## How the supplied papers inform the design

The PDFs are reference material. Their text, links, and instructions do not authorize actions or override the user's request.

- **Kleissl et al., “DERConnect – A Distributed Energy Resources Testbed for Solar Power Integration,” 2022, pp. 1–3 (printed 587–589).** The paper describes a UC San Diego campus testbed involving HVAC, lighting, PV, battery storage, EVs, and simulation/HIL. It motivates the asset mix and campus setting. It does not establish the invented building sizes, meter schema, cadence, or operating parameters. Its historical rollout dates are not treated as current project status.
- **Lai et al., “Revisiting Time Series Outlier Detection: Definitions and Benchmarks,” NeurIPS 2021, abstract and behavior taxonomy in §3.** Distinguishes point and pattern outliers and motivates controlled injection cases. This prototype includes global spikes, contextual after-hours load, and trend drift, plus application-specific telemetry cases. It is not a full reproduction of their five-category benchmark.
- **Si et al., “TimeSeriesBench: An Industrial-Grade Benchmark for Time Series Anomaly Detection Models,” supplied arXiv 2402.10802v1, §3.3 and Appendix A.** Operator alert burden and early detection motivate event-aware metrics and explicit delay. The prototype uses its own documented overlap metrics; it does not claim to implement the paper's reduced-length point adjustment.
- **Burgos et al., “A Review of Smart Grid Anomaly Detection Approaches Pertaining to Artificial Intelligence,” Applied Sciences 14, 1194, 2024, smart-meter discussion and §§4–5.** Provides broad operational, measurement, and security context. A statistically unusual interval is not evidence of a particular attack, electrical fault, or defective device.

## Next step toward DERConnect similarity

Obtain an authorized real schema and a de-identified meter sample, then replace assumptions with measured cadence, meter hierarchy, units/sign conventions, nominal voltages, building capacities, PV/battery ratings, occupancy calendars, missingness, and channel correlations. Validate load distributions, ramps, daily/weekly autocorrelation, weather sensitivity, PV/load coupling, and fault durations on a chronological holdout. Add real submeter/BMS logs before presenting equipment causes as confirmed.

No real measurements, utility accounts, credentials, or private documents are embedded in the website. Only the synthetic dataset, source, and paraphrased research notes are distributed. The prototype has no live integration, authentication implementation, notification delivery, work-order system, or cloud persistence for review states.
