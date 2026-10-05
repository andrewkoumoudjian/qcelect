# Architecture

## Goal

Publish Québec election results with minimal latency and failure surface while adding clearly separated, calibrated projections.

The architecture intentionally follows two proven newsroom patterns:

- **WaPo elex-style model boundary**: historical baseline + live residual estimation + calibrated intervals.
- **NPR-style results UI**: static SVG map/cartogram whose styles change from live race state.

## Data flow

```text
Élections Québec resultats.json
          |
          v
Cloudflare worker
  fetch -> validate -> hash -> dedupe
          |
      source changed?
       /        \
     no          yes
     |            |
 cached JSON   normalize
                  |
             deterministic
             model scoring
                  |
             publish state
                  |
        Cache API / durable history
                  |
                  v
             Next.js UI
       SVG maps + result tables
```

### Polling

The source publishes on a multi-minute cadence. Polling may be more frequent to reduce detection delay, but unchanged payloads terminate before model work.

Prefer conditional HTTP requests when supported. Otherwise hash the raw body and compare to the last accepted source hash.

### Storage

The public state is immutable per source update. Each accepted snapshot carries:

- source `iso8601DateMAJ`;
- `ingestedAt`;
- SHA-256 of the upstream body;
- schema version;
- model artifact version;
- projection/calibration version.

Local operation now uses the official libSQL TypeScript client, with optional
Turso configuration. The narrow `ElectionRepository` adapter implements the
existing ingestion store contract. Versioned SQL migrations carry a checksum
ledger and apply each migration transactionally.

Each accepted source hash has one unique official snapshot containing the full
normalized riding, candidate and party state. A single atomic insert persists
the complete official document, avoiding partial election writes. The original
official JSON is immutable; the separate public JSON can acquire validated
model output after evaluation. Model errors or malformed output cannot undo the
official insert. A hash that already exists terminates before model evaluation.

This first local slice stores normalized result documents rather than creating
unused model tables. Relational metadata/projection tables and historical replay
remain subsequent work. Geometry stays in static assets.

The Next.js Node adapter owns the local process loop and a memory cache. It polls
serially with a ten-second fetch timeout and waits five seconds between checks.
SSE subscribers receive changed snapshots immediately and a fifteen-second
heartbeat. One global runtime is shared across HTTP/SSE routes; browser reads
do not trigger database reads. Startup reloads the latest accepted state.

Core normalization, ingestion and repository code is reusable by a future
Cloudflare adapter. The existing deployed-worker entry still uses its KV
adapter; no Cloudflare deployment or hosted database was touched.

## Production packages

### `worker/`

Owns upstream I/O and API publication. It may:

- fetch and validate official data;
- normalize it;
- call pure inference functions using pre-generated artifacts;
- cache the output.

It may not fit statistical models or depend on Python.

### `packages/schema/`

Owns the boundary contracts:

- raw Élections Québec fields we consume;
- normalized qcelect live state;
- projection payloads.

### `packages/core/`

Pure deterministic domain functions. No network, framework or persistence imports.

### `apps/web/`

Presentation only. It consumes normalized qcelect state and static assets.

The main results map is SVG generated offline. If a detailed street-level map is ever added, keep it on a secondary route so WebGL is not in the critical path.

## Offline packages

### `research/`

Python research environment for:

- historical archive acquisition/normalization;
- boundary transposition;
- demographics;
- historical replay;
- elex-style regression/quantile models;
- conformal calibration;
- fixed correlated scenario generation.

### `model/`

Generated, versioned artifacts read by production. Files are data, not source code.

### `data/`

Static/generated electoral assets: normalized candidate metadata, simplified SVG/GeoJSON used at build time, small fixtures.

## Failure behavior

If projection artifacts are unavailable or inference fails, official results must continue to publish. The UI renders `projection: null` rather than substituting stale or fabricated numbers.

If the source schema changes incompatibly, retain the last valid state and expose source-health metadata; do not publish partially parsed official totals.
