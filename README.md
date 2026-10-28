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
