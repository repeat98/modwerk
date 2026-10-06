-- Optional profile pictures. The file lives in the MEDIA bucket under avatars/<avatar_id>; the ID is
-- random and changes with every new picture, so public URLs never name the account and old copies
-- stop resolving. Removing the picture or deleting the account clears both columns and the object.
ALTER TABLE users ADD COLUMN avatar_id TEXT;
ALTER TABLE users ADD COLUMN avatar_mime TEXT;
CREATE UNIQUE INDEX users_avatar ON users(avatar_id) WHERE avatar_id IS NOT NULL;
