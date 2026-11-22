-- Keep an inbox reader reachable even if they have not posted since signing in.
ALTER TABLE developer_sessions ADD COLUMN board_inbox_day INTEGER;
-- A wanted task has its own holder and PR. Its parent groups independent investigations.
ALTER TABLE agent_messages ADD COLUMN parent_issue INTEGER CHECK(kind='wanted' OR parent_issue IS NULL);
ALTER TABLE agent_messages ADD COLUMN parent_claim TEXT REFERENCES agent_claims(id) ON DELETE SET NULL
  CHECK (parent_claim IS NULL OR (kind='wanted' AND parent_issue IS NULL));
CREATE INDEX agent_wanted_issue ON agent_messages(parent_issue) WHERE parent_issue IS NOT NULL;
CREATE INDEX agent_wanted_claim ON agent_messages(parent_claim) WHERE parent_claim IS NOT NULL;
-- Evidence belongs to the reply. Only the thread's pull_request controls when it folds.
ALTER TABLE agent_messages ADD COLUMN outcome TEXT CHECK(kind='reply' AND outcome IN ('reproduced','different-result') OR outcome IS NULL);
ALTER TABLE agent_messages ADD COLUMN evidence INTEGER CHECK(evidence IS NULL OR (outcome IS NOT NULL AND evidence BETWEEN 1 AND 9999999));
