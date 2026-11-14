"""Tenor data pipeline: US Treasury par yield curve + a handful of FRED series.

Standard library only, no API keys:
  * U.S. Treasury "Daily Treasury Par Yield Curve Rates", one CSV per year
    (home.treasury.gov resource centre, public domain).
  * FRED's keyless CSV endpoint (fredgraph.csv) for real yields, breakevens,
    the effective fed funds rate and ICE BofA credit spreads.

Everything is aligned to Treasury business days and written to
site/data/tenor.json. The ICE BofA OAS series are only published on FRED for a
rolling three-year window, so the pipeline MERGES with the JSON already on
disk: history it has seen before is kept, and the archive grows by a day each
run instead of being truncated.

Run:  python pipeline/run.py            (from the repo root; incremental)
      python pipeline/run.py --full     (refetch every year since --since)
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "tenor.json"

UA = "Tenor/1.0 (educational yield-curve tool; GitHub Pages; contact via GitHub)"

# Treasury CSV column -> our tenor label, months to maturity
TENORS = [
    ("1 Mo", "1M", 1), ("3 Mo", "3M", 3), ("6 Mo", "6M", 6), ("1 Yr", "1Y", 12),
    ("2 Yr", "2Y", 24), ("3 Yr", "3Y", 36), ("5 Yr", "5Y", 60), ("7 Yr", "7Y", 84),
    ("10 Yr", "10Y", 120), ("20 Yr", "20Y", 240), ("30 Yr", "30Y", 360),
]

FRED = {
    "real10": ("DFII10", "10Y TIPS real yield"),
    "be10": ("T10YIE", "10Y breakeven inflation"),
    "ffr": ("DFF", "Effective fed funds rate"),
    "hy": ("BAMLH0A0HYM2", "ICE BofA US High Yield OAS"),
    "ig": ("BAMLC0A0CM", "ICE BofA US Corporate (IG) OAS"),
}

TREASURY_URL = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    "daily-treasury-rates.csv/{y}/all?type=daily_treasury_yield_curve"
    "&field_tdr_date_value={y}&page&_format=csv"
)
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}"


def fetch(url: str, tries: int = 4) -> str:
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8-sig")
        except Exception as e:  # network hiccup, 5xx, rate limit
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"fetch failed after {tries} tries: {url} ({last})")


def num(s: str):
    s = (s or "").strip()
    if s in ("", ".", "N/A"):
        return None
    try:
        return round(float(s), 3)
    except ValueError:
        return None


def treasury_year(y: int) -> dict[str, list]:
    text = fetch(TREASURY_URL.format(y=y))
    rows = {}
    for rec in csv.DictReader(io.StringIO(text)):
        d = datetime.strptime(rec["Date"], "%m/%d/%Y").date().isoformat()
        rows[d] = [num(rec.get(col, "")) for col, _, _ in TENORS]
    return rows


def fred_series(sid: str) -> dict[str, float]:
    text = fetch(FRED_URL.format(sid=sid))
    out = {}
    reader = csv.reader(io.StringIO(text))
    next(reader, None)
    for row in reader:
        if len(row) >= 2:
            v = num(row[1])
            if v is not None:
                out[row[0]] = v
    return out


def load_existing() -> dict:
    if OUT.exists():
        try:
            return json.loads(OUT.read_text())
        except Exception:
            pass
    return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=int, default=2000)
    ap.add_argument("--full", action="store_true", help="refetch every year, not just the last two")
    args = ap.parse_args()

    prev = load_existing()
    prev_curve = {}
    prev_series = {k: {} for k in FRED}
    if prev.get("dates"):
        for i, d in enumerate(prev["dates"]):
            prev_curve[d] = prev["curve"][i]
            for k in FRED:
                v = prev.get("series", {}).get(k, [None] * len(prev["dates"]))[i]
                if v is not None:
                    prev_series[k][d] = v

    # Past years only change if Treasury revises them, and the Treasury site is
    # slow per request, so once an archive exists only the current and prior
    # year are refetched. --full (or an empty archive) backfills everything.
    curve = dict(prev_curve)
    this_year = date.today().year
    first_year = args.since if (args.full or not prev_curve) else max(args.since, this_year - 1)
    failures = []
    for y in range(first_year, this_year + 1):
        try:
            curve.update(treasury_year(y))
            print(f"treasury {y}: ok")
        except Exception as e:
            failures.append(str(e))
            print(f"treasury {y}: FAILED, keeping archived rows ({e})", file=sys.stderr)

    if not curve:
        print("no curve data at all; refusing to write", file=sys.stderr)
        return 1

    dates = sorted(d for d in curve if d >= f"{args.since}-01-01")

    series = {}
    for key, (sid, _) in FRED.items():
        merged = dict(prev_series[key])
        try:
            merged.update(fred_series(sid))
            print(f"fred {sid}: ok")
        except Exception as e:
            failures.append(str(e))
            print(f"fred {sid}: FAILED, keeping archived values ({e})", file=sys.stderr)
        # align to Treasury days, carrying a value forward at most 5 sessions
        keys = sorted(merged)
        aligned, j, last, last_pos = [], 0, None, None
        for i, d in enumerate(dates):
            while j < len(keys) and keys[j] <= d:
                last, last_pos = merged[keys[j]], i
                j += 1
            aligned.append(last if last is not None and i - last_pos <= 5 else None)
        series[key] = aligned

    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "asOf": dates[-1],
        "tenors": [t for _, t, _ in TENORS],
        "months": [m for _, _, m in TENORS],
        "dates": dates,
        "curve": [curve[d] for d in dates],
        "series": series,
        "seriesMeta": {k: {"id": sid, "name": name} for k, (sid, name) in FRED.items()},
        "sources": {
            "curve": "U.S. Department of the Treasury, Daily Treasury Par Yield Curve Rates",
            "series": "Federal Reserve Bank of St. Louis, FRED (fredgraph.csv); ICE BofA indices via FRED",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(dates)} days, last {dates[-1]}, {OUT.stat().st_size/1024:.0f} KB")
    if failures:
        print(f"{len(failures)} source(s) failed; archived data kept for them", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
