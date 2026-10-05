import { getLive } from "../../../server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json((await getLive()).health(), {
    headers: { "cache-control": "no-store" },
  });
}
