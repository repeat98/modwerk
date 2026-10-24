/** The release flow shown on the Start developing page and named in its prompts. The rules behind each step live in the repository (AGENTS.md, docs/DEVELOPER_WORKFLOW.md), which every coding agent reads. */
export type DeveloperTask = 'create' | 'update'
export type DeveloperStage = 'prepare' | 'verify' | 'submit' | 'publish'

export const RELEASE_STEPS: Record<DeveloperTask, { id: DeveloperStage; title: string; summary: string }[]> = {
  create: [
    { id: 'prepare', title: 'Prepare the module', summary: 'Build or port it with matching docs, credits, media and release notes.' },
    { id: 'verify', title: 'Verify the exact build', summary: 'Run the checks, test on your unit and record actual results.' },
    { id: 'submit', title: 'Submit for first review', summary: 'Open a Modwerk PR. Every new module currently needs owner review.' },
    { id: 'publish', title: 'Check the published download', summary: 'Follow deployment, confirm the live version and save a compatible firmware download.' },
  ],
  update: [
    { id: 'prepare', title: 'Change, version and document', summary: 'Fix or update your module; bump the version and write matching release notes.' },
    { id: 'verify', title: 'Verify the exact build', summary: 'Run the checks, test on your unit and personally review the evidence.' },
    { id: 'submit', title: 'Request publication in the PR', summary: 'Registered authors check both release boxes after personally verifying the evidence.' },
    { id: 'publish', title: 'Verify live, then resolve', summary: 'Save and test the published download before resolving a fixed report.' },
  ],
}

export const INSTRUMENT_STEPS = [
  { title: 'Research the instrument', summary: 'Establish the stock format, exact rebuild and safe recovery.' },
  { title: 'Integrate SDK and builder', summary: 'Add the profile, hooks, toolchain and measured resource budgets.' },
  { title: 'Qualify on hardware', summary: 'Test the exact build and record actual results and remaining gaps.' },
  { title: 'Owner review, then modules', summary: 'Instrument integration needs owner review before module publication.' },
]

const STAGE_RULES: Record<DeveloperTask, string> = {
  create: 'Every new module needs owner review before its first release. A push, merge or "Firmware ready" state is not a release: verify the live version and a saved download.',
  update: 'Before I check either release box in the PR, I verify the evidence myself; never check them for me. Missing, failed or untested required checks block automatic publication. Use "Related to #<number>", not closing keywords. A push or merge alone never closes a Modwerk report: resolve it only after the published download and the fix are verified on my unit.',
}

/** The release flow in a prompt: the stages by name, with the rules behind them left to the repository. */
export function developerWorkflowPrompt(task: DeveloperTask) {
  return [
    'Follow the workflow in ' + (task === 'update' ? 'AGENTS.md, docs/DEVELOPER_WORKFLOW.md and docs/MODULE_AUTHOR_UPDATES.md' : 'AGENTS.md and docs/DEVELOPER_WORKFLOW.md') + ', in these stages:',
    ...RELEASE_STEPS[task].map((step, index) => `${index + 1}. ${step.title}: ${step.summary}`),
    STAGE_RULES[task],
    'Before pushing a module update, tell me in chat that publication will notify followers, including by email unless they opted out. A push alone does not send mail.',
    'Before every push, and after merging main, run `npm run pr:ready' + (task === 'update' ? ' -- --author <my login>' : '') + '` until it says Ready, then watch the PR checks until they are green ("Make it mergeable" in docs/DEVELOPER_WORKFLOW.md).',
    'Give me concrete steps to test the exact build on my unit and record only results I actually report. My stock OS stays on my computer; never commit firmware, extracted stock code or built images.',
    'When you learn something every later developer needs, or find a bug, a fix or an improvement outside this work, offer it to me as its own small PR titled "Fix: …", "Improvement: …" or "Docs: …", in plain words (Fixes and improvements in docs/DEVELOPER_WORKFLOW.md). Never put it in the module PR.',
    'Before you run pr:ready, tell me in one line what the guides lacked or got wrong while we worked and where you fixed it ("nothing" is a fine answer); the pull request template asks for it.',
  ].join('\n')
}
