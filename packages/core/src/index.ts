import type { DgeqResults, PublicLiveState } from "@qcelect/schema";

function finitePct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

function leaderParty(
  candidates: DgeqResults["circonscriptions"][number]["candidats"],
): string | null {
  if (candidates.length === 0) return null;

  const ordered = [...candidates].sort(
    (a, b) => b.nbVoteTotal - a.nbVoteTotal || a.numeroCandidat - b.numeroCandidat,
  );
  const first = ordered[0];
  const second = ordered[1];

  if (!first || first.nbVoteTotal <= 0) return null;
  if (second && second.nbVoteTotal === first.nbVoteTotal) return null;
  return first.abreviationPartiPolitique ?? null;
}

export function normalizeDgeqResults(
  source: DgeqResults,
  metadata: { ingestedAt: string; sourceSha256: string },
): PublicLiveState {
  const stats = source.statistiques;

  return {
    schemaVersion: "qcelect.live.v1",
    source: "elections-quebec",
    sourceUpdatedAt: stats.iso8601DateMAJ,
    ingestedAt: metadata.ingestedAt,
    sourceSha256: metadata.sourceSha256,
    final: stats.isResultatsFinaux,
    pollsReported: stats.nbBureauVoteRempli,
    pollsTotal: stats.nbBureauVote,
    reportingPct: finitePct(stats.nbBureauVoteRempli, stats.nbBureauVote),
    validVotes: stats.nbVoteValide,
    rejectedVotes: stats.nbVoteRejete,
    registeredElectors: stats.nbElecteurInscrit,
    turnoutPct: stats.tauxParticipationTotal,
    parties: stats.partisPolitiques.map((party) => ({
      id: party.numeroPartiPolitique,
      name: party.nomPartiPolitique,
      abbreviation: party.abreviationPartiPolitique,
      votes: party.nbVoteTotal,
      votePct: party.tauxVoteTotal,
      seatsLeading: party.nbCirconscriptionsEnAvance,
    })),
    ridings: source.circonscriptions.map((riding) => ({
      id: riding.numeroCirconscription,
      name: riding.nomCirconscription,
      sourceUpdatedAt: riding.iso8601DateMAJ,
      final: riding.isResultatsFinaux,
      pollsReported: riding.nbBureauComplete,
      pollsTotal: riding.nbBureauTotal,
      reportingPct: finitePct(riding.nbBureauComplete, riding.nbBureauTotal),
      validVotes: riding.nbVoteValide,
      rejectedVotes: riding.nbVoteRejete,
      registeredElectors: riding.nbElecteurInscrit,
      turnoutPct: riding.tauxParticipation,
      leaderParty: leaderParty(riding.candidats),
      candidates: riding.candidats
        .map((candidate) => ({
          id: candidate.numeroCandidat,
          firstName: candidate.prenom,
          lastName: candidate.nom,
          party: candidate.abreviationPartiPolitique ?? null,
          votes: candidate.nbVoteTotal,
          votePct: candidate.tauxVote,
          leadVotes: candidate.nbVoteAvance,
        }))
        .sort(
          (a, b) =>
            b.votes - a.votes ||
            a.lastName.localeCompare(b.lastName, "fr") ||
            a.id - b.id,
        ),
      projection: null,
    })),
  };
}
