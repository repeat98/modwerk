import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it.each(['--help', '-h'])('prints device help for %s without connecting to a bridge', flag => {
  const result = spawnSync(process.execPath, [
    join(import.meta.dirname, 'device.mjs'), flag, '--socket', join(import.meta.dirname, 'absent.sock'),
  ], { encoding: 'utf8' })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('serve [--share')
  expect(result.stdout).toContain('stats')
  expect(result.stderr).toBe('')
})
