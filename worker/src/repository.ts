import type { Client } from "@libsql/client";
import { PublicLiveStateSchema, type PublicLiveState } from "@qcelect/schema";
import { DGEQ_RESULTS_URL } from "./dgeq";
import { HASH_KEY, LIVE_KEY, type LiveStore } from "./pipeline";

/** Durable snapshots; each JSON document contains the complete typed result history. */
export class ElectionRepository implements LiveStore {
  constructor(
    private readonly client: Client,
    private readonly election = "2026-10-05",
  ) {}

  async latest(): Promise<PublicLiveState | null> {
    const result = await this.client.execute({
      sql: "SELECT public_json, official_json FROM official_snapshots WHERE election = ? ORDER BY CASE WHEN source_sha256 = (SELECT value FROM ingestion_metadata WHERE key = ?) THEN 0 ELSE 1 END, id DESC LIMIT 1",
      args: [this.election, `active-replay:${this.election}`],
    });
    const row = result.rows[0];
    if (!row) return null;
    const published = PublicLiveStateSchema.safeParse(
      JSON.parse(String(row.public_json)),
    );
    return published.success
      ? published.data
      : PublicLiveStateSchema.parse(JSON.parse(String(row.official_json)));
  }

  async acceptOfficial(state: PublicLiveState): Promise<boolean> {
    const official = PublicLiveStateSchema.parse(state);
    if (official.ridings.some((riding) => riding.projection !== null)) {
      throw new Error("Official snapshots must exclude model output");
    }
    const body = JSON.stringify(official);
    const result = await this.client.execute({
      sql: `INSERT INTO official_snapshots
        (election, source_sha256, source_updated_at, fetched_at, source_url, schema_version, official_json, public_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (election, source_sha256) DO NOTHING`,
      args: [
        this.election,
        official.sourceSha256,
        official.sourceUpdatedAt,
        official.ingestedAt,
        official.replay ? `historical-replay:${official.replay.election}:on-2026` : DGEQ_RESULTS_URL,
        official.schemaVersion,
        body,
        body,
      ],
    });
    return result.rowsAffected === 1;
  }

  /** Selecting recorded replay states changes a pointer, never their immutable history. */
  async activateReplay(hash: string): Promise<void> {
    if (!this.election.startsWith("historical-replay:")) throw new Error("Cannot select replay state in a live election");
    const key = `active-replay:${this.election}`;
    const result = await this.client.execute({
      sql: "INSERT INTO ingestion_metadata (key, value) SELECT ?, source_sha256 FROM official_snapshots WHERE election = ? AND source_sha256 = ? ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE value != excluded.value",
      args: [key, this.election, hash],
    });
    if (result.rowsAffected === 0 && await this.get(key) !== hash) throw new Error("Replay snapshot is not stored");
  }

  async get(key: string): Promise<string | null> {
    if (key === LIVE_KEY) {
      const state = await this.latest();
      return state ? JSON.stringify(state) : null;
    }
    if (key === HASH_KEY) {
      const result = await this.client.execute({
        sql: "SELECT source_sha256 FROM official_snapshots WHERE election = ? ORDER BY CASE WHEN source_sha256 = (SELECT value FROM ingestion_metadata WHERE key = ?) THEN 0 ELSE 1 END, id DESC LIMIT 1",
        args: [this.election, `active-replay:${this.election}`],
      });
      return result.rows[0] ? String(result.rows[0].source_sha256) : null;
    }
    const result = await this.client.execute({
      sql: "SELECT value FROM ingestion_metadata WHERE key = ?",
      args: [key],
    });
    return result.rows[0] ? String(result.rows[0].value) : null;
  }

  async put(key: string, value: string): Promise<void> {
    if (key === HASH_KEY) return; // The accepted snapshot owns its hash atomically.
    if (key === LIVE_KEY) {
      const state = PublicLiveStateSchema.parse(JSON.parse(value));
      await this.client.execute({
        sql: "UPDATE official_snapshots SET public_json = ? WHERE election = ? AND source_sha256 = ?",
        args: [JSON.stringify(state), this.election, state.sourceSha256],
      });
      return;
    }
    await this.client.execute({
      sql: "INSERT INTO ingestion_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, value],
    });
  }
}
