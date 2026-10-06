import { readFile } from "node:fs/promises";
import { parseReplaySource } from "@qcelect/worker/replay";
import type { PublicLiveState } from "@qcelect/schema";
import { refreshLiveState } from "@qcelect/worker/pipeline";
import { openDatabase, migrateDatabase } from "./database";

const POLL_MS = 5_000;
type Subscriber = (state: PublicLiveState) => void;

async function startLive() {
  const database = await openDatabase();
  if (database.local) await migrateDatabase(database.client);
  let state = await database.repository.latest();
  const subscribers = new Set<Subscriber>();
  let sourceError: string | null = null;
  let checkedAt: string | null = null;

  async function refresh() {
    try {
      let next: PublicLiveState | null;
      if (database.replayFile) {
        const source = await parseReplaySource(await readFile(database.replayFile, "utf8"));
        await refreshLiveState(database.repository, { fetchResults: async () => source });
        if (source.status !== "ok") throw new Error("Replay source must contain a snapshot");
        await database.repository.activateReplay(source.sha256);
        const selected = await database.repository.latest();
        next = selected?.sourceSha256 !== state?.sourceSha256 ? selected : null;
      } else {
        next = await refreshLiveState(database.repository);
      }
      sourceError = null;
      if (next) {
        state = next;
        for (const subscriber of subscribers) {
          try {
            subscriber(next);
          } catch {
            subscribers.delete(subscriber);
          }
        }
      }
    } catch (error) {
      sourceError =
        error instanceof Error ? error.message : "Upstream fetch failed";
    } finally {
      checkedAt = new Date().toISOString();
      setTimeout(() => void refresh(), POLL_MS).unref();
    }
  }
  void refresh();
  return {
    current: () => state,
    health: () => ({
      checkedAt,
      sourceError,
      pollingMs: POLL_MS,
      sourceSha256: state?.sourceSha256 ?? null,
    }),
    subscribe(subscriber: Subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
}

declare global {
  var qcelectLive: ReturnType<typeof startLive> | undefined;
}

/** One process-wide ingestion loop, shared by HTTP and streaming clients. */
export function getLive() {
  return (globalThis.qcelectLive ??= startLive().catch((error) => {
    globalThis.qcelectLive = undefined;
    throw error;
  }));
}
