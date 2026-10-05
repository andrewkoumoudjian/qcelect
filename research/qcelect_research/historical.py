"""Province-wide Élections Québec historical result normalization.

This module is offline-only. It downloads the official polling-station archives,
parses each 2014+ riding file, validates vote reconciliation, and emits one
canonical long table suitable for boundary transposition and historical replay.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from .elections_quebec import (
    GENERAL_ELECTION_ARCHIVES,
    _decode_bytes,
    _rows_from_text,
    _strip_trailing_garbage,
    archive_url,
)

MODERN_ELECTIONS = ("2014-04-07", "2018-10-01", "2022-10-03")

AGGREGATE_MARKERS = (
    "TOTAL DU SECTEUR",
    "GRAND TOTAL",
)

SPECIAL_VOTE_MARKERS = (
    "VOTE DES DÉTENUS",
    "VOTE DES DETENUS",
    "VOTE HORS QUÉBEC",
    "VOTE HORS QUEBEC",
    "ÉLECTEURS HORS",
    "ELECTEURS HORS",
)

PARTY_ALIASES = {
    "P.Q.": "PQ",
    "Q.S.": "QS",
    "P.L.Q./Q.L.P.": "PLQ",
    "C.A.Q.-É.F.L.": "CAQ",
    "C.A.Q.-E.F.L.": "CAQ",
    "P.C.Q./C.P.Q.": "PCOQ",
    "P.V.Q./G.P.Q.": "PVQ",
    "P.M.L.Q.": "PMLQ",
}

CANONICAL_COLUMNS = [
    "election",
    "riding_code",
    "riding",
    "polling_section",
    "municipality",
    "candidate",
    "party",
    "party_raw",
    "votes",
    "valid_votes",
    "rejected_votes",
    "registered_electors",
    "turnout",
    "is_merged_poll",
    "is_special_vote",
    "source_file",
]


@dataclass(frozen=True)
class HistoricalDataset:
    rows: pd.DataFrame
    diagnostics: dict[str, object]


def _contains_marker(row: Iterable[object], markers: Iterable[str]) -> bool:
    haystack = " | ".join(str(value) for value in row).upper()
    return any(marker in haystack for marker in markers)


def _clean_identifier(value: object) -> str:
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return ""
    if re.fullmatch(r"-?\d+\.0+", text):
        return text.split(".", 1)[0]
    return text


def _number(value: object) -> float:
    parsed = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return float(parsed) if pd.notna(parsed) else float("nan")


def _split_candidate_header(label: str) -> tuple[str, str, str]:
    clean = label.strip()
    if " " not in clean:
        return clean, "", ""
    candidate, party_raw = clean.rsplit(" ", 1)
    party_raw = party_raw.strip()
    return candidate.strip(), PARTY_ALIASES.get(party_raw, party_raw), party_raw


def _header_and_records(raw: bytes) -> tuple[list[str], list[list[str]]]:
    rows = _rows_from_text(_decode_bytes(raw))
    if len(rows) < 2:
        raise ValueError("DGEQ file has fewer than two rows")

    header_index = next(
        (
            index
            for index, row in enumerate(rows[:5])
            if row and row[0].strip().rstrip(":").lower() == "header"
        ),
        None,
    )
    if header_index is None:
        raise ValueError("modern DGEQ file is missing Header: prefix")

    headers = [
        value.strip()
        for value in _strip_trailing_garbage(rows[header_index][1:])
    ]
    if not headers:
        raise ValueError("modern DGEQ file has an empty header")

    records: list[list[str]] = []
    for raw_row in rows[header_index + 1 :]:
        row = _strip_trailing_garbage(raw_row)
        if not row:
            continue
        if row[0].strip().rstrip(":").lower() in {"parties", "party"}:
            continue
        if _contains_marker(row, AGGREGATE_MARKERS):
            continue

        is_special = _contains_marker(row, SPECIAL_VOTE_MARKERS)
        if len(row) < len(headers):
            if not is_special:
                raise ValueError(
                    f"record has {len(row)} fields but header has {len(headers)}"
                )
            row = [*row, *([""] * (len(headers) - len(row)))]
        if len(row) > len(headers):
            raise ValueError(
                f"record has {len(row)} fields but header has {len(headers)}"
            )
        records.append(row)

    return headers, records


def parse_modern_riding_csv(
    raw: bytes,
    *,
    election_date: str,
    source_file: str,
) -> pd.DataFrame:
    """Parse one 2014/2018/2022 per-riding file into canonical long rows."""

    if election_date not in MODERN_ELECTIONS:
        raise ValueError(f"{election_date} is not a supported modern election")

    headers, records = _header_and_records(raw)
    required = {
        "Code",
        "Circonscription",
        "Nom des Municipalités",
        "S.V.",
        "É.I.",
        "B.V.",
        "B.R.",
    }
    missing = required.difference(headers)
    if missing:
        raise ValueError(f"modern DGEQ header missing columns: {sorted(missing)}")

    electors_index = headers.index("É.I.")
    valid_index = headers.index("B.V.")
    if valid_index <= electors_index + 1:
        raise ValueError("no candidate columns between É.I. and B.V.")

    candidate_columns = headers[electors_index + 1 : valid_index]
    parsed_candidates = [_split_candidate_header(label) for label in candidate_columns]
    if any(not party_raw for _, _, party_raw in parsed_candidates):
        raise ValueError("candidate header missing party suffix")

    output: list[dict[str, object]] = []

    for record in records:
        row = dict(zip(headers, record, strict=True))
        is_special = _contains_marker(record, SPECIAL_VOTE_MARKERS)
        polling_section = _clean_identifier(row["S.V."])
        registered = _number(row["É.I."])
        valid = _number(row["B.V."])
        rejected = _number(row["B.R."])

        candidate_votes = [_number(row[column]) for column in candidate_columns]
        candidate_votes = [0.0 if np.isnan(value) else value for value in candidate_votes]

        if not is_special:
            if np.isnan(valid):
                raise ValueError(f"{source_file}: regular polling row has no B.V.")
            difference = abs(sum(candidate_votes) - valid)
            if difference > 1e-9:
                raise ValueError(
                    f"{source_file}: candidate votes do not reconcile to B.V.; "
                    f"poll={polling_section!r}, diff={difference}"
                )

        turnout = (
            valid / registered
            if not np.isnan(valid) and not np.isnan(registered) and registered > 0
            else float("nan")
        )
        try:
            poll_number = int(polling_section)
        except ValueError:
            poll_number = -1

        for column, (candidate, party, party_raw), votes in zip(
            candidate_columns,
            parsed_candidates,
            candidate_votes,
            strict=True,
        ):
            output.append(
                {
                    "election": election_date,
                    "riding_code": _clean_identifier(row["Code"]),
                    "riding": str(row["Circonscription"]).strip(),
                    "polling_section": polling_section,
                    "municipality": str(row["Nom des Municipalités"]).strip(),
                    "candidate": candidate,
                    "party": party,
                    "party_raw": party_raw,
                    "votes": int(votes),
                    "valid_votes": int(valid) if not np.isnan(valid) else pd.NA,
                    "rejected_votes": int(rejected)
                    if not np.isnan(rejected)
                    else pd.NA,
                    "registered_electors": int(registered)
                    if not np.isnan(registered)
                    else pd.NA,
                    "turnout": turnout,
                    "is_merged_poll": poll_number >= 500,
                    "is_special_vote": is_special,
                    "source_file": source_file,
                }
            )

    frame = pd.DataFrame(output, columns=CANONICAL_COLUMNS)
    if frame.empty:
        raise ValueError(f"{source_file}: no polling-station records parsed")
    return frame


def _validate_poll_uniqueness(frame: pd.DataFrame) -> None:
    regular = frame[~frame["is_special_vote"]].copy()
    poll_rows = regular[
        ["election", "riding_code", "polling_section", "source_file"]
    ].drop_duplicates()

    duplicates = poll_rows.duplicated(
        ["election", "riding_code", "polling_section"], keep=False
    )
    if duplicates.any():
        sample = poll_rows.loc[
            duplicates, ["election", "riding_code", "polling_section"]
        ].head()
        raise ValueError(
            "duplicated polling-section IDs within election/riding: "
            f"{sample.to_dict(orient='records')}"
        )


def validate_historical_long(frame: pd.DataFrame) -> dict[str, object]:
    """Validate canonical historical rows and return reproducible diagnostics."""

    missing = set(CANONICAL_COLUMNS).difference(frame.columns)
    if missing:
        raise ValueError(f"historical frame missing columns: {sorted(missing)}")
    if frame.empty:
        raise ValueError("historical frame is empty")

    _validate_poll_uniqueness(frame)

    poll_keys = [
        "election",
        "riding_code",
        "polling_section",
        "source_file",
        "is_special_vote",
    ]
    totals = (
        frame.groupby(poll_keys, dropna=False, sort=False)
        .agg(candidate_votes=("votes", "sum"), valid_votes=("valid_votes", "first"))
        .reset_index()
    )
    regular = totals[~totals["is_special_vote"] & totals["valid_votes"].notna()]
    mismatch = (regular["candidate_votes"] - regular["valid_votes"]).abs()
    if not mismatch.empty and float(mismatch.max()) > 1e-9:
        raise ValueError(
            "historical candidate votes do not reconcile to valid votes; "
            f"max diff={float(mismatch.max())}"
        )

    regular_rows = frame[~frame["is_special_vote"]]
    riding_count = int(
        regular_rows[["election", "riding_code"]].drop_duplicates().shape[0]
    )
    poll_count = int(
        regular_rows[
            ["election", "riding_code", "polling_section"]
        ].drop_duplicates().shape[0]
    )

    party_votes = (
        frame.groupby(["election", "party"], dropna=False)["votes"]
        .sum()
        .astype(int)
        .reset_index()
    )

    return {
        "elections": sorted(str(value) for value in frame["election"].unique()),
        "riding_election_count": riding_count,
        "regular_poll_count": poll_count,
        "special_poll_count": int(
            frame.loc[
                frame["is_special_vote"],
                ["election", "riding_code", "polling_section", "source_file"],
            ]
            .drop_duplicates()
            .shape[0]
        ),
        "merged_poll_count": int(
            regular_rows.loc[
                regular_rows["is_merged_poll"],
                ["election", "riding_code", "polling_section"],
            ]
            .drop_duplicates()
            .shape[0]
        ),
        "party_votes": party_votes.to_dict(orient="records"),
    }


def parse_election_archive(
    raw_zip: bytes,
    *,
    election_date: str,
) -> HistoricalDataset:
    """Parse all modern riding CSVs from one official DGEQ ZIP archive."""

    if election_date not in MODERN_ELECTIONS:
        raise ValueError(f"{election_date} is not a supported modern election")

    frames: list[pd.DataFrame] = []
    with zipfile.ZipFile(io.BytesIO(raw_zip)) as archive:
        members = sorted(
            name
            for name in archive.namelist()
            if name.lower().endswith(".csv") and not name.endswith("/")
        )
        if not members:
            raise ValueError("DGEQ archive contains no CSV files")

        for member in members:
            frames.append(
                parse_modern_riding_csv(
                    archive.read(member),
                    election_date=election_date,
                    source_file=member,
                )
            )

    rows = pd.concat(frames, ignore_index=True)
    diagnostics = validate_historical_long(rows)
    diagnostics.update(
        {
            "archive_url": archive_url(election_date),
            "archive_sha256": hashlib.sha256(raw_zip).hexdigest(),
            "source_file_count": len(frames),
        }
    )
    return HistoricalDataset(rows=rows, diagnostics=diagnostics)


def download_archive(
    election_date: str,
    cache_dir: str | Path,
    *,
    refresh: bool = False,
) -> Path:
    """Download one official archive once, retaining a local research cache."""

    if election_date not in GENERAL_ELECTION_ARCHIVES:
        raise KeyError(f"unknown election date {election_date}")

    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / f"{election_date}-resultats-bureau-vote.zip"
    if target.exists() and not refresh:
        return target

    request = urllib.request.Request(
        archive_url(election_date),
        headers={
            "Accept": "application/zip, application/octet-stream",
            "User-Agent": "qcelect-research/1.0 (+https://github.com/andrewkoumoudjian/qcelect)",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()

    # Validate before replacing the cache entry.
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        if not archive.namelist():
            raise ValueError(f"{election_date}: downloaded archive is empty")

    temporary = target.with_suffix(".tmp")
    temporary.write_bytes(body)
    temporary.replace(target)
    return target


def build_historical_dataset(
    *,
    elections: Iterable[str] = MODERN_ELECTIONS,
    cache_dir: str | Path,
    refresh: bool = False,
) -> HistoricalDataset:
    """Download, normalize and validate all requested modern elections."""

    datasets: list[HistoricalDataset] = []
    for election_date in elections:
        path = download_archive(election_date, cache_dir, refresh=refresh)
        datasets.append(
            parse_election_archive(path.read_bytes(), election_date=election_date)
        )

    rows = pd.concat([dataset.rows for dataset in datasets], ignore_index=True)
    diagnostics = validate_historical_long(rows)
    diagnostics["archives"] = [
        dataset.diagnostics for dataset in datasets
    ]
    return HistoricalDataset(rows=rows, diagnostics=diagnostics)


def write_historical_dataset(
    dataset: HistoricalDataset,
    *,
    output_csv: str | Path,
    diagnostics_json: str | Path,
) -> None:
    output = Path(output_csv)
    diagnostics = Path(diagnostics_json)
    output.parent.mkdir(parents=True, exist_ok=True)
    diagnostics.parent.mkdir(parents=True, exist_ok=True)

    dataset.rows.to_csv(output, index=False, compression="gzip")
    diagnostics.write_text(
        json.dumps(dataset.diagnostics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
