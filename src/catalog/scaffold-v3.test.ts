import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import MACHINES from '../devices/machines.generated.json'
import type { MachineProfile } from '../devices/machine-contract'
import { parseElemodBuild, parseModwerkModule, requireModwerkPublication } from './module-contract-v3'

describe('elemod SDK scaffold', () => {
  it('creates a valid contract v3 draft for each elemod machine and refuses machines without an SDK', () => {
    const output = mkdtempSync(resolve(tmpdir(), 'modwerk-scaffold-test.'))
    try {
      for (const machine of ['digitakt', 'digitone']) {
        execFileSync(process.execPath, ['scripts/scaffold-module.mjs', 'proof-' + machine, '--machine', machine, '--author', 'example-author', '--output', output])
        const folder = resolve(output, 'proof-' + machine)
        const document = parseModwerkModule(JSON.parse(readFileSync(resolve(folder, 'modwerk.module.json'), 'utf8')), MACHINES as MachineProfile[])
        expect(document).toMatchObject({ id: 'proof-' + machine, machine, maintainers: ['example-author'], evidence: { tier: 'none' } })
        expect(parseElemodBuild(JSON.parse(readFileSync(resolve(folder, 'build.json'), 'utf8')), document).sources).toEqual(['src/main.c'])
        expect(() => requireModwerkPublication(document)).toThrow()
        for (const file of ['README.md', 'TESTING.md', 'LICENSE', 'src/main.c', 'media/thumbnail.svg']) expect(existsSync(resolve(folder, file))).toBe(true)
        expect(readFileSync(resolve(folder, 'LICENSE'), 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE')
        expect(readFileSync(resolve(folder, 'LICENSE'), 'utf8')).not.toContain('Elastic License')
      }
      const refused = spawnSync(process.execPath, ['scripts/scaffold-module.mjs', 'proof-x', '--machine', 'syntakt', '--author', 'example-author', '--output', output], { encoding: 'utf8' })
      expect(refused.status).not.toBe(0)
      expect(refused.stderr).toContain('no module SDK yet')
    } finally { rmSync(output, { recursive: true, force: true }) }
  })

  it('creates a Zoom effect (zdl) with its 8.3 file, an MIT licence and no source or build here', () => {
    const output = mkdtempSync(resolve(tmpdir(), 'modwerk-scaffold-test.'))
    try {
      execFileSync(process.execPath, ['scripts/scaffold-module.mjs', 'tape-shimmer-delay', '--machine', 'zoom-ms-70cdr', '--author', 'example-author', '--output', output])
      const folder = resolve(output, 'tape-shimmer-delay')
      const document = parseModwerkModule(JSON.parse(readFileSync(resolve(folder, 'modwerk.module.json'), 'utf8')), MACHINES as MachineProfile[])
      expect(document).toMatchObject({ machine: 'zoom-ms-70cdr', category: 'effects', platform: { kind: 'zdl', file: 'TapeShim.ZDL', pedals: [{ machine: 'zoom-ms-70cdr', status: 'untested' }] } })
      expect(() => requireModwerkPublication(document)).toThrow()
      for (const file of ['README.md', 'TESTING.md', 'LICENSE', 'media/thumbnail.svg']) expect(existsSync(resolve(folder, file))).toBe(true)
      for (const file of ['build.json', 'src']) expect(existsSync(resolve(folder, file))).toBe(false)
      expect(readFileSync(resolve(folder, 'LICENSE'), 'utf8')).toMatch(/MIT License\n\nCopyright \(c\) \d{4} example-author/)
      expect(readFileSync(resolve(folder, 'README.md'), 'utf8')).toContain('sdk/machines/zoom-ms-70cdr/README.md')
    } finally { rmSync(output, { recursive: true, force: true }) }
  })
})
