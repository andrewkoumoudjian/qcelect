"use client";

import { PublicLiveStateSchema, type PublicLiveState } from "@qcelect/schema";
import { useEffect, useMemo, useState } from "react";
import { ResultsViewTabs } from "./ResultsViewTabs";
import { RidingDialog } from "./RidingDialog";

const LIVE_API_URL = process.env.NEXT_PUBLIC_LIVE_API_URL ?? "/api/live.json";
const POLL_MS = 20_000;

type Riding = PublicLiveState["ridings"][number];

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
  const parsed = new Date(value);
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

export function LiveResults() {
  const [state, setState] = useState<PublicLiveState | null>(null);
  const [selectedRiding, setSelectedRiding] = useState<Riding | null>(null);
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
      setSelectedRiding((current) =>
        current
          ? (next.ridings.find((riding) => riding.id === current.id) ?? null)
          : null,
      );
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

  const parties = useMemo(() => (state ? partyRows(state) : []), [state]);

  if (!state) {
    return (
      <section className="liveLoading" aria-live="polite">
        <div>
          <p className="statusKicker">Résultats officiels</p>
          <h2>En attente des données d&apos;Élections Québec</h2>
          <p>
            La page s&apos;actualisera automatiquement dès qu&apos;un premier
            état officiel sera publié.
          </p>
        </div>
        {connectionError ? (
          <span className="connectionNote">
            Source qcelect momentanément indisponible
          </span>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <section className="liveStatus" aria-live="polite">
        <div className="sourceStatus">
          <span className="liveDot" aria-hidden="true" />
          <strong>Officiel · Élections Québec</strong>
          <span>Mis à jour à {formatTimestamp(state.sourceUpdatedAt)}</span>
          <span>
            {number.format(state.pollsReported)} /{" "}
            {number.format(state.pollsTotal)} bureaux
          </span>
          <span>{percent.format(state.reportingPct)} % dépouillé</span>
        </div>
        {connectionError ? (
          <span className="connectionNote">
            Reconnexion en cours · dernière donnée valide conservée
          </span>
        ) : null}
      </section>

      <section className="majorityBand" aria-label="Seuil de majorité">
        <strong>64</strong>
        <span>sièges pour une majorité</span>
        <span className="modelSeparation">
          Projections statistiques: non publiées tant qu&apos;aucun artifact
          calibré n&apos;est validé
        </span>
      </section>

      <section className="partySummary" aria-label="Sommaire des partis">
        {parties.map((party) => (
          <article className="partyCard" key={party.id}>
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
                <strong>{party.seatsLeading}</strong>
                <span>en tête</span>
              </div>
              <div>
                <strong>{percent.format(party.votePct)} %</strong>
                <span>vote</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <ResultsViewTabs
        state={state}
        onRidingSelect={(id) => {
          setSelectedRiding(
            state.ridings.find((riding) => riding.id === id) ?? null,
          );
        }}
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
          <span>{state.ridings.length} sièges</span>
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
              {[...state.ridings]
                .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                .map((riding) => {
                  const leader = riding.candidates[0];
                  return (
                    <tr key={riding.id}>
                      <td>
                        <button
                          className="ridingLink"
                          type="button"
                          onClick={() => setSelectedRiding(riding)}
                        >
                          {riding.name}
                        </button>
                      </td>
                      <td>{riding.leaderParty ?? "—"}</td>
                      <td>
                        {leader && leader.votes > 0
                          ? `${percent.format(leader.votePct)} %`
                          : "—"}
                      </td>
                      <td>
                        {riding.pollsReported}/{riding.pollsTotal}
                      </td>
                      <td>
                        {riding.final
                          ? "Final"
                          : riding.pollsReported > 0
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
        open={selectedRiding !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRiding(null);
        }}
      />
    </>
  );
}
