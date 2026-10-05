"""Élections Québec historical archive utilities.

Ported and consolidated from Andrew Koumoudjian's prior election extraction
work in obsidian-vault. This module is intentionally research-only.

The archive changed formats repeatedly. Do not make one parser pretend every
year is identical; detect encoding/delimiter/format and validate the result.
"""

from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Iterable

import pandas as pd

GENERAL_ELECTION_ARCHIVES: dict[str, dict[str, str]] = {
    "2022-10-03": {"slug": "gen2022-10-03", "format": "modern-csv"},
    "2018-10-01": {"slug": "gen2018-10-01", "format": "modern-csv"},
    "2014-04-07": {"slug": "gen2014-04-07", "format": "modern-csv"},
    "2012-09-04": {"slug": "gen2012-09-04", "format": "legacy-mixed"},
    "2008-12-08": {"slug": "gen2008-12-08", "format": "xls"},
    "2007-03-26": {"slug": "gen2007-03-26", "format": "xls"},
    "2003-04-14": {"slug": "gen2003-04-14", "format": "legacy-mixed"},
    "1998-11-30": {"slug": "gen1998-11-30", "format": "xls"},
}

SPECIAL_ROW_MARKERS = (
    "TOTAL DU SECTEUR",
    "GRAND TOTAL",
    "VOTE DES DÉTENUS",
    "VOTE DES DETENUS",
    "VOTE HORS QUÉBEC",
    "VOTE HORS QUEBEC",
    "ÉLECTEURS HORS",
    "ELECTEURS HORS",
)


def archive_url(election_date: str) -> str:
    spec = GENERAL_ELECTION_ARCHIVES[election_date]
    return (
        "https://donnees.electionsquebec.qc.ca/production/provincial/"
        f"resultats/archives/{spec['slug']}/resultats-bureau-vote.zip"
    )


def _decode_bytes(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", raw, 0, 1, "no supported encoding")


def _rows_from_text(text: str) -> list[list[str]]:
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return list(csv.reader(io.StringIO(text), dialect))


def _is_special_row(first_cell: str) -> bool:
    value = first_cell.strip().upper()
    return any(marker in value for marker in SPECIAL_ROW_MARKERS)


def _strip_trailing_garbage(row: list[str]) -> list[str]:
    trimmed = list(row)
    while trimmed and trimmed[-1].strip().lower() in {"", "nan"}:
        trimmed.pop()
    return trimmed


def _parse_election_year(rows: list[list[str]]) -> int | None:
    if not rows or not rows[0]:
        return None
    head = rows[0][0]
    if ":" not in head:
        return None
    tail = head.split(":", 1)[1].strip()
    try:
        return int(tail[:4])
    except ValueError:
        return None


def _parse_modern(rows: list[list[str]]) -> pd.DataFrame:
    """Parse the 2014+ per-riding files with the Header: prefix.

    The historical files can include a metadata/party row between the header
    and first numeric record, so rows are selected by width and content rather
    than by one hard-coded starting index.
    """

    if len(rows) < 2:
        raise ValueError("DGEQ file has fewer than two rows")

    header_row = rows[1]
    if not header_row or header_row[0].strip().rstrip(":").lower() != "header":
        raise ValueError("modern DGEQ file is missing Header: prefix")

    headers = [column.strip() for column in header_row[1:]]
    width = len(headers)
    records: list[list[str]] = []

    for raw_row in rows[2:]:
        row = _strip_trailing_garbage(raw_row)
        if not row:
            continue
        if row[0].strip().rstrip(":").lower() in {"parties", "party"}:
            continue
        if _is_special_row(row[0]):
            continue
        if len(row) < width:
            continue
        records.append(row[:width])

    frame = pd.DataFrame(records, columns=headers)
    year = _parse_election_year(rows)
    if year is not None:
        frame["election_year"] = year
    return frame


def _legacy_candidate_names(header_row: list[str]) -> list[str]:
    """Recover candidate labels from legacy per-riding CSV headers.

    Legacy files vary by year. Candidate labels occur after structural empty
    slots and before B.V./B.R. fields. We retain non-empty labels and remove
    known structural/result labels.
    """

    structural = {
        "CIRCONSCRIPTION",
        "MUNICIPALITÉS",
        "MUNICIPALITES",
        "SECTEUR",
        "S.V.",
        "É.I.",
        "E.I.",
        "B.V.",
        "B.R.",
        "NAN",
    }
    return [
        value.strip()
        for value in header_row[1:]
        if value.strip() and value.strip().upper() not in structural
    ]


def _parse_legacy(rows: list[list[str]]) -> pd.DataFrame:
    if len(rows) < 3:
        raise ValueError("legacy DGEQ file has too few rows")

    candidates = _legacy_candidate_names(rows[1])
    if not candidates:
        raise ValueError("could not identify legacy candidate columns")

    records: list[list[str]] = []
    expected = 4 + len(candidates) + 2

    # Old exports commonly have header, party and blank metadata rows. Instead
    # of depending on the exact count, accept only records with enough fields.
    for raw_row in rows[2:]:
        row = _strip_trailing_garbage(raw_row)
        if not row or _is_special_row(row[0]) or len(row) < expected:
            continue

        municipality, code, sv, electors = row[:4]
        candidate_votes = row[4 : 4 + len(candidates)]
        # B.V./B.R. are the final two real fields after trailing garbage removal.
        bv, br = row[-2:]
        records.append(
            [municipality, code, sv, electors, *candidate_votes, bv, br]
        )

    columns = [
        "Municipalité",
        "Code",
        "S.V.",
        "É.I.",
        *candidates,
        "B.V.",
        "B.R.",
    ]
    frame = pd.DataFrame(records, columns=columns)
    year = _parse_election_year(rows)
    if year is not None:
        frame["election_year"] = year
    return frame


def parse_dgeq_csv(path: str | Path) -> pd.DataFrame:
    """Parse a per-riding historical DGEQ CSV into a DataFrame."""

    raw = Path(path).read_bytes()
    rows = _rows_from_text(_decode_bytes(raw))
    if len(rows) < 2:
        raise ValueError(f"{path}: not enough rows")

    first = rows[1][0].strip().rstrip(":").lower() if rows[1] else ""
    if first == "header":
        return _parse_modern(rows)
    return _parse_legacy(rows)


def normalize_numeric(
    frame: pd.DataFrame,
    candidate_columns: Iterable[str],
) -> pd.DataFrame:
    """Normalize core numeric columns and reject impossible turnout rows."""

    result = frame.copy()
    numeric = ["É.I.", "B.V.", "B.R.", *candidate_columns]
    for column in numeric:
        if column in result:
            result[column] = pd.to_numeric(result[column], errors="coerce")

    result = result[
        result["É.I."].notna()
        & result["B.V."].notna()
        & (result["É.I."] > 0)
        & (result["B.V."] > 0)
    ].copy()
    result["turnout"] = result["B.V."] / result["É.I."]

    if candidate_columns:
        present = [c for c in candidate_columns if c in result.columns]
        result["candidate_vote_sum"] = result[present].sum(axis=1)
        discrepancy = (result["candidate_vote_sum"] - result["B.V."]).abs()
        if not discrepancy.empty and discrepancy.max() != 0:
            raise ValueError(
                f"candidate votes do not reconcile to B.V.; max diff={discrepancy.max()}"
            )

    return result
