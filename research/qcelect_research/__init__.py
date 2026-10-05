"""Offline data preparation and model research for qcelect."""

from .elections_quebec import (
    GENERAL_ELECTION_ARCHIVES,
    archive_url,
    parse_dgeq_csv,
)

__all__ = [
    "GENERAL_ELECTION_ARCHIVES",
    "archive_url",
    "parse_dgeq_csv",
]
