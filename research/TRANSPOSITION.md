# Historical results → 2026 boundaries

Boundary transposition is offline research. No geometry operations are allowed
in the production worker.

## Official geometry sources

Élections Québec currently publishes archived polling-section shapefiles for
the 2018 and 2022 elections and the current 2026 polling-section geometry:

- 2018: `sections_vote_2018_shapefile.zip`
- 2022: `sections_vote_2022_shapefile.zip`
- 2026: `sections_vote_2026_shapefile.zip`
- target ridings: `circonscriptions_electorales_sans_eau_2026.json`

The archived open-data page does **not** currently expose a 2014
polling-section geometry download. qcelect therefore refuses to substitute the
2018 geometry for 2014. A 2014→2026 output must remain blocked until an
authoritative 2014 section geometry is located or a separately documented,
validated coarser fallback is approved.

This matters because Élections Québec explicitly warns that polling-section
boundaries can change from one election to another.

## Weighting hierarchy

For a source polling-section polygon:

1. If it is wholly contained by one 2026 riding, its weight is exactly 1.
2. If it crosses a 2026 boundary, qcelect intersects the polygons in Québec
   Lambert (EPSG:32198) and weights by shared area.
3. Raw geometric coverage is recorded before normalization. Sections with
   meaningful missing coverage are reported; they are never silently dropped.

Area overlap is used only because the official section polygons do not contain
an intra-section population surface. This mirrors the publicly documented
Route 127 approach for its 2022→2026 baseline, but qcelect keeps its own
implementation and diagnostics.

Results rows that cannot be geocoded directly—special votes, accommodation
sections, or merged categories—are preserved. They are distributed across the
old riding's 2026 destinations using registered-elector mass from the ordinary
mapped sections. This fallback is reported separately from geometry-mapped
votes.

## Conservation

Every candidate/poll allocation uses deterministic largest-remainder rounding.
The transposition fails if province-wide total votes or party totals differ by
even one vote after allocation.

Diagnostics include:

- source / mapped / split section counts;
- raw coverage distribution;
- geocoded share of historical votes;
- unmatched rows and votes;
- allocation method totals;
- exact party before/after checks.

The output is therefore suitable for model inputs only after these diagnostics
have been reviewed for the full province.
