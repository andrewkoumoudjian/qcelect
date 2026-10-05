# Official sources

## Live results

Canonical endpoint:

`https://donnees.electionsquebec.qc.ca/production/provincial/resultats/resultats.json`

Élections Québec documents the top-level `statistiques` and `circonscriptions` objects and states that election-night result files are updated every two to five minutes.

Fields consumed by qcelect are defined in `packages/schema/src/index.ts`. Keep that schema aligned with the official documentation and prefer additive `.passthrough()` parsing so new upstream fields do not break ingestion.

## Candidates

`https://donnees.electionsquebec.qc.ca/production/provincial/candidatures/candidatures.json`

Use for pre-election candidate metadata. Live vote totals come from the result feed.

## 2026 electoral map

`https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json`

This is a build/research input. The election-night homepage should serve generated SVG rather than parsing the GeoJSON in browsers.

## Required attribution

The Élections Québec open-data licence requires the following notice to be displayed at all times when using the data:

> Comprend des données ouvertes octroyées sous la licence d'utilisation des données ouvertes du directeur général des élections disponible à l'adresse Web dgeq.org. L'octroi de la licence n'implique aucune approbation par le directeur général des élections de l'utilisation des données ouvertes qui en est faite.

Do not use Élections Québec trademarks/logos without prior written authorization and do not imply endorsement.
