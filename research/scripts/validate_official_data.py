#!/usr/bin/env python3
"""One-shot full official-data validation for the research data graph."""

from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from qcelect_research.historical import (
    MODERN_ELECTIONS,
    build_historical_dataset,
    write_historical_dataset,
)
from qcelect_research.transposition import (
    download_geometry,
    download_target_2026,
    load_geometry_zip,
    load_target_2026,
    transpose_results,
    normalize_target_ridings,
    section_geometry_url,
)


def main() -> None:
    started_at = datetime.now(timezone.utc).isoformat()
    repo_root = Path(__file__).resolve().parents[2]
    base = repo_root / "data" / "generated"
    historical_dir = base / "historical"
    geometry_dir = base / "geometry"
    transposition_dir = base / "transposition"

    print("Validating official historical archives: 2014, 2018, 2022", flush=True)
    dataset = build_historical_dataset(
        elections=MODERN_ELECTIONS,
        cache_dir=historical_dir / "raw",
        refresh=False,
    )
    write_historical_dataset(
        dataset,
        output_csv=historical_dir / "results_long.csv.gz",
        diagnostics_json=historical_dir / "diagnostics.json",
    )

    print("Historical ingestion passed; loading 127 target ridings", flush=True)
    target_path = download_target_2026(geometry_dir)
    target = load_target_2026(target_path)
    canonical = json.loads((repo_root / "data" / "ridings-2026.json").read_text())
    expected_ids = {str(riding["id"]) for riding in canonical["ridings"]}
    if (
        set(normalize_target_ridings(target)["target_riding"]) != expected_ids
        or len(expected_ids) != 127
    ):
        raise ValueError("target geometry does not match the canonical 127 riding IDs")
    transposition_dir.mkdir(parents=True, exist_ok=True)

    transposition_summaries: dict[str, object] = {}
    for election in MODERN_ELECTIONS:
        print(f"Validating {election} -> 2026 geometry and transposition", flush=True)
        source_path = download_geometry(election, geometry_dir)
        source = load_geometry_zip(source_path)
        election_rows = dataset.rows[dataset.rows["election"] == election].copy()
        result = transpose_results(election_rows, source, target)
        result.diagnostics.update(
            {
                "source_geometry_url": section_geometry_url(election),
                "source_geometry_sha256": hashlib.sha256(
                    source_path.read_bytes()
                ).hexdigest(),
                "target_geometry_sha256": hashlib.sha256(
                    target_path.read_bytes()
                ).hexdigest(),
            }
        )

        slug = election[:4]
        result.votes.to_csv(
            transposition_dir / f"{slug}-on-2026.csv.gz",
            index=False,
            compression="gzip",
        )
        result.crosswalk.to_csv(
            transposition_dir / f"{slug}-crosswalk.csv.gz",
            index=False,
            compression="gzip",
        )
        (transposition_dir / f"{slug}-diagnostics.json").write_text(
            json.dumps(result.diagnostics, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        transposition_summaries[election] = result.diagnostics

    summary = {
        "started_at": started_at,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "historical": dataset.diagnostics,
        "transposition": transposition_summaries,
    }
    (base / "official-data-validation.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
