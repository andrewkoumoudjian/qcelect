from __future__ import annotations

import geopandas as gpd
import pandas as pd
import pytest
import zipfile
from shapely.geometry import box

from qcelect_research.transposition import (
    build_section_crosswalk,
    section_geometry_url,
    transpose_results,
    load_geometry_zip,
    normalize_section_geometry,
)


def _source_sections() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "CO_CEP_VG": ["10", "10"],
            "NO_SV_VG": ["1", "2"],
        },
        geometry=[box(0, 0, 1, 1), box(1, 0, 2, 1)],
        crs="EPSG:32198",
    )


def _target_ridings() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {"CO_CEP": ["101", "102"]},
        geometry=[box(0, 0, 1.5, 1), box(1.5, 0, 2, 1)],
        crs="EPSG:32198",
    )


def _results() -> pd.DataFrame:
    rows = []
    for poll, electors, a_votes, b_votes in [
        ("1", 100, 60, 40),
        ("2", 100, 30, 70),
    ]:
        for candidate, party, votes in [
            ("Alice", "A", a_votes),
            ("Bob", "B", b_votes),
        ]:
            rows.append(
                {
                    "election": "2022-10-03",
                    "riding_code": "10",
                    "polling_section": poll,
                    "candidate": candidate,
                    "party": party,
                    "votes": votes,
                    "registered_electors": electors,
                    "is_special_vote": False,
                    "source_file": "10.csv",
                }
            )

    # This row has no polygon and must be retained through the explicit
    # old-riding elector-share fallback.
    for candidate, party, votes in [
        ("Alice", "A", 7),
        ("Bob", "B", 3),
    ]:
        rows.append(
            {
                "election": "2022-10-03",
                "riding_code": "10",
                "polling_section": "900",
                "candidate": candidate,
                "party": party,
                "votes": votes,
                "registered_electors": pd.NA,
                "is_special_vote": True,
                "source_file": "10.csv",
            }
        )
    return pd.DataFrame(rows)


def test_crosswalk_uses_containment_then_area_overlap():
    crosswalk, diagnostics = build_section_crosswalk(
        _source_sections(), _target_ridings()
    )

    poll_1 = crosswalk[crosswalk["polling_section"] == "1"]
    assert poll_1[["target_riding", "weight"]].to_dict(orient="records") == [
        {"target_riding": "101", "weight": 1.0}
    ]

    poll_2 = crosswalk[crosswalk["polling_section"] == "2"]
    weights = dict(zip(poll_2["target_riding"], poll_2["weight"], strict=True))
    assert weights["101"] == pytest.approx(0.5)
    assert weights["102"] == pytest.approx(0.5)
    assert diagnostics["split_section_count"] == 1


def test_transposition_conserves_votes_and_allocates_unmapped_special_votes():
    result = transpose_results(_results(), _source_sections(), _target_ridings())

    assert result.diagnostics["source_total_votes"] == 210
    assert result.diagnostics["target_total_votes"] == 210
    assert result.diagnostics["vote_difference"] == 0
    assert result.diagnostics["unmatched_result_votes"] == 10

    source_party = _results().groupby("party")["votes"].sum().to_dict()
    target_party = result.votes.groupby("party")["votes"].sum().to_dict()
    assert source_party == target_party
    assert set(result.votes["target_riding"]) == {"101", "102"}


def test_2014_geometry_uses_pinned_archived_official_dgeq_file():
    url = section_geometry_url("2014-04-07")
    assert "web.archive.org/web/20160407203022id_" in url
    assert "electionsquebec.qc.ca" in url
    assert "2014-shapefile.zip" in url


def test_official_geometry_urls_are_versioned_by_election():
    assert "2014" in section_geometry_url("2014-04-07")
    assert "2018" in section_geometry_url("2018-10-01")
    assert "2022" in section_geometry_url("2022-10-03")
    assert "2026" in section_geometry_url("2026")


def test_nested_archived_2014_shapefile_loads_and_normalizes(tmp_path):
    source = _source_sections().rename(
        columns={"CO_CEP_VG": "CO_CEP", "NO_SV_VG": "NO_SV"}
    )
    directory = tmp_path / "source"
    directory.mkdir()
    source.to_file(directory / "Sections 2014.shp")
    archive_path = tmp_path / "sections.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        for path in directory.iterdir():
            archive.write(
                path, f"Sections de vote élections 2014-shapefile/{path.name}"
            )
    loaded = normalize_section_geometry(load_geometry_zip(archive_path))
    assert loaded["polling_section"].tolist() == ["1", "2"]
    assert loaded.crs == source.crs


def test_suffixed_bureaus_share_geometry_without_losing_or_combining_votes():
    rows = _results()
    rows.loc[rows.polling_section == "1", "polling_section"] = "1A"
    second = rows[rows.polling_section == "1A"].copy()
    second["polling_section"] = "1B"
    second["votes"] = 1
    rows = pd.concat([rows, second], ignore_index=True)
    result = transpose_results(rows, _source_sections(), _target_ridings())
    assert result.diagnostics["source_total_votes"] == 212
    assert result.diagnostics["target_total_votes"] == 212
    assert result.diagnostics["suffixed_bureau_count"] == 2
    assert result.diagnostics["unmatched_result_votes"] == 10
    assert (
        result.votes.groupby("party")["votes"].sum().to_dict()
        == rows.groupby("party")["votes"].sum().to_dict()
    )


def test_replay_cached_crosswalk_preserves_units_and_final_totals():
    original = transpose_results(_results(), _source_sections(), _target_ridings())
    replay = transpose_results(_results(), None, None, crosswalk=original.crosswalk)
    pd.testing.assert_frame_equal(original.votes, replay.votes)
    assert replay.allocations.votes.sum() == 210
    assert set(replay.allocations.polling_section) == {"1", "2", "900"}
    assert replay.allocations.groupby("party").votes.sum().to_dict() == {"A": 97, "B": 113}
    invalid = original.crosswalk.copy()
    invalid.loc[0, "weight"] = .5
    with pytest.raises(ValueError, match="sum to one"):
        transpose_results(_results(), None, None, crosswalk=invalid)
