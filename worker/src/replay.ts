import { ReplaySourceSchema } from "@qcelect/schema";
import { sha256, type DgeqFetchResult } from "./dgeq";

/** Adapt an offline historical snapshot to the exact live ingestion contract. */
export async function parseReplaySource(raw: string): Promise<DgeqFetchResult> {
  const parsed = ReplaySourceSchema.parse(JSON.parse(raw));
  return {
    status: "ok",
    raw,
    sha256: await sha256(raw),
    result: parsed.result,
    replay: parsed.replay,
    validators: {},
  };
}
