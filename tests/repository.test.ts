import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/dgeq-results.json";
import { DgeqResultsSchema } from "../packages/schema/src/index";
import { normalizeDgeqResults } from "../packages/core/src/index";
import { ElectionRepository } from "../worker/src/repository";
import { refreshLiveState } from "../worker/src/pipeline";
import { migrateDatabase } from "../apps/web/src/server/database";

const source = {
  status: "ok" as const,
  result: DgeqResultsSchema.parse(fixture),
  sha256: "test-hash",
  raw: JSON.stringify(fixture),
  validators: { etag: '"v1"' },
};
const official = normalizeDgeqResults(source.result, {
  sourceSha256: source.sha256,
  ingestedAt: "2026-10-05T23:00:00Z",
});

describe("local libSQL snapshot repository", () => {
  it("only accepts projection fields from valid model output", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await migrateDatabase(client);
      const repository = new ElectionRepository(client);
      const state = await refreshLiveState(repository, {
        fetchResults: async () => source,
        project: (state) => {
          const riding = state.ridings[0];
          if (riding) {
            riding.validVotes = 999999;
            riding.projection = {
              modelVersion: "test",
              projectedWinner: "PQ",
              winProbability: 0.8,
              projectedMarginPct: 5,
              interval80: [1, 9],
            };
          }
          return state;
        },
      });
      expect(state?.ridings[0]?.validVotes).toBe(1500);
      expect(state?.ridings[0]?.projection?.modelVersion).toBe("test");
    } finally {
      client.close();
    }
  });
  it("migrates idempotently and persists one complete snapshot before model evaluation", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await migrateDatabase(client);
      await migrateDatabase(client);
      const repository = new ElectionRepository(client);
      const project = vi.fn(() => {
        throw new Error("artifact failed");
      });
      const state = await refreshLiveState(repository, {
        fetchResults: async () => source,
        project,
      });
      expect(state?.ridings.every((riding) => riding.projection === null)).toBe(
        true,
      );
      expect((await repository.latest())?.sourceSha256).toBe("test-hash");
      expect(
        await refreshLiveState(repository, {
          fetchResults: async () => source,
          project,
        }),
      ).toBeNull();
      expect(project).toHaveBeenCalledOnce();
      expect(await repository.acceptOfficial(official)).toBe(false);
      const rows = await client.execute(
        "SELECT official_json, public_json FROM official_snapshots",
      );
      expect(rows.rows).toHaveLength(1);
      expect(JSON.parse(String(rows.rows[0]?.official_json))).toMatchObject({
        sourceSha256: "test-hash",
      });
    } finally {
      client.close();
    }
  });

  it("rejects malformed writes atomically and fails on modified migration hashes", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await migrateDatabase(client);
      const repository = new ElectionRepository(client);
      await repository.acceptOfficial(official);
      await expect(
        client.execute(
          "UPDATE official_snapshots SET public_json = 'invalid-json'",
        ),
      ).rejects.toThrow();
      expect(await repository.latest()).toEqual(official);
      await client.execute("UPDATE official_snapshots SET public_json = '{}' ");
      expect(await repository.latest()).toEqual(official);
      await client.execute("UPDATE schema_migrations SET sha256 = 'changed'");
      await expect(migrateDatabase(client)).rejects.toThrow(
        "Applied migration changed",
      );
    } finally {
      client.close();
    }
  });

  it("keeps official data intact when a model mutates input and returns invalid output", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await migrateDatabase(client);
      const repository = new ElectionRepository(client);
      const state = await refreshLiveState(repository, {
        fetchResults: async () => source,
        project: (state) => {
          const riding = state.ridings[0];
          if (riding) {
            riding.validVotes = 999999;
            riding.reportingPct = NaN;
          }
          return state;
        },
      });
      expect(state?.ridings[0]?.validVotes).toBe(1500);
      expect((await repository.latest())?.ridings[0]?.validVotes).toBe(1500);
    } finally {
      client.close();
    }
  });
});
