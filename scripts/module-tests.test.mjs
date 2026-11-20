import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listedModuleTests, moduleTestFiles, runModuleTests } from './module-tests.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

describe('module host tests', () => {
  it('finds test_*.py at any depth in a module folder, and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'modwerk-module-tests.'))
    try {
      mkdirSync(join(dir, 'm/deeper/__pycache__'), { recursive: true })
      for (const file of ['m/test_a.py', 'm/deeper/test_b.py', 'm/emulator_test.py', 'm/deeper/__pycache__/test_c.py', 'm/test_notes.md']) writeFileSync(join(dir, file), '')
      expect(moduleTestFiles(dir, 'm')).toEqual(['m/deeper/test_b.py', 'm/test_a.py'])
      expect(moduleTestFiles(dir, 'missing')).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('lists the listed modules\' host tests for sdk:check, never a draft\'s or an emulator script', () => {
    const files = listedModuleTests(root)
    expect(files).toContain('sdk/octatrack/modules/pattern-sample-locks/test_native_commit.py')
    expect(files.some(file => file.startsWith('sdk/drafts/') || file.startsWith('sdk/octabam/'))).toBe(false)
    expect(files.some(file => file.endsWith('emulator_test.py'))).toBe(false)
  })

  it('runs each as a script and names the error of one that fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'modwerk-module-tests.'))
    try {
      writeFileSync(join(dir, 'test_pass.py'), 'import unittest\nclass T(unittest.TestCase):\n    def test_x(self): pass\nif __name__ == "__main__": unittest.main()\n')
      writeFileSync(join(dir, 'test_fail.py'), 'import unittest\nclass T(unittest.TestCase):\n    def test_x(self): self.assertEqual(1, 2)\nif __name__ == "__main__": unittest.main()\n')
      const [pass, fail] = runModuleTests(dir, ['test_pass.py', 'test_fail.py'])
      expect(pass).toEqual({ file: 'test_pass.py', ok: true, detail: '' })
      expect(fail.ok).toBe(false)
      expect(fail.detail).toBe('AssertionError: 1 != 2')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
