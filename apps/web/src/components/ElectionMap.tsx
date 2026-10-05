"use client";

import { useEffect, useRef, useState } from "react";

export interface RidingPaint {
  id: number;
  party: string | null;
  final: boolean;
  reportingPct: number;
}

export interface ElectionMapProps {
  svgUrl: string;
  ridings: readonly RidingPaint[];
  ariaLabel: string;
  onRidingSelect?: (id: number) => void;
}

/**
 * NPR-style election map primitive:
 * load one same-origin generated SVG, then mutate only data attributes as
 * results change. No WebGL/map-engine lifecycle is required on the homepage.
 */
export function ElectionMap({
  svgUrl,
  ridings,
  ariaLabel,
  onRidingSelect,
}: ElectionMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      const response = await fetch(svgUrl, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (!response.ok) {
        setLoaded(false);
        return;
      }

      const markup = await response.text();
      if (!hostRef.current) return;

      // svgUrl is a build-generated same-origin asset, never user content.
      hostRef.current.innerHTML = markup;
      const svg = hostRef.current.querySelector("svg");
      if (svg) {
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", ariaLabel);
      }

      for (const node of hostRef.current.querySelectorAll<SVGElement>(
        "[data-riding]",
      )) {
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.dataset.ridingName = node.getAttribute("aria-label") ?? "";
      }

      setLoaded(true);
    }

    load().catch(() => setLoaded(false));
    return () => controller.abort();
  }, [ariaLabel, svgUrl]);

  useEffect(() => {
    if (!loaded || !hostRef.current) return;

    for (const riding of ridings) {
      const nodes = hostRef.current.querySelectorAll<SVGElement>(
        `[data-riding="${riding.id}"]`,
      );
      for (const node of nodes) {
        node.dataset.party = riding.party ?? "";
        node.dataset.final = String(riding.final);
        node.dataset.reporting = String(Math.round(riding.reportingPct));

        const name = node.dataset.ridingName || `Circonscription ${riding.id}`;
        const status = riding.party
          ? `${riding.party} en tête, ${Math.round(riding.reportingPct)} % dépouillé`
          : "aucun résultat";
        node.setAttribute("aria-label", `${name}, ${status}`);
      }
    }
  }, [loaded, ridings]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !onRidingSelect) return;

    function select(target: EventTarget | null) {
      if (!(target instanceof Element)) return;
      const node = target.closest<SVGElement>("[data-riding]");
      const id = Number(node?.dataset.riding);
      if (Number.isInteger(id)) onRidingSelect?.(id);
    }

    function onClick(event: MouseEvent) {
      select(event.target);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select(event.target);
    }

    host.addEventListener("click", onClick);
    host.addEventListener("keydown", onKeyDown);
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("keydown", onKeyDown);
    };
  }, [onRidingSelect]);

  return (
    <div className="mapFrame">
      <div ref={hostRef} className="electionMap" />
      {!loaded && <div className="mapFallback">Carte en préparation</div>}
    </div>
  );
}
