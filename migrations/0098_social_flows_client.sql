-- Which window started a social sign-in: the site in a browser, or Modwerk's desktop app, whose sign-in runs in the
-- default browser and returns to the app through a modwerk:// link (docs/DESKTOP_APP.md). The verifier still binds it.
ALTER TABLE social_flows ADD COLUMN client TEXT NOT NULL DEFAULT 'web' CHECK(client IN ('web','desktop'));
