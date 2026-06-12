# RPS Pump Curve Tool

A static web tool for RPS Water Pumps. Pick a pump family, enter the Total Dynamic Head, and get a customer-ready chart with the TDH line drawn on it. Models with stored curve data also get a dot on the exact curve and a GPM readout. Downloads are auto-compressed under 500 KB.

Live (after Pages is enabled): `https://matticushtml.github.io/RPS-Pump-Curve-Tool/`

## Run it locally

Because the page loads `data/families.json` over `fetch()`, it must be served, not opened from the file system.

```
cd RPS-Pump-Curve-Tool
python3 -m http.server 8000
```
Then open `http://localhost:8000`. Cursor's Live Preview also works.

## Structure

```
index.html            page shell
css/styles.css         styles
js/app.js              engine (reads data, draws line + dot, handles download)
data/families.json     single source of truth (calibration + models + curve data)
images/*.png           official RPS chart backgrounds
tools/calibrate.py      helper for adding new charts
AGENTS.md              project protocol for Cursor
```

## Editing

All pump content lives in `data/families.json`. See `AGENTS.md` for the data model, the calibration system, how to add a family, and how to flip a model from line-only to smart by adding its curve data.

## Deploy (GitHub Desktop)

1. Commit changes to `main` in GitHub Desktop.
2. Push.
3. Repo Settings > Pages > Source: Deploy from a branch, Branch `main`, folder `/ (root)`.
