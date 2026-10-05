import { normalizeDgeqResults } from "@qcelect/core";
import { PublicLiveStateSchema, type PublicLiveState } from "@qcelect/schema";
import { fetchDgeqResults } from "./dgeq";
import { applyProjections } from "./model";

const LIVE_KEY = "live:v1";
const HASH_KEY = "source-hash:v1";

export interface Env {
  LIVE: KVNamespace;
}

async function refresh(env: Env): Promise<PublicLiveState | null> {
  const source = await fetchDgeqResults();
  const priorHash = await env.LIVE.get(HASH_KEY);

  if (priorHash === source.sha256) {
    return null;
  }

  const normalized = normalizeDgeqResults(source.result, {
    ingestedAt: new Date().toISOString(),
    sourceSha256: source.sha256,
  });
  const state = applyProjections(normalized);
  PublicLiveStateSchema.parse(state);

  await Promise.all([
    env.LIVE.put(LIVE_KEY, JSON.stringify(state)),
    env.LIVE.put(HASH_KEY, source.sha256),
  ]);

  return state;
}

async function serveLive(env: Env): Promise<Response> {
  const body = await env.LIVE.get(LIVE_KEY);
  if (!body) {
    return Response.json(
      { error: "live_state_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=10, stale-while-revalidate=60",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/live.json") return serveLive(env);
    if (url.pathname === "/healthz") return Response.json({ ok: true });
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      refresh(env).catch((error: unknown) => {
        console.error("live refresh failed", error);
      }),
    );
  },
};
