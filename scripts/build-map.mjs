import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const GEO_URL =
  "https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json";
const WIDTH = 960;
const HEIGHT = 640;
const PAD = 16;
const RAD = Math.PI / 180;
const MONTREAL = [-74.0, 45.38, -73.35, 45.78];
const QUEBEC_CITY = [-71.65, 46.65, -71.0, 47.0];

const inputArg = process.argv[2];
const input = inputArg ? resolve(inputArg) : null;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function idOf(feature) {
  return Number(feature.properties?.CO_CEP);
}

function nameOf(feature) {
  return String(feature.properties?.NM_CEP ?? idOf(feature));
}

function flattenCoordinates(geometry) {
  const output = [];
  function walk(value) {
    if (Array.isArray(value) && typeof value[0] === "number") {
      output.push(value);
      return;
    }
    for (const child of value ?? []) walk(child);
  }
  walk(geometry.coordinates);
  return output;
}

function centerOf(feature) {
  const coordinates = flattenCoordinates(feature.geometry);
  let lon = 0;
  let lat = 0;
  for (const coordinate of coordinates) {
    lon += coordinate[0];
    lat += coordinate[1];
  }
  return [lon / coordinates.length, lat / coordinates.length];
}

function centerInBox(feature, box) {
  const [lon, lat] = centerOf(feature);
  return lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3];
}

function mercator([lon, latitude]) {
  const lat = Math.max(-85, Math.min(85, latitude));
  return [lon * RAD, Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))];
}

function geographicSvg(features, ariaLabel) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const feature of features) {
    for (const coordinate of flattenCoordinates(feature.geometry)) {
      const [x, y] = mercator(coordinate);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  const scale = Math.min(
    (WIDTH - 2 * PAD) / (maxX - minX),
    (HEIGHT - 2 * PAD) / (maxY - minY),
  );
  const offsetX = (WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = (HEIGHT - (maxY - minY) * scale) / 2;

  function point(coordinate) {
    const [x, y] = mercator(coordinate);
    return [offsetX + (x - minX) * scale, offsetY + (maxY - y) * scale];
  }

  function ringPath(ring) {
    let path = "";
    for (let index = 0; index < ring.length; index += 1) {
      const [x, y] = point(ring[index]);
      path += `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return `${path}Z`;
  }

  function geometryPath(geometry) {
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map(ringPath).join("");
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath)).join("");
    }
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  const paths = [...features]
    .sort((a, b) => idOf(a) - idOf(b))
    .map(
      (feature) =>
        `  <path data-riding="${idOf(feature)}" aria-label="${escapeXml(
          nameOf(feature),
        )}" d="${geometryPath(feature.geometry)}" />`,
    )
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(ariaLabel)}">`,
    '<g class="ridings">',
    paths,
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}

function cartogramSvg(features) {
  const columns = 13;
  const cell = 42;
  const gap = 5;
  const padding = 14;
  const ordered = [...features].sort((a, b) => {
    const [aLon, aLat] = centerOf(a);
    const [bLon, bLat] = centerOf(b);
    return bLat - aLat || aLon - bLon || idOf(a) - idOf(b);
  });
  const rows = Math.ceil(ordered.length / columns);
  const width = padding * 2 + columns * cell + (columns - 1) * gap;
  const height = padding * 2 + rows * cell + (rows - 1) * gap;

  const cells = ordered
    .map((feature, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = padding + column * (cell + gap);
      const y = padding + row * (cell + gap);
      return `  <rect data-riding="${idOf(feature)}" aria-label="${escapeXml(
        nameOf(feature),
      )}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" />`;
    })
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cartogramme égalitaire des 127 sièges du Québec">`,
    '<g class="ridings">',
    cells,
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}

async function loadGeoJson() {
  if (input) {
    return JSON.parse(await readFile(input, "utf8"));
  }

  const response = await fetch(GEO_URL, {
    headers: { accept: "application/geo+json, application/json" },
  });
  if (!response.ok) {
    throw new Error(`Élections Québec geography returned HTTP ${response.status}`);
  }
  return response.json();
}

async function write(path, content) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), content, "utf8");
}

const geojson = await loadGeoJson();
if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
  throw new Error("Expected a GeoJSON FeatureCollection");
}

const features = geojson.features;
if (features.length !== 127) {
  throw new Error(`Expected 127 2026 ridings, received ${features.length}`);
}

const ids = features.map(idOf);
if (ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== 127) {
  throw new Error("2026 geography must contain 127 unique integer CO_CEP riding IDs");
}

const metadata = {
  source: GEO_URL,
  targetDelimitation: 2026,
  sourceGeometryUpdatedEpochMs: Math.max(
    ...features.map((feature) => Number(feature.properties?.DH_MAJ ?? 0)),
  ),
  ridingCount: 127,
  ridings: [...features]
    .sort((a, b) => idOf(a) - idOf(b))
    .map((feature) => ({ id: idOf(feature), name: nameOf(feature) })),
};

await Promise.all([
  write(
    "apps/web/public/maps/quebec.svg",
    geographicSvg(features, "Carte des 127 circonscriptions du Québec"),
  ),
  write(
    "apps/web/public/maps/montreal.svg",
    geographicSvg(
      features.filter((feature) => centerInBox(feature, MONTREAL)),
      "Inset des circonscriptions de Montréal et Laval",
    ),
  ),
  write(
    "apps/web/public/maps/quebec-city.svg",
    geographicSvg(
      features.filter((feature) => centerInBox(feature, QUEBEC_CITY)),
      "Inset des circonscriptions de la région de Québec",
    ),
  ),
  write("apps/web/public/maps/cartogram.svg", cartogramSvg(features)),
  write("data/ridings-2026.json", `${JSON.stringify(metadata, null, 2)}\n`),
]);

console.log("wrote 2026 Québec geographic maps, insets, cartogram and riding metadata");
