import { describe, expect, it } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exporter = fileURLToPath(new URL('./export-coldfire-packages.py', import.meta.url))

describe('reviewed authored ColdFire link exporter', () => {
  it('uses the vendored platform catalog source while retaining the legacy source path', () => {
    const paths = JSON.parse(execFileSync('python3', ['-B', '-c', String.raw`
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('exporter',sys.argv[1]);e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
print(json.dumps([e.catalog_source(True),e.catalog_source(False),e.manifest_source('loader',True,('loader',)),e.manifest_source('euclid',True,('loader',)),e.manifest_source('loader',False,('loader',))]))
`, exporter], { encoding: 'utf8' }))
    expect(paths).toEqual(['platform/dsp-dynload-transport/catalog.s', 'modules/dsp-dynload-transport/catalog.s', 'platform/loader/manifest.py', 'modules/euclid/manifest.py', 'modules/loader/manifest.py'])
  })

  it('refuses an unreviewed private SDK before importing or assembling native code', () => {
    const root = mkdtempSync(join(tmpdir(), 'modwerk-cf-export-')), app = join(root, 'app'), sdk = join(root, 'private')
    mkdirSync(join(app, 'sdk'), { recursive: true })
    writeFileSync(join(app, 'sdk/catalog.json'), JSON.stringify({ sourceRevision: 'a'.repeat(40) }))
    for (const group of ['modules', 'platform', 'tools', 'dsp', 'licenses']) for (const folder of [join(app, 'sdk/octabam', group), join(sdk, group)]) {
      mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'source.py'), 'value=1\n')
    }
    writeFileSync(join(sdk, 'platform/source.py'), 'value=2\n')
    try {
      const result = spawnSync('python3', ['-B', exporter, sdk, join(root, 'output'), '--app', app, '--vendored-sdk', '--oracles-only'], { encoding: 'utf8' })
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('Private SDK differs from reviewed source: platform')
      expect(result.stderr).not.toContain('toolpath')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
