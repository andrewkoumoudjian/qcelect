import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { geoMercator, geoPath } from "d3-geo";

const input = resolve(
  process.argv[2] ?? "data/generated/circonscriptions-2026.geojson",
);
const output = resolve(
  process.argv[3] ?? "apps/web/public/maps/quebec.svg",
);

const featureCollection = JSON.parse(await readFile(input, "utf8"));
const projection = geoMercator().fitExtent(
  [
    [16, 16],
    [944, 624],
  ],
  featureCollection,
);
const path = geoPath(projection);

const ridingPaths = featureCollection.features
  .map((feature) => {
    const properties = feature.properties ?? {};
    const id =
      properties.numeroCirconscription ??
      properties.NUM_CEP ??
      properties.NO_CEP ??
      properties.code;

    if (id == null) {
      throw new Error("GeoJSON feature missing riding identifier");
    }

    const d = path(feature);
    if (!d) return "";

    const name = String(
      properties.nomCirconscription ?? properties.NM_CEP ?? properties.name ?? id,
    )
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    return `<path data-riding="${id}" aria-label="${name}" d="${d}" />`;
  })
  .join("\n");

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640">',
  '<g class="ridings">',
  ridingPaths,
  "</g>",
  "</svg>",
  "",
].join("\n");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, svg, "utf8");
console.log(`wrote ${output}`);
