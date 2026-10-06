import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/dgeq-results.json";
import { DgeqResultsSchema } from "../packages/schema/src/index";
import { normalizeDgeqResults } from "../packages/core/src/index";
import {
  fetchDgeqResults,
  sha256,
  type DgeqFetchResult,
} from "../worker/src/dgeq";
import {
  HASH_KEY,
  LIVE_KEY,
  VALIDATORS_KEY,
  refreshLiveState,
  type LiveStore,
} from "../worker/src/pipeline";

class MemoryStore implements LiveStore {
  readonly values = new Map<string, string>();
  readonly puts: Array<[string, string]> = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.puts.push([key, value]);
    this.values.set(key, value);
  }
}

const parsedFixture = DgeqResultsSchema.parse(fixture);

describe("Élections Québec source contract", () => {
  it("accepts additive upstream fields while requiring consumed fields", () => {
    expect(parsedFixture.statistiques.nbBureauVoteRempli).toBe(50);
    expect(parsedFixture.circonscriptions).toHaveLength(2);
  });

  it("preserves unavailable turnout without accepting arbitrary strings", () => {
    const source = structuredClone(fixture);
    const earlySource = {
      ...source,
      statistiques: { ...source.statistiques, tauxParticipationTotal: "n.d." },
      circonscriptions: source.circonscriptions.map((riding) => ({ ...riding, tauxParticipation: "n.d." })),
    };
    const parsed = DgeqResultsSchema.parse(earlySource);
    const normalized = normalizeDgeqResults(parsed, { ingestedAt: "2026-10-05T20:00:10-04:00", sourceSha256: "early" });
    expect(normalized.turnoutPct).toBeNull();
    expect(DgeqResultsSchema.parse({
      ...earlySource,
      statistiques: { ...earlySource.statistiques, tauxParticipationTotal: "72.21" },
    }).statistiques.tauxParticipationTotal).toBe(72.21);
    expect(normalized.ridings.every((riding) => riding.turnoutPct === null)).toBe(true);
    expect(DgeqResultsSchema.safeParse({
      ...earlySource,
      statistiques: { ...earlySource.statistiques, tauxParticipationTotal: "unexpected" },
    }).success).toBe(false);
  });

  it("sends conditional validators and accepts HTTP 304", async () => {
    let requestHeaders: Headers | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      return new Response(null, {
        status: 304,
        headers: { etag: '"next"' },
      });
    };

    const result = await fetchDgeqResults(fetcher, {
      etag: '"prior"',
      lastModified: "Mon, 05 Oct 2026 20:00:00 GMT",
    });

    expect(requestHeaders?.get("if-none-match")).toBe('"prior"');
    expect(requestHeaders?.get("if-modified-since")).toBe(
      "Mon, 05 Oct 2026 20:00:00 GMT",
    );
    expect(result).toEqual({
      status: "not-modified",
      validators: {
        etag: '"next"',
        lastModified: "Mon, 05 Oct 2026 20:00:00 GMT",
      },
    });
  });

  it("hashes source bodies deterministically", async () => {
    expect(await sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("normalization", () => {
  it("sorts candidates, preserves official seat totals, and treats tied leaders as unknown", () => {
    const state = normalizeDgeqResults(parsedFixture, {
      ingestedAt: "2026-10-05T21:00:01-04:00",
      sourceSha256: "hash",
    });

    expect(state.reportingPct).toBe(25);
    expect(state.parties[0]?.seatsLeading).toBe(1);
    expect(state.ridings[0]?.candidates[0]?.lastName).toBe("Premier");
    expect(state.ridings[0]?.leaderParty).toBe("PQ");
    expect(state.ridings[1]?.leaderParty).toBeNull();
  });
});

describe("worker refresh pipeline", () => {
  const source: DgeqFetchResult = {
    status: "ok",
    result: parsedFixture,
    raw: JSON.stringify(fixture),
    sha256: "same-hash",
    validators: { etag: '"v1"' },
  };

  it("short-circuits before normalization/model work when the source hash is unchanged", async () => {
    const store = new MemoryStore();
    store.values.set(HASH_KEY, "same-hash");
    const project = vi.fn((state) => state);

    const result = await refreshLiveState(store, {
      fetchResults: async () => source,
      project,
    });

    expect(result).toBeNull();
    expect(project).not.toHaveBeenCalled();
    expect(store.values.get(LIVE_KEY)).toBeUndefined();
    expect(store.values.get(VALIDATORS_KEY)).toBe(JSON.stringify({ etag: '"v1"' }));
  });

  it("short-circuits on an upstream HTTP 304", async () => {
    const store = new MemoryStore();
    const project = vi.fn((state) => state);

    const result = await refreshLiveState(store, {
      fetchResults: async () => ({
        status: "not-modified",
        validators: { etag: '"v2"' },
      }),
      project,
    });

    expect(result).toBeNull();
    expect(project).not.toHaveBeenCalled();
  });

  it("publishes valid official results even when projection evaluation throws", async () => {
    const store = new MemoryStore();
    const onProjectionError = vi.fn();

    const state = await refreshLiveState(store, {
      fetchResults: async () => ({
        ...source,
        sha256: "new-hash",
      }),
      now: () => "2026-10-05T21:00:02-04:00",
      project: () => {
        throw new Error("artifact unavailable");
      },
      onProjectionError,
    });

    expect(onProjectionError).toHaveBeenCalledOnce();
    expect(state?.sourceSha256).toBe("new-hash");
    expect(state?.ridings.every((riding) => riding.projection === null)).toBe(true);
    expect(store.values.get(LIVE_KEY)).toContain('"source":"elections-quebec"');
    expect(store.values.get(HASH_KEY)).toBe("new-hash");
  });
});
