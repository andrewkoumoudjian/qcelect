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

For 2014 boundary transposition, the current Élections Québec site no longer links the election-specific polling-section shapefile. qcelect pins the Internet Archive capture from `20160407203022` of the original DGEQ URL `www.electionsquebec.qc.ca/documents/zip/sections%20de-vote-elections-2014-shapefile.zip`. This preserves the authoritative election-specific source rather than substituting 2018 geometry or a third-party reconstruction. The current Élections Québec historical map documentation confirms that the 2011 electoral map was in force for the 2014 general election.

## External references not vendored

The following are architectural references only; their code is not copied here:

- Washington Post `washingtonpost/elex-live-model`
- NPR election applications such as `nprapps/elections22`
- Base UI

Any future vendoring of third-party code requires an explicit license check and an entry here.

## Party summary media

The reference layout selected on 2026-10-05 uses locally served media under
`apps/web/public/parties/`. Logos identify parties; portraits identify their
2026 representatives. These assets are presentation only, never election data.
Results continue to come exclusively from Élections Québec.

The three accessible party-site logos are sourced directly from their parties.
PQ and PCOQ marks come from Wikimedia Commons; their file pages document
logo/trademark status. Portraits come from TVA/Québecor's public 2026 election
widget. Media rights remain with their respective holders; the Élections Québec
open-data licence does not apply to this media. No third-party widget code or
results API is used in qcelect.

| Local file | Media source |
| --- | --- |
| `pq-portrait.png` | [Source](https://s1.quebecormedia.com/infojdem/2026/elections/quebec/components/widget/assets/image/candidats/PQ_mobile.png) |
| `plq-portrait.png` | [Source](https://s1.quebecormedia.com/infojdem/2026/elections/quebec/components/widget/assets/image/candidats/PLQ_mobile.png) |
| `pcoq-portrait.png` | [Source](https://s1.quebecormedia.com/infojdem/2026/elections/quebec/components/widget/assets/image/candidats/PCQC_mobile.png) |
| `caq-portrait.png` | [Source](https://s1.quebecormedia.com/infojdem/2026/elections/quebec/components/widget/assets/image/candidats/CAQ_mobile.png) |
| `qs-portrait.png` | [Source](https://s1.quebecormedia.com/infojdem/2026/elections/quebec/components/widget/assets/image/candidats/QS_mobile.png) |
| `pq-logo.svg` | [Source](https://commons.wikimedia.org/wiki/Special:FilePath/Parti_Quebecois.svg) |
| `pcoq-logo.png` | [Source](https://commons.wikimedia.org/wiki/Special:FilePath/Conservative_Party_of_Quebec_Logo_(2021).png?width=240) |
| `plq-logo.svg` | [Source](https://plq.org/wp-content/uploads/2026/09/plq-logo-couleurs.svg) |
| `caq-logo.png` | [Source](https://coalitionavenirquebec.org/wp-content/uploads/2026/07/logo-equipe-frechette-partage-2026.png) |
| `qs-logo.svg` | [Source](https://cdn.prod.website-files.com/6a58006e8d06c0d8d7cc521d/6a5b78e424fbef13167d6d40_logo_qs.svg) |

Commons file records: [PQ](https://commons.wikimedia.org/wiki/File:Parti_Quebecois.svg),
[PCOQ](https://commons.wikimedia.org/wiki/File:Conservative_Party_of_Quebec_Logo_(2021).png).
Portrait source page: [TVA 2026 election results](https://www.tvanouvelles.ca/actualites/elections-quebec-2026/resultats-quebec-2026).
Historical replay hides these 2026 portraits so they do not imply historical candidacies.
