"""Offline transposition of historical polling results onto 2026 ridings.

The algorithm uses official polling-section geometry where DGEQ publishes it.
Contained sections map 1:1. Boundary-crossing sections are split by polygon
intersection area, the finest reproducible weighting available without an
address/population surface. Unmapped special/merged vote categories are
allocated across the old riding's mapped 2026 destinations using registered
elector mass from ordinary sections.

All vote allocations use deterministic largest-remainder rounding so provincial
and party totals are conserved exactly.
"""

from __future__ import annotations

import io
import math
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import geopandas as gpd
import numpy as np
import pandas as pd

SECTION_GEOMETRY_URLS = {
    # Original DGEQ 2014 polling-section shapefile, preserved by the Internet
    # Archive. The timestamped replay URL pins the exact archived official file.
    "2014-04-07": (
        "https://web.archive.org/web/20160407203022id_/"
        "http://www.electionsquebec.qc.ca/documents/zip/"
        "sections%20de-vote-elections-2014-shapefile.zip"
    ),
    "2018-10-01": (
        "https://donnees.electionsquebec.qc.ca/autres/provincial/"
        "sections_vote_2018_shapefile.zip"
    ),
    "2022-10-03": (
        "https://donnees.electionsquebec.qc.ca/autres/provincial/"
        "sections_vote_2022_shapefile.zip"
    ),
    "2026": (
        "https://donnees.electionsquebec.qc.ca/autres/provincial/"
        "sections_vote_2026_shapefile.zip"
    ),
}

TARGET_2026_GEOJSON_URL = (
    "https://donnees.electionsquebec.qc.ca/autres/provincial/"
    "circonscriptions_electorales_sans_eau_2026.json"
)

# Québec Lambert is equal-area enough for deterministic overlap ratios across
# the province and avoids computing polygon areas in longitude/latitude.
AREA_CRS = "EPSG:32198"


@dataclass(frozen=True)
class TranspositionResult:
    votes: pd.DataFrame
    crosswalk: pd.DataFrame
    diagnostics: dict[str, object]


def section_geometry_url(election_date: str) -> str:
    try:
        return SECTION_GEOMETRY_URLS[election_date]
    except KeyError as exc:
        raise KeyError(
            f"No official DGEQ polling-section geometry is catalogued for "
            f"{election_date}. Do not substitute another election's sections."
        ) from exc


def _key(value: object) -> str:
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return ""
    try:
        numeric = float(text)
    except ValueError:
        return text
    if numeric.is_integer():
        return str(int(numeric))
    return text


def _field(frame: gpd.GeoDataFrame, candidates: Iterable[str]) -> str:
    upper = {column.upper(): column for column in frame.columns}
    for candidate in candidates:
        if candidate.upper() in upper:
            return upper[candidate.upper()]
    raise ValueError(
        f"none of the expected fields {list(candidates)} exist; "
        f"available={list(frame.columns)}"
    )


def normalize_section_geometry(
    frame: gpd.GeoDataFrame,
    *,
    riding_field: str | None = None,
    polling_field: str | None = None,
) -> gpd.GeoDataFrame:
    """Normalize DGEQ section geometry to stable source keys."""

    if frame.crs is None:
        raise ValueError("section geometry is missing a CRS")

    riding = riding_field or _field(
        frame, ("CO_CEP_VG", "CO_CEP", "CODE_CEP", "CODE")
    )
    polling = polling_field or _field(
        frame, ("NO_SV_VG", "NO_SV", "S.V.", "SV")
    )

    output = frame[[riding, polling, "geometry"]].copy()
    output["source_riding"] = output[riding].map(_key)
    output["polling_section"] = output[polling].map(_key)
    output = output[
        output.geometry.notna()
        & ~output.geometry.is_empty
        & (output["source_riding"] != "")
        & (output["polling_section"] != "")
    ].copy()

    # A logical section can be represented by more than one polygon part.
    output = output.dissolve(
        by=["source_riding", "polling_section"], as_index=False
    )
    return output[["source_riding", "polling_section", "geometry"]]


def normalize_target_ridings(
    frame: gpd.GeoDataFrame,
    *,
    riding_field: str | None = None,
) -> gpd.GeoDataFrame:
    if frame.crs is None:
        raise ValueError("target riding geometry is missing a CRS")

    riding = riding_field or _field(frame, ("CO_CEP", "CO_CEP_VG", "CODE"))
    output = frame[[riding, "geometry"]].copy()
    output["target_riding"] = output[riding].map(_key)
    output = output[
        output.geometry.notna()
        & ~output.geometry.is_empty
        & (output["target_riding"] != "")
    ].copy()

    if output["target_riding"].duplicated().any():
        output = output.dissolve(by="target_riding", as_index=False)

    return output[["target_riding", "geometry"]]


def build_section_crosswalk(
    source_sections: gpd.GeoDataFrame,
    target_ridings: gpd.GeoDataFrame,
) -> tuple[pd.DataFrame, dict[str, object]]:
    """Build deterministic source-section -> 2026 riding overlap weights."""

    source = normalize_section_geometry(source_sections).to_crs(AREA_CRS)
    target = normalize_target_ridings(target_ridings).to_crs(AREA_CRS)

    source = source.copy()
    source["source_area"] = source.geometry.area
    if (source["source_area"] <= 0).any():
        raise ValueError("source section geometry contains zero-area polygons")

    intersections = gpd.overlay(
        source,
        target,
        how="intersection",
        keep_geom_type=False,
    )
    if intersections.empty:
        raise ValueError("source sections do not intersect target ridings")

    intersections["intersection_area"] = intersections.geometry.area
    intersections = intersections[intersections["intersection_area"] > 0].copy()
    intersections["raw_weight"] = (
        intersections["intersection_area"] / intersections["source_area"]
    )

    keys = ["source_riding", "polling_section"]
    coverage = (
        intersections.groupby(keys, sort=False)["raw_weight"]
        .sum()
        .rename("coverage")
        .reset_index()
    )
    intersections = intersections.merge(coverage, on=keys, validate="many_to_one")
    if (intersections["coverage"] <= 0).any():
        raise ValueError("crosswalk contains a section with zero target coverage")

    # Normalize tiny shoreline/topology losses. The raw coverage is retained in
    # diagnostics so meaningful gaps cannot disappear silently.
    intersections["weight"] = (
        intersections["raw_weight"] / intersections["coverage"]
    )

    crosswalk = intersections[
        [
            "source_riding",
            "polling_section",
            "target_riding",
            "weight",
            "raw_weight",
            "coverage",
        ]
    ].sort_values(keys + ["target_riding"], kind="stable")

    source_keys = source[keys].drop_duplicates()
    mapped_keys = crosswalk[keys].drop_duplicates()
    unmapped = source_keys.merge(mapped_keys, on=keys, how="left", indicator=True)
    unmapped = unmapped[unmapped["_merge"] == "left_only"]

    diagnostics = {
        "source_section_count": int(len(source_keys)),
        "mapped_section_count": int(len(mapped_keys)),
        "unmapped_geometry_section_count": int(len(unmapped)),
        "raw_coverage_min": float(coverage["coverage"].min()),
        "raw_coverage_median": float(coverage["coverage"].median()),
        "raw_coverage_below_0_99": int((coverage["coverage"] < 0.99).sum()),
        "split_section_count": int(
            (crosswalk.groupby(keys)["target_riding"].nunique() > 1).sum()
        ),
        "target_riding_count": int(target["target_riding"].nunique()),
    }
    return crosswalk.reset_index(drop=True), diagnostics


def _largest_remainder(
    total: int,
    destinations: pd.DataFrame,
    *,
    weight_column: str,
) -> list[tuple[str, int]]:
    if total < 0:
        raise ValueError("vote totals cannot be negative")
    if destinations.empty:
        raise ValueError("cannot allocate votes without destinations")

    weights = destinations[weight_column].astype(float).to_numpy()
    weight_sum = float(weights.sum())
    if not math.isfinite(weight_sum) or weight_sum <= 0:
        raise ValueError("allocation weights must sum to a positive finite value")
    weights = weights / weight_sum

    raw = weights * total
    allocated = np.floor(raw).astype(int)
    remainder = total - int(allocated.sum())

    order = sorted(
        range(len(destinations)),
        key=lambda index: (
            -(raw[index] - allocated[index]),
            _key(destinations.iloc[index]["target_riding"]),
        ),
    )
    for index in order[:remainder]:
        allocated[index] += 1

    return [
        (_key(destinations.iloc[index]["target_riding"]), int(allocated[index]))
        for index in range(len(destinations))
    ]


def _riding_destination_weights(
    results: pd.DataFrame,
    crosswalk: pd.DataFrame,
) -> pd.DataFrame:
    poll_meta = (
        results[
            [
                "riding_code",
                "polling_section",
                "registered_electors",
                "is_special_vote",
            ]
        ]
        .drop_duplicates()
        .copy()
    )
    poll_meta = poll_meta[~poll_meta["is_special_vote"]].copy()
    poll_meta["source_riding"] = poll_meta["riding_code"].map(_key)
    poll_meta["polling_section"] = poll_meta["polling_section"].map(_key)

    mapped = poll_meta.merge(
        crosswalk,
        on=["source_riding", "polling_section"],
        how="inner",
        validate="many_to_many",
    )
    if mapped.empty:
        raise ValueError("no historical polling sections match geometry")

    electors = pd.to_numeric(mapped["registered_electors"], errors="coerce")
    # If an individual section lacks an elector count, give it one unit of
    # mass rather than dropping it. This fallback is explicit and diagnostic.
    mapped["elector_mass"] = np.where(
        electors.notna() & (electors > 0),
        electors * mapped["weight"],
        mapped["weight"],
    )

    shares = (
        mapped.groupby(["source_riding", "target_riding"], as_index=False)[
            "elector_mass"
        ]
        .sum()
        .rename(columns={"elector_mass": "mass"})
    )
    shares["riding_weight"] = shares["mass"] / shares.groupby(
        "source_riding"
    )["mass"].transform("sum")
    return shares[["source_riding", "target_riding", "riding_weight"]]


def transpose_results(
    results: pd.DataFrame,
    source_sections: gpd.GeoDataFrame,
    target_ridings: gpd.GeoDataFrame,
) -> TranspositionResult:
    """Transpose one historical election onto the 2026 riding map."""

    elections = {str(value) for value in results["election"].dropna().unique()}
    if len(elections) != 1:
        raise ValueError("transpose_results expects exactly one election")
    election = next(iter(elections))

    crosswalk, geometry_diagnostics = build_section_crosswalk(
        source_sections, target_ridings
    )
    work = results.copy()
    work["source_riding"] = work["riding_code"].map(_key)
    work["polling_section"] = work["polling_section"].map(_key)

    joined = work.merge(
        crosswalk[
            ["source_riding", "polling_section", "target_riding", "weight"]
        ],
        on=["source_riding", "polling_section"],
        how="left",
        validate="many_to_many",
    )
    matched = joined[joined["target_riding"].notna()].copy()

    unit_keys = [
        "election",
        "source_file",
        "source_riding",
        "polling_section",
        "candidate",
        "party",
    ]
    allocations: list[dict[str, object]] = []

    for key_values, group in matched.groupby(unit_keys, dropna=False, sort=False):
        total = int(group["votes"].iloc[0])
        # A historical result row may duplicate after the geometry join only;
        # every target destination appears once per source result unit.
        destinations = group[["target_riding", "weight"]].drop_duplicates()
        for target_riding, votes in _largest_remainder(
            total, destinations, weight_column="weight"
        ):
            allocations.append(
                {
                    "election": election,
                    "target_riding": target_riding,
                    "candidate": key_values[-2],
                    "party": key_values[-1],
                    "votes": votes,
                    "allocation": "section_geometry",
                }
            )

    matched_result_keys = matched[
        ["source_file", "source_riding", "polling_section", "candidate", "party"]
    ].drop_duplicates()
    unmatched = work.merge(
        matched_result_keys,
        on=["source_file", "source_riding", "polling_section", "candidate", "party"],
        how="left",
        indicator=True,
    )
    unmatched = unmatched[unmatched["_merge"] == "left_only"].copy()

    riding_weights = _riding_destination_weights(work, crosswalk)
    for _, row in unmatched.iterrows():
        total = int(row["votes"])
        if total == 0:
            continue
        destinations = riding_weights[
            riding_weights["source_riding"] == row["source_riding"]
        ]
        if destinations.empty:
            raise ValueError(
                "unmapped historical votes have no target destinations for "
                f"source riding {row['source_riding']}"
            )
        for target_riding, votes in _largest_remainder(
            total, destinations, weight_column="riding_weight"
        ):
            allocations.append(
                {
                    "election": election,
                    "target_riding": target_riding,
                    "candidate": row["candidate"],
                    "party": row["party"],
                    "votes": votes,
                    "allocation": "riding_elector_share",
                }
            )

    allocated = pd.DataFrame(allocations)
    if allocated.empty:
        raise ValueError("transposition produced no votes")

    output = (
        allocated.groupby(
            ["election", "target_riding", "candidate", "party"],
            as_index=False,
            dropna=False,
        )["votes"]
        .sum()
        .sort_values(
            ["target_riding", "party", "candidate"],
            kind="stable",
        )
        .reset_index(drop=True)
    )

    source_party = (
        work.groupby("party", dropna=False)["votes"].sum().sort_index()
    )
    target_party = (
        output.groupby("party", dropna=False)["votes"].sum().sort_index()
    )
    party_check = source_party.to_frame("source").join(
        target_party.to_frame("target"), how="outer"
    ).fillna(0)
    party_check["difference"] = party_check["target"] - party_check["source"]

    source_total = int(work["votes"].sum())
    target_total = int(output["votes"].sum())
    if source_total != target_total or (party_check["difference"] != 0).any():
        raise ValueError("transposition failed exact vote-conservation checks")

    matched_original = work.merge(
        crosswalk[["source_riding", "polling_section"]].drop_duplicates(),
        on=["source_riding", "polling_section"],
        how="inner",
    )
    matched_votes = int(matched_original["votes"].sum())

    diagnostics = {
        "election": election,
        **geometry_diagnostics,
        "source_total_votes": source_total,
        "target_total_votes": target_total,
        "vote_difference": target_total - source_total,
        "geocoded_vote_share": (
            matched_votes / source_total if source_total > 0 else 0.0
        ),
        "unmatched_result_rows": int(len(unmatched)),
        "unmatched_result_votes": int(unmatched["votes"].sum()),
        "party_vote_check": party_check.reset_index().to_dict(orient="records"),
        "allocation_methods": {
            method: int(votes)
            for method, votes in allocated.groupby("allocation")["votes"].sum().items()
        },
    }

    return TranspositionResult(
        votes=output,
        crosswalk=crosswalk,
        diagnostics=diagnostics,
    )


def download_geometry(
    election_date: str,
    cache_dir: str | Path,
    *,
    refresh: bool = False,
) -> Path:
    url = section_geometry_url(election_date)
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / f"sections-{election_date}.zip"
    if target.exists() and not refresh:
        return target

    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/zip, application/octet-stream",
            "User-Agent": "qcelect-research/1.0 (+https://github.com/andrewkoumoudjian/qcelect)",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read()

    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        if not any(name.lower().endswith(".shp") for name in archive.namelist()):
            raise ValueError(f"{election_date}: geometry ZIP contains no shapefile")

    temporary = target.with_suffix(".tmp")
    temporary.write_bytes(body)
    temporary.replace(target)
    return target


def load_geometry_zip(path: str | Path) -> gpd.GeoDataFrame:
    return gpd.read_file(f"zip://{Path(path).resolve()}")


def download_target_2026(
    cache_dir: str | Path,
    *,
    refresh: bool = False,
) -> Path:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / "ridings-2026.geojson"
    if target.exists() and not refresh:
        return target

    request = urllib.request.Request(
        TARGET_2026_GEOJSON_URL,
        headers={
            "Accept": "application/geo+json, application/json",
            "User-Agent": "qcelect-research/1.0 (+https://github.com/andrewkoumoudjian/qcelect)",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read()

    # Parse through GeoPandas before replacing the cache entry.
    temporary = target.with_suffix(".tmp")
    temporary.write_bytes(body)
    test = gpd.read_file(temporary)
    if len(test) != 127:
        temporary.unlink(missing_ok=True)
        raise ValueError(
            f"expected 127 target ridings in 2026 GeoJSON, received {len(test)}"
        )
    temporary.replace(target)
    return target


def load_target_2026(path: str | Path | None = None) -> gpd.GeoDataFrame:
    if path is None:
        return gpd.read_file(TARGET_2026_GEOJSON_URL)
    return gpd.read_file(path)
