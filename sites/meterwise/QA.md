# Verification: severity and context update

- `node --check dist/app.js` passes.
- Eight contextual regression tests pass: ambiguous one-off night, repeated-night trigger timing, expiry of old history, distinct-night counting, persistent subthreshold detection, gaps breaking evidence, independence from injected labels/latent channels, and links that exclude future meter detections.
- Dataset checks pass: 32,256 chronological intervals, 18 injected event windows, battery energy balance, electrical relationships, explicit nulls, label windows, and point/context alert boundaries.
- Held-out evaluation: interval rules detect 11/15 events; adding history rules detects 15/15. Events E13–E16 have no point-rule detections in their injection windows. Combined output has 26 episodes, 23 overlapping injected events, and 3 unmatched episodes / 84 meter-days. History adds 6 test episodes. This is a hand-designed synthetic stress test, not real-world validation.
- Repeated-night cases first trigger 45 minutes after the episode's first interval timestamp. Persistent modest increase triggers after 510 minutes; the gradual drift first detection improves to 180 minutes with the sequence layer. These are interval-index delays; actual data availability and collection latency are additional.
- Browser smoke checks cover red/yellow colors, severity filters, contextual cards, repeated-event evidence snapshots, engineering details, and shared missing-data links. The baseline threshold remains visible even where context detects a sequence of individually subthreshold readings.
- Review states use a new browser-storage key because the generated dataset revision changed. Existing local start/stop launchers are preserved.

- Final browser checks also passed for cross-building related-event navigation, the point-only versus combined benchmark, red scenario highlights, and a 390px layout with no document overflow. Browser console reports no JavaScript errors.

## Connected workflow verification

- Twelve Node tests pass for timezone/DST handling, calendar validation and half-open overlaps, simultaneous alert hit testing, event/day/history bounds, feedback fields and revision keys, dataset fingerprint changes, import/export round trips, explicit conflict replacement, duplicate records, malformed envelopes, and safe handling of markup as text.
- Existing eight detector tests, dataset validation, and JavaScript syntax checks pass. Simulation JSON and reading CSV have no Git diff.
- Browser checks passed for an actual chart click with Administration selected, an explicit three-alert overlap chooser, keyboard anomaly selection, synchronized selected alert, event padding, day/history views, distinct history outlines, and unchanged detection timestamps.
- Calendar CRUD, invalid end-time errors, escaped markup, and refresh persistence passed. Feedback required-outcome validation, save/edit fields, refresh persistence, outcome filters, assessment summary, and unchanged review status passed. One clearly marked synthetic demo assessment was retained in the test browser; temporary QA calendar entries were deleted through the UI.
- JSON export and browser imports passed: malformed JSON changes nothing; a mixed file previews 1 valid new, 1 invalid, and 2 conflicting records; default application preserves conflicts; explicit replacement is required and tested on a temporary QA entry. Existing synthetic maintenance context and feedback were preserved.
- Runtime check under `/meterwise-demo/` on a temporary localhost origin passed, including importing the exported assessment with the same dataset fingerprint. Original benchmark remains 15/15 detected events and 23/26 matching alert episodes after calendar and feedback changes.
- Desktop 1440px and narrow 390px layouts were inspected. No horizontal document overflow was observed. Alert selection scrolls and focuses the chosen investigation on narrow screens. The calendar dialog fits the viewport.
- No remote push or publication was performed. Records remain browser-local; JSON transfer is required across origins or browsers.

## Appearance studio verification (2026-10-27)

- Switched all five palettes using the dashboard selector; high priorities remain red and medium priorities yellow.
- Confirmed browser-local theme/decal persistence, gallery selection, and decal-off overlay removal.
- Confirmed an unsaved investigation note and selected alert survive an in-page theme switch; discarded the test draft without saving.
- Checked the dark calendar dialog and scenario chart, plus two-column desktop and single-column mobile gallery layout with no horizontal overflow.
- Checked primary/muted text, button labels, priority labels, and chart line contrast for the four new palettes. These palette checks do not constitute a full accessibility audit.
- JavaScript syntax check, twelve workspace tests, eight detector tests, and dataset verification pass. Original Sage restored as the default saved choice for handoff.

## Connected evidence and sensitivity verification (2026-10-28)

- Default JavaScript recomputation reproduces all original alert types and start/end boundaries, including validation episodes, and every test-event delay. Held-out baseline remains 15/15 detected events, 26 episodes, and 3 unmatched episodes.
- Thirteen new tests cover default parity, control effects, input/label isolation, no backdating, future-data independence, deterministic grouping, overlap tolerance, comparison eligibility, calendar exceptions, missing/stale/weather cases, daylight-saving boundaries, and evidence timing. Together with twelve workspace and eight Python tests, 33 tests pass.
- Browser checks: linked group timeline opens original events; a High member opened while the Medium filter and its 16-episode count remained unchanged. Return controls restore filtered investigation selection.
- Typed an unsaved test note, changed historical comparison, audience, and all five themes; the draft survived. Discarded the test draft by reload and verified the original saved A006 note/outcome remained intact. No calendar, review-state, or feedback record was saved by QA.
- All five themes give the new panels appropriate surfaces/text colors. High/medium priority colors remain separate from neutral/accent contextual signals.
- Tested supporting chart links with Enter, group access with Enter, and dialog close with Escape. At 390px and 1440px viewport widths, expanded comparison/results tables and group dialogs do not cause horizontal page overflow. Screenshot review covered the checklist, comparisons, group details, and sensitivity controls.
- Browser experiment at 2x threshold, four eligible demand readings, and three nights produced 17 alert episodes, 12 detected injections, 3 misses, and 45-minute median delay, compared with 26/15/0/0 at default. Reset restores baseline results. Experimental detection never writes main alerts or published metrics.
- Current calendar entries are additional retrospective interpretation, not an audited record of historical operator knowledge. Measured occupancy, real weather, equipment logs, and gateway topology remain unavailable.
- Dataset verifier and JavaScript syntax checks pass. No push or deployment performed.

## Campus Pulse display verification (2026-10-28)

- Default overview shows the observed line and small priority markers, without expected-demand line, threshold shading, full-height alert shading, colored alert traces, or calendar bars. Existing detail and scenario charts retain their layers and geometry.
- Five new pure geometry/layer tests cover exact reading coordinates, spike preservation, no curve overshoot, missing/nonfinite and discontinuous intervals, straight mode, and display filtering without source mutation.
- Browser checks passed for all six toggles, synchronized legends, separate high/medium counts (10/16), hidden event chooser when both priorities are off, continued 26-episode dashboard count, curve/straight switching, and two disconnected path segments at the campus telemetry gap.
- Display choices survived audience changes and navigation. Detail expected line/band remained visible. Keyboard activation and a 390px layout passed without horizontal page overflow; browser error log was empty. The existing Aurora appearance preference was preserved.
- Smoothing is monotone cubic interpolation through the actual readings, not a moving average or a detector input. Hover values stay raw; no alert timestamps or data files changed.
