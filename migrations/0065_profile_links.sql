-- Optional public music/social profiles. Empty defaults preserve existing members.
ALTER TABLE users ADD COLUMN instagram_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN soundcloud_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bandcamp_url TEXT NOT NULL DEFAULT '';
