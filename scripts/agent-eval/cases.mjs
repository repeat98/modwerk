// Public, software-only tasks. The merge's first parent supplies the starting files.
export const cases = [
  {
    id: 'board-holder', pr: 1889, merge: '6396b149464b2dee3681473fed2dceec31216443',
    files: ['scripts/agent-board.mjs'],
    task: 'The board claim list treats an incomplete --holder filter as a real query. Reject a missing, blank or option-shaped login with an actionable error before contacting the board. Keep both valid filtered and unfiltered queries working.',
  },
  {
    id: 'diagnostic-summary', pr: 1855, merge: 'e9ba0bebcd88e4486235432450fa989ad86d0719',
    files: ['scripts/diagnostics-pull.mjs', 'src/community/octatrack-diagnostics-contract.ts', 'src/dev/address-names.ts'],
    task: 'A musician who cannot establish a USB connection disappears from the Problems section of the diagnostics summary. Include these failures in the usual newest-first list with the reported reason and the browser and OS when available. Keep older records and existing problem types working.',
  },
  {
    id: 'bold-guides', pr: 1334, merge: 'd9cba731ef5f43bc675af629ac1ac32c3fd41a13',
    files: ['scripts/pr-body.mjs', '.github/pull_request_template.md'],
    task: 'The PR description check rejects a completed guides answer when the author formats the label or question in bold Markdown. Accept inline answers and a bold question with its answer on the next paragraph. An empty heading followed by another heading still needs an answer. Preserve existing description checks.',
  },
]

export function findCase(id) {
  const item = cases.find(entry => entry.id === id)
  if (!item) throw new Error(`Unknown replay case ${id}`)
  return item
}
