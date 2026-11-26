import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freeFx2Ids } from './module-list.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const moduleCheckTimeout = 30_000
const catalogCheckTimeout = 120_000
const doctor = (...args) => spawnSync(process.execPath, ['scripts/module-doctor.mjs', ...args], {
  cwd: root, encoding: 'utf8', timeout: args.includes('--all') ? catalogCheckTimeout : moduleCheckTimeout,
})

// Owner requirement, 6 October 2026: every module always integrates with the existing workflows. This is that requirement, enforced.
describe('module doctor', () => {
  it('finds every catalog module and every Digitakt and Digitone module integrated with the existing workflows', () => {
    const result = doctor('--all')
    expect(result.error).toBeUndefined()
    expect(result.stdout + result.stderr).not.toContain('✗')
    expect(result.status).toBe(0)
    for (const id of ['miniverb', 'sidechain-compressor', 'analog-bassdrum', 'euclid', 'digihealth']) expect(result.stdout).toContain(id)
    // The re-test queue is a report at the end: it lists, it never turns the run red.
    expect(result.stdout).toContain('Due for a re-run on the unit (a report: it fails nothing)')
  }, catalogCheckTimeout + 5000)
  // A machine page's controls come from modwerk_page_control(), which picks stock's switch for two to five values; a page written
  // by hand before the helper existed is told, not refused.
  it('tells a module that writes its page descriptor by hand about the shared helper', () => {
    expect(doctor('analog-bassdrum').stdout).toMatch(/· page controls\s+control\.c writes its page descriptor by hand/)
  }, moduleCheckTimeout + 5000)
  // The draft's copy under sdk/octatrack/modules/ is visible to anything reading that folder while it runs, so npm run check defers
  // this test from its parallel stage (SDK suite, other test files, build) and runs it alone afterwards.
  it.skipIf(process.env.MODWERK_DEFER_DRAFT_DOCTOR === '1')('checks a draft where every gate looks and leaves no copy behind', () => {
    // Any draft with a manifest that is not also a listed module; the fast loop keeps unqualified work in sdk/drafts/.
    const draft = readdirSync(join(root, 'sdk/drafts')).find(name => existsSync(join(root, 'sdk/drafts', name, 'octamod.module.json')) && !existsSync(join(root, 'sdk/octatrack/modules', name)))
    expect(draft, 'a draft to check').toBeTruthy()
    const result = doctor('--draft', draft)
    expect(result.stdout).toContain(draft + ' (Octatrack)')
    expect(result.stdout).toContain('usb package')
    expect(result.stdout).not.toContain('Node.js v')
    // The gate compares the draft too, so a clash shows before the catalogue lists it.
    expect(result.stdout).toMatch(/[✓✗] cross-compatibility/)
    expect(result.stdout).not.toContain('once it is listed')
    expect(existsSync(join(root, 'sdk/octatrack/modules', draft))).toBe(false)
    expect(doctor('--draft', 'no-such-draft').status).toBe(2)
  }, moduleCheckTimeout + 5000)
  // What npm run module:new writes is where every new author starts: it must pass the draft's experimental lines as it is, and
  // build where the toolchain is (the same tools module-dev.test.mjs looks for). Named so npm run check runs it alone, with the test above.
  it.skipIf(process.env.MODWERK_DEFER_DRAFT_DOCTOR === '1')('checks a draft where every gate looks: a fresh module:new draft of each kind', () => {
    const upstream = join(homedir(), '.cache/modwerk-upstream')
    const tools = existsSync(join(upstream, 'elekloader/elekloader')) && existsSync(process.env.ELEKLOADER_DSP_ASM ?? join(upstream, 'octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm'))
    // A ColdFire draft also needs m68k-elf binutils on PATH (scripts/module-dev-package.py).
    const onPath = tool => (process.env.PATH ?? '').split(delimiter).some(dir => dir && existsSync(join(dir, tool)))
    const binutils = ['as', 'ld', 'readelf', 'objcopy', 'nm'].every(tool => onPath('m68k-elf-' + tool))
    const out = mkdtempSync(join(tmpdir(), 'modwerk-fresh-draft.'))
    for (const kind of ['dsp', 'coldfire']) {
      const id = 'zz-fresh-' + kind + '-' + process.pid
      try {
        const made = spawnSync(process.execPath, ['scripts/scaffold-module.mjs', id, '--kind', kind, '--author', 'example-author'], { cwd: root, encoding: 'utf8', env: { ...process.env, MODWERK_BOARD: 'off' } })
        expect(made.status, made.stderr).toBe(0)
        const result = doctor('--draft', id)
        // Once stock and the listed modules hold every FX2 id the build takes, a new effect is told so plainly (owner, 25 November 2026).
        if (kind === 'dsp' && !freeFx2Ids(root).length) { expect(made.stderr).toContain('No FX2 id is left'); expect(result.stdout).toContain('no FX2 id is left'); continue }
        expect(result.stdout).toContain('The experimental lines are green')
        expect(result.status, result.stdout).toBe(0)
        if (tools && (kind === 'dsp' || binutils)) {
          const built = spawnSync(process.execPath, ['scripts/module-dev.mjs', id, '--build-only', '--out', join(out, id + '.mwrm')], { cwd: root, encoding: 'utf8', timeout: 120_000 })
          expect(built.status, built.stdout + built.stderr).toBe(0)
        }
      } finally { rmSync(join(root, 'sdk/drafts', id), { recursive: true, force: true }) }
      expect(existsSync(join(root, 'sdk/octatrack/modules', id))).toBe(false)
    }
    rmSync(out, { recursive: true, force: true })
  }, 2 * moduleCheckTimeout + 2 * 120_000)
  // A port starts from upstream's files at the commit checked out, a reference model, its host test and gates on the shared harness
  // (sdk/octatrack/tools/dsp_gate.py). As written it must pass the experimental lines; its own host test fails until it is ported.
  it.skipIf(process.env.MODWERK_DEFER_DRAFT_DOCTOR === '1')('checks a draft where every gate looks: a module:new port of an Airwindows plugin', () => {
    const clone = mkdtempSync(join(tmpdir(), 'modwerk-airwindows.')), plugin = join(clone, 'plugins/LinuxVST/src/Fakeity')
    const git = (...args) => execFileSync('git', ['-C', clone, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { encoding: 'utf8' })
    mkdirSync(plugin, { recursive: true })
    writeFileSync(join(clone, 'LICENSE'), 'MIT License\n\nCopyright (c) 2018 Example Author\n')
    writeFileSync(join(plugin, 'FakeityProc.cpp'), 'void processReplacing() {}\n')
    git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'one')
    const revision = git('rev-parse', 'HEAD').trim()
    writeFileSync(join(plugin, 'FakeityProc.cpp'), 'an edit not committed\n')
    const id = 'zz-port-' + process.pid, draft = join(root, 'sdk/drafts', id)
    const scaffold = (...args) => spawnSync(process.execPath, ['scripts/scaffold-module.mjs', ...args, '--author', 'example-author'], { cwd: root, encoding: 'utf8', env: { ...process.env, MODWERK_BOARD: 'off' } })
    try {
      expect(scaffold(id, '--kind', 'coldfire', '--port', 'airwindows', '--upstream', plugin).stderr).toContain('--kind dsp --port airwindows')
      expect(scaffold(id, '--kind', 'dsp', '--port', 'airwindows', '--upstream', clone).stderr).toContain('name the plugin\'s folder')
      expect(existsSync(draft)).toBe(false)
      const made = scaffold(id, '--kind', 'dsp', '--port', 'airwindows', '--upstream', plugin)
      expect(made.status, made.stderr).toBe(0)
      // Upstream's bytes at HEAD, not the working tree, each recorded for sdk/imports/.
      expect(readFileSync(join(draft, 'upstream/FakeityProc.cpp'), 'utf8')).toBe('void processReplacing() {}\n')
      const record = JSON.parse(readFileSync(join(draft, 'import-record.json'), 'utf8'))
      expect(record.revision).toBe(revision)
      expect(record.files.map(file => file.path)).toEqual(['upstream/FakeityProc.cpp', 'upstream/LICENSE'])
      expect(readFileSync(join(draft, 'LICENSE'), 'utf8')).toContain('Example Author')
      const manifest = JSON.parse(readFileSync(join(draft, 'octamod.module.json'), 'utf8'))
      expect(manifest.source).toEqual({ repository: 'https://github.com/airwindows/airwindows', revision, path: 'plugins/LinuxVST/src/Fakeity' })
      for (const file of ['reference.py', 'test_reference.py', 'verify.py', 'perf.py', 'engine.asm']) expect(existsSync(join(draft, file)), file).toBe(true)
      expect(readFileSync(join(draft, 'verify.py'), 'utf8')).toContain('import dsp_gate as G')
      const host = spawnSync('python3', ['-B', join(draft, 'test_reference.py')], { encoding: 'utf8' })
      expect(host.status).not.toBe(0)
      expect(host.stderr).toContain('set PORTED = True')
      const result = doctor('--draft', id)
      if (!freeFx2Ids(root).length) expect(result.stdout).toContain('no FX2 id is left')
      else {
        expect(result.stdout).toContain('The experimental lines are green')
        expect(result.status, result.stdout).toBe(0)
      }
    } finally { rmSync(draft, { recursive: true, force: true }); rmSync(clone, { recursive: true, force: true }) }
    expect(existsSync(join(root, 'sdk/octatrack/modules', id))).toBe(false)
  }, moduleCheckTimeout + 30_000)
  // npm run lint's rules on the module's own scripts, before anything is measured or stamped on them.
  it.skipIf(process.env.MODWERK_DEFER_DRAFT_DOCTOR === '1')('lints a draft\'s own scripts', () => {
    const id = 'zz-lint-' + process.pid, draft = join(root, 'sdk/drafts', id)
    try {
      const made = spawnSync(process.execPath, ['scripts/scaffold-module.mjs', id, '--kind', 'coldfire', '--author', 'example-author'], { cwd: root, encoding: 'utf8', env: { ...process.env, MODWERK_BOARD: 'off' } })
      expect(made.status, made.stderr).toBe(0)
      writeFileSync(join(draft, 'tool.mjs'), "import process from 'node:process'\nprocess.stdout.write(String(1))\n")
      expect(doctor('--draft', id).stdout).toMatch(/✓ lint +1 script pass/)
      writeFileSync(join(draft, 'tool.mjs'), 'console.log(process.argv)\n')
      const result = doctor('--draft', id).stdout
      expect(result).toMatch(/✗ lint +2 errors, first: tool\.mjs:1 'console' is not defined/)
      expect(result).toContain('npx eslint sdk/drafts/' + id)
    } finally { rmSync(draft, { recursive: true, force: true }) }
    expect(existsSync(join(root, 'sdk/octatrack/modules', id))).toBe(false)
  }, 2 * moduleCheckTimeout)
  // Two tiers: a draft is judged on what trying and sharing it needs; what listing it needs reads as still to do until --release.
  it.skipIf(process.env.MODWERK_DEFER_DRAFT_DOCTOR === '1')('judges a draft as experimental, and as a release with --release', () => {
    const draft = readdirSync(join(root, 'sdk/drafts')).find(name => existsSync(join(root, 'sdk/drafts', name, 'octamod.module.json')) && !existsSync(join(root, 'sdk/octatrack/modules', name)))
    const experimental = doctor('--draft', draft).stdout
    const [now, later] = experimental.split('  Release: before it is listed')
    expect(now).toContain('Experimental: to try it on your unit and share it')
    expect(now).toMatch(/[✓✗] cross-compatibility/)
    expect(now).toContain('npm run module:dev -- ' + draft)
    expect(later).toMatch(/○ catalog entry/)
    expect(later).not.toMatch(/^ {2}✗ /m)
    const strict = doctor('--draft', draft, '--release')
    expect(strict.stdout).not.toContain('Experimental:')
    expect(strict.stdout).toMatch(/✗ catalog entry/)
    expect(strict.status).toBe(1)
    expect(existsSync(join(root, 'sdk/octatrack/modules', draft))).toBe(false)
    expect(doctor('miniverb', '--release').status).not.toBe(0)
  }, 2 * moduleCheckTimeout + 5000)
  it('names the failing integration point and the command that fixes it', () => {
    const result = doctor('no-such-module')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('No module named no-such-module')
    // Every elemod machine's folder is searched, the Digitakt II's too (it was missing until 13 November 2026).
    for (const folder of ['sdk/digitakt/modules', 'sdk/digitakt-ii/modules', 'sdk/analog-four-mkii/modules']) expect(result.stderr).toContain(folder)
  }, moduleCheckTimeout + 5000)
})
