import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { crlfModuleFiles, evidenceOnBaseProblem, gitStoredBytes, moduleEarlierPerformanceSourceSha256, moduleFolderSha256, moduleNativeSourceSha256, modulePerformanceSourceSha256, modulePricelessFolderSha256, procedureRecordProblem, testingVersionProblem } from './module-qualification.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('reads each file as Git stores it under the repository\'s .gitattributes', () => {
  const root = mkdtempSync(join(tmpdir(), 'git-bytes-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q')
  writeFileSync(join(root, '.gitattributes'), readFileSync(new URL('../.gitattributes', import.meta.url)))
  const files = {
    'crlf.svg': '<svg>\r\n  <path d="M0 0"/>\r\n</svg>\r\n',
    'mixed.c': 'int a;\r\nint b;\nint c;\r\n',
    'lf.py': 'x = 1\ny = 2\n',
    'lone-cr.txt': 'one\rtwo\r\n',
    'nul.bin': 'a\r\n\0b\r\n',
    'controls.bin': '\x01\x02\x03\r\nabc\r\n',
    'ctrl-z.txt': 'end\r\n\x1a',
    'utf8.md': 'Grüße — é\r\n',
  }
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text)
  git('add', '.')
  for (const name of Object.keys(files)) {
    const stored = git('cat-file', 'blob', ':' + name), here = readFileSync(join(root, name))
    expect(Buffer.from(gitStoredBytes(here)).equals(stored), name).toBe(true)
  }
  expect(gitStoredBytes(readFileSync(join(root, 'crlf.svg'))).includes(13)).toBe(false)
})

it('hashes a module with CRLF text as the LF checkout CI has, and names the CRLF files', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'crlf-')); roots.push(folder)
  const document = { id: 'echo', version: '0.1.0-experimental', tests: {} }
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(document, null, 2) + '\n')
  writeFileSync(join(folder, 'native.c'), 'int echo;\nint gain;\n')
  mkdirSync(join(folder, 'presentation')); writeFileSync(join(folder, 'presentation/thumbnail.svg'), '<svg>\n  <rect/>\n</svg>\n')
  const hashes = async () => [await moduleFolderSha256(folder), await modulePricelessFolderSha256(folder), await moduleNativeSourceSha256(folder, document), await modulePerformanceSourceSha256(folder, document)]
  const lf = await hashes()
  expect(await crlfModuleFiles(folder)).toEqual([])
  // Mackity (#2148): the thumbnail written on Windows with CRLF, the source too.
  writeFileSync(join(folder, 'presentation/thumbnail.svg'), '<svg>\r\n  <rect/>\r\n</svg>\r\n')
  writeFileSync(join(folder, 'native.c'), 'int echo;\r\nint gain;\r\n')
  expect(await hashes()).toEqual(lf)
  expect(await crlfModuleFiles(folder)).toEqual(['native.c', 'presentation/thumbnail.svg'])
  // A change Git would store is still a change.
  writeFileSync(join(folder, 'native.c'), 'int echo;\r\nint gain = 1;\r\n')
  expect((await hashes()).some((hash, i) => hash === lf[i])).toBe(false)
})

it('leaves the art out of the performance source, and keeps the earlier hash for older stamps', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'art-')); roots.push(folder)
  const document = { id: 'echo', version: '0.1.0-experimental', tests: {} }
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(document) + '\n')
  writeFileSync(join(folder, 'native.c'), 'int echo;\n')
  mkdirSync(join(folder, 'presentation')); writeFileSync(join(folder, 'presentation/thumbnail.svg'), '<svg/>\n')
  const performance = await modulePerformanceSourceSha256(folder, document), earlier = await moduleEarlierPerformanceSourceSha256(folder, document), native = await moduleNativeSourceSha256(folder, document)
  expect(earlier).not.toBe(performance)
  writeFileSync(join(folder, 'presentation/thumbnail.svg'), '<svg><circle/></svg>\n')
  expect(await modulePerformanceSourceSha256(folder, document)).toBe(performance)
  // The earlier stamp and the qualification source still cover the art, as recorded hashes on main expect.
  expect(await moduleEarlierPerformanceSourceSha256(folder, document)).not.toBe(earlier)
  expect(await moduleNativeSourceSha256(folder, document)).not.toBe(native)
  writeFileSync(join(folder, 'native.c'), 'int echo = 1;\n')
  expect(await modulePerformanceSourceSha256(folder, document)).not.toBe(performance)
})

it('refuses a new module whose tested commit is already on main, and judges no other commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const manifest = (path, evidenceRevision) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify({ tests: { evidenceRevision } })) }
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a')
  manifest('sdk/octatrack/modules/euclid/octamod.module.json', '0'.repeat(40)); git('add', '.'); git('commit', '-qm', 'main')
  const main = git('rev-parse', 'HEAD')
  git('checkout', '-qb', 'work')
  // DATAMATIC (#1103): a draft whose tested commit is main's.
  manifest('sdk/drafts/datamatic/octamod.module.json', main)
  expect(evidenceOnBaseProblem({ root, base: main })).toMatch(/^sdk\/drafts\/datamatic\/octamod\.module\.json: tests\.evidenceRevision names .*already on main/)
  git('add', '.'); git('commit', '-qm', 'draft')
  manifest('sdk/drafts/datamatic/octamod.module.json', git('rev-parse', 'HEAD'))
  expect(evidenceOnBaseProblem({ root, base: main })).toBe(null)
  // A commit from the author's own repository, and a listed module's update, are not judged.
  manifest('sdk/drafts/datamatic/octamod.module.json', 'f'.repeat(40))
  manifest('sdk/octatrack/modules/euclid/octamod.module.json', main)
  expect(evidenceOnBaseProblem({ root, base: main })).toBe(null)
})

it('asks a new version\'s TESTING.md to name it, and leaves an unchanged version alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'testing-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  const folder = 'sdk/analog-rytm-mkii/modules/qperf/'
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a')
  write(folder + 'modwerk.module.json', JSON.stringify({ version: '0.1.0-experimental' })); write(folder + 'TESTING.md', 'QT08 on 0.1.0: passed.')
  git('add', '.'); git('commit', '-qm', 'main')
  const main = git('rev-parse', 'HEAD')
  write(folder + 'README.md', 'docs only')
  expect(testingVersionProblem({ root, base: main })).toBe(null)
  write(folder + 'modwerk.module.json', JSON.stringify({ version: '0.2.0-experimental' }))
  expect(testingVersionProblem({ root, base: main })).toMatch(/^sdk\/analog-rytm-mkii\/modules\/qperf\/TESTING\.md does not name 0\.2\.0-experimental/)
  write(folder + 'TESTING.md', 'QL19 on 0.2.0: not tested on a unit yet.')
  expect(testingVersionProblem({ root, base: main })).toBe(null)
  // 0.2.0 is not 0.2.01 or 10.2.0.
  write(folder + 'TESTING.md', 'Ran 10.2.0 and 0.2.01.')
  expect(testingVersionProblem({ root, base: main })).toMatch(/does not name/)
})

it('asks a new version for the test procedure\'s record on the package it ships, and leaves drafts and unchanged versions alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'procedure-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  const ot = 'sdk/octatrack/modules/echo/', rytm = 'sdk/analog-rytm-mkii/modules/qperf/'
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a')
  write(ot + 'octamod.module.json', JSON.stringify({ version: '0.1.0-experimental' })); write(rytm + 'modwerk.module.json', JSON.stringify({ version: '0.1.0-experimental' }))
  git('add', '.'); git('commit', '-qm', 'main')
  const main = git('rev-parse', 'HEAD')
  expect(procedureRecordProblem({ root, base: main })).toBe(null)
  // An update with only a typed line, as five releases before 26 November 2026 had.
  write(ot + 'octamod.module.json', JSON.stringify({ version: '0.1.1-experimental' })); write('public/octatrack-modules/echo/0.1.1-experimental.mwrm', 'package')
  write(ot + 'TESTING.md', 'Tested on a unit: 0.1.1, MKII.')
  expect(procedureRecordProblem({ root, base: main })).toMatch(/^sdk\/octatrack\/modules\/echo\/TESTING\.md has no record of `npm run test:procedure -- echo` for 0\.1\.1/)
  // A record of another build, then of the package that ships (sha256 of "package" starts bc4a7118).
  write(ot + 'TESTING.md', '0.1.1: `npm run test:procedure -- echo --package echo.mwrm`, package `0123abcd`.')
  expect(procedureRecordProblem({ root, base: main })).toMatch(/does not name the package that ships, public\/octatrack-modules\/echo\/0\.1\.1-experimental\.mwrm/)
  write(ot + 'TESTING.md', '0.1.1: `npm run test:procedure -- echo --package echo.mwrm`, package `bc4a7118`.')
  expect(procedureRecordProblem({ root, base: main })).toBe(null)
  // Another machine: the command with its machine, and not another module whose id starts the same.
  write(rytm + 'modwerk.module.json', JSON.stringify({ version: '0.2.0-experimental' })); write(rytm + 'TESTING.md', '0.2.0: `npm run test:procedure -- analog-rytm-mkii:qperf-two`')
  expect(procedureRecordProblem({ root, base: main })).toMatch(/qperf\/TESTING\.md has no record/)
  write(rytm + 'TESTING.md', '0.2.0: `npm run test:procedure -- analog-rytm-mkii:qperf`, steps 6 to 10 not run: no USB link.')
  expect(procedureRecordProblem({ root, base: main })).toBe(null)
  // A draft in sdk/drafts/ ships nothing yet.
  write('sdk/drafts/scope/octamod.module.json', JSON.stringify({ version: '0.1.0-experimental' }))
  expect(procedureRecordProblem({ root, base: main })).toBe(null)
})

it('keeps a qualified folder retained when only a measured CPU price and its readings were added, and nothing else', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'priced-')); roots.push(folder)
  const document = { id: 'echo', version: '0.1.0-experimental', author: { name: 'Jannik A\u00dffalg' }, resources: { memory: 'small' } }
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(document, null, 2).replace(/\u00df/g, '\\u00df') + '\n')
  writeFileSync(join(folder, 'echo.c'), 'int echo;\n')
  const qualified = await moduleFolderSha256(folder), source = await moduleNativeSourceSha256(folder, { tests: {} })
  // What device:price --write adds: resources.cpuPrice, in the file's own escaping, and evidence/cpu-price.json.
  const priced = { ...document, resources: { ...document.resources, cpuPrice: { value: 7.7, unit: 'percent-of-frame', measure: 'frame-interrupt', source: 'evidence/cpu-price.json' } } }
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(priced, null, 2).replace(/\u00df/g, '\\u00df') + '\n')
  mkdirSync(join(folder, 'evidence')); writeFileSync(join(folder, 'evidence/cpu-price.json'), '{}\n')
  expect(await moduleFolderSha256(folder)).not.toBe(qualified)
  expect(await modulePricelessFolderSha256(folder)).toBe(qualified)
  expect(await moduleNativeSourceSha256(folder, { tests: {} })).toBe(source)
  // Anything else changed beside the price is a changed module.
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify({ ...priced, version: '0.1.1-experimental' }, null, 2).replace(/\u00df/g, '\\u00df') + '\n')
  expect(await modulePricelessFolderSha256(folder)).not.toBe(qualified)
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(priced, null, 2).replace(/\u00df/g, '\\u00df') + '\n')
  writeFileSync(join(folder, 'echo.c'), 'int echo = 1;\n')
  expect(await modulePricelessFolderSha256(folder)).not.toBe(qualified)
})
