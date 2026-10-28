# DERConnect dashboard prototype

**Meterwise** is a static smart-meter anomaly dashboard for building managers and electrical engineers. It includes synthetic campus data, red/yellow alert priorities, likely anomaly explanations, and history-based contextual detection.

## Run locally

On Windows, double-click **Start-Meterwise.cmd**, then open **http://127.0.0.1:8765** in Opera or another browser. **Stop-Meterwise.cmd** stops the background server. Both launchers work relative to this repository folder.

On any platform with Python 3.10 or newer:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory sites/meterwise/dist
```

## Deploy to GitHub Pages

1. Publish this local repository to GitHub (for example, using GitHub Desktop's **Publish repository**), or add your GitHub repository as `origin` and push the `main` branch.
2. In the GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Open **Actions → Deploy dashboard to GitHub Pages → Run workflow**. Later pushes to `main` deploy automatically.
4. Find the live URL in the completed deployment's **github-pages** environment.

The workflow checks JavaScript syntax, runs the detector regression tests, verifies the generated data, and publishes **sites/meterwise/dist**. The app uses relative asset/data URLs and hash-based navigation, so it works at a project URL such as `https://USERNAME.github.io/REPOSITORY/` without a base-path build step. It has no server-side dependencies or secrets to configure.

GitHub's setup instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Data and development

All readings are synthetic and inspired by the DERConnect asset mix; they are not real DERConnect measurements.

```sh
cd sites/meterwise
python3 generate.py
python3 -m unittest test_context.py
python3 verify.py
```

See [the detailed methodology](sites/meterwise/README.md) and [verification notes](sites/meterwise/QA.md). Downloadable readings, injection labels, generator, and context rules are inside `sites/meterwise/dist/data/`.

The source layout is preserved under `sites/meterwise`. Local research files and preview artifacts remain in this folder but are excluded from Git tracking. Prior local Git metadata and the destination's original placeholder README are preserved in `.migration/`; the repository's existing root Git history remains active.

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
