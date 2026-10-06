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
  const [zoom, setZoom] = useState(1);
  const controlsRef = useRef<{ zoomBy: (factor: number) => void; reset: () => void } | null>(null);
  const draggedRef = useRef(false);

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

    load().catch(() => {
      if (!controller.signal.aborted) setLoaded(false);
    });
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
    const svg = hostRef.current?.querySelector("svg");
    if (!loaded || !svg) return;
    const base = { x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y,
      width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height };
    let view = { ...base };
    let drag: { x: number; y: number; clientX: number; clientY: number } | null = null;

    function paint() {
      view.x = Math.max(base.x, Math.min(base.x + base.width - view.width, view.x));
      view.y = Math.max(base.y, Math.min(base.y + base.height - view.height, view.y));
      svg?.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
      setZoom(base.width / view.width);
    }

    function point(clientX: number, clientY: number) {
      const matrix = svg?.getScreenCTM();
      return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
    }

    function zoomBy(factor: number, anchor = { x: view.x + view.width / 2, y: view.y + view.height / 2 }) {
      const scale = Math.max(1, Math.min(8, base.width / view.width * factor));
      const width = base.width / scale;
      const height = base.height / scale;
      view = { x: anchor.x - (anchor.x - view.x) * width / view.width,
        y: anchor.y - (anchor.y - view.y) * height / view.height, width, height };
      paint();
    }

    function reset() { view = { ...base }; paint(); }

    function wheel(event: WheelEvent) {
      // Ctrl-wheel includes trackpad pinch, and keeps ordinary page scrolling available.
      if (!event.ctrlKey && !event.metaKey) return;
      const anchor = point(event.clientX, event.clientY);
      if (!anchor) return;
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * .01), anchor);
    }

    function down(event: PointerEvent) {
      draggedRef.current = false;
      if (event.button !== 0 || base.width / view.width <= 1) return;
      const start = point(event.clientX, event.clientY);
      if (!start) return;
      drag = { x: start.x, y: start.y, clientX: event.clientX, clientY: event.clientY };
    }

    function move(event: PointerEvent) {
      if (!drag) return;
      const current = point(event.clientX, event.clientY);
      if (!current) return;
      if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4 && !draggedRef.current) return;
      draggedRef.current = true;
      view.x += drag.x - current.x;
      view.y += drag.y - current.y;
      paint();
    }

    function up() { drag = null; }
    controlsRef.current = { zoomBy, reset };
    svg.addEventListener("wheel", wheel, { passive: false });
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    svg.addEventListener("pointerleave", up);
    return () => {
      controlsRef.current = null;
      svg.removeEventListener("wheel", wheel);
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      svg.removeEventListener("pointerleave", up);
    };
  }, [loaded, svgUrl]);

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
      if (draggedRef.current) {
        draggedRef.current = false;
        return;
      }
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
      <div className="mapControls" role="group" aria-label={`Zoom · ${ariaLabel}`}>
        <button type="button" aria-label="Agrandir la carte" disabled={!loaded || zoom >= 8}
          onClick={() => controlsRef.current?.zoomBy(1.5)}>+</button>
        <button type="button" aria-label="Réduire la carte" disabled={!loaded || zoom <= 1}
          onClick={() => controlsRef.current?.zoomBy(1 / 1.5)}>−</button>
        <button type="button" aria-label="Réinitialiser la carte" disabled={!loaded || zoom <= 1}
          onClick={() => controlsRef.current?.reset()}>↺</button>
      </div>
      <div ref={hostRef} className="electionMap" data-zoomed={zoom > 1} />
      {!loaded && <div className="mapFallback">Carte en préparation</div>}
    </div>
  );
}
