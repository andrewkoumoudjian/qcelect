import { expect, it, vi } from "vitest";
import fixture from "./fixtures/dgeq-results.json";
import {
  DgeqResultsSchema,
  PublicLiveStateSchema,
} from "../packages/schema/src/index";
import { normalizeDgeqResults } from "../packages/core/src/index";
import { getLive } from "../apps/web/src/server/live";
import { GET as liveResponse } from "../apps/web/src/app/api/live.json/route";
import { GET as streamResponse } from "../apps/web/src/app/api/live/stream/route";

vi.mock("../apps/web/src/server/live", () => ({ getLive: vi.fn() }));
const state = normalizeDgeqResults(DgeqResultsSchema.parse(fixture), {
  sourceSha256: "hash",
  ingestedAt: "2026-10-05T23:00:00Z",
});

it("serializes one canonical payload and streams it immediately with cleanup on disconnect", async () => {
  const unsubscribe = vi.fn(() => true);
  vi.mocked(getLive).mockResolvedValue({
    current: () => state,
    health: () => ({
      checkedAt: null,
      sourceError: null,
      pollingMs: 5000,
      sourceSha256: "hash",
    }),
    subscribe: () => unsubscribe,
  });
  const response = await liveResponse();
  expect(response.status).toBe(200);
  expect(PublicLiveStateSchema.parse(await response.json())).toEqual(state);
  const abort = new AbortController();
  const stream = await streamResponse(
    new Request("http://localhost/api/live/stream", { signal: abort.signal }),
  );
  expect(stream.headers.get("content-type")).toBe("text/event-stream");
  if (!stream.body) throw new Error("Missing stream body");
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  expect(first).toBe(`id: hash\ndata: ${JSON.stringify(state)}\n\n`);
  abort.abort();
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("returns a waiting response without inventing results", async () => {
  vi.mocked(getLive).mockResolvedValue({
    current: () => null,
    health: () => ({
      checkedAt: null,
      sourceError: "HTTP 403",
      pollingMs: 5000,
      sourceSha256: null,
    }),
    subscribe: () => () => true,
  });
  const response = await liveResponse();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    status: "waiting-for-official-results",
    sourceError: "HTTP 403",
  });
});
