**A fix or improvement outside a module?** Title it `Fix: …`, `Improvement: …` or `Docs: …` (it is labelled from that), keep it to one change, delete everything below and answer three questions in plain words:

- **What was wrong or hard:**
- **What this changes:**
- **How I checked it:** (`npm run pr:ready` and anything else you ran)
- **What the guides lacked or got wrong, and where I fixed it:** ("nothing" is a fine answer)

**A module or module update:** describe the change in behavior, module version(s), compatibility and source/media attribution. Then say what the guides lacked or got wrong while you built it and link the `Docs:` pull request that fixes it, or write "nothing"; the module release itself stays free of guide edits.

Existing module authors can opt into [automatic publication](../docs/MODULE_AUTHOR_UPDATES.md) after reviewing all evidence:

- [ ] Automatically merge and publish my module update after checks pass.
- [ ] I verified the source, licences, UI and qualification reports, including instance isolation and Part/project/reboot persistence where applicable; no required acceptance check is failed or untested.

- [ ] New or changed module: I read the guide for its category in `docs/module-guides/` (and `sequencing.md` if it acts in time), walked its checklists, and TESTING.md lists what I did not test. `npm run module:doctor -- <id>` is green.
- [ ] The module builds, installs and works when it is the only module chosen. It depends on no other module: no `requires`, no hooks into another module, not stacked on another module's pull request. Its key gestures and stock screens are in `compatibility.uiClaims` (`[]` for none).
- [ ] Every code change to a module has a greater semantic version and exact catalog pin (documentation and media edits need none).
- [ ] Source and media are original or properly licensed; authors and full licence texts are preserved.
- [ ] No Elektron firmware, extracted routines/tables, upgrade files or other infringing material is included.
- [ ] Every new/changed module with OT UI has real screenshots of its location and relevant control pages, manifest `access` instructions, and `media[].otUi` version/build/setup provenance. Automatic USB modules without OT UI use the narrow `access.noUiReason` declaration for reviewer verification.
- [ ] I verified the captions, button/menu steps, screenshot authenticity and page coverage against the current module UI.
- [ ] TESTING.md records commands, results, exact source, conditions and limitations; emulator and hardware evidence are separate.
- [ ] CPU, DSP core and memory gauges are populated in `resources.impact` with rough load tiers, workload, rationale and source records. Reviewer: I checked the estimates; they do not imply exact hardware headroom percentages.
- [ ] Runtime/resource changes and new modules: `tests.qualification` contains worst-case cycle counts for every processor used, under parameter extremes, simultaneous modulation, mode changes and maximum load, within the declared real-time budget.
- [ ] Runtime/resource changes and new modules: exact memory regions include code, state, tables, buffers, stack/heap, padding and shared allocations; words, word widths, bytes and maximum-instance totals agree with the native allocation/build report.
- [ ] Runtime/resource changes and new modules: this version/source/build has attributed real-hardware test evidence verified by the reviewer (the owner for first releases; the registered author for scoped updates). Record tester, date, source/build identity, observed behavior, workload and limitations. A reported functional test must stay labelled as reported; unknown model, duration and maximum load must stay explicit.
- [ ] Reviewer: for new modules and runtime/resource changes, I verified the actual cycle/memory reports, coverage of modulation and maximum load, and attributed hardware evidence and its actual coverage against the submitted source/build. A declaration or emulator-only result is insufficient.
- [ ] Complete README/TESTING/licence/control/compatibility documentation, at least three practical tutorial steps and real black-and-white PNG screenshots document the current behavior with honest version/build provenance; README and the applicable qualification/retained-evidence documentation record are synchronized. Yellow captures do not qualify.
- [ ] Reviewer: I verified tutorial usefulness, all relevant control/page coverage, screenshot authenticity, exact access instructions and full documentation completeness.
- [ ] I rebased onto current main and ran module/version checks on this revision.

Validation commands and results:

For an editorial-only update, use `tests.retainedEvidence` referencing the original published version in approved main history. CI compares protected source, defaults, compatibility, resource claims, reports and shared runtime/build inputs before permitting reuse; preserve original measurement/hardware status and capture provenance. All version, documentation and media/rights requirements still apply; reviewer verification follows the author/owner scope above.

Owner merge or the verified author-release workflow approves the exact source version. Link issues with “Related to #...”; close them only after successful deployment and live download verification. Failed source builds retain the previous publication. Metadata validation and successful assembly are not hardware qualification.
