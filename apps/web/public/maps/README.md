# Generated SVG maps

These assets are generated deterministically from the official Élections Québec
2026 electoral geography with `pnpm build:map`. Do not hand-edit them.

- `quebec.svg` — all 127 ridings, using official `CO_CEP` as
  `data-riding`.
- `montreal.svg` — explicit Montréal/Laval inset for dense urban ridings.
- `quebec-city.svg` — explicit Québec City inset.
- `cartogram.svg` — 127 equal-area cells, one per riding.

Every interactive geometry carries both `data-riding="<CO_CEP>"` and an
`aria-label` using the official `NM_CEP` riding name. The cartogram layout is
computed offline from geographic centres and saved as SVG; no layout work runs
in the browser.
