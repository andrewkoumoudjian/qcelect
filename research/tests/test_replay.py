from pathlib import Path
import runpy
import pandas as pd
import pytest

historical_units = runpy.run_path(str(Path(__file__).parents[1] / "scripts/build_replay.py"))["historical_units"]


def test_replay_reporting_retains_zero_vote_units_and_rejects_lost_votes():
    source = pd.DataFrame({"riding_code": [10, 10, 10], "polling_section": ["1", "1", "900"], "votes": [30, 20, 0]})
    allocations = pd.DataFrame({"source_riding": [10], "polling_section": ["1"]})
    units, missing = historical_units(source, allocations)
    assert len(units) == 2
    assert missing == [(10, "900")]
    source.loc[2, "votes"] = 1
    with pytest.raises(ValueError, match="contain votes"):
        historical_units(source, allocations)
