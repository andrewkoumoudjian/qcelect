"""Spatial diagnostics for offline election-model validation.

Derived from Andrew's earlier manual Moran's-I utility. The port uses a
permutation p-value rather than relying on a fragile closed-form variance
approximation.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree


def morans_i(residuals: np.ndarray, coords: np.ndarray, k: int = 5) -> float:
    residuals = np.asarray(residuals, dtype=float)
    coords = np.asarray(coords, dtype=float)

    if residuals.ndim != 1:
        raise ValueError("residuals must be one-dimensional")
    if coords.shape != (len(residuals), 2):
        raise ValueError("coords must have shape (n, 2)")
    if len(residuals) <= k:
        raise ValueError("need more observations than neighbours")

    centered = residuals - residuals.mean()
    denominator = np.dot(centered, centered)
    if denominator == 0:
        raise ValueError("residuals have zero variance")

    tree = cKDTree(coords)
    _, indexes = tree.query(coords, k=k + 1)

    weighted_sum = 0.0
    for i, neighbours in enumerate(indexes[:, 1:]):
        weighted_sum += np.sum(centered[i] * centered[neighbours] / k)

    # Row-standardized weights sum to n.
    return float(weighted_sum / denominator)


def morans_i_permutation_test(
    residuals: np.ndarray,
    coords: np.ndarray,
    *,
    k: int = 5,
    permutations: int = 999,
    seed: int = 23,
) -> dict[str, float | int]:
    observed = morans_i(residuals, coords, k=k)
    rng = np.random.default_rng(seed)
    null = np.empty(permutations, dtype=float)

    residuals = np.asarray(residuals, dtype=float)
    for i in range(permutations):
        null[i] = morans_i(rng.permutation(residuals), coords, k=k)

    p_value = (1 + np.count_nonzero(np.abs(null) >= abs(observed))) / (
        permutations + 1
    )
    return {
        "I": observed,
        "expected_I": -1.0 / (len(residuals) - 1),
        "p_value": float(p_value),
        "k": k,
        "n": len(residuals),
        "permutations": permutations,
    }
