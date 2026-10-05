from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pandas as pd
import pytest
from openpyxl import Workbook
from qcelect_research.elections_quebec import _rows_from_text

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


def test_2014_regroupement_marks_merged_polling_sections():
    raw = (
        "Code;Circonscription;Date scrutin;Étendue;Nom des Municipalités;"
        "Secteur;Regroupement;S.V.;É.I.;Alpha Alice P.Q.;B.V.;B.R.;\n"
        "613;Chauveau;2014-04-07;G;Québec, v;95;Regr. BVO-18;17;0;0;0;0;\n"
        "613;Chauveau;2014-04-07;G;Les résultats des BVA 1 et 4 ont été regroupés."
    ).encode()

    frame = parse_modern_riding_csv(
        raw,
        election_date="2014-04-07",
        source_file="Chauveau_officiels2014.csv",
    )

    assert frame["polling_section_group"].iloc[0] == "Regr. BVO-18"
    assert bool(frame["is_merged_poll"].iloc[0]) is True


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


def test_2014_named_special_bureaus_are_preserved_without_double_counting_total():
    header = (
        "Code;Circonscription;Date scrutin;Étendue;Nom des Municipalités;"
        "Secteur;Regroupement;S.V.;É.I.;Alpha Alice P.Q.;B.V.;B.R.;\n"
    )
    records = (
        "579;Abitibi-Est;2014-04-07;G;Senneterre, v;1;;1;100;10;10;1;\n"
        "579;Abitibi-Est;2014-04-07;G;BVA1;;;;0;7;7;0;\n"
        "579;Abitibi-Est;2014-04-07;G;BVA2;;;;0;3;3;0;\n"
        "579;Abitibi-Est;2014-04-07;G;Vote hors circonscription;;;;0;2;2;0;\n"
        "579;Abitibi-Est;2014-04-07;G;Total de la circonscription;;;;100;22;22;1;\n"
    )
    frame = parse_modern_riding_csv(
        (header + records).encode(), election_date="2014-04-07", source_file="test.csv"
    )
    assert frame["votes"].sum() == 22
    assert set(frame.loc[frame["is_special_vote"], "polling_section"]) == {
        "special:BVA1",
        "special:BVA2",
        "special:Vote hors circonscription",
    }
    validate_historical_long(frame)
    with pytest.raises(ValueError, match="declared riding totals"):
        parse_modern_riding_csv(
            (header + records.replace("100;22;22;1", "100;23;23;1")).encode(),
            election_date="2014-04-07",
            source_file="test.csv",
        )
    with pytest.raises(ValueError, match="duplicated polling-section"):
        validate_historical_long(pd.concat([frame, frame[frame["is_special_vote"]]]))


def test_special_votes_must_reconcile_when_valid_total_is_present():
    raw = (
        (FIXTURES / "modern_2022.csv")
        .read_bytes()
        .replace(b",4,3,3,10,0", b",4,3,3,11,0")
    )
    with pytest.raises(ValueError, match="do not reconcile"):
        parse_modern_riding_csv(raw, election_date="2022-10-03", source_file="test.csv")


def test_official_spreadsheet_transport_uses_same_parser_and_completeness_gate():
    workbook = Workbook()
    sheet = workbook.active
    for row in _rows_from_text((FIXTURES / "modern_2018.csv").read_text()):
        sheet.append(row)
    xlsx = io.BytesIO()
    workbook.save(xlsx)
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("DGE-80.10_Verdun_Sans_SE.xlsx", xlsx.getvalue())
    dataset = parse_election_archive(
        archive_bytes.getvalue(), election_date="2018-10-01", expected_riding_count=1
    )
    assert dataset.rows["votes"].sum() == 70
    assert dataset.diagnostics["source_file_count"] == 1
    with pytest.raises(ValueError, match="expected exactly 125"):
        parse_election_archive(
            archive_bytes.getvalue(),
            election_date="2018-10-01",
            expected_riding_count=125,
        )


def test_same_named_candidates_with_different_parties_remain_distinct():
    raw = (
        "Code;Circonscription;Date scrutin;Étendue;Nom des Municipalités;"
        "Secteur;Regroupement;S.V.;É.I.;Simard Jean-François Ind;"
        "Simard Jean-François C.A.Q.-É.F.L.;B.V.;B.R.;\n"
        "742;Montmorency;2018-10-01;G;Québec, v;1;;1;100;3;7;10;0;\n"
        "742;Montmorency;2018-10-01;G;Total de la circonscription;;;;100;3;7;10;0;\n"
    ).encode()
    frame = parse_modern_riding_csv(
        raw, election_date="2018-10-01", source_file="test.csv"
    )
    assert frame.groupby("party")["votes"].sum().to_dict() == {"CAQ": 7, "Ind": 3}
    validate_historical_long(frame)


def test_2022_acadie_header_typo_and_middle_initial_are_explicitly_normalized():
    raw = (
        "S;Circonscription;Date scrutin;Étendue;Nom des Municipalités;"
        "Secteur;Regroupement;S.V.;É.I.;Morin André A. P.L.Q./Q.L.P.;"
        "Other Candidate P.C.Q-E.E.D.;Canadian Candidate P.C.Q./C.P.Q;B.V.;B.R.;\n"
        "338;Acadie;2022-10-03;G;Montréal, v;1;;1;100;7;2;1;10;0;\n"
    ).encode()
    frame = parse_modern_riding_csv(
        raw, election_date="2022-10-03", source_file="DGE-80.10_Acadie_sans_SE.csv"
    )
    assert frame["candidate"].iloc[0] == "Morin André A."
    assert frame.groupby("party")["votes"].sum().to_dict() == {
        "PLQ": 7,
        "PCOQ": 2,
        "PCANQ": 1,
    }
    with pytest.raises(ValueError, match="recognized direct header"):
        parse_modern_riding_csv(
            raw, election_date="2018-10-01", source_file="DGE-80.10_Acadie_sans_SE.csv"
        )


@pytest.mark.parametrize(
    "name",
    [
        "DGE-80-10_Repentigny_sans_SE.csv",
        "DGE-80-10_Westmount-Saint-Louis_sans_SE.csv",
        "DGE-80.10_Matane-Matapédia_sans-SE.csv",
    ],
)
def test_2022_official_filename_variants_are_not_silently_ignored(name):
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        archive.writestr(name, (FIXTURES / "modern_2022.csv").read_bytes())
    dataset = parse_election_archive(
        memory.getvalue(), election_date="2022-10-03", expected_riding_count=1
    )
    assert dataset.diagnostics["source_files"] == [name]


@pytest.mark.parametrize("count", ["garbage", "-1", "1.5", "inf"])
def test_invalid_vote_counts_are_never_coerced_or_truncated(count):
    raw = (
        (FIXTURES / "modern_2018.csv")
        .read_bytes()
        .replace(b",30,10,20,60,3", f",{count},10,20,60,3".encode())
    )
    with pytest.raises(ValueError, match="invalid official"):
        parse_modern_riding_csv(raw, election_date="2018-10-01", source_file="test.csv")
