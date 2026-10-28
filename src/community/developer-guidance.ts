/** The release flow shown on the Start developing page. The prompts hand the work to the module skills, and the rules behind each step live in the repository (AGENTS.md, docs/DEVELOPER_WORKFLOW.md), which every coding agent reads. */
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
