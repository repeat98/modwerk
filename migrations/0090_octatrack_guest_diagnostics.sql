-- Opt-in diagnostics from visitors without an account. `guest_id` is the SHA-256 of a random ID the visitor's browser
-- made when they agreed to share; stopping deletes both rows, and hourly cleanup removes what has expired.
CREATE TABLE octatrack_guest_diagnostic_consent (
  guest_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  version TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
CREATE TABLE octatrack_guest_diagnostic_events (
  guest_id TEXT NOT NULL REFERENCES octatrack_guest_diagnostic_consent(guest_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(guest_id,event_id)
);
CREATE INDEX octatrack_guest_diagnostic_expiry ON octatrack_guest_diagnostic_events(created_at);
