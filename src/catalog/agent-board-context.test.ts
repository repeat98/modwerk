import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
// Agents use the board because the commands they already run read and write claims, and the files they read say so
// (docs/AGENT_BOARD.md, "Making agents use it"). A later edit that drops one of these breaks that, so it fails here.
describe('the agent board stays in the context agents read and the commands they run', () => {
  it('is named where an agent plans, claims and pushes', () => {
    expect(read('AGENTS.md')).toContain('the [agent board](docs/AGENT_BOARD.md)')
    expect(read('AGENTS.md')).toContain('never work around a claim')
    for (const folder of ['.claude/skills', '.agents/skills']) {
      expect(read(folder + '/modwerk-new-module/SKILL.md')).toContain('npm run board -- list module')
      expect(read(folder + '/modwerk-new-module/SKILL.md')).toContain('Never work around a claim')
      expect(read(folder + '/modwerk-pr-ready/SKILL.md')).toContain('claims on the agent board')
      expect(read(folder + '/modwerk-start/SKILL.md')).toContain('npm run board -- login')
      expect(read(folder + '/modwerk-update-module/SKILL.md')).toContain('npm run board -- claim module')
      expect(read(folder + '/modwerk-review-prs/SKILL.md')).toContain('the agent board')
    }
    expect(read('docs/DEVELOPER_WORKFLOW.md')).toContain('npm run board -- list module')
    const hooks = read('docs/module-guides/README.md').split('### Propose a hook').slice(1)
    expect(hooks.slice(0, 2).every(section => section.split('\n### ')[0].includes('[agent board](../AGENT_BOARD.md)'))).toBe(true)
    expect(read('docs/MAINTENANCE.md')).toContain('**The agent board**')
    expect(read('docs/FRONTEND_MCP.md')).toContain('## The agent board')
  })
  it('is read and written by module:new, module:doctor, pr:ready, check and the MCP', () => {
    expect(read('scripts/scaffold-module.mjs')).toContain('board.boardSnapshot(')
    expect(read('scripts/scaffold-module.mjs')).toContain('await claimModule()')
    expect(read('scripts/module-doctor.mjs')).toContain('board.moduleClaimLine(')
    expect(read('scripts/pr-ready.mjs')).toContain("await boardClaims(root, base, await import('./agent-board.mjs'))")
    expect(read('scripts/check.mjs')).toContain("run('board', ['check', '--base', base])")
    const mcp = read('scripts/frontend-mcp.mjs')
    for (const tool of ['board_claims', 'board_claim', 'board_release']) expect(mcp).toContain("tool('" + tool + "'")
    expect(mcp).toContain('call board_claims; claims are other developers')
    expect(JSON.parse(read('package.json')).scripts.board).toBe('node scripts/agent-board.mjs')
  })
})
