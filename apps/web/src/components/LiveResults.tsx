"use client";

import { PublicLiveStateSchema, type PublicLiveState } from "@qcelect/schema";
import { useEffect, useMemo, useState } from "react";
import { ResultsViewTabs } from "./ResultsViewTabs";
import { RidingDialog } from "./RidingDialog";

const LIVE_API_URL = process.env.NEXT_PUBLIC_LIVE_API_URL ?? "/api/live.json";
const POLL_MS = 20_000;

const WAITING_PARTIES = [
  { abbreviation: "CAQ", name: "Coalition avenir Québec" },
  { abbreviation: "PLQ", name: "Parti libéral du Québec" },
  { abbreviation: "PQ", name: "Parti québécois" },
  { abbreviation: "QS", name: "Québec solidaire" },
  { abbreviation: "PCOQ", name: "Parti conservateur du Québec" },
];

const number = new Intl.NumberFormat("fr-CA");
const percent = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 1,
});

function partyColor(abbreviation: string): string {
  switch (abbreviation) {
    case "PQ":
      return "#2b63ad";
    case "PLQ":
    case "PLQ/QLP":
      return "#d43a3a";
    case "PCOQ":
      return "#5f82bd";
    case "CAQ":
    case "ÉCF-CAQ":
      return "#43a6a6";
    case "QS":
      return "#e4782f";
    default:
      return "#85857e";
  }
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value.replace(/,(\d{3})/, ".$1"));
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

function partyRows(state: PublicLiveState) {
  const ordered = [...state.parties].sort(
    (a, b) =>
      b.seatsLeading - a.seatsLeading ||
      b.votePct - a.votePct ||
      b.votes - a.votes,
  );
  const active = ordered.filter(
    (party) => party.seatsLeading > 0 || party.votes > 0,
  );
  return active.length ? active : ordered.slice(0, 6);
}

export function LiveResults({ ridingMetadata }: {
  ridingMetadata: readonly { id: number; name: string }[];
}) {
  const [state, setState] = useState<PublicLiveState | null>(null);
  const [selectedRidingId, setSelectedRidingId] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let streamConnected = false;
    let polling = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function acceptState(next: PublicLiveState) {
      if (cancelled) return;
      setState((current) =>
        current?.sourceSha256 === next.sourceSha256 ? current : next,
      );
      setConnectionError(false);

    }

    async function poll() {
      if (polling || cancelled) return;
      polling = true;
      try {
        const response = await fetch(LIVE_API_URL, {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`live API HTTP ${response.status}`);

        const parsed = PublicLiveStateSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("invalid live state");

        if (!streamConnected) acceptState(parsed.data);
      } catch {
        if (!cancelled) setConnectionError(true);
      } finally {
        polling = false;
        if (!cancelled && !streamConnected)
          timeout = setTimeout(() => {
            timeout = undefined;
            void poll();
          }, POLL_MS);
      }
    }

    const stream =
      LIVE_API_URL === "/api/live.json"
        ? new EventSource("/api/live/stream")
        : null;
    if (stream) {
      stream.onopen = () => {
        streamConnected = true;
        setConnectionError(false);
        if (timeout) clearTimeout(timeout);
        timeout = undefined;
      };
      stream.onmessage = (event) => {
        try {
          const parsed = PublicLiveStateSchema.safeParse(
            JSON.parse(event.data),
          );
          if (parsed.success) acceptState(parsed.data);
        } catch {
          setConnectionError(true);
        }
      };
      stream.onerror = () => {
        streamConnected = false;
        if (!cancelled) setConnectionError(true);
        if (!timeout) void poll();
      };
    } else void poll();
    return () => {
      cancelled = true;
      stream?.close();
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const parties = useMemo(() => state
    ? partyRows(state).map((party) => ({ abbreviation: party.abbreviation, name: party.name, results: party }))
    : WAITING_PARTIES.map((party) => ({ ...party, results: null })), [state]);
  const ridings = ridingMetadata.map((metadata) =>
    state?.ridings.find((riding) => riding.id === metadata.id) ?? metadata,
  );
  const selectedRiding = state?.ridings.find((riding) => riding.id === selectedRidingId) ?? null;
  const selectedName = ridings.find((riding) => riding.id === selectedRidingId)?.name ?? "";

  return (
    <>
      <section className="liveStatus" aria-live="polite">
        <div className="sourceStatus">
          {state ? (
            <>
              <span className="liveDot" aria-hidden="true" />
              <strong>Officiel · Élections Québec</strong>
              <span>Mis à jour à {formatTimestamp(state.sourceUpdatedAt)}</span>
              <span>{number.format(state.pollsReported)} / {number.format(state.pollsTotal)} bureaux</span>
              <span>{percent.format(state.reportingPct)} % dépouillé</span>
            </>
          ) : (
            <>
              <strong>En attente du premier résultat officiel</strong>
              <span>Mise à jour automatique · Élections Québec</span>
            </>
          )}
        </div>
        {connectionError ? (
          <span className="connectionNote">
            {state ? "Reconnexion en cours · dernière donnée valide conservée" : "Reconnexion en cours"}
          </span>
        ) : null}
      </section>

      <section className="partySummary" aria-label="Sommaire des partis">
        {parties.map((party) => (
          <article className="partyCard" key={party.abbreviation}>
            <div className="partyIdentity">
              <span
                className="partySwatch"
                style={{ backgroundColor: partyColor(party.abbreviation) }}
                aria-hidden="true"
              />
              <div>
                <strong>{party.abbreviation}</strong>
                <span>{party.name}</span>
              </div>
            </div>
            <div className="partyMetrics">
              <div>
                <strong>{party.results?.seatsLeading ?? "–"}</strong>
                <span>en tête</span>
              </div>
              <div>
                <strong>{party.results ? `${percent.format(party.results.votePct)} %` : "–"}</strong>
                <span>vote</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="majorityBand" aria-label="Seuil de majorité">
        <strong>64</strong>
        <span>sièges pour une majorité</span>
        <span className="modelSeparation">Modèle : non publié</span>
      </section>

      <ResultsViewTabs
        ridings={state?.ridings ?? []}
        onRidingSelect={setSelectedRidingId}
      />

      <section
        className="resultsTable"
        aria-label="Résultats par circonscription"
      >
        <div className="sectionHeading">
          <div>
            <p className="statusKicker">Officiel</p>
            <h2>Circonscriptions</h2>
          </div>
          <span>{ridings.length} sièges</span>
        </div>
        <div className="tableScroller">
          <table className="ridingTable">
            <thead>
              <tr>
                <th>Circonscription</th>
                <th>En tête</th>
                <th>Vote</th>
                <th>Bureaux</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {[...ridings]
                .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                .map((riding) => {
                  const result = state?.ridings.find((result) => result.id === riding.id);
                  const leader = result?.candidates[0];
                  return (
                    <tr key={riding.id}>
                      <td>
                        <button
                          className="ridingLink"
                          type="button"
                          onClick={() => setSelectedRidingId(riding.id)}
                        >
                          {riding.name}
                        </button>
                      </td>
                      <td>{result?.leaderParty ?? "–"}</td>
                      <td>
                        {leader && leader.votes > 0
                          ? `${percent.format(leader.votePct)} %`
                          : "–"}
                      </td>
                      <td>
                        {result ? `${result.pollsReported}/${result.pollsTotal}` : "–"}
                      </td>
                      <td>
                        {result?.final
                          ? "Final"
                          : result && result.pollsReported > 0
                            ? "En cours"
                            : "Aucun résultat"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <RidingDialog
        riding={selectedRiding}
        name={selectedName}
        open={selectedRidingId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRidingId(null);
        }}
      />
    </>
  );
}
