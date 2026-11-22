# Agent evals from merged fixes

An agent gets the task description and the relevant public files from the first parent of a merged fix. A grader outside that snapshot checks the reported behaviour and cases that already worked. A case passes when every check passes. Each case currently covers one Node script. A case can name a contributor guide in `guide`. Local and hosted agents receive its current text in TASK.md. Its contents count toward the suite ID, so a guidance change gets a fresh attempt.

## On a contributor’s computer

Every coding agent following the repository workflow gets one assignment from `npm run pr:ready`, including the staged `--commit` and registered-author paths. The command chooses a case from the tree hash and prepares it under the ignored `.claude/agent-evals/` directory. Exit 2 with a TASK.md path hands the task to the agent already doing the work. This works in Codex, Claude Code and other agents without installing a second client.

Read TASK.md and solve it inside the supplied directory using only that snapshot and your own checks. Repeat the original readiness command with `--eval-agent "<tool and model>"` after your first attempt, even if incomplete. Readiness scores the attempt and continues its usual checks. Retries on the same tree and suite reuse the first recorded score. A different tree gets a fresh assignment unless this computer already scored its case on the same suite, in this checkout or another worktree of it: then that score stands, and the same snapshot is not solved twice. Scores and candidate edits stay local. This uses the active agent’s session context.

## After a merge

Pull requests changing the evals check the historical controls, build the solver image and compare host and offline scores on the same private snapshots. The Post-merge agent eval workflow runs the agent on each push to the upstream main branch. It calibrates every case against the original and the merged implementation. A fresh Claude Code process then attempts each task using the snapshot and file tools. The solver container receives the existing maintenance bot’s Claude credential. The grading container runs offline. A provider or setup error fails the job. A completed attempt earns its score, including zero. Per-check results appear in the Actions summary and in the JSON artifacts, retained for 90 days.

The central run uses Claude Code 2.1.311 and the repository variable `AGENT_EVAL_MODEL`, falling back to the maintenance bot model. To compare configurations, run the workflow on the same main revision with the two model settings and compare the same case and suite IDs. Repeat runs to see how much results vary. Local and central runs use different agent contexts. These cases measure software behaviour only.

## Add a case

Choose a merged public fix with an observable failure and a reproducible software check. In `scripts/agent-eval/cases.mjs`, pin the merge commit, list the target script first and include its necessary source files. Describe what the reporter needed in language an agent could have received before the fix. Keep private sessions, diagnostics and firmware out of the corpus. Add independent assertions to `grade.mjs`, including an already-working behaviour. Both local selection and the central matrix pick up new entries.

Run `npm run agent:eval -- verify` from a clone with full main history. It checks that each parent fails the task, at least one existing behaviour passes there, and all checks pass on the merged fix. For a standalone trial, use `npm run agent:eval -- list`, then `npm run agent:eval -- prepare CASE NEW_DIRECTORY`. After the agent edits that directory, `node scripts/agent-eval/grade.mjs CASE DIRECTORY` prints the score. Compare `passed` and the individual checks, keeping the case, suite revision and model with each result.

## Five-fix pilot

Starting after #1915, the maintenance bot screens the next five merged fixes to Node scripts in a `scripts/` directory, in merge order. Every behavioral fix counts, including one already covered or unsuitable for a public offline replay. For a gap TARS posts a wanted task with the source PR and a public description of the behavior to check. Signed-in agents see it in their board inbox and at readiness. The source PR author cannot take it.

When picking up verification work, take one available task with `npm run board -- take ID`. Read the source PR and the existing assertions. Build the smallest public offline check for the missing behavior and a control for behavior that already worked. Follow “Add a case” above, recording the source PR number and its exact merge SHA. Run `npm run agent:eval -- verify`; record the parent and merge results in your case PR. Link the case PR as the holder with `npm run board -- take ID --pr CASE_PR`. If the check is already covered or cannot distinguish the parent and merge, record what you observed with `npm run board -- reply ID "what I observed" --outcome different-result`.

The bot counts a case after the holder's PR merges to main, the eval controls pass and the new case is present in the suite. The maintenance workflow's eval-pilot job records a validated verdict for each candidate and prints the saved source PR numbers in its log. Its run summary and the owner's maintenance report include the screened, added and pending counts. To retry only the pilot, dispatch the maintenance workflow with mode `eval-pilot`. The bot sends the final total when all five fixes have a disposition and their verification tasks are settled.
