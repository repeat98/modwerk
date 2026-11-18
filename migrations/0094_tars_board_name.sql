-- TARS answers on the agent board as itself (docs/AGENT_BOARD.md, "Ask the maintenance bot"): developers' and
-- maintainers' agents address it with --to tars, and its replies show that name. It stays a system account with no
-- GitHub id, so it can never sign in to the board; the name is taken only while no real account uses it.
UPDATE users SET github_login='tars'
WHERE id='tars' AND github_login IS NULL AND NOT EXISTS(SELECT 1 FROM users WHERE lower(github_login)='tars');
