import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { parseModuleDocument, requireModuleUiForPublication, requireModuleQualificationForPublication, parseModuleResourceImpact } from './module-contract'
import { requireModuleResourceImpact } from './resource-impact'

describe('SDK developer scaffolds', () => {
  it('creates coherent DSP and CPU declarations with author attribution and a failing qualification gate', () => {
    const output = mkdtempSync(resolve(tmpdir(), 'octamod-scaffold-test.'))
    try {
      for (const kind of ['dsp', 'coldfire']) {
        const id = 'proof-' + kind
        execFileSync(process.execPath, ['scripts/scaffold-module.mjs', id, '--kind', kind, '--author', 'example-author', '--output', output])
        const folder = resolve(output, id)
        const doc = parseModuleDocument(JSON.parse(readFileSync(resolve(folder, 'octamod.module.json'), 'utf8')))
        expect(doc.id).toBe(id)
        expect(doc.author.github).toBe('example-author')
        expect(doc.tests.hardwareStatus).toBe('untested')
        expect(doc.access?.screenshots).toEqual([])
        expect(()=>requireModuleUiForPublication(doc)).toThrow('actual screenshots')
        expect(()=>requireModuleQualificationForPublication(doc)).toThrow('worst-case cycles, exact memory and hardware')
        expect(()=>requireModuleResourceImpact(doc)).toThrow('release requires populated')
        expect(()=>parseModuleResourceImpact(JSON.parse(readFileSync(resolve(folder,'resource-impact.example.json'),'utf8')))).toThrow('level')
        const pending=JSON.parse(readFileSync(resolve(folder,'qualification.example.json'),'utf8'))
        expect(pending.hardware.status).toBe('pending')
        expect(()=>parseModuleDocument({...doc,tests:{...doc.tests,qualification:pending}})).toThrow()
        const native = readFileSync(resolve(folder, 'manifest.py'), 'utf8')
        expect(native).toContain('author="example-author"')
        // The chooser shows the module's own name, never the template's.
        if (kind === 'dsp') {
          expect(native).toContain('abbr=b"PROO"')
          expect(native).toContain('fullname=b"Proof Dsp"')
        }
        // The README has every section a listed module needs, and points at the dev loop.
        const readme = readFileSync(resolve(folder, 'README.md'), 'utf8')
        for (const section of ['Overview', 'Controls', 'Usage', 'Compatibility and limitations', 'Tests and measurements', 'Authorship and licences', 'Screens and audio']) expect(readme).toContain('## ' + section)
        expect(readme).toContain('npm run module:dev -- ' + id)
        expect(native).toContain('proof=Proof.UNTESTED')
        expect(native).toContain('modules/' + id + '/verify.py')
        expect(native).not.toContain('verify_template.py')
        for (const file of ['README.md', 'TESTING.md', 'LICENSE', 'qualification.example.json', 'resource-impact.example.json', kind === 'dsp' ? 'engine.asm' : 'unit.s']) expect(existsSync(resolve(folder, file))).toBe(true)
        const gate = spawnSync('python3', [resolve(folder, 'verify.py')], { encoding: 'utf8' })
        expect(gate.status).not.toBe(0)
        expect(gate.stderr).toContain('Untested development scaffold')
        const retry = spawnSync(process.execPath, ['scripts/scaffold-module.mjs', id, '--author', 'example-author', '--output', output], { encoding: 'utf8' })
        expect(retry.status).not.toBe(0)
        expect(retry.stderr).toContain('refusing to replace')
      }
      const unsafe = spawnSync(process.execPath, ['scripts/scaffold-module.mjs', '../escape', '--author', 'example-author', '--output', output], { encoding: 'utf8' })
      expect(unsafe.status).not.toBe(0)
      expect(existsSync(resolve(output, 'escape'))).toBe(false)
      // Without --output a new module goes to sdk/drafts/, and an id a listed module has is refused before anything is written.
      const listed = spawnSync(process.execPath, ['scripts/scaffold-module.mjs', 'miniverb', '--kind', 'dsp', '--author', 'example-author'], { encoding: 'utf8' })
      expect(listed.status).not.toBe(0)
      expect(listed.stderr).toContain('A listed module is already called miniverb')
      expect(existsSync(resolve('sdk/drafts/miniverb'))).toBe(false)
    } finally { rmSync(output, { recursive: true, force: true }) }
  })
})
