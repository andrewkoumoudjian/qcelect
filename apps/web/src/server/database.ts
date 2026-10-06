import { createClient } from "@libsql/client";
import type { Client, Config } from "@libsql/client";
import { DatabaseEnvironmentSchema } from "@qcelect/schema";
import { ElectionRepository } from "@qcelect/worker/repository";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

let root = process.cwd();
while (!existsSync(join(root, "pnpm-workspace.yaml"))) {
  const parent = dirname(root);
  if (parent === root) throw new Error("Cannot locate qcelect workspace");
  root = parent;
}
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

export async function openDatabase() {
  const env = DatabaseEnvironmentSchema.parse(process.env);
  const replay = Boolean(env.QCELECT_REPLAY_FILE);
  const url = replay
    ? `file:${join(root, "data/generated/replay/qcelect.db")}`
    : env.TURSO_DATABASE_URL || `file:${join(root, "data/generated/qcelect.db")}`;
  if (url.startsWith("file:"))
    await mkdir(dirname(url.slice(5)), { recursive: true });
  const config: Config = { url };
  if (!replay && env.TURSO_AUTH_TOKEN) config.authToken = env.TURSO_AUTH_TOKEN;
  const client = createClient(config);
  return {
    client,
    repository: new ElectionRepository(client, replay ? "historical-replay:2026" : "2026-10-05"),
    replayFile: env.QCELECT_REPLAY_FILE ? resolve(root, env.QCELECT_REPLAY_FILE) : undefined,
    local: url.startsWith("file:"),
  };
}

/** Migration SQL and ledger changes commit together; changed applied SQL fails closed. */
export async function migrateDatabase(client: Client) {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL)",
  );
  const directory = join(root, "worker/migrations");
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(join(directory, name), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const transaction = await client.transaction("write");
    try {
      const applied = await transaction.execute({
        sql: "SELECT sha256 FROM schema_migrations WHERE name = ?",
        args: [name],
      });
      if (applied.rows[0]) {
        if (applied.rows[0].sha256 !== sha256)
          throw new Error(`Applied migration changed: ${name}`);
      } else {
        await transaction.executeMultiple(sql);
        await transaction.execute({
          sql: "INSERT INTO schema_migrations (name, sha256) VALUES (?, ?)",
          args: [name, sha256],
        });
      }
      await transaction.commit();
    } finally {
      transaction.close();
    }
  }
}
