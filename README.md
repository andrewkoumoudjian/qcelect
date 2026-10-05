# qcelect

Fast, source-attributed live results and projections for Québec elections.

qcelect is deliberately split into two systems:

- **production**: a small TypeScript path that fetches Élections Québec, validates it, runs pre-fit deterministic inference, and serves cached JSON/UI;
- **research**: Python tooling that prepares historical data, geographic transpositions, model coefficients, calibration, and fixed scenario artifacts offline.

The election-night path must remain boring: no model fitting, MCMC, pandas/geopandas, runtime map engines, or per-request simulation.

## Repository layout

```text
apps/web/                 Next.js results UI; Base UI primitives; static SVG maps
worker/                   Cloudflare ingestion + deterministic inference + API
packages/schema/          shared source/public contracts
packages/core/            pure TypeScript election/domain logic
research/                 offline Python data/model/calibration work
model/                    versioned generated model artifacts
data/                     generated/static election assets
docs/                     architecture, model and provenance decisions
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) before changing boundaries.

## Canonical live source

Élections Québec's all-in-one JSON results feed is the canonical election-night source. Clients never call it directly; the worker polls it, validates it, deduplicates unchanged snapshots and publishes one normalized cached state.

## Design references

- Washington Post `elex-live-model`: baseline-relative live estimation and calibrated prediction intervals.
- NPR election applications: pre-generated SVG geographic maps/cartograms recolored from live state.
- Base UI: accessible unstyled React primitives.

These are architectural references. Third-party source is not vendored unless its license is reviewed and recorded in `docs/PROVENANCE.md`.
