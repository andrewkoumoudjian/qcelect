import { z } from "zod";

export const SourceValidatorsSchema = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
});
export type SourceValidators = z.infer<typeof SourceValidatorsSchema>;
export const DatabaseEnvironmentSchema = z.object({
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  QCELECT_REPLAY_FILE: z.string().optional(),
});

// The live feed sends turnout as a decimal string, or "n.d." when unavailable.
const DgeqTurnoutSchema = z.union([
  z.number().min(0).max(100),
  z.literal("n.d.").transform(() => null),
  z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().min(0).max(100)),
]);

export const DgeqCandidateSchema = z
  .object({
    numeroCandidat: z.number(),
    nom: z.string(),
    prenom: z.string(),
    numeroPartiPolitique: z.number().nullable().optional(),
    abreviationPartiPolitique: z.string().nullable().optional(),
    nbVoteTotal: z.number(),
    tauxVote: z.number(),
    nbVoteAvance: z.number(),
  })
  .passthrough();

export const DgeqRidingSchema = z
  .object({
    numeroCirconscription: z.number(),
    nomCirconscription: z.string(),
    iso8601DateMAJ: z.string(),
    isResultatsFinaux: z.boolean(),
    nbBureauComplete: z.number(),
    nbBureauTotal: z.number(),
    nbVoteValide: z.number(),
    nbVoteRejete: z.number(),
    nbVoteExerce: z.number(),
    nbElecteurInscrit: z.number(),
    tauxVoteValide: z.number(),
    tauxVoteRejete: z.number(),
    tauxParticipation: DgeqTurnoutSchema,
    candidats: z.array(DgeqCandidateSchema),
  })
  .passthrough();

export const DgeqPartySchema = z
  .object({
    numeroPartiPolitique: z.number(),
    nomPartiPolitique: z.string(),
    abreviationPartiPolitique: z.string(),
    nbVoteTotal: z.number(),
    tauxVoteTotal: z.number(),
    nbCirconscriptionsEnAvance: z.number(),
    tauxCirconscriptionsEnAvance: z.number(),
  })
  .passthrough();

export const DgeqStatisticsSchema = z
  .object({
    partisPolitiques: z.array(DgeqPartySchema),
    nbBureauVote: z.number(),
    nbBureauVoteRempli: z.number(),
    tauxBureauVoteRempli: z.number(),
    nbVoteValide: z.number(),
    nbVoteRejete: z.number(),
    nbVoteExerce: z.number(),
    nbElecteurInscrit: z.number(),
    tauxParticipationTotal: DgeqTurnoutSchema,
    nbCirconscription: z.number(),
    nbCirconscriptionAvecResultat: z.number(),
    nbCirconscriptionSansResultat: z.number(),
    tauxCirconscriptionSansResultat: z.number(),
    isResultatsFinaux: z.boolean(),
    iso8601DateMAJ: z.string(),
  })
  .passthrough();

export const DgeqResultsSchema = z
  .object({
    statistiques: DgeqStatisticsSchema,
    circonscriptions: z.array(DgeqRidingSchema),
  })
  .passthrough();

export type DgeqResults = z.infer<typeof DgeqResultsSchema>;

export const PublicCandidateSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  party: z.string().nullable(),
  votes: z.number(),
  votePct: z.number(),
  leadVotes: z.number(),
});

export const RidingProjectionSchema = z.object({
  modelVersion: z.string(),
  projectedWinner: z.string().nullable(),
  winProbability: z.number().min(0).max(1).nullable(),
  projectedMarginPct: z.number().nullable(),
  interval80: z.tuple([z.number(), z.number()]).nullable(),
});

export const PublicRidingSchema = z.object({
  id: z.number(),
  name: z.string(),
  sourceUpdatedAt: z.string(),
  final: z.boolean(),
  pollsReported: z.number(),
  pollsTotal: z.number(),
  reportingPct: z.number(),
  validVotes: z.number(),
  rejectedVotes: z.number(),
  registeredElectors: z.number(),
  turnoutPct: z.number().nullable(),
  leaderParty: z.string().nullable(),
  candidates: z.array(PublicCandidateSchema),
  projection: RidingProjectionSchema.nullable(),
});

export const PublicPartySchema = z.object({
  id: z.number(),
  name: z.string(),
  abbreviation: z.string(),
  votes: z.number(),
  votePct: z.number(),
  seatsLeading: z.number(),
});

export const ReplayMetadataSchema = z.object({
  election: z.union([z.literal(2014), z.literal(2018), z.literal(2022)]),
  reporting: z.number().min(0).max(100),
  seed: z.number().int(),
  order: z.literal("hashed-units"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  crosswalkHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ReplayMetadata = z.infer<typeof ReplayMetadataSchema>;
export const ReplaySourceSchema = z.object({
  replay: ReplayMetadataSchema,
  result: DgeqResultsSchema,
});

export const PublicLiveStateSchema = z.object({
  schemaVersion: z.literal("qcelect.live.v1"),
  source: z.enum(["elections-quebec", "historical-replay"]),
  replay: ReplayMetadataSchema.optional(),
  sourceUpdatedAt: z.string(),
  ingestedAt: z.string(),
  sourceSha256: z.string(),
  final: z.boolean(),
  pollsReported: z.number(),
  pollsTotal: z.number(),
  reportingPct: z.number(),
  validVotes: z.number(),
  rejectedVotes: z.number(),
  registeredElectors: z.number(),
  turnoutPct: z.number().nullable(),
  parties: z.array(PublicPartySchema),
  ridings: z.array(PublicRidingSchema),
}).superRefine((state, context) => {
  if ((state.source === "historical-replay") !== Boolean(state.replay)) {
    context.addIssue({ code: "custom", message: "Replay provenance must match the source", path: ["replay"] });
  }
});

export type PublicLiveState = z.infer<typeof PublicLiveStateSchema>;
