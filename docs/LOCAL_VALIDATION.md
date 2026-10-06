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
metadata/projection tables, prior/backtests,
conformal calibration and deterministic seat scenarios remain unfinished.

The white local UI now renders before the first accepted snapshot. Canonical
2026 riding metadata supplies the 127-row list; unavailable values stay blank
and no synthetic official snapshot is created. Geography and the cartogram are
visible together, with the existing 48-riding Montréal/Laval and 10-riding Québec
insets. Empty riding dialogs open and close. Local browser verification counted
all four maps and 127 list rows; all 13 production tests, typechecks and map and
architecture checks passed. The two existing full-lint errors remain unchanged.

Live opening validation at 20:03 Toronto: the official endpoint returned early
partial snapshots. Turnout arrived as the literal `n.d.` and as decimal strings
(e.g. `72.21`); both are parsed explicitly, arbitrary strings are rejected, and
unavailable turnout remains null. Upstream timestamps use comma milliseconds,
which the display converts before date parsing. Accepted official snapshots
were verified in local libSQL, the cached API and the browser SSE consumer.
The UI retains all 127 canonical ridings when the upstream snapshot is partial.
A focused contract regression brings the local production suite to 14 tests;
all typechecks and changed-file lint pass. Full lint has the same two baseline
errors recorded above.

All four map views support bounded zoom (1–8×), reset, modifier-wheel/trackpad
pinch, and drag panning when zoomed. Ordinary wheel scrolling remains available.
Browser verification checked province and Montréal zoom/reset, actual viewBox
movement during a Montréal pan, and absence of an accidental riding dialog
after dragging. Map-shaped cartogram visual studies await the user's selection;
the current cartogram asset remains unchanged.

Party summary: only PQ, PLQ/QLP, PCOQ, QS and ÉCF-CAQ (including the existing
PLQ/CAQ aliases) appear initially. The other 16 parties in the observed official
snapshot are preserved in a Base UI disclosure, including those with zero
votes. Browser verification confirmed the exact five-party summary, all 16
other parties on expansion, and keyboard collapse through Space. Local tests
(14), typechecks and changed-file lint pass; full lint remains at its baseline.

Local historical application replay uses the same strict normalization,
libSQL repository, model boundary and SSE state interfaces as live ingestion,
with a separate database and port 3002. Full snapshots for 2014/2018/2022
retain 4,232,262 / 4,033,538 / 4,112,821 votes and reproduce every final
riding/party total exactly. Source reporting inventories contain all
21,819 / 21,054 / 21,765 distinct historical units. The 343 / 360 / 363
zero-vote units without target allocations remain in the source denominator
and are enumerated in generated replay diagnostics. No positive-vote unit
may be omitted. Split units retain membership in multiple target ridings;
these synthetic counts are not official bureau counts.

2022 replay was exercised at 0%, 35%, and 100%, including rewinding to
previously stored states. The 35% state contains 7,617 source units and
1,425,163 votes. Repeated hashes skip inference and do not duplicate history;
an active pointer enables rewinding without changing recorded snapshots.
The live database cannot activate a replay pointer. Model failures preserve
results with null projections. Both laptop servers run concurrently with
separate Next build directories; the live health endpoint still reports no
source error. This is operational replay, not statistical calibration.

Local validation now passes 15 production tests and 37 research tests,
all typechecks, architecture and map checks. Changed-file lint passes;
full lint still reports the two baseline errors and two warnings above.
Party presentation mock A follows the supplied screenshot structure;
logos/portraits and layout implementation await the user's mock selection.
