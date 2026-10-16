-- A secret extra link admits members beyond the 50-person pool; NULL means closed, a new token retires the old link.
ALTER TABLE beta_invitation_settings ADD COLUMN extra_token TEXT;
-- The pool trigger keeps the cap for every path except a pending invitation through the current extra link.
DROP TRIGGER beta_pool_update;
CREATE TRIGGER beta_pool_update BEFORE UPDATE OF beta_tester ON users
WHEN NEW.beta_tester=1 AND OLD.beta_tester=0 AND (SELECT COUNT(*) FROM users WHERE beta_tester=1)>=50
 AND NOT EXISTS(SELECT 1 FROM member_beta_invitations i JOIN beta_invitation_settings s ON s.id=1 AND s.extra_token=i.campaign_id WHERE i.user_id=NEW.id AND i.state='pending')
BEGIN SELECT RAISE(ABORT,'The beta tester pool is full.'); END;
