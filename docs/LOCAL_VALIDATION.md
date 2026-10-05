# Local validation, October 5, 2026

The complete official-data validator passed locally, including the archived
original 2014 geometry. No GitHub Actions validation was used. The compact
source hashes, geometry diagnostics and party conservation checks are saved in
`research/validation/local-2026-10-05.json`; complete generated diagnostics stay
under `data/generated/` on the laptop.

| Election | Riding files | Votes before and after | Directly geocoded votes | Ordinary unmatched votes |
| --- | ---: | ---: | ---: | ---: |
| 2014 | 125 | 4,232,262 | 72.85% | 1,128 |
| 2018 | 125 | 4,033,538 | 72.67% | 1,152 |
| 2022 | 125 | 4,112,821 | 62.42% | 748 |

Every party conserves every vote. Advance/special vote categories account for
nearly all votes without direct section geometry; they use the documented old
riding elector-share allocation rather than disappearing. A/B bureau suffixes
map to the underlying section while preserving their distinct vote records.

Some ordinary historical polygons have no intersection with the official 2026
land-only riding geometry. Inspection confirmed polygons exist in the source:
for example, Terrebonne 2014 sections 105–110 sit in a gap in the target layer,
with sections 105/106 about 2.25 metres from its nearest edge. These votes remain
explicit unmatched rows and use the same reported fallback. No nearest-neighbour
geometry assignment was invented to force a match. All low-coverage sections
are enumerated in the generated diagnostics. This is a conservation/data audit,
not evidence of predictive accuracy or calibrated uncertainty.

Local production validation: 13 tests, all package and test/script typechecks,
architecture boundaries, and map checks passed. Research: 35 tests passed.
The HTTP page and SSE waiting stream were exercised against the running laptop
server. The live upstream returned 403 before its documented 20:00 opening;
no fixture votes were presented as official results.

Anti-slop is installed with matching Oxlint/plugin versions 1.87.0 and all ten
rules at error. Changed production code passes. The full lint command still
finds two baseline errors in unchanged code: runtime type inspection in
`scripts/build-map.mjs` and an unparsed unknown error parameter in
`worker/src/index.ts`. Two pre-existing spread warnings remain in the boundary
checker. These rules were not suppressed.

The first local persistence slice stores complete normalized snapshot documents
atomically, with immutable official JSON and separate published JSON. Relational
metadata/projection tables, historical application replay, prior/backtests,
conformal calibration and deterministic seat scenarios remain unfinished.
