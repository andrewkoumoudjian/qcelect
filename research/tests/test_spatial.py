import numpy as np

from qcelect_research.spatial import morans_i, morans_i_permutation_test


def test_morans_i_detects_ordered_spatial_pattern():
    coords = np.column_stack([np.arange(12, dtype=float), np.zeros(12)])
    residuals = np.array([-3, -3, -2, -2, -1, -1, 1, 1, 2, 2, 3, 3], dtype=float)
    assert morans_i(residuals, coords, k=2) > 0


def test_permutation_test_is_deterministic():
    coords = np.column_stack([np.arange(12, dtype=float), np.zeros(12)])
    residuals = np.array([-3, -3, -2, -2, -1, -1, 1, 1, 2, 2, 3, 3], dtype=float)
    a = morans_i_permutation_test(residuals, coords, k=2, permutations=99, seed=23)
    b = morans_i_permutation_test(residuals, coords, k=2, permutations=99, seed=23)
    assert a == b
