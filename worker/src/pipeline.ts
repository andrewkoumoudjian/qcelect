import { normalizeDgeqResults } from "@qcelect/core";
import {
  PublicLiveStateSchema,
  SourceValidatorsSchema,
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
  acceptOfficial?: (state: PublicLiveState) => Promise<boolean>;
}

export interface RefreshDependencies {
  fetchResults: (validators: SourceValidators) => Promise<DgeqFetchResult>;
  now: () => string;
  project: (state: PublicLiveState) => PublicLiveState;
  onProjectionError?: (error: Error) => void;
}

const defaultDependencies: RefreshDependencies = {
  fetchResults: (validators) => fetchDgeqResults(fetch, validators),
  now: () => new Date().toISOString(),
  project: applyProjections,
  onProjectionError: (error) =>
    console.error("projection inference failed", error),
};

function parseValidators(raw: string | null): SourceValidators {
  if (!raw) return {};

  try {
    const parsed = SourceValidatorsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function persistValidators(
  store: LiveStore,
  validators: SourceValidators,
  previous: string | null,
): Promise<void> {
  if (!validators.etag && !validators.lastModified) return;
  const body = JSON.stringify(validators);
  if (body !== previous) await store.put(VALIDATORS_KEY, body);
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
    await persistValidators(store, source.validators, validatorsRaw);
    return null;
  }

  if (priorHash === source.sha256) {
    await persistValidators(store, source.validators, validatorsRaw);
    return null;
  }

  const normalized = normalizeDgeqResults(source.result, {
    ingestedAt: deps.now(),
    sourceSha256: source.sha256,
  });
  if (store.acceptOfficial && !(await store.acceptOfficial(normalized))) {
    await persistValidators(store, source.validators, validatorsRaw);
    return null;
  }

  let state = normalized;
  try {
    const evaluated = PublicLiveStateSchema.parse(
      deps.project(structuredClone(normalized)),
    );
    const projections = new Map(
      evaluated.ridings.map((riding) => [riding.id, riding.projection]),
    );
    if (
      evaluated.ridings.length !== normalized.ridings.length ||
      projections.size !== normalized.ridings.length ||
      normalized.ridings.some((riding) => !projections.has(riding.id))
    ) {
      throw new Error("Projection changed the official riding universe");
    }
    state = {
      ...normalized,
      ridings: normalized.ridings.map((riding) => ({
        ...riding,
        projection: projections.get(riding.id) ?? null,
      })),
    };
  } catch (error: unknown) {
    deps.onProjectionError?.(
      error instanceof Error
        ? error
        : new Error("Projection evaluation failed"),
    );
  }

  const validated = PublicLiveStateSchema.parse(state);

  // Persist the public state before the hash. If the hash write fails, the
  // next scheduled run may repeat deterministic work but cannot suppress a
  // valid official snapshot.
  await store.put(LIVE_KEY, JSON.stringify(validated));
  await store.put(HASH_KEY, source.sha256);
  await persistValidators(store, source.validators, validatorsRaw);

  return validated;
}
