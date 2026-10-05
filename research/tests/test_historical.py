from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pandas as pd
import pytest

from qcelect_research.historical import (
    parse_election_archive,
    parse_modern_riding_csv,
    validate_historical_long,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize(
    ("election", "filename", "expected_party"),
    [
        ("2014-04-07", "modern_2014.csv", "CAQ"),
        ("2018-10-01", "modern_2018.csv", "PCOQ"),
        ("2022-10-03", "modern_2022.csv", "QS"),
    ],
)
def test_modern_elections_normalize_to_long_format(
    election: str,
    filename: str,
    expected_party: str,
):
    frame = parse_modern_riding_csv(
        (FIXTURES / filename).read_bytes(),
        election_date=election,
        source_file=filename,
    )

    assert set(
        [
            "election",
            "riding",
            "polling_section",
            "candidate",
            "party",
            "votes",
            "valid_votes",
            "registered_electors",
            "turnout",
        ]
    ).issubset(frame.columns)
    assert expected_party in set(frame["party"])



def test_2014_majority_summary_row_is_not_treated_as_a_poll():
    raw = (
        "Code;Circonscription;Date scrutin;Étendue;Nom des Municipalités;"
        "Secteur;Regroupement;S.V.;É.I.;Alpha Alice P.Q.;B.V.;B.R.;\n"
        "579;Abitibi-Est;2014-04-07;G;Senneterre, v;1;;1;100;10;10;1;\n"
        "579;Abitibi-Est;2014-04-07;G;Majorité en faveur de Alpha Alice : 5\n"
    ).encode()

    frame = parse_modern_riding_csv(
        raw,
        election_date="2014-04-07",
        source_file="Abitibi-Est_officiels2014.csv",
    )

    assert frame["votes"].sum() == 10
    assert set(frame["polling_section"]) == {"1"}


def test_2014_official_archive_direct_header_is_supported():
    raw = (FIXTURES / "modern_2014.csv").read_text(encoding="utf-8")
    _, header, *records = raw.splitlines()
    direct = "\n".join([header.removeprefix("Header:,"), *records]).encode()

    frame = parse_modern_riding_csv(
        direct,
        election_date="2014-04-07",
        source_file="Abitibi-Est_officiels2014.csv",
    )

    assert frame["riding_code"].iloc[0] == "101"
    assert frame["valid_votes"].iloc[0] == 60


def test_2014_multi_token_party_labels_are_not_left_in_candidate_names():
    raw = (
        "Code;Circonscription;Date scrutin;Étendue;Nom des Municipalités;"
        "Secteur;Regroupement;S.V.;É.I.;"
        "Perron-Tellier Maxym É.A.P. - P.C.Q.;"
        "Trudel Richard O.N. - P.I.Q.;B.V.;B.R.;\n"
        "579;Abitibi-Est;2014-04-07;G;Senneterre, v;1;;1;100;7;3;10;1;\n"
    ).encode()

    frame = parse_modern_riding_csv(
        raw,
        election_date="2014-04-07",
        source_file="Abitibi-Est_officiels2014.csv",
    )

    assert set(frame["candidate"]) == {"Perron-Tellier Maxym", "Trudel Richard"}
    assert set(frame["party"]) == {"PCOQ", "ON"}


def test_2014_trailing_commas_do_not_shift_columns_and_merged_poll_is_flagged():
    frame = parse_modern_riding_csv(
        (FIXTURES / "modern_2014.csv").read_bytes(),
        election_date="2014-04-07",
        source_file="modern_2014.csv",
    )

    poll_1 = frame[frame["polling_section"] == "1"]
    assert poll_1["registered_electors"].iloc[0] == 100
    assert poll_1["valid_votes"].iloc[0] == 60
    assert poll_1["votes"].sum() == 60

    merged = frame[frame["polling_section"] == "500"]
    assert merged["is_merged_poll"].all()


def test_zero_registered_electors_produce_unknown_turnout_not_infinity():
    frame = parse_modern_riding_csv(
        (FIXTURES / "modern_2018.csv").read_bytes(),
        election_date="2018-10-01",
        source_file="modern_2018.csv",
    )
    turnout = frame.loc[frame["polling_section"] == "2", "turnout"]
    assert turnout.isna().all()


def test_special_vote_category_is_preserved_and_labeled():
    frame = parse_modern_riding_csv(
        (FIXTURES / "modern_2022.csv").read_bytes(),
        election_date="2022-10-03",
        source_file="modern_2022.csv",
    )
    special = frame[frame["is_special_vote"]]
    assert not special.empty
    assert special["votes"].sum() == 10


def test_archive_parser_reads_every_csv_and_records_archive_hash():
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        archive.writestr(
            "DGE-80.10_riding-a_sans_SE.csv",
            (FIXTURES / "modern_2022.csv").read_bytes(),
        )
        second = (FIXTURES / "modern_2022.csv").read_text(encoding="utf-8")
        second = second.replace("303,Test-2022", "304,Other-2022")
        archive.writestr("DGE-80.10_riding-b_sans_SE.csv", second.encode())
        archive.writestr("metadata.csv", b"not,a,riding,file\n")

    dataset = parse_election_archive(memory.getvalue(), election_date="2022-10-03")

    assert dataset.diagnostics["source_file_count"] == 2
    assert dataset.diagnostics["ignored_csv_members"] == ["metadata.csv"]
    assert len(dataset.diagnostics["archive_sha256"]) == 64
    assert set(dataset.rows["riding_code"]) == {"303", "304"}


def test_duplicate_regular_polling_sections_fail_validation():
    frame = parse_modern_riding_csv(
        (FIXTURES / "modern_2018.csv").read_bytes(),
        election_date="2018-10-01",
        source_file="modern_2018.csv",
    )
    duplicate = pd.concat([frame, frame], ignore_index=True)
    with pytest.raises(ValueError, match="duplicated polling-section"):
        validate_historical_long(duplicate)
