# AGENTS.md - RPS Pump Curve Tool

Read this first. This is the project protocol. Where this file conflicts with the global Matticus Build Playbook, this file wins for this project.

## What this is

A static, customer-facing web tool. A user picks an RPS pump family, lands on that family's official pump curve chart, types in a Total Dynamic Head (TDH), and the tool draws a TDH line on the chart. For models that have stored curve data, it also drops a dot on the exact curve and reads the GPM. A download button exports the marked chart as a JPEG auto-compressed under 500 KB.

## Architecture (do not break)

- Static GitHub Pages. No backend, no framework, no npm, no build step.
- Data lives in `data/families.json`. The JS engine reads it at runtime and derives everything. Do not hardcode pump data, calibration, or model lists into `js/app.js`.
- `index.html` loads `css/styles.css` and `js/app.js`. The JS `fetch()`es `data/families.json`.
- Because of `fetch()`, the site must be served over http (GitHub Pages, or a local static server). Opening `index.html` from the file system will fail with a CORS error. This is expected.
- `.nojekyll` is present so Pages serves all folders as is.

```
index.html
css/styles.css
js/app.js
data/families.json      <- single source of truth
images/*.png            <- official RPS chart backgrounds (1275 x 1650)
tools/calibrate.py       <- helper for adding new charts (not shipped to the browser)
```

## The data model: data/families.json

```
{
  "order":   ["05RPS","07RPS","10RPS","13_18RPS","25RPS"],   // homepage card order
  "families": {
    "25RPS": {
      "title":  "25RPS",
      "fam":    "25 GPM family",
      "blurb":  "Irrigation",
      "image":  "images/25RPS.png",
      "default": 300,                  // starting TDH when the tool opens
      "cal": { "xLf":..., "xRf":..., "yTf":..., "yBf":..., "gpmMax":35, "tdhMax":1000 },
      "models": [
        { "id":"25RPS15", "label":"25RPS15 (1.5 HP)", "color":"#2c9b3f",
          "data":[[0,31],[125,31],[150,30.5],[175,29],[200,27.5],[250,24],[300,17]] },
        { "id":"25RPS07", "label":"25RPS07 (3/4 HP)", "color":"#cf3b34", "data": null }
      ]
    }
  }
}
```

### Calibration (`cal`) explained

The four `*f` values are fractions of the chart image, so they survive any rescale.
- `xLf` = x of GPM 0 (left axis), as a fraction of image width.
- `xRf` = x of GPM max (right edge of plot), as a fraction of image width.
- `yTf` = y of TDH max (top of plot), as a fraction of image height.
- `yBf` = y of TDH 0 (bottom axis), as a fraction of image height.
- `gpmMax`, `tdhMax` = the axis maximums printed on that chart.

The engine maps a value to a pixel like this:
```
x = (xLf + (xRf - xLf) * gpm / gpmMax) * canvasWidth
y = (yBf + (yTf - yBf) * tdh / tdhMax) * canvasHeight
```

### Models

- `id` is the exact model number, used in the filename and the readout.
- `color` should match that curve's printed color on the chart, so the dot reads as part of the line. Convention in use: 1/2 HP blue `#2f7fd0`, 3/4 HP red `#cf3b34`, 1 HP gold `#e0a800`, 1.5 HP green `#2c9b3f`, and the 13RPS10 salmon line `#cf8a7d`.
- `data` is a `[TDH, GPM]` table, TDH ascending, taken from the RPS published curve. `null` means line only (no dot, no GPM). Source of truth for curve numbers is `RPS_Pump_GPM_at_TDH_-_Up_to_1_5_HP.md`.
- Off-curve: if TDH is past the last `data` row, the engine shows an off-curve warning. That is intended behavior, not a bug.

## Hard rules

- No em dashes anywhere in user-visible copy. Use periods, commas, colons.
- Only models 1.5 HP and under are listed (head codes 05, 07, 10, 15). Higher HP (20, 30, 50) is intentionally hidden for now. Do not add them back without an explicit ask.
- Never invent curve data. If a real RPS number is missing, leave `data` as `null` so it falls back to line only.
- Keep dots landing on the printed line. After any calibration or data edit, verify visually (see tools/calibrate.py).
- Match existing code style. Touch only what the task needs.
- Publishing is done by Matticus in GitHub Desktop. The agent never runs git (no add, commit, push).
- Confirm before destructive or bulk edits.

## Current coverage and known gaps

Five families are live: 05RPS, 07RPS, 10RPS, 13/18RPS, 25RPS.

Line only (no `data` yet), would become smart if curve data is added:
- Every 3/4 HP model (the 07 head code): 05RPS07, 07RPS07, 10RPS07, 18RPS07, 25RPS07.
- 05RPS15 and 07RPS15.

Not yet added (chart images exist in the source PDF set but are not in `images/`):
- 35 / 40 / 55 RPS family.
- 60 / 80 RPS family.
Both are mostly above 1.5 HP and have little to no curve data, so they would ship line only. Add them only on request.

## How to add a new family or chart

1. Render the chart page to PNG at 150 DPI (1275 x 1650). Keep the same size so existing fraction math holds, or just store correct fractions for the new size.
2. Compress with pngquant to keep the file small, then drop it in `images/<KEY>.png`.
3. Get the calibration. Run `tools/calibrate.py images/<KEY>.png`, which prints `xLf xRf yTf yBf` candidates. Read `gpmMax` and `tdhMax` off the printed axes.
4. Add the family block to `data/families.json` with `cal`, `models`, `image`, `default`, and add the key to `order`.
5. Verify a known data point lands on the line (calibrate.py can render a test dot). Adjust fractions if the dot floats off the curve.

## How to add curve data to a model

Set that model's `data` to the `[TDH, GPM]` table from the RPS curve, TDH ascending. The model flips from BASIC (line only) to SMART (dot + GPM) automatically. No code change needed.
