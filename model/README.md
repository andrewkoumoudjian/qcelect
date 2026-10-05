# Model artifacts

Generated production artifacts live here once they pass historical replay/calibration.

Required metadata for every artifact:

- model version;
- source training elections;
- target delimitation;
- feature contract;
- calibration method/window;
- creation commit;
- deterministic hash.

Do not hand-edit generated artifacts and do not add placeholder coefficients. Until a valid artifact exists, production publishes official results with `projection: null`.
