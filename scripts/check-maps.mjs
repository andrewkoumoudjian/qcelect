import { readFile } from "node:fs/promises";

const metadata = JSON.parse(await readFile("data/ridings-2026.json", "utf8"));
const expectedIds = metadata.ridings.map((riding) => String(riding.id));
const expected = new Set(expectedIds);

if (metadata.ridingCount !== 127 || expected.size !== 127) {
  throw new Error("data/ridings-2026.json must contain exactly 127 unique ridings");
}

async function inspect(path, { requireAll = false, tag = null } = {}) {
  const source = await readFile(path, "utf8");
  const matches = [
    ...source.matchAll(
      /<(path|rect)\b[^>]*data-riding="(\d+)"[^>]*aria-label="[^"]+"[^>]*>/g,
    ),
  ];
  const ids = matches.map((match) => match[2]);
  const unique = new Set(ids);

  if (ids.length !== unique.size) {
    throw new Error(`${path}: duplicate data-riding IDs`);
  }
  if (tag && matches.some((match) => match[1] !== tag)) {
    throw new Error(`${path}: expected every riding element to be <${tag}>`);
  }
  for (const id of unique) {
    if (!expected.has(id)) throw new Error(`${path}: unknown riding ID ${id}`);
  }
  if (requireAll) {
    const missing = expectedIds.filter((id) => !unique.has(id));
    if (missing.length) {
      throw new Error(`${path}: missing riding IDs ${missing.join(", ")}`);
    }
  }
  return ids.length;
}

const province = await inspect("apps/web/public/maps/quebec.svg", {
  requireAll: true,
  tag: "path",
});
const cartogram = await inspect("apps/web/public/maps/cartogram.svg", {
  requireAll: true,
  tag: "rect",
});
const montreal = await inspect("apps/web/public/maps/montreal.svg", { tag: "path" });
const quebecCity = await inspect("apps/web/public/maps/quebec-city.svg", {
  tag: "path",
});

if (province !== 127 || cartogram !== 127) {
  throw new Error("province map and cartogram must each contain exactly 127 ridings");
}
if (montreal === 0 || quebecCity === 0) {
  throw new Error("geographic insets must contain at least one riding");
}

console.log(
  `maps OK: province=${province}, cartogram=${cartogram}, Montréal=${montreal}, Québec=${quebecCity}`,
);
