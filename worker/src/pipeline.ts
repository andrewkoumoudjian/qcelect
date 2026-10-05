import { normalizeDgeqResults } from "@qcelect/core";
import {
  PublicLiveStateSchema,
  type PublicLiveState,
} from "@qcelect/schema";
import {
  fetchDgeqResults,
  type DgeqFetchResult,
  type SourceValidators,
} from "./dgeq";
import { applyProjections } from "./model";

export const LIVE_KEY = "live:v1";
export const HASH_KEY = "source-hash:v1";
export const VALIDATORS_KEY = "source-validators:v1";

export interface LiveStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface RefreshDependencies {
  fetchResults: (validators: SourceValidators) => Promise<DgeqFetchResult>;
  now: () => string;
  project: (state: PublicLiveState) => PublicLiveState;
  onProjectionError?: (error: unknown) => void;
}

const defaultDependencies: RefreshDependencies = {
  fetchResults: (validators) => fetchDgeqResults(fetch, validators),
  now: () => new Date().toISOString(),
  project: applyProjections,
  onProjectionError: (error) => console.error("projection inference failed", error),
};

function parseValidators(raw: string | null): SourceValidators {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const value = parsed as Record<string, unknown>;
    return {
      ...(typeof value.etag === "string" ? { etag: value.etag } : {}),
      ...(typeof value.lastModified === "string"
        ? { lastModified: value.lastModified }
        : {}),
    };
  } catch {
    return {};
  }
}

async function persistValidators(
  store: LiveStore,
  validators: SourceValidators,
): Promise<void> {
  if (!validators.etag && !validators.lastModified) return;
  await store.put(VALIDATORS_KEY, JSON.stringify(validators));
}

/**
 * One election-night ingestion pass.
 *
 * Official data publication is deliberately independent from projections:
 * if model evaluation fails, the normalized official state is still validated
 * and persisted with projection fields left null.
 */
export async function refreshLiveState(
  store: LiveStore,
  dependencies: Partial<RefreshDependencies> = {},
): Promise<PublicLiveState | null> {
  const deps: RefreshDependencies = { ...defaultDependencies, ...dependencies };
  const [priorHash, validatorsRaw] = await Promise.all([
    store.get(HASH_KEY),
    store.get(VALIDATORS_KEY),
  ]);

  const source = await deps.fetchResults(parseValidators(validatorsRaw));

  if (source.status === "not-modified") {
    await persistValidators(store, source.validators);
    return null;
  }

  if (priorHash === source.sha256) {
    await persistValidators(store, source.validators);
    return null;
  }

  const normalized = normalizeDgeqResults(source.result, {
    ingestedAt: deps.now(),
    sourceSha256: source.sha256,
  });

  let state = normalized;
  try {
    state = deps.project(normalized);
  } catch (error: unknown) {
    deps.onProjectionError?.(error);
  }

  const validated = PublicLiveStateSchema.parse(state);

  // Persist the public state before the hash. If the hash write fails, the
  // next scheduled run may repeat deterministic work but cannot suppress a
  // valid official snapshot.
  await store.put(LIVE_KEY, JSON.stringify(validated));
  await store.put(HASH_KEY, source.sha256);
  await persistValidators(store, source.validators);

  return validated;
}
