#!/usr/bin/env python3
"""Build the canonical 2014/2018/2022 province-wide historical dataset."""

from __future__ import annotations

import argparse
from pathlib import Path

from qcelect_research.historical import (
    MODERN_ELECTIONS,
    build_historical_dataset,
    write_historical_dataset,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--election",
        action="append",
        choices=MODERN_ELECTIONS,
        dest="elections",
        help="Election date to include; repeat to select several.",
    )
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    base = repo_root / "data" / "generated" / "historical"
    elections = tuple(args.elections) if args.elections else MODERN_ELECTIONS

    dataset = build_historical_dataset(
        elections=elections,
        cache_dir=base / "raw",
        refresh=args.refresh,
    )
    write_historical_dataset(
        dataset,
        output_csv=base / "results_long.csv.gz",
        diagnostics_json=base / "diagnostics.json",
    )

    print(
        f"wrote {len(dataset.rows):,} candidate-poll rows across "
        f"{len(elections)} elections"
    )


if __name__ == "__main__":
    main()
