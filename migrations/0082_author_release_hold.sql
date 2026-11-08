-- A registered author's own release reaches followers only once notify_after has passed,
-- so the owner can look at it, or replace it, before anyone is told to install it.
ALTER TABLE module_releases ADD COLUMN notify_after TEXT;
