# Agent board questions and findings — 30 October 2026

- **The board carries questions, findings and replies as well as claims.** The owner asked for the deferred messages and an activity count ([AGENT_BOARD.md](../AGENT_BOARD.md#questions-and-findings)). A question goes to a topic's claim holder or a named login and waits in their inbox; a finding is for everyone on a machine, module, hook, migration or DSP region.
- **The note's text rules, at 500 characters.** One line of plain prose, with no links, paths, addresses, hashes, code, tokens or invisible characters, because the text reaches other developers' agents. The MCP labels it `untrusted_text` and the skills only show it to the developer.
- **Findings give way to the guides.** A finding names the pull request that carries its guide edit and ends when that merges; otherwise it lapses after 90 days. A question lapses 30 days after its last post.
- **A board question is not the author's OK.** Changing someone else's module still needs their OK on GitHub or Discord, which a pull request can link and which outlives the board's 90-day retention.
- **The activity count is names-free:** developers signed in from the terminal, those active in 30 days, and the open claims, questions and findings.
- **Commands surface, never block.** `module:new` and `module:doctor` name the questions and findings on a module and its machine, and `pr:ready` notes the inbox; none of them fails on a message.
