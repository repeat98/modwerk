-- A report about a whole configuration is an ordinary issue row with scope 'configuration'. Its module_id is the first
-- catalog module in the configuration, so every existing join keeps a valid module. issue_modules lists all of its
-- modules, which is what gives each module's authors access, mentions and commands.
ALTER TABLE issues ADD COLUMN scope TEXT NOT NULL DEFAULT 'module' CHECK(scope IN ('module','configuration'));
CREATE TABLE IF NOT EXISTS issue_modules (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (issue_id, module_id)
);
CREATE INDEX IF NOT EXISTS issue_modules_by_module ON issue_modules(module_id, issue_id);
