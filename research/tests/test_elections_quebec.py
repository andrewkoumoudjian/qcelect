from qcelect_research.elections_quebec import (
    _parse_modern,
    _strip_trailing_garbage,
    archive_url,
)


def test_archive_url_is_canonical():
    assert archive_url("2022-10-03").endswith(
        "/gen2022-10-03/resultats-bureau-vote.zip"
    )


def test_trailing_garbage_is_removed():
    assert _strip_trailing_garbage(["1", "2", "nan", "", ""]) == ["1", "2"]


def test_modern_header_prefix_does_not_shift_columns():
    rows = [
        ["Election: 2022"],
        ["Header:", "Code", "Circonscription", "S.V.", "É.I.", "A", "B.V.", "B.R."],
        ["364", "Jeanne-Mance-Viger", "2", "373", "18", "201", "3"],
    ]
    frame = _parse_modern(rows)
    assert list(frame.columns[:7]) == [
        "Code",
        "Circonscription",
        "S.V.",
        "É.I.",
        "A",
        "B.V.",
        "B.R.",
    ]
    assert frame.iloc[0]["S.V."] == "2"
