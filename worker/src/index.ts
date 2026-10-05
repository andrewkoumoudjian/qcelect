import { refreshLiveState, LIVE_KEY } from "./pipeline";

export interface Env {
  LIVE: KVNamespace;
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

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      refreshLiveState(env.LIVE).catch((error: unknown) => {
        console.error("live refresh failed", error);
      }),
    );
  },
};
