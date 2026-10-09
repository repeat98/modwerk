-- Beta tester is an independent access class; it grants no moderation or developer permissions.
ALTER TABLE users ADD COLUMN beta_tester INTEGER NOT NULL DEFAULT 0 CHECK(beta_tester IN (0,1));
