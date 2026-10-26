# Records in dated files, documents under 32 KB — 25 October 2026

The owner asked how to stop the documentation ballooning, and chose this. `docs/` had grown from 5 Markdown files (39 KB) on 1 October 2026 to 64 (1.6 MB) on 25 October, and 871 of the 2,039 commits in those weeks changed it. Most of the growth was appended history: the verification record (220 KB), the Elekloader migration record (191 KB) and the beta test plan (108 KB). Agents read these documents as their context, and every session added to them.

- **Old logs are frozen.** `docs/VERIFICATION.md` and `docs/DECISIONS.md` keep their entries, and `npm run check` refuses new ones, as it has for `CHANGELOG.md` since 23 October. A module's results go in its own `TESTING.md`, any other verification in `docs/verification/<YYYY-MM-DD>-<topic>.md`, and a decision in this folder.
- **Documents stay under 32 KB.** `AGENTS.md` and every Markdown file in `docs/` may grow to 32 KB. One already longer may shrink but not grow (`scripts/docs.mjs`). Make room by cutting what is stale or said elsewhere; Git keeps the history.
- **One index.** [docs/README.md](../README.md) lists every document in `docs/`, and a test fails on one it does not list.

Not done yet: moving what is still true out of the migration record and the beta test plan, archiving finished snapshots, and removing documents nothing links to.
