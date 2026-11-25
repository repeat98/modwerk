**A fix or improvement outside a module?** Title it `Fix: …`, `Improvement: …`, `Docs: …` or `Workflow: …` (it is labelled from that), keep it to one change, delete everything below and answer these questions in plain words:

- **What was wrong or hard:**
- **What this changes:**
- **How I checked it:** (`npm run pr:ready` and anything else you ran)
- **Tested on a unit:** (a change to a built package or base: the exact build, the model and what ran; keep the pull request a draft until then, or write "Not tested on a unit:" and why)
- **Edge cases:** (a change to a built package or base, draft or ready: below this line a table with one row a case, `| Case | Why this change makes it a risk | How run | Result |`, each result pass, fail or "not run: why" (a draft says what it has not run yet); or "none, because …". [How to find them](../docs/TEST_PROCEDURE.md#edge-cases))
- **What the guides lacked or got wrong, and where I fixed it:** ("nothing" is a fine answer)

**A module or module update:** describe the change in behaviour, module version(s), compatibility and source/media attribution. Run it through [the test procedure](../docs/TEST_PROCEDURE.md) and give its "Tested on a unit" line and its edge-case table under a line "Edge cases". Then say what the guides lacked or got wrong while you built it and link the `Docs:` pull request that fixes it, or write "nothing"; the module release itself stays free of guide edits.

Before you save this description, `npm run pr:body -- FILE.md` (add `--draft` for a draft) checks it as CI's describe check will.

The checks do the rest. `npm run pr:ready` (a registered author: `npm run pr:ready -- --author <login>`) runs what CI runs: the module contract, version and release notes, compatibility and UI claims, resource and qualification records, documentation and licences. A pull request with a red check is labelled `needs-work` and leaves the review queue until it is green; after 14 days without a new commit it is closed, and you can reopen it once it is green. Until your first module is published, one module pull request is reviewed at a time.

No check can prove these, so you vouch for them:

- [ ] Changing a module someone else wrote: its author said yes before I started, and I link it here (a GitHub link, or Discord and the day). [Ask the author first](../docs/DEVELOPER_WORKFLOW.md#ask-the-author-first)
- [ ] I read the guide for its category in `docs/module-guides/` (and `sequencing.md` if it acts in time), and TESTING.md lists what I did not test. An effect module holds one effect.
- [ ] Source and media are mine or properly licensed, with authors and full licence texts kept. Nothing comes from Elektron firmware: no extracted code or tables, upgrade files or factory content, and nothing is modelled on another current Elektron product.
- [ ] Screenshots are real captures of the current module UI. Hardware results are what a named person saw on this exact build; emulator results are labelled as emulator results.

Registered module authors can opt into [automatic publication](../docs/MODULE_AUTHOR_UPDATES.md) after reviewing all the evidence; a first release leaves both boxes unticked. An update that reaches firmware or hardware addresses the published version did not use goes to owner review instead, and followers hear about an automatic release 48 hours after it goes live:

- [ ] Automatically merge and publish my module update after checks pass.
- [ ] I verified the source, licences, UI and qualification reports, including instance isolation and Part/project/reboot persistence where applicable; no required acceptance check is failed or untested.

Reviewer (an assigned device reviewer or a repository maintainer for a first release, the registered author for their own update):

- [ ] I checked the cycle and memory reports against the worst case, the attributed hardware evidence against the submitted source and build, and the screenshots, tutorial and access steps against the current UI. I read the submitter's test record ([the test procedure](../docs/TEST_PROCEDURE.md#who-runs-it)) against the diff and did not have to test it myself; a missing or unexplained step goes back to the submitter.

Validation commands and results:

Link issues with "Related to #…"; they are closed after the release is live and its download is verified.
