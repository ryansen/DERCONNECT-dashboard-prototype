# DERConnect dashboard prototype

**Meterwise** is a static smart-meter anomaly dashboard for building managers and electrical engineers. It includes synthetic campus data, red/yellow alert priorities, likely anomaly explanations, and history-based contextual detection.

## Run locally

On Windows, double-click **Start-Meterwise.cmd**, then open **http://127.0.0.1:8765** in Opera or another browser. **Stop-Meterwise.cmd** stops the background server. Both launchers work relative to this repository folder.

On any platform with Python 3.10 or newer:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory .
```

## Deploy to GitHub Pages

Live dashboard: **https://ryansen.github.io/DERCONNECT-dashboard-prototype/**

The actual dashboard `index.html`, CSS, JavaScript, `themes/`, and `data/` live at the repository root. No redirect or nested entry URL is required. In **Settings → Pages**, the source is **GitHub Actions**. Pushes to `main` run the checked-in workflow, or use **Actions → Deploy dashboard to GitHub Pages → Run workflow**.

The workflow checks JavaScript, runs the investigation and detector tests, verifies the synthetic data, and packages only the root website assets into `_site/`. Development tools, research files, local runtime files, and Git metadata are excluded from the published artifact. Relative URLs and hash navigation work under the repository path without a base-path build step. No server-side dependencies or secrets are required.

GitHub's setup instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Data and development

All readings are synthetic and inspired by the DERConnect asset mix; they are not real DERConnect measurements.

```sh
cd sites/meterwise
python3 generate.py
python3 -m unittest test_context.py
python3 verify.py
```

See [the detailed methodology](sites/meterwise/README.md) and [verification notes](sites/meterwise/QA.md). Downloadable readings, injection labels, generator, and context rules are inside `data/`.

The public website lives at the repository root. Generator, verification scripts, tests, and detailed documentation remain under `sites/meterwise`. Local research files and preview artifacts remain in this folder but are excluded from Git tracking. Prior local Git metadata and the destination's original placeholder README are preserved in `.migration/`; the repository's existing root Git history remains active.

## Timeline, operating calendar, and assessments

Click a highlighted anomaly on the overview timeline, or use **Choose an anomaly from this chart** for keyboard selection. Overlapping alerts open a chooser. Investigations default to two hours of padding and provide **Zoom to event**, **Show full day**, and **Show supporting history** controls. Supporting observations have dashed gray outlines; red/yellow shading continues to mark the actual flagged interval.

Use **Operating calendar** to manage explicit dated intervals in Los Angeles time. Three entries are clearly marked synthetic examples. Neutral gray chart bars and an investigation's **What was scheduled?** section show overlapping calendar context without changing detector output or priority.

Save an outcome, optional cause, and notes under **Investigation feedback**. Feedback remains separate from review status and model results. The inbox can filter outcomes and shows a user-assessment summary, not detector accuracy. Feedback keys include a SHA-256 fingerprint of the complete dataset and its alert ID.

Records are saved only in the current browser and site origin. Localhost, GitHub Pages, and different browsers do not automatically share them. Use **Export / import records** to transfer JSON. Imports preview valid new, invalid, and conflicting records. Existing records are kept unless replacement is explicitly selected; invalid entries are skipped. Feedback from another dataset fingerprint remains archived rather than attaching to current alerts.

Calendar entries are individual intervals, not recurring weekly schedules. Calendar form times skipped or repeated at daylight-saving transitions are rejected to avoid silently choosing the wrong instant. Timestamps in JSON require explicit offsets. Imports accept up to 2 MB and 10,000 records. Browser storage failures leave record editing read-only rather than discarding existing records.

Run the additional workflow tests with:

```sh
cd sites/meterwise
node --test test_workspace.cjs
```

## Campus Pulse chart display

Campus Pulse defaults to observed demand and small red/yellow anomaly markers. Open **Chart display** to toggle expected demand, the threshold band, high/medium markers, calendar bars, and the smooth curve. Calendar bars also respect the existing global calendar toggle. Choices remain for the current page session across building/window changes and navigation; they do not filter alerts elsewhere or modify saved records. The smooth curve passes through each original 15-minute reading without averaging, preserves peaks without overshoot, and breaks at missing intervals. Hover values remain the original readings. Detail and Scenario Lab charts retain their existing rendering.
