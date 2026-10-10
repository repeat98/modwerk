/** Shared guidance for the readable submit page and its complete agent prompt. */
export type DeveloperTask = 'create' | 'update'
export type DeveloperStage = 'prepare' | 'verify' | 'submit' | 'publish'

export const AUTHOR_RELEASE_OPT_IN = '- [ ] Automatically merge and publish my module update after checks pass.\n- [ ] I verified the source, licences, UI and qualification reports, including instance isolation and Part/project/reboot persistence where applicable; no required acceptance check is failed or untested.'

export const ISSUE_COMMANDS = '/modwerk resolve <published-version> verified-download\n/modwerk close configuration <public explanation>\n/modwerk reopen <public explanation>'

export const DEVELOPER_CONTEXT = [
  { title: 'Separate catalogues', summary: 'Octabam, Modwerk and Elekloader maintain separate catalogues. A module enters Modwerk through an explicit submission or port; an Elekloader listing is optional.' },
  { title: 'Builders today', summary: 'Octatrack uses the Octabam source and native remixer. Modwerk uses the Elekloader builder kit for Digitakt and Digitone. Elekloader retains its own frontend and loader.' },
  { title: 'Planned', summary: 'A shared Elekloader builder will replace Modwerk’s two builder paths. Publishing entirely new modules without another owner review is also planned for verified developers; it is not available yet.' },
]

export const DEVELOPER_RULES = [
  { title: 'Fit the instrument', summary: 'Use stock gestures, UI style and the instrument’s own tempo, track speed and swing.', detail: 'Keep stock firmware flows intact by default. Propose any minor stock-flow change to me first; document why, alternatives, visible differences, how to disable it and neighbouring flows tested. The owner reviews these changes. Never use an independent sequencer clock.' },
  { title: 'Measure the worst case', summary: 'Benchmark DSP and memory use, compare against stock and stress every supported instance.', detail: 'Plan the performance budget before coding. New FX should aim for the stock SPRING REV cost at its worst settings; benchmark under matched conditions on both cores. Keep modeled cycles, executed instructions and hardware timing distinct. Octatrack modules need a passing evidence/performance.json; run the applicable FX/performance audits. Digitakt and Digitone record measured budgets and evidence tiers. Preview-machine scope needs owner agreement.' },
  { title: 'Share what you learn', summary: 'Fold findings that help every developer into the shared guides, in their own small PR.', detail: 'If you find something any later module or agent would need (a trap, a tool quirk, a measured constraint, a step a guide lacks or has wrong), do not leave it in this session. Add it to the matching file under docs/module-guides/, docs/ADD_A_MODULE.md or AGENTS.md, correcting a stale line instead of contradicting it. Keep it short, general and free of firmware bytes, code, tables and dumps; state a hardware behaviour only as I observed it on a named build. Leave sdk/octabam/AGENTS.md unchanged. Send it as a separate docs-only PR, never inside the module release (it is outside an author’s scope and would end automatic publication), and tell me what you added.' },
  { title: 'Keep firmware private', summary: 'Only original or properly licensed source, credited media and stock-free packages belong in a PR.', detail: 'Never commit Elektron firmware, extracted routines or tables, memory dumps, projects/cards or built firmware images. My OS file stays on my computer. Preserve authorship, licence text and exact upstream source pins. Review is not legal clearance.' },
]

export const RELEASE_STEPS: Record<DeveloperTask, { id: DeveloperStage; title: string; summary: string; detail: string }[]> = {
  create: [
    { id: 'prepare', title: 'Prepare the module', summary: 'Build or port it with matching docs, credits, media and release notes.', detail: 'Work on a branch from current main in my Modwerk fork. Prepare source/build files, a versioned manifest and catalog pin, README.md with controls, access steps, compatibility, limitations and at least three tutorial steps, TESTING.md, LICENSE and reviewed media. Add version-matched notes to src/community/module-changelogs.json and preserve previous entries. Ports retain each author’s credit, licence and exact source revision. Include matching stock-free module packages for the supported OS variants.' },
    { id: 'verify', title: 'Verify the exact build', summary: 'Run the checks, test on your unit and record actual results.', detail: 'Regenerate changed metadata, run npm run module:doctor -- <id> until green and npm run check -- --base origin/main. Build and qualify the exact source/packages using the module guide. Give me concrete hardware steps and capture requirements for this build. Check native/browser parity, resource budgets, different simultaneous instances across tracks/FX slots/DSP cores, and Part/project/reboot persistence where applicable. Record only results I actually provide, including model, OS, version, duration and failures. Emulator project-load results do not prove physical reboot persistence. Stop release-dependent work until required hardware results arrive; continue independent preparation.' },
    { id: 'submit', title: 'Submit for first review', summary: 'Open a Modwerk PR. Every new module currently needs owner review.', detail: 'Commit source, docs, evidence, media and stock-free packages, push the branch and open a PR against Modwerk main. Follow its checks and fix failures. The owner reviews and merges the first release, and registers the module author for future updates. Do not treat a website claim as release authority or use the automatic author-update path for a new module.' },
    { id: 'publish', title: 'Check the published download', summary: 'Follow deployment, confirm the live version and save a compatible firmware download.', detail: 'After approval, follow the exact merged commit through site/API publication. Verify the live module-releases.json version and an actual saved compatible firmware download. Check its version/source identity and hash against the tested private image where deterministic. A push, merge or “Firmware ready” state alone is not release verification. Report remaining limits honestly. Registered authors can then use the checked automatic path for updates to their own approved modules.' },
  ],
  update: [
    { id: 'prepare', title: 'Change, version and document', summary: 'Fix or update your module; bump the version and write matching release notes.', detail: 'Read the linked report and reproduce it where possible. Distinguish a confirmed fix, a mitigation and an unconfirmed symptom. Rebase my fork onto current main and change only my approved module. Explicitly increase the semantic version and synchronize manifest, catalog pin, release notes, docs and shipped packages. A compatible bug fix normally increments the patch version; pushing Git commits does not increment it. Preserve published release notes, authors, licence text, source provenance and approved downloads.' },
    { id: 'verify', title: 'Verify the exact build', summary: 'Run the checks, test on your unit and personally review the evidence.', detail: 'Follow docs/MODULE_AUTHOR_UPDATES.md and the machine/category guides. Regenerate metadata and shipped packages and run npm run module:doctor -- <id> and npm run check -- --base origin/main. Runtime changes need current exact-source native/browser parity and actual hardware evidence: different simultaneous instances, track/FX-slot/DSP-core isolation and Part/project/physical-reboot persistence where applicable. Editorial updates can retain approved evidence only through the documented checked path. Ask me for exact-build test results and record only what I actually report. Missing, failed or untested required checks block automatic publication; continue independent preparation while waiting.' },
    { id: 'submit', title: 'Request publication in the PR', summary: 'Registered authors check both release boxes after personally verifying the evidence.', detail: 'Commit, push and open a PR against Modwerk main. Use “Related to #<number>” instead of merge-time closing keywords. Include both exact unchecked release boxes in the PR description. I must personally review the evidence before checking them; never check the evidence box on my behalf without my actual verification. Automatic merge/publication covers registered authors’ own approved modules only. New modules, shared code, ownership/licence changes and exceptions need owner review. Follow Module PR checks, Publish module author updates and site/API deployment; fix failures without bypassing gates.' },
    { id: 'publish', title: 'Verify live, then resolve', summary: 'Save and test the published download before resolving a fixed report.', detail: 'Verify deployment of the exact merged commit, the live module-releases.json version, and an actual saved compatible firmware download with matching version/source identity and hash where deterministic. Ask me to test the published fix on my unit and record only actual version-matched results. Only after that verification may the registered author post /modwerk resolve <published-version> verified-download as a NEW GitHub issue comment. A push or merge alone never closes a Modwerk report. Verify GitHub closure, Modwerk status sync and the reporter notification. Verify existing eligible follower/downloader notification fanout, preserving opt-outs; distinguish queued counts, provider acceptance and delivery or digest delays.' },
  ],
}

export const REPORT_GUIDANCE = 'Public Modwerk reports and GitHub replies share one thread; replies and status sync back to Modwerk. Replying, closing or reopening needs no fork; code changes use a fork and PR. As the registered author, post issue commands as new comments on mapped public reports for your module. Other closure reasons are duplicate, not_reproducible or withdrawn; include a public explanation without claiming a firmware fix. Direct GitHub-only issues use authorized native GitHub closure. Private report details stay access-controlled and consent-based.'

export const INSTRUMENT_STEPS = [
  { title: 'Research the instrument', summary: 'Establish the stock format, exact rebuild and safe recovery.' },
  { title: 'Integrate SDK and builder', summary: 'Add the profile, hooks, toolchain and measured resource budgets.' },
  { title: 'Qualify on hardware', summary: 'Test the exact build and record actual results and remaining gaps.' },
  { title: 'Owner review, then modules', summary: 'Instrument integration needs owner review before module publication.' },
]

export function developerWorkflowPrompt(task: DeveloperTask) {
  return [
    'Complete the workflow:',
    ...RELEASE_STEPS[task].map((step, index) => `${index + 1}. ${step.title}: ${step.summary} ${step.detail}`),
    '',
    'Development requirements:',
    ...DEVELOPER_RULES.map(rule => `${rule.title}: ${rule.summary} ${rule.detail}`),
    '',
    'Automatic update publication uses these exact PR checkboxes (leave unchecked until I personally verify the evidence and opt in):',
    AUTHOR_RELEASE_OPT_IN,
    '',
    'Reports:', REPORT_GUIDANCE, ISSUE_COMMANDS,
    '',
    'Distribution and roadmap:', ...DEVELOPER_CONTEXT.map(item => `${item.title}: ${item.summary}`),
    'I may keep research/source in my own repository, but a Modwerk PR is required to publish here. A new instrument needs device/builder integration and qualification first. Using published modules does not require development: choose a frontend and modules, build locally with my own stock OS, save the firmware and flash the unit.',
    'After publication I can verify my developer account, claim my module and add, change or remove a Ko-fi support link in Creator settings. Website claims do not confer automatic release authority.',
  ].join('\n')
}
