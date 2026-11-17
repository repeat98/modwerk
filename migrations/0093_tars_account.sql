-- TARS, the maintenance bot's site account (docs/MAINTENANCE_BOT.md). It answers members who need help in the forum
-- and the shoutbox through the site's own handlers, so its posts follow the same rules, limits and notifications as
-- anyone's. It never signs in: only the bot's key acts as it. Like the 'modwerk' system author it is no member: with
-- no verified email it stays out of member lists, @-suggestions and announcement audiences, and direct messages are off.
INSERT OR IGNORE INTO users(id,display_name,username,email_verified,messages_enabled,show_online,profile_bio)
VALUES('tars','TARS','tars',0,0,0,'Modwerk''s helper bot. It answers questions in the forum, the shoutbox and on Discord, and a person reads along.');
