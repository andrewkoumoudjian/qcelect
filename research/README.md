# Research

Everything here is offline. Nothing under this directory is imported by the Cloudflare worker or web app.

The research package carries the expensive, falsifiable work needed to create production artifacts:

- historical archive acquisition and normalization;
- 2026 boundary transposition;
- pre-election baseline construction;
- historical pseudo-live replay;
- elex-style regression/quantile fitting;
- conformal calibration;
- challenger observation models;
- fixed correlated residual scenarios.

## Historical results

`python scripts/build_historical.py` reproducibly downloads the official
Élections Québec polling-station archives for 2014, 2018 and 2022, parses every
riding CSV, validates candidate-vote reconciliation and polling-section
uniqueness, and writes:

- `data/generated/historical/results_long.csv.gz`
- `data/generated/historical/diagnostics.json`
- cached source ZIPs under `data/generated/historical/raw/`

The canonical long table preserves merged polling stations and explicitly marks
special vote categories. Rows with zero or missing registered electors remain
usable for vote totals but receive unknown turnout rather than infinity.

Generated historical data is intentionally not committed. The downloader,
parsers, tiny format fixtures and validation tests are.
