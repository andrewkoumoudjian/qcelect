"use client";

import type { PublicLiveState } from "@qcelect/schema";
import { Tabs } from "@base-ui/react/tabs";
import { ElectionMap } from "./ElectionMap";

type Riding = PublicLiveState["ridings"][number];

function closeRaceMargin(riding: Riding): number | null {
  const first = riding.candidates[0];
  const second = riding.candidates[1];
  if (!first || !second || riding.pollsReported === 0) return null;
  return Math.abs(first.votePct - second.votePct);
}

export function ResultsViewTabs({
  ridings,
  replay = false,
  onRidingSelect,
}: {
  ridings: PublicLiveState["ridings"];
  replay?: boolean;
  onRidingSelect: (id: number) => void;
}) {
  const paint = ridings.map((riding) => ({
    id: riding.id,
    party: riding.leaderParty,
    final: riding.final,
    reportingPct: riding.reportingPct,
  }));

  const closeRaces = ridings
    .map((riding) => ({ riding, margin: closeRaceMargin(riding) }))
    .filter(
      (
        item,
      ): item is {
        riding: Riding;
        margin: number;
      } => item.margin !== null,
    )
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 12);

  return (
    <Tabs.Root defaultValue="geography" className="resultsTabs">
      <Tabs.List className="tabList" aria-label="Vue des résultats">
        <Tabs.Tab className="tab" value="geography">
          Géographie
        </Tabs.Tab>
        <Tabs.Tab className="tab" value="seats">
          127 sièges
        </Tabs.Tab>
        <Tabs.Tab className="tab" value="close">
          Courses serrées
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel className="tabPanel" value="geography">
        <div className="geographyLayout">
          <div className="provinceOverview">
            <div>
              <h3>Géographie · {replay ? "rejeu historique" : "résultats officiels"}</h3>
              <ElectionMap
                svgUrl="/maps/quebec.svg"
                ridings={paint}
                ariaLabel="Carte des résultats par circonscription"
                onRidingSelect={onRidingSelect}
              />
            </div>
            <div className="seatOverview">
              <div className="cartogramHeader">
                <strong>127 sièges</strong>
                <span className="majorityMarker">Majorité : 64</span>
              </div>
              <ElectionMap
                svgUrl="/maps/cartogram.svg"
                ridings={paint}
                ariaLabel="Cartogramme des 127 sièges"
                onRidingSelect={onRidingSelect}
              />
              <p className="mapLegend">Une case par circonscription · gris : aucun résultat</p>
            </div>
          </div>
          <div className="insetGrid">
            <div>
              <h3>Montréal / Laval · zoom</h3>
              <ElectionMap
                svgUrl="/maps/montreal.svg"
                ridings={paint}
                ariaLabel="Carte agrandie de Montréal et Laval"
                onRidingSelect={onRidingSelect}
              />
            </div>
            <div>
              <h3>Québec</h3>
              <ElectionMap
                svgUrl="/maps/quebec-city.svg"
                ridings={paint}
                ariaLabel="Inset de la région de Québec"
                onRidingSelect={onRidingSelect}
              />
            </div>
          </div>
        </div>
      </Tabs.Panel>

      <Tabs.Panel className="tabPanel" value="seats">
        <div className="cartogramHeader">
          <div>
            <strong>127 sièges</strong>
            <span>Chaque case représente exactement une circonscription.</span>
          </div>
          <span className="majorityMarker">Majorité: 64</span>
        </div>
        <ElectionMap
          svgUrl="/maps/cartogram.svg"
          ridings={paint}
          ariaLabel="Cartogramme des 127 sièges"
          onRidingSelect={onRidingSelect}
        />
      </Tabs.Panel>

      <Tabs.Panel className="tabPanel" value="close">
        {closeRaces.length ? (
          <div className="closeRaceList">
            {closeRaces.map(({ riding, margin }) => (
              <button
                type="button"
                className="closeRaceRow"
                key={riding.id}
                onClick={() => onRidingSelect(riding.id)}
              >
                <span>
                  <strong>{riding.name}</strong>
                  <small>
                    {riding.candidates[0]?.party ?? "—"} ·{" "}
                    {riding.pollsReported}/{riding.pollsTotal} bureaux
                  </small>
                </span>
                <span>{margin.toFixed(1)} pt</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="placeholder">
            Les courses serrées apparaîtront dès les premiers résultats officiels.
          </p>
        )}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
