import { getLive } from "../../../server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const live = await getLive();
  const state = live.current();
  return Response.json(
    state ?? { status: "waiting-for-official-results", ...live.health() },
    {
      status: state ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
