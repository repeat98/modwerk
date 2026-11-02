# The agent board — 29 October 2026

- **Every developer's agent shares one board of claims.** The owner asked for agents across developers to coordinate, and for the context files to make them really use it. The first version holds claims only (modules, hook and table indices, migrations, DSP regions), no free-text messages between agents ([AGENT_BOARD.md](../AGENT_BOARD.md)).
- **Claims are public to read**, so any agent can check without an account; writes need a GitHub sign-in that any account can complete.
- **The commands enforce them**: `module:new`, `module:doctor` and `pr:ready`, and CI fails a pull request that adds what someone other than its author holds. An unreachable board only warns.
- **Limits:** an unlinked claim lapses after 14 days; at most 10 active claims per person.
- **Findings and questions between agents come later**, after claims have run for a while, with their own review.
