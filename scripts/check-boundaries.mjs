import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(".");
const violations = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const productionRoots = ["apps/web/src", "worker/src", "packages/core/src", "packages/schema/src"];
for (const relative of productionRoots) {
  for (const file of await walk(join(root, relative))) {
    if (![".ts", ".tsx", ".js", ".mjs"].includes(extname(file))) continue;
    const source = await readFile(file, "utf8");

    if (/from\s+["'][^"']*research|qcelect_research/.test(source)) {
      violations.push(`${file}: production must not import research code`);
    }
  }
}

const workerSource = (await Promise.all(
  (await walk(join(root, "worker/src")))
    .filter((file) => [".ts", ".tsx"].includes(extname(file)))
    .map((file) => readFile(file, "utf8")),
)).join("\n");

if (/Math\.random\s*\(/.test(workerSource)) {
  violations.push("worker/: runtime RNG is forbidden; score fixed offline scenarios instead");
}

const workerManifest = JSON.parse(
  await readFile(join(root, "worker/package.json"), "utf8"),
);
for (const dependency of Object.keys(workerManifest.dependencies ?? {})) {
  if (!dependency.startsWith("@qcelect/")) {
    violations.push(
      `worker/package.json: runtime dependency ${dependency} is outside the qcelect production core`,
    );
  }
}

const webManifest = JSON.parse(
  await readFile(join(root, "apps/web/package.json"), "utf8"),
);
const forbiddenMapPackages = new Set([
  "maplibre-gl",
  "mapbox-gl",
  "react-map-gl",
  "deck.gl",
  "@deck.gl/core",
]);
for (const dependency of Object.keys({
  ...(webManifest.dependencies ?? {}),
  ...(webManifest.devDependencies ?? {}),
})) {
  if (forbiddenMapPackages.has(dependency)) {
    violations.push(
      `apps/web/package.json: ${dependency} is forbidden on the election-night homepage; use generated SVG`,
    );
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("architecture boundaries OK");
