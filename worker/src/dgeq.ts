import { DgeqResultsSchema, type DgeqResults } from "@qcelect/schema";

export const DGEQ_RESULTS_URL =
  "https://donnees.electionsquebec.qc.ca/production/provincial/resultats/resultats.json";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

export async function fetchDgeqResults(fetcher: typeof fetch = fetch): Promise<{
  result: DgeqResults;
  raw: string;
  sha256: string;
}> {
  const response = await fetcher(DGEQ_RESULTS_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "qcelect/1.0 (+https://github.com/andrewkoumoudjian/qcelect)",
    },
  });

  if (!response.ok) {
    throw new Error(`Élections Québec returned HTTP ${response.status}`);
  }

  const raw = await response.text();
  const parsed: unknown = JSON.parse(raw);
  const result = DgeqResultsSchema.parse(parsed);

  return { result, raw, sha256: await sha256(raw) };
}
