CREATE TABLE official_snapshots (
  id INTEGER PRIMARY KEY,
  election TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  official_json TEXT NOT NULL CHECK (json_valid(official_json)),
  public_json TEXT NOT NULL CHECK (json_valid(public_json)),
  UNIQUE (election, source_sha256)
);
CREATE TABLE ingestion_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
