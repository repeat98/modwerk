import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const NOTICE_NAME = 'THIRD_PARTY_NOTICES.txt'
export const NOTICE_PAGE = 'THIRD_PARTY_NOTICES.html'

/** Platform terms belong in the site's notices, never the native SDK bundle. */
export async function renderPlatformNotices(root) {
  const scope = (await readFile(resolve(root, 'LICENSE'), 'utf8')).trimEnd()
  const elastic = (await readFile(resolve(root, 'LICENSES/Elastic-2.0.txt'), 'utf8')).trimEnd()
  const gpl = (await readFile(resolve(root, 'LICENSES/GPL-3.0-or-later.txt'), 'utf8')).trimEnd()
  const manifest = JSON.parse(await readFile(resolve(root, 'LICENSES/platform.json'), 'utf8'))
  return [scope, 'Pipeline files (Elastic-2.0):', ...manifest.pipelineFiles, '', 'Shared helpers (GPL-3.0-or-later OR Elastic-2.0):', ...manifest.sharedFiles,
    '', 'Full Elastic License 2.0 terms:', elastic, '', 'Full GPL-3.0-or-later terms:', gpl].join('\n') + '\n'
}

export function renderLicensePage(notices) {
  const escaped = notices.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Copyright &amp; licence notices · Octamod</title><style>body{max-width:80ch;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui,sans-serif;background:#19191c;color:#e5e4e9}a{color:#c4baff}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 ui-monospace,monospace}</style></head><body><main><h1>Copyright &amp; licence notices</h1><p><a href="THIRD_PARTY_NOTICES.txt" download>Download the full text bundle</a></p><pre>' + escaped + '</pre></main></body></html>\n'
}

/** Preserve full component notices in both the source tree and distributed artifacts. */
export async function renderLicenseNotices(root) {
  const folder = resolve(root, 'sdk/octabam/licenses')
  const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.components)) throw new Error('Invalid licence inventory')
  const notices = new Map()
  const sections = []
  for (const component of manifest.components) {
    if (notices.has(component.id) || !/^[a-z0-9-]+\.txt$/.test(component.noticeFile) || !component.spdx || !component.sources?.length || !component.usedIn?.length) throw new Error('Invalid component notice: ' + component.id)
    const notice = (await readFile(resolve(folder, component.noticeFile), 'utf8')).trimEnd()
    if (!notice.includes('Copyright') || notice.length < 500) throw new Error('Incomplete component notice: ' + component.id)
    notices.set(component.id, { ...component, notice })
    sections.push([component.name, 'SPDX: ' + component.spdx, 'Used in: ' + component.usedIn.join('; '), ...component.sources.map(source => 'Notice source: ' + (source.url ?? source.path)), '', notice].join('\n'))
  }
  for (const [id, components] of Object.entries(manifest.moduleComponents)) {
    const moduleFolder = resolve(root, 'sdk/octabam/modules', id)
    const document = JSON.parse(await readFile(resolve(moduleFolder, 'octamod.module.json'), 'utf8'))
    const terms = (await readFile(resolve(moduleFolder, document.license.file), 'utf8')).trimEnd()
    const expectedSpdx = ['MIT', ...components.map(component => {
      if (!notices.has(component)) throw new Error('Unknown component: ' + component)
      if (!terms.includes(notices.get(component).notice)) throw new Error(id + ': preserve full ' + component + ' notice in ' + document.license.file)
      return notices.get(component).spdx
    })].filter((spdx, index, all) => all.indexOf(spdx) === index).join(' AND ')
    if (document.license.spdx !== expectedSpdx) throw new Error(id + ': expected SPDX ' + expectedSpdx)
  }
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const installed = (await readFile(resolve(root, 'node_modules', name, 'LICENSE'), 'utf8')).trimEnd()
    if (installed !== notices.get('react').notice) throw new Error(name + ': installed runtime licence changed; update the notice inventory')
  }
  const header = ['Octamod third-party copyright and licence notices', '',
    'Octamod is independent and unofficial; not affiliated with, endorsed by or supported by Elektron.',
    'These terms apply to the identified components, not to Elektron firmware.',
    'Do not upload, share or redistribute original or generated firmware images.',
    'Retain applicable component notices and full terms with source and binary distributions.',
    'Source patch licences apply to those patches; fetched toolchains are not bundled in the app.',
    manifest.noticeSources].join('\n')
  return header + '\n\n' + sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n'
}

/** Notices for the vendored Digitakt/Digitone builder (vendor/licenses), kept out of the Octatrack SDK tree. */
export async function renderVendorNotices(root) {
  const folder = resolve(root, 'vendor/licenses')
  const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.components) || !manifest.components.length) throw new Error('Invalid vendored licence inventory')
  const sections = [], seen = new Set()
  for (const component of manifest.components) {
    if (seen.has(component.id) || !/^[a-z0-9-]+\.txt$/.test(component.noticeFile) || !component.spdx || !component.sources?.length || !component.usedIn?.length) throw new Error('Invalid component notice: ' + component.id)
    seen.add(component.id)
    const notice = (await readFile(resolve(folder, component.noticeFile), 'utf8')).trimEnd()
    if (!notice.includes('Copyright') || notice.length < 500) throw new Error('Incomplete component notice: ' + component.id)
    sections.push([component.name, 'SPDX: ' + component.spdx, 'Used in: ' + component.usedIn.join('; '), ...component.sources.map(source => 'Notice source: ' + (source.url ?? source.path)), '', notice].join('\n'))
  }
  return sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n'
}
