import { DgeqResultsSchema, type DgeqResults } from "@qcelect/schema";
import type { SourceValidators } from "@qcelect/schema";
export type { SourceValidators } from "@qcelect/schema";

export const DGEQ_RESULTS_URL =
  "https://donnees.electionsquebec.qc.ca/production/provincial/resultats/resultats.json";

export type DgeqFetchResult =
  | {
      status: "not-modified";
      validators: SourceValidators;
    }
  | {
      status: "ok";
      result: DgeqResults;
      raw: string;
      sha256: string;
      validators: SourceValidators;
    };

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validatorsFromResponse(
  response: Response,
  previous: SourceValidators,
): SourceValidators {
  const etag = response.headers.get("etag") ?? previous.etag;
  const lastModified =
    response.headers.get("last-modified") ?? previous.lastModified;
  const validators: SourceValidators = {};

  if (etag) validators.etag = etag;
  if (lastModified) validators.lastModified = lastModified;

  return validators;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return toHex(new Uint8Array(digest));
}

export async function fetchDgeqResults(
  fetcher: typeof fetch = fetch,
  previousValidators: SourceValidators = {},
): Promise<DgeqFetchResult> {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": "qcelect/1.0 (+https://github.com/andrewkoumoudjian/qcelect)",
  });

  if (previousValidators.etag) {
    headers.set("if-none-match", previousValidators.etag);
  }
  if (previousValidators.lastModified) {
    headers.set("if-modified-since", previousValidators.lastModified);
  }

  const response = await fetcher(DGEQ_RESULTS_URL, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const validators = validatorsFromResponse(response, previousValidators);

  if (response.status === 304) {
    return { status: "not-modified", validators };
  }

  if (!response.ok) {
    throw new Error(`Élections Québec returned HTTP ${response.status}`);
  }

  const raw = await response.text();
  const parsed: unknown = JSON.parse(raw);
  const result = DgeqResultsSchema.parse(parsed);

  return {
    status: "ok",
    result,
    raw,
    sha256: await sha256(raw),
    validators,
  };
}
