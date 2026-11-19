import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderLicenseNotices, renderLicensePage } from './license-notices.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('shows notice text without interpreting upstream text as HTML', () => {
  const page = renderLicensePage('Copyright <script>alert(1)</script> & terms')
  assert.ok(page.includes('Copyright &lt;script&gt;alert(1)&lt;/script&gt; &amp; terms'))
  assert.ok(!page.includes('<script>'))
})

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'octamod-notices-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(resolve(project, 'sdk/octabam/licenses'), resolve(root, 'sdk/octabam/licenses'), { recursive: true })
  const manifest = JSON.parse(await readFile(resolve(root, 'sdk/octabam/licenses/manifest.json'), 'utf8'))
  for (const id of Object.keys(manifest.moduleComponents)) {
    const folder = 'sdk/octatrack/modules/' + id
    await mkdir(resolve(root, folder), { recursive: true })
    for (const file of ['octamod.module.json', 'LICENSE']) await cp(resolve(project, folder, file), resolve(root, folder, file))
  }
  for (const name of ['react', 'react-dom', 'scheduler']) {
    await mkdir(resolve(root, 'node_modules', name), { recursive: true })
    await cp(resolve(project, 'node_modules', name, 'LICENSE'), resolve(root, 'node_modules', name, 'LICENSE'))
  }
  return root
}

test('rejects a source subset that omits the adapted component notice', async t => {
  const root = await fixture(t)
  await writeFile(resolve(root, 'sdk/octatrack/modules/tapehead/LICENSE'), await readFile(resolve(project, 'sdk/octabam/LICENSE')))
  await assert.rejects(renderLicenseNotices(root), /preserve full jsfxclones notice/)
})

test('rejects an SPDX declaration that differs from the module\'s components', async t => {
  const root = await fixture(t)
  const path = resolve(root, 'sdk/octatrack/modules/tapehead/octamod.module.json')
  const document = JSON.parse(await readFile(path, 'utf8'))
  document.license.spdx = 'MIT AND ISC'
  await writeFile(path, JSON.stringify(document))
  await assert.rejects(renderLicenseNotices(root), /tapehead: expected SPDX MIT$/)
})

test('rejects a dependency update whose licence differs from the shipped notice', async t => {
  const root = await fixture(t)
  await writeFile(resolve(root, 'node_modules/react-dom/LICENSE'), 'Changed dependency terms')
  await assert.rejects(renderLicenseNotices(root), /installed runtime licence changed/)
})
