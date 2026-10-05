"use client";

import type { PublicLiveState } from "@qcelect/schema";
import { Dialog } from "@base-ui/react/dialog";

type Riding = PublicLiveState["ridings"][number];

const number = new Intl.NumberFormat("fr-CA");
const percent = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 1,
});

export function RidingDialog({
  riding,
  open,
  onOpenChange,
}: {
  riding: Riding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialogBackdrop" />
        <Dialog.Viewport className="dialogViewport">
          <Dialog.Popup className="ridingDialog">
            {riding ? (
              <>
                <div className="dialogHeader">
                  <div>
                    <p className="statusKicker">
                      {riding.final ? "Résultat final" : "Résultat officiel en cours"}
                    </p>
                    <Dialog.Title className="dialogTitle">
                      {riding.name}
                    </Dialog.Title>
                    <Dialog.Description className="dialogDescription">
                      {riding.pollsReported} / {riding.pollsTotal} bureaux ·{" "}
                      {percent.format(riding.reportingPct)} % dépouillé · participation{" "}
                      {percent.format(riding.turnoutPct)} %
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="dialogClose" aria-label="Fermer">
                    ×
                  </Dialog.Close>
                </div>

                <div className="candidateList" aria-label="Candidats">
                  {riding.candidates.map((candidate, index) => (
                    <div
                      className={index === 0 && riding.leaderParty ? "candidate leader" : "candidate"}
                      key={candidate.id}
                    >
                      <div>
                        <strong>
                          {candidate.firstName} {candidate.lastName}
                        </strong>
                        <span>{candidate.party ?? "Indépendant"}</span>
                      </div>
                      <div>
                        <strong>{number.format(candidate.votes)}</strong>
                        <span>{percent.format(candidate.votePct)} %</span>
                      </div>
                    </div>
                  ))}
                </div>

                <dl className="ridingFacts">
                  <div>
                    <dt>Votes valides</dt>
                    <dd>{number.format(riding.validVotes)}</dd>
                  </div>
                  <div>
                    <dt>Votes rejetés</dt>
                    <dd>{number.format(riding.rejectedVotes)}</dd>
                  </div>
                  <div>
                    <dt>Électeurs inscrits</dt>
                    <dd>{number.format(riding.registeredElectors)}</dd>
                  </div>
                  <div>
                    <dt>Chef actuel</dt>
                    <dd>{riding.leaderParty ?? "—"}</dd>
                  </div>
                </dl>

                <section className="projectionPanel" aria-label="Projection statistique">
                  <p className="statusKicker">Modèle · distinct du résultat officiel</p>
                  {riding.projection ? (
                    <>
                      <strong>
                        {riding.projection.projectedWinner ?? "Aucun favori"}
                      </strong>
                      <span>
                        P(gagner):{" "}
                        {riding.projection.winProbability === null
                          ? "—"
                          : `${percent.format(
                              riding.projection.winProbability * 100,
                            )} %`}
                      </span>
                      <span>
                        Marge finale projetée:{" "}
                        {riding.projection.projectedMarginPct === null
                          ? "—"
                          : `${percent.format(
                              riding.projection.projectedMarginPct,
                            )} pt`}
                      </span>
                    </>
                  ) : (
                    <span>
                      Projection non publiée — aucun artifact calibré n&apos;est
                      encore chargé en production.
                    </span>
                  )}
                </section>
              </>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
