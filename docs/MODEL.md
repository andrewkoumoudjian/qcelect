# Model contract

## Production philosophy

qcelect follows the proven `elex-live-model` shape rather than running a general Bayesian model in Cloudflare.

Model fitting and uncertainty calibration are offline. Election-night inference is bounded deterministic math over the latest official snapshot.

## Offline stages

1. Transpose historical elections onto the 2026 electoral map.
2. Build a pre-election riding baseline using historical results, polling and approved covariates.
3. Replay historical/pseudo election-night completion states.
4. Fit point models for final vote share/margin or outstanding vote.
5. Fit quantile models and conformal corrections for requested intervals.
6. Optionally generate a fixed correlated residual/scenario matrix for province-level seat-most/majority-threshold probabilities.
7. Export one immutable versioned artifact.

## Live stages

For each changed source snapshot:

1. derive current riding totals and completion features;
2. compare the live state with the riding baseline;
3. evaluate pre-fit point/quantile functions;
4. apply fixed conformal corrections;
5. mark final ridings as official rather than modeled;
6. if enabled, score the fixed scenario matrix to derive seat-most/majority-threshold probabilities.

No RNG is required in production.

## Why not runtime Dirichlet-multinomial/logistic-normal?

Those are useful research baselines, but Élections Québec's main live feed provides cumulative riding totals and completion counts rather than identified reporting sections. A rich hierarchical runtime posterior would add complexity without the information needed to condition it well. Historical replay + residual estimation + conformal calibration is easier to falsify and matches a proven live-election architecture.

If identified bureau-level live results become available, reevaluate the observation layer offline; do not patch a new probabilistic model directly into the worker.

## Calls

A projection probability is descriptive model output. Election calls are a separate policy system and are out of scope until explicit call rules and backtests exist.

## Development replay contract

The operational replay adapter currently reveals complete historical source
units in a deterministic hash order, then aggregates their already conserved
2026-boundary allocations. This verifies transport and state handling only. It
is not yet an adverse-order replay study, an out-of-sample model benchmark, or
conformal calibration evidence. Model artifacts must exclude future information
for each historical backtest; the production no-artifact behavior remains null.
