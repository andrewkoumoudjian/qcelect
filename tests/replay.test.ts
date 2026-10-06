import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/dgeq-results.json";
import { PublicLiveStateSchema } from "../packages/schema/src/index";
import { parseReplaySource } from "../worker/src/replay";
import { refreshLiveState } from "../worker/src/pipeline";
import { ElectionRepository } from "../worker/src/repository";
import { migrateDatabase } from "../apps/web/src/server/database";

const replayMetadata = { election: 2022, reporting: 35, seed: 2026, order: "hashed-units", sourceHash: "a".repeat(64), crosswalkHash: "b".repeat(64) };
const raw = JSON.stringify({ result: fixture, replay: replayMetadata });

describe("historical replay through production ingestion", () => {
  it("isolates replay, preserves provenance, deduplicates, and survives model failure", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await migrateDatabase(client);
      const replay = new ElectionRepository(client, "historical-replay:2026");
      const live = new ElectionRepository(client);
      const project = vi.fn(() => { throw new Error("no calibrated artifact"); });
      const dependencies = { fetchResults: () => parseReplaySource(raw), project, onProjectionError: vi.fn() };
      const state = await refreshLiveState(replay, dependencies);
      expect(state?.source).toBe("historical-replay");
      expect(state?.replay?.election).toBe(2022);
      expect(state?.ridings.every((riding) => riding.projection === null)).toBe(true);
      expect(await live.latest()).toBeNull();
      await expect(live.activateReplay(state?.sourceSha256 ?? "")).rejects.toThrow("live election");
      expect((await replay.latest())?.sourceSha256).toBe(state?.sourceSha256);
      expect(await refreshLiveState(replay, dependencies)).toBeNull();
      expect(project).toHaveBeenCalledOnce();
      const nextRaw = JSON.stringify({ result: fixture, replay: { ...replayMetadata, reporting: 100 } });
      const final = await refreshLiveState(replay, { ...dependencies, fetchResults: () => parseReplaySource(nextRaw) });
      expect((await replay.latest())?.sourceSha256).toBe(final?.sourceSha256);
      await replay.activateReplay(state?.sourceSha256 ?? "");
      expect((await replay.latest())?.replay?.reporting).toBe(35);
      expect(project).toHaveBeenCalledTimes(2);
      const stored = await client.execute("SELECT source_url FROM official_snapshots");
      expect(stored.rows[0]?.source_url).toBe("historical-replay:2022:on-2026");
      expect(PublicLiveStateSchema.safeParse({ ...state, source: "elections-quebec" }).success).toBe(false);
      expect(PublicLiveStateSchema.safeParse({ ...state, replay: undefined }).success).toBe(false);
    } finally {
      client.close();
    }
  });
});
