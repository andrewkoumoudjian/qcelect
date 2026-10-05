#!/usr/bin/env python3
"""One-shot full official-data validation for the research data graph."""

from __future__ import annotations

import json
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
)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    base = repo_root / "data" / "generated"
    historical_dir = base / "historical"
    geometry_dir = base / "geometry"
    transposition_dir = base / "transposition"

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

    target_path = download_target_2026(geometry_dir)
    target = load_target_2026(target_path)
    transposition_dir.mkdir(parents=True, exist_ok=True)

    transposition_summaries: dict[str, object] = {}
    for election in MODERN_ELECTIONS:
        source_path = download_geometry(election, geometry_dir)
        source = load_geometry_zip(source_path)
        election_rows = dataset.rows[dataset.rows["election"] == election].copy()
        result = transpose_results(election_rows, source, target)

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
