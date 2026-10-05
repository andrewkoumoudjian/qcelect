# qcelect architecture rules

These rules are repository invariants.

## Production boundary

1. `apps/web`, `worker`, `packages/schema`, and `packages/core` are the production graph.
2. Production is TypeScript-only. Python, pandas, scipy, geopandas, notebooks and model fitting stay under `research/`.
3. The worker may evaluate **pre-fit** coefficients and fixed scenario artifacts. It must not fit models, bootstrap residuals, run MCMC, or generate Monte Carlo draws.
4. Expensive inference runs only when the upstream Élections Québec snapshot changes, never per browser request.
5. The public API is a cached normalized snapshot. Browsers must not query Élections Québec directly.
6. Official results and model projections are different fields and different UI states. Never overwrite or relabel official data with modeled data.

## Source/data rules

1. Élections Québec is canonical for live official results.
2. Persist the upstream `iso8601DateMAJ`, ingestion time, source hash and model artifact version with every derived state.
3. Source schemas are permissive to additive upstream fields but strict for fields qcelect consumes.
4. Historical geometry/results must be reconciled to the target delimitation before cross-election modeling.
5. Polling-station IDs are not assumed stable across elections. Merged sections and special vote categories require explicit handling.
6. Generated model/data artifacts must be reproducible from scripts in `research/`; do not hand-edit generated JSON.

## Model rules

1. Start from the proven elex pattern: compare partial results against a historical/prior baseline, estimate outstanding/final quantities, and calibrate intervals out of sample.
2. Prefer transparent regression/quantile/conformal models to bespoke complex Bayesian runtime systems.
3. Any seat/government probability computation must use a versioned fixed residual/scenario artifact generated offline. Runtime only scores it.
4. A model probability is not an election call. Calling logic, if added, is a separate policy layer.
5. Never ship a coefficient or uncertainty parameter that has not passed historical replay/calibration.

## UI rules

1. The primary map is pre-generated SVG. Do not add MapLibre/Mapbox/deck.gl to the election-night homepage.
2. Use Base UI for accessible controls, popovers, tooltips, tabs, drawers and menus.
3. Map geometry is static; live updates only alter presentation state/fills and detail data.
4. Provide a geographic map plus a 127-seat equal-area view. Use Montréal/Québec insets where needed.
5. The page must remain usable without animation and under degraded network conditions.

## Dependency/porting rules

1. Prefer small primitives over frameworks.
2. Code moved from Andrew's other repositories must record its origin in `docs/PROVENANCE.md`.
3. Third-party projects such as WaPo/NPR are references, not copy sources, unless license review is explicit.
4. Do not duplicate historical data already reproducibly downloadable; port the downloader/parser/catalog instead.
5. Keep test fixtures tiny and representative.

## Change discipline

Architecture-changing PRs must update `docs/ARCHITECTURE.md`. Model-contract changes must update `docs/MODEL.md`.
