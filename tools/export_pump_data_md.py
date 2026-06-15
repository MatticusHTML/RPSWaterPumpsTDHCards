"""Export all pump data from data/families.json to a markdown file."""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "RPS_PUMP_DATA_FULL.md"


def fmt_tdh(v):
    return str(int(v)) if v == int(v) else str(v)


def main():
    data = json.loads((ROOT / "data" / "families.json").read_text(encoding="utf-8"))
    order = data["order"]
    families = data["families"]
    help_links = data.get("helpLinks", [])

    total_models = smart_models = line_only = total_points = 0
    for key in order:
        for m in families[key]["models"]:
            total_models += 1
            if m.get("data"):
                smart_models += 1
                total_points += len(m["data"])
            else:
                line_only += 1

    lines = [
        "# RPS Pump Curve Tool: Full Data Export",
        "",
        "Generated from `data/families.json` on " + date.today().isoformat() + ".",
        "",
        "Use this document to review all pump families, calibration, and curve tables when planning a tooling upgrade.",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Pump families | {len(order)} |",
        "| Homepage order keys | " + ", ".join(f"`{k}`" for k in order) + " |",
        f"| Help link cards | {len(help_links)} |",
        f"| Total models | {total_models} |",
        f"| Models with curve data (SMART) | {smart_models} |",
        f"| Models line-only (`data: null`) | {line_only} |",
        f"| Total `[TDH, GPM]` data points | {total_points} |",
        "",
        "---",
        "",
        "## Data schema (current JSON)",
        "",
        "Single source of truth: `data/families.json`. The browser app fetches this at runtime; nothing is hardcoded in `js/app.js`.",
        "",
        "```json",
        "{",
        '  "order": ["05RPS", "..."],',
        '  "families": {',
        '    "FAMILY_KEY": {',
        '      "title": "display name",',
        '      "fam": "subtitle on home card",',
        '      "blurb": "one-line description",',
        '      "image": "images/FAMILY_KEY.png",',
        '      "default": 200,',
        '      "cal": {',
        '        "xLf": 0.0, "xRf": 0.0, "yTf": 0.0, "yBf": 0.0,',
        '        "gpmMax": 0, "tdhMax": 0',
        "      },",
        '      "models": [',
        "        {",
        '          "id": "MODEL_ID",',
        '          "label": "MODEL_ID (1 HP)",',
        '          "color": "#hex",',
        '          "data": [[TDH, GPM], ...] or null',
        "        }",
        "      ]",
        "    }",
        "  },",
        '  "helpLinks": [',
        '    { "title", "fam", "blurb", "image", "url", "foot" }',
        "  ]",
        "}",
        "```",
        "",
        "### Calibration (`cal`)",
        "",
        "Fractions of the chart PNG (1275 x 1650 px at 150 DPI). Maps axis values to canvas pixels:",
        "",
        "- `xLf`: x of GPM 0 (left axis)",
        "- `xRf`: x of GPM max (right edge of plot)",
        "- `yTf`: y of TDH max (top of plot)",
        "- `yBf`: y of TDH 0 (bottom axis)",
        "- `gpmMax`, `tdhMax`: axis maximums printed on the chart",
        "",
        "Pixel mapping:",
        "",
        "```",
        "x = (xLf + (xRf - xLf) * gpm / gpmMax) * canvasWidth",
        "y = (yBf + (yTf - yBf) * tdh / tdhMax) * canvasHeight",
        "```",
        "",
        "### Model curve data",
        "",
        "- Each `data` row is `[TDH feet, GPM]`, TDH ascending.",
        "- `null` data means line-only mode: TDH line drawn, no dot or GPM readout.",
        "- GPM at a TDH is linearly interpolated between table rows in the app.",
        "- Head code colors: 05 blue `#2f7fd0`, 07 red `#cf3b34`, 10 gold `#e0a800`, 15 green `#2c9b3f`, 20 orange `#e07b00`, 30 teal `#008080`, 50 light blue `#6eb5d0`.",
        "",
        "---",
        "",
        "## Help links (homepage external cards)",
        "",
    ]

    if help_links:
        lines += [
            "| Title | Subtitle | URL | Image |",
            "| --- | --- | --- | --- |",
        ]
        for h in help_links:
            lines.append(
                f"| {h['title']} | {h['fam']} | {h['url']} | `{h['image']}` |"
            )
    else:
        lines.append("_None._")

    lines += ["", "---", "", "## Pump families (full detail)", ""]

    for key in order:
        f = families[key]
        cal = f["cal"]
        models = f["models"]
        fam_smart = sum(1 for m in models if m.get("data"))
        lines += [
            f"### {f['title']} (`{key}`)",
            "",
            "| Field | Value |",
            "| --- | --- |",
            f"| Family subtitle | {f['fam']} |",
            f"| Blurb | {f['blurb']} |",
            f"| Chart image | `{f['image']}` |",
            f"| Default TDH (ft) | {f['default']} |",
            f"| Models | {len(models)} ({fam_smart} with curve data) |",
            f"| GPM axis max | {cal['gpmMax']} |",
            f"| TDH axis max | {cal['tdhMax']} |",
            f"| xLf | {cal['xLf']!r} |",
            f"| xRf | {cal['xRf']!r} |",
            f"| yTf | {cal['yTf']!r} |",
            f"| yBf | {cal['yBf']!r} |",
            "",
            "#### Models",
            "",
        ]
        for m in models:
            lines += [
                f"##### {m['label']} (`{m['id']}`)",
                "",
                f"- Color: `{m['color']}`",
            ]
            d = m.get("data")
            if not d:
                lines += ["- Mode: **LINE ONLY** (`data: null`)", ""]
                continue
            lines += [
                f"- Mode: **SMART** ({len(d)} points)",
                "",
                "| TDH (ft) | GPM |",
                "| ---: | ---: |",
            ]
            for row in d:
                lines.append(f"| {fmt_tdh(row[0])} | {row[1]} |")
            lines.append("")
        lines += ["---", ""]

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Lines: {len(lines)}")
    print(f"Size KB: {OUT.stat().st_size / 1024:.1f}")


if __name__ == "__main__":
    main()
