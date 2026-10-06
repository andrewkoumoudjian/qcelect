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

## Run locally

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. The default database is local SQLite/libSQL at
`data/generated/qcelect.db`; no Docker or hosted account is required. Optional
Turso configuration comes from a root `.env` matching `.env.example`. Never
commit credentials. `pnpm db:status` shows applied migration hashes.

Opening the application starts one shared server ingestion loop. It checks the
official feed every five seconds, with conditional HTTP validators and SHA-256
deduplication. Changed, validated snapshots are persisted before model work and
pushed immediately through `/api/live/stream` (SSE). Browsers reconnect and fall
back to the cached `/api/live.json` endpoint. Client reads do not query Turso or
Élections Québec. `/api/health` reports source errors and the last check time.

Before Élections Québec publishes results, the full UI stays visible with
neutral maps and unavailable values; it never shows fixture votes. Upstream publication is every two to five minutes, so faster
local delivery cannot accelerate that source cadence. Projections remain null
until frozen artifacts pass their statistical validation.

Research is optional for running the app; install [uv](https://docs.astral.sh/uv/)
and use `pnpm research:test` or `pnpm research:validate` for the offline data gate.
Large generated data stays in the ignored `data/generated/` directory.

## Canonical live source

Élections Québec's all-in-one JSON results feed is the canonical election-night source. Clients never call it directly; the worker polls it, validates it, deduplicates unchanged snapshots and publishes one normalized cached state.

## Design references

- Washington Post `elex-live-model`: baseline-relative live estimation and calibrated prediction intervals.
- NPR election applications: pre-generated SVG geographic maps/cartograms recolored from live state.
- Base UI: accessible unstyled React primitives.

These are architectural references. Third-party source is not vendored unless its license is reviewed and recorded in `docs/PROVENANCE.md`.

## Local historical replay

After the historical validation gate has generated its data:

```bash
pnpm replay --election 2022 --reporting 35
pnpm dev:replay
```

Open http://localhost:3002. Change reporting with the same `pnpm replay` command;
the replay process publishes changes through the same normalization, ingestion,
model boundary, repository and SSE interfaces as live operation. Historical
2014, 2018 and 2022 are supported. Python/uv runs only in the offline preparation
command, never in the website or worker. The live app can keep running on port
3000. Replay has a separate local database and Next build directory, and ignores
Turso credentials. It never requests the live results endpoint.

These are historical source units transposed onto 2026 boundaries, with explicit
special-vote fallback and deterministic integer allocation. Percent reporting
selects whole source units in a SHA-256 order using a fixed seed. Split source
units can appear in multiple target ridings. Zero-vote units remain in the source
reporting denominator; units without target allocations are enumerated in
`data/generated/replay/<year>-diagnostics.json`. Synthetic party candidates and
unknown electorate/rejected counts are clearly a replay transport, not official
2026 candidates or bureau statistics. No projection/calibration claims follow
from this development replay; adverse-order statistical replay remains to build.
