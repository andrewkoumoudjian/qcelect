# Provenance

## Andrew's existing work ported into qcelect

The initial research utilities are derived from Andrew Koumoudjian's prior Québec election work in `andrewkoumoudjian/obsidian-vault`, principally:

- `hermes-vault/Hermes/Skills/.archive/stale-skills/canadian-election-data-extraction/SKILL.md`
- `.../references/elections-quebec-url-catalog.md`
- `.../references/analysis-pitfalls.md`
- `.../references/spatial-autocorrelation-workaround.md`

Ported knowledge includes archive URL patterns, historical format/encoding changes, Header-prefix parsing, trailing-garbage handling, polling-section alignment cautions, turnout validation and the manual Moran's-I research utility.

The narrow Jeanne-Mance–Viger CSVs are not copied into this repository because the useful reusable primitive is the reproducible acquisition/parser pipeline, not duplicated data.

## External references not vendored

The following are architectural references only; their code is not copied here:

- Washington Post `washingtonpost/elex-live-model`
- NPR election applications such as `nprapps/elections22`
- Base UI

Any future vendoring of third-party code requires an explicit license check and an entry here.
