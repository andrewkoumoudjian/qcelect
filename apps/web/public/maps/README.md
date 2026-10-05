# Generated SVG maps

Do not hand-edit generated election maps.

Expected files:

- `quebec.svg` — geographic 2026 electoral map with `data-riding="<numeroCirconscription>"` on every interactive path.
- `cartogram.svg` — one equal-area cell per one of the 127 seats.
- later: Montréal and Québec City inset assets if the primary SVG does not make dense ridings legible.

The web runtime loads these once and only mutates result-state data attributes.
