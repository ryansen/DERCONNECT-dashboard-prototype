# Verification: severity and context update

- `node --check dist/app.js` passes.
- Eight contextual regression tests pass: ambiguous one-off night, repeated-night trigger timing, expiry of old history, distinct-night counting, persistent subthreshold detection, gaps breaking evidence, independence from injected labels/latent channels, and links that exclude future meter detections.
- Dataset checks pass: 32,256 chronological intervals, 18 injected event windows, battery energy balance, electrical relationships, explicit nulls, label windows, and point/context alert boundaries.
- Held-out evaluation: interval rules detect 11/15 events; adding history rules detects 15/15. Events E13–E16 have no point-rule detections in their injection windows. Combined output has 26 episodes, 23 overlapping injected events, and 3 unmatched episodes / 84 meter-days. History adds 6 test episodes. This is a hand-designed synthetic stress test, not real-world validation.
- Repeated-night cases first trigger 45 minutes after the episode's first interval timestamp. Persistent modest increase triggers after 510 minutes; the gradual drift first detection improves to 180 minutes with the sequence layer. These are interval-index delays; actual data availability and collection latency are additional.
- Browser smoke checks cover red/yellow colors, severity filters, contextual cards, repeated-event evidence snapshots, engineering details, and shared missing-data links. The baseline threshold remains visible even where context detects a sequence of individually subthreshold readings.
- Review states use a new browser-storage key because the generated dataset revision changed. Existing local start/stop launchers are preserved.

- Final browser checks also passed for cross-building related-event navigation, the point-only versus combined benchmark, red scenario highlights, and a 390px layout with no document overflow. Browser console reports no JavaScript errors.
