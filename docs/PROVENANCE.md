# Provenance

## Andrew's existing work ported into qcelect

The initial research utilities are derived from Andrew Koumoudjian's prior Québec election work in `andrewkoumoudjian/obsidian-vault`, principally:

- `hermes-vault/Hermes/Skills/.archive/stale-skills/canadian-election-data-extraction/SKILL.md`
- `.../references/elections-quebec-url-catalog.md`
- `.../references/analysis-pitfalls.md`
- `.../references/spatial-autocorrelation-workaround.md`

Ported knowledge includes archive URL patterns, historical format/encoding changes, Header-prefix parsing, trailing-garbage handling, polling-section alignment cautions, turnout validation and the manual Moran's-I research utility.

The province-wide 2014/2018/2022 pipeline uses the same archive catalog and parser lessons, but downloads the official ZIP archives reproducibly rather than copying the prior Jeanne-Mance–Viger CSV collection. Full-archive validation found that the current official 2014 ZIP differs from the older copied research examples: its per-riding CSVs begin directly with the named `Code,Circonscription,...` header instead of an `Election:` / `Header:` prefix. qcelect handles that 2014 variant explicitly while keeping 2018/2022 strict. Tiny synthetic fixtures preserve these observed variants solely for regression testing.

The narrow Jeanne-Mance–Viger CSVs are not copied into this repository because the useful reusable primitive is the reproducible acquisition/parser pipeline, not duplicated data.

## External references not vendored

The following are architectural references only; their code is not copied here:

- Washington Post `washingtonpost/elex-live-model`
- NPR election applications such as `nprapps/elections22`
- Base UI

Any future vendoring of third-party code requires an explicit license check and an entry here.
