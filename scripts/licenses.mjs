import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOTICE_NAME, NOTICE_PAGE, renderLicenseNotices, renderLicensePage, renderVendorNotices } from './license-notices.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const write = process.argv.includes('--write')
const notices = await renderLicenseNotices(root)
// The site also ships the vendored Digitakt/Digitone builder; the Octatrack SDK copy stays its own.
// Website acknowledgements stay outside the native source inventory.
const usbCredits = await readFile(resolve(root, 'docs/USB_AUDIO_ATTRIBUTION.txt'), 'utf8')
const audioPackage = JSON.parse(await readFile(resolve(root, 'node_modules/wavesurfer.js/package.json'), 'utf8'))
const audioCredits = ['WaveSurfer.js ' + audioPackage.version, 'SPDX: BSD-3-Clause',
  'Used in: website audio players', 'Notice source: https://github.com/katspaugh/wavesurfer.js/blob/v' + audioPackage.version + '/LICENSE', '',
  (await readFile(resolve(root, 'node_modules/wavesurfer.js/LICENSE'), 'utf8')).trimEnd()].join('\n') + '\n'
const site = notices + '\n' + '='.repeat(72) + '\n\n' + await renderVendorNotices(root)
  + '\n' + '='.repeat(72) + '\n\n' + usbCredits
  + '\n' + '='.repeat(72) + '\n\n' + audioCredits
for (const [relativePath, content] of [
  ['sdk/octabam/licenses/' + NOTICE_NAME, notices],
  ['public/licenses/' + NOTICE_NAME, site],
  ['public/licenses/' + NOTICE_PAGE, renderLicensePage(site)],
]) {
  const path = resolve(root, relativePath)
  if (write) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  } else if (await readFile(path, 'utf8') !== content) {
    throw new Error(relativePath + ': licence notices are stale. Run npm run licenses:generate.')
  }
}
console.log('Full component notices, module SPDX declarations and distribution copies verified.')
