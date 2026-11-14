# Tenor — The Rates Desk, One Page

The US Treasury yield curve, its slope and inversion history, implied forwards,
real yields, breakevens, the policy rate and credit spreads — refreshed every
weekday from public data, served as a static GitHub Pages site.

- **Curve** — today's par curve against 1W / 1M / 1Y / 5Y ago, a timeline to replay any day since 2000, moves by tenor (1D, 1W, 1M, YTD, 1Y) and implied forwards (1y1y … 5y5y, 10y20y).
- **Inversions** — 10Y−2Y and 10Y−3M since 2000 with inverted stretches shaded, plus a table of every inversion episode (start, end, length, depth).
- **Real rates** — 10Y nominal vs TIPS real yield vs breakeven; effective fed funds vs the 2-year.
- **Credit** — ICE BofA high-yield and investment-grade OAS with percentiles.

> Part of the zero-cost finance suite alongside Meridian, MarketPulse, Ledger, Abacus, Tenline, Covenant and Redline.

## Cost: $0/day
- **Data:** U.S. Treasury Daily Par Yield Curve CSVs and FRED's keyless `fredgraph.csv` (DFII10, T10YIE, DFF, BAMLH0A0HYM2, BAMLC0A0CM). No API keys, no secrets.
- **Refresh:** `.github/workflows/daily-update.yml` runs `pipeline/run.py` at 23:30 UTC Mon–Fri, commits `site/data/tenor.json` and redeploys Pages.
- **Archive:** the pipeline merges into the JSON already committed, so the ICE BofA spread history (FRED only serves a rolling 3 years) keeps lengthening.
- **Hosting:** GitHub Pages. Python standard library only.

## Run it locally
```bash
python3 pipeline/run.py          # incremental refresh (~40 s)
python3 pipeline/run.py --full   # refetch every year since 2000 (slow: Treasury is ~1 req/min)
cd site && python3 -m http.server 8000
```

Personal, educational project — not investment advice, not SEBI-registered research.
