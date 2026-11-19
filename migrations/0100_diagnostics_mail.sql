-- Personal emails to a member whose shared Octatrack diagnostics show a problem, and the follow-up once it is fixed
-- (server/diagnostics-mail.ts). An agent or the owner drafts one; only the owner, signed in, sends it. The body holds that
-- member's own facts in plain words, never another tester's data or raw records. Deleted with the account.
CREATE TABLE diagnostics_mail (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('problem','fixed')),
  cause TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','sent','discarded','failed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_by TEXT,
  sent_at TEXT
);
CREATE INDEX diagnostics_mail_member ON diagnostics_mail(user_id,created_at);
-- A member who followed the link in one of these emails: never mailed again this way. Deleted with the account.
CREATE TABLE diagnostics_mail_optout (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- These emails are counted beside the other mail, as totals per day only.
CREATE TABLE account_mail_daily_v6 (
 day TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset','activity','welcome','news','beta','diagnostics')),
 accepted INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, limited INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,purpose)
);
INSERT INTO account_mail_daily_v6 SELECT day,purpose,accepted,failed,limited FROM account_mail_daily;
DROP TABLE account_mail_daily;
ALTER TABLE account_mail_daily_v6 RENAME TO account_mail_daily;
