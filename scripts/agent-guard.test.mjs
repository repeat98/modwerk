import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { refusal } from './agent-guard.mjs'

const call = (command, run_in_background = false) => refusal({ tool_name: 'Bash', tool_input: { command, run_in_background } })

describe('agent guard', () => {
  it('lets ordinary commands, short sleeps and the documented serve loop in the background run', () => {
    for (const command of ['npm run pr:ready', 'npm test', 'git log -1', 'sleep 5 && gh pr checks 1', 'tail -n 40 out.log', 'npm run device -- try A.mwrm --seconds 120',
      'npm run device:price -- --base 945cc074 --scene "bank C pattern C01" vibrato', 'npm run device:price -- --out x.json FILE.mwrm', 'echo "npm run dev"',
      'grep -n "curve" scripts/octatrack-price.mjs', 'node --check scripts/octatrack-price.mjs', 'npx vitest run scripts/octatrack-price.test.mjs', 'git diff -- scripts/octatrack-price.mjs'])
      expect(call(command), command).toBeNull()
    expect(call('while [ -f scripts/device.mjs ]; do npm run device -- serve --share /tmp/s.sock; sleep 1; done', true)).toBeNull()
    expect(call('npm run dev &')).toBeNull()
    expect(call("git commit -F - <<'EOF'\nDocs: never tail -f or sleep 90 in a session\nEOF")).toBeNull()
    expect(call(`gh pr create --body "$(cat <<'EOF'\nsleep 300 "quoted" npm run dev\nEOF\n)"`)).toBeNull()
  })

  it('refuses what never ends in the foreground, long sleeps, long trials and an unnamed price sweep', () => {
    expect(call('tail -f /tmp/log')).toMatch(/never ends/)
    expect(call('tail -n 40 -f /tmp/log')).toMatch(/never ends/)
    expect(call('npm run dev')).toMatch(/never ends/)
    expect(call('npm run device -- serve --share /tmp/s.sock')).toMatch(/never ends/)
    expect(call('sleep 45; sleep 30; echo done')).toMatch(/75 s/)
    expect(call('sleep 2m')).toMatch(/120 s/)
    expect(call('npm run device -- try A.mwrm --seconds 1500')).toMatch(/two minutes/)
    expect(call('npm run device:price -- --base 945cc074 --scene "bank A, pattern 1" --seconds 8')).toMatch(/every USB package/)
    expect(call('npm run device:price')).toMatch(/every USB package/)
    expect(call('node scripts/octatrack-price.mjs --seconds 8')).toMatch(/every USB package/)
    expect(call('node -B /x/scripts/octatrack-price.mjs')).toMatch(/every USB package/)
  })

  it('runs anything the developer asked for with MODWERK_GUARD=off', () => {
    expect(call('MODWERK_GUARD=off npm run device -- try A.mwrm --seconds 1500')).toBeNull()
  })

  it('refuses through the hook with exit 2 and a reason on stderr', () => {
    const script = fileURLToPath(new URL('./agent-guard.mjs', import.meta.url))
    const run = input => spawnSync(process.execPath, [script], { input, encoding: 'utf8' })
    const refused = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'tail -F x.log' } }))
    expect(refused.status).toBe(2)
    expect(refused.stderr).toMatch(/MODWERK_GUARD=off/)
    expect(run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })).status).toBe(0)
    expect(run('not json').status).toBe(0)
  })
})
