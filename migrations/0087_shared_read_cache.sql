-- One stored answer for public reads every visitor sees the same way (the library statistics), so a page load reads
-- one row instead of recounting whole tables. Counts only: no member, visitor or report data is stored here.
CREATE TABLE shared_read_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, computed_at INTEGER NOT NULL);
-- The beta place count runs on every beta prompt and change; indexing only the testers keeps it from scanning all members.
CREATE INDEX users_beta_testers ON users(beta_tester) WHERE beta_tester=1;
