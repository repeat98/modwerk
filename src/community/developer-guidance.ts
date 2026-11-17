/** The release flow shown on the Start developing page. The prompts hand the work to the module skills, and the rules behind each step live in the repository (AGENTS.md, docs/DEVELOPER_WORKFLOW.md), which every coding agent reads. */
export type DeveloperTask = 'create' | 'update'
export type DeveloperStage = 'prepare' | 'verify' | 'submit' | 'publish'

export const RELEASE_STEPS: Record<DeveloperTask, { id: DeveloperStage; title: string; summary: string }[]> = {
  create: [
    { id: 'prepare', title: 'Prepare the module', summary: 'Build or port it, with docs, credits and release notes.' },
    { id: 'verify', title: 'Verify the exact build', summary: 'Run the checks and test it on your unit.' },
    { id: 'submit', title: 'Submit for first review', summary: 'Open a pull request. The owner reviews every first release.' },
    { id: 'publish', title: 'Check the published download', summary: 'Check the live version and its download.' },
  ],
  update: [
    { id: 'prepare', title: 'Change, version and document', summary: 'Make the change, raise the version, write release notes.' },
    { id: 'verify', title: 'Verify the exact build', summary: 'Run the checks and test it on your unit.' },
    { id: 'submit', title: 'Request publication in the PR', summary: 'Registered authors tick both release boxes.' },
    { id: 'publish', title: 'Verify live, then resolve', summary: 'Test the live download, then close the report.' },
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
