**A fix or improvement outside a module?** Title it `Fix: …`, `Improvement: …` or `Docs: …` (it is labelled from that), keep it to one change, delete everything below and answer four questions in plain words:

- **What was wrong or hard:**
- **What this changes:**
- **How I checked it:** (`npm run pr:ready` and anything else you ran)
- **What the guides lacked or got wrong, and where I fixed it:** ("nothing" is a fine answer)

**A module or module update:** describe the change in behaviour, module version(s), compatibility and source/media attribution. Then say what the guides lacked or got wrong while you built it and link the `Docs:` pull request that fixes it, or write "nothing"; the module release itself stays free of guide edits.

The checks do the rest. `npm run pr:ready` (a registered author: `npm run pr:ready -- --author <login>`) runs what CI runs: the module contract, version and release notes, compatibility and UI claims, resource and qualification records, documentation and licences. A pull request with a red check is labelled `needs-work` and leaves the review queue until it is green; after 14 days without a new commit it is closed, and you can reopen it once it is green. Until your first module is published, one module pull request is reviewed at a time.

No check can prove these, so you vouch for them:

- [ ] Changing a module someone else wrote: its author said yes before I started, and I link it here (a GitHub link, or Discord and the day). [Ask the author first](../docs/DEVELOPER_WORKFLOW.md#ask-the-author-first)
- [ ] I read the guide for its category in `docs/module-guides/` (and `sequencing.md` if it acts in time), and TESTING.md lists what I did not test.
- [ ] Source and media are mine or properly licensed, with authors and full licence texts kept. Nothing comes from Elektron firmware: no extracted code or tables, upgrade files or factory content.
- [ ] Screenshots are real captures of the current module UI. Hardware results are what a named person saw on this exact build; emulator results are labelled as emulator results.

Registered module authors can opt into [automatic publication](../docs/MODULE_AUTHOR_UPDATES.md) after reviewing all the evidence. An update that reaches firmware or hardware addresses the published version did not use goes to owner review instead, and followers hear about an automatic release 48 hours after it goes live:

- [ ] Automatically merge and publish my module update after checks pass.
- [ ] I verified the source, licences, UI and qualification reports, including instance isolation and Part/project/reboot persistence where applicable; no required acceptance check is failed or untested.

Reviewer (the owner for a first release, the registered author for their own update):

- [ ] I checked the cycle and memory reports against the worst case, the attributed hardware evidence against the submitted source and build, and the screenshots, tutorial and access steps against the current UI.

Validation commands and results:

Link issues with "Related to #…"; they are closed after the release is live and its download is verified.
