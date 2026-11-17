/** The release flow shown on the Start developing page. The prompts hand the work to the module skills, and the rules behind each step live in the repository (AGENTS.md, docs/DEVELOPER_WORKFLOW.md), which every coding agent reads. */
export type DeveloperTask = 'create' | 'update'
export type DeveloperStage = 'plan' | 'build' | 'test' | 'submit' | 'review' | 'publish'

/** The order of work in /modwerk-new-module and /modwerk-update-module, in a developer's words. */
export const RELEASE_STEPS: Record<DeveloperTask, { id: DeveloperStage; title: string; summary: string }[]> = {
  create: [
    { id: 'plan', title: 'Agree the plan', summary: 'Your agent checks what already exists, then proposes the controls and waits for your OK.' },
    { id: 'build', title: 'Build it', summary: 'It writes the module and runs the checks.' },
    { id: 'test', title: 'Test on your unit', summary: 'Your agent tests it over USB first. Then you play it and listen. No unit? Start in the emulator.' },
    { id: 'submit', title: 'Open the pull request', summary: 'Once you say testing is done. Automatic checks run on it.' },
    { id: 'review', title: 'Owner review', summary: 'The owner reviews every first release. Your agent fixes what the review asks for.' },
    { id: 'publish', title: 'Check it live', summary: 'After the merge it is in the library. Check the live version and its download.' },
  ],
  update: [
    { id: 'plan', title: 'Ask the author', summary: 'Not your module? Its author says yes before any work starts.' },
    { id: 'build', title: 'Make the change', summary: 'With a new version and its release notes.' },
    { id: 'test', title: 'Test on your unit', summary: 'Your agent tests it over USB first. Then you confirm the change yourself.' },
    { id: 'submit', title: 'Open the pull request', summary: 'Registered authors release their own updates by ticking both release boxes.' },
    { id: 'publish', title: 'Check it live', summary: 'Test the live download on your unit, then close the report.' },
  ],
}

export const INSTRUMENT_STEPS = [
  { title: 'Research the instrument', summary: 'Establish the stock format, exact rebuild and safe recovery.' },
  { title: 'Integrate SDK and builder', summary: 'Add the profile, hooks, toolchain and measured resource budgets.' },
  { title: 'Qualify on hardware', summary: 'Test the exact build and record actual results and remaining gaps.' },
  { title: 'Owner review, then modules', summary: 'Instrument integration needs owner review before module publication.' },
]

/** The skills the setup prompt installs, in a developer's words. Every folder in .claude/skills/ is in one of these lists (starter-prompts.test.ts). */
export const DEVELOPER_SKILLS = [
  { name: 'modwerk-start', summary: 'Start here' },
  { name: 'modwerk-new-module', summary: 'Build a new module' },
  { name: 'modwerk-update-module', summary: 'Update your module' },
  { name: 'modwerk-test-on-unit', summary: 'Test on your machine' },
  { name: 'modwerk-pr-ready', summary: 'Get ready to merge' },
  { name: 'modwerk-fix-issue', summary: 'Fix a reported issue' },
  { name: 'modwerk-contribute', summary: 'Find something to help with' },
]
export const MAINTAINER_SKILLS = ['modwerk-review-prs', 'modwerk-triage-issues', 'modwerk-discord']
/** Never offered to developers: their descriptions say they are for the owner only, and the setup prompt skips them. */
export const OWNER_SKILLS = ['modwerk-maintain', 'modwerk-diagnostics', 'modwerk-todo']
