Development: post-eval of SEQ (#2348), SCOPE (#2344), and CX (#2293) catalog/release agent sessions (local `npm run session -- review` only; no session uploads).

## Sessions measured

| Session | Agent | Prompts | Tools | Wall (capped) |
|---------|-------|---------|-------|---------------|
| `537c046c` SEQ release | Cursor | 73 | 1033 | ~234 min |
| `baac5e85` SCOPE release | Cursor | 72 | 943 | ~217 min |
| `6bce4694` CX (#2293) | Cursor | 46 | 1140 | ~193 min |
| 2026-11-26 23:27 | Codex | 35 | 405 | ~32 min |
| 2026-11-27 14:13 | Codex | 42 | 910 | ~140 min |
| 2026-11-27 14:41 publish | Codex | 95 | 841 | ~82 min |

Tool times cap inferred Cursor idle at 15 minutes per developer gap (this PR). Codex times are exec/wait only.

## Cost drivers (all sessions)

1. **Full `npm run check` / `pr:ready`** (~8+ min each); agents rerun after every small fix instead of `npm run check -- --base origin/main --rerun-failed`.
2. **`gh pr checks` / `gh run view` / `gh pr view body`** loops; slowest Cursor calls are often 8–15 min Bash polling CI.
3. **`| tail` on check output**; shell exit code can be tail's, not check's.
4. **Publication metadata edits** in repeated loops: `octamod.module.json` (SEQ 14×, SCOPE 18×), `TESTING.md`, qualify/evidence/performance fields.
5. **Fork vs PR HEAD**: local commits without push to the remote the PR uses.
6. **Gate scope**: `scripts/octatrack-qualify.py` inside module release PR → maintenance split to Fix #2370.
7. **PR describe**: missing `Guides:` on Fix PR; failure at CI, not at `pr:ready`.
8. **Device path**: `device serve` / bridge down during qualify (SEQ, CX Codex).
9. **Evidence vs contract**: SCOPE dropouts in JSON vs not measured; publish session fought thumbnails, comments, merged-state confusion.

## Developer friction lines (representative)

- SEQ: qualify/unit timing; share sessions without ask; close sibling PR.
- SCOPE: repeated "ci failed again"; dropouts field.
- CX: bridge stop/start; shared hooks; module load.
- Publish: merged PRs, wrong remix/thumbnail work, PR comment not read.

## What this Workflow PR ships (code)

- `readCursorTranscript` + `buildSession` / `findTranscript` for Cursor JSONL.
- `npm run session -- review` on Cursor; 15 min cap between user prompts.
- Upload fallback until Worker lists `cursor` agent (share still opt-in).

## Recommended follow-ups (not in this PR; separate Workflow/Improvement PRs)

| Id | Fix |
|----|-----|
| W1 | `pr:ready` dry-run describe / mandatory `Guides:` |
| W2 | `npm run pr:ci <n>`: failed check + first error + headRefOid vs local |
| W3 | `module:qualify` preflight: device socket, release base vs twin evidence |
| W4 | `pr:ready` preview Documents gate growth on `docs/*.md` |
| W5 | Skills: no tail on check; no close sibling PR; no session upload unless ask |
| W6 | `gateEdits` refuse qualify on module PRs; release/fork notes in `pr:ready` (Improvement #2375) |