import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseReplaySource } from "../worker/src/replay";
import { refreshLiveState } from "../worker/src/pipeline";

const { values } = parseArgs({
  options: {
    election: { type: "string" }, reporting: { type: "string" }, seed: { type: "string", default: "2026" },
  },
});
if (!values.election || !values.reporting) throw new Error("Usage: pnpm replay --election 2022 --reporting 35");
const built = spawnSync("uv", ["run", "--project", "research", "--extra", "dev", "python", "research/scripts/build_replay.py",
  "--election", values.election, "--reporting", values.reporting, "--seed", values.seed], { stdio: "inherit" });
if (built.status !== 0) throw new Error("Historical replay preparation failed");
// An explicit local replay database cannot target hosted Turso or the live database.
process.env.QCELECT_REPLAY_FILE = resolve("data/generated/replay/snapshot.json");
const { openDatabase, migrateDatabase } = await import("../apps/web/src/server/database");
const database = await openDatabase();
try {
  await migrateDatabase(database.client);
  const source = await parseReplaySource(await readFile(process.env.QCELECT_REPLAY_FILE ?? "", "utf8"));
  const next = await refreshLiveState(database.repository, { fetchResults: async () => source });
  if (source.status !== "ok") throw new Error("Replay source must contain a snapshot");
  await database.repository.activateReplay(source.sha256);
  console.log(next ? `Persisted replay: ${next.validVotes} votes, ${next.ridings.length} target ridings` : "Replay unchanged; ingestion deduplicated");
  console.log("Run pnpm dev:replay, then open http://localhost:3002");
} finally {
  database.client.close();
}
