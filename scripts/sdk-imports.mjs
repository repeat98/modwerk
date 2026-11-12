// Import history remains exact for code and preserved upstream files. Local module guides are editable.
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const localGuides = new Set(['README.md', 'TESTING.md', 'CPU.md'])
export function verifyImportedFile(path, expected, moduleRoot = null) {
  let stat
  try { stat = lstatSync(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!stat?.isFile()) throw new Error('Imported file must be a regular file: ' + path)
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid recorded import checksum: ' + path)
  const bytes = readFileSync(path)
  if (moduleRoot && dirname(resolve(path)) === resolve(moduleRoot) && localGuides.has(basename(path))) {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) throw new Error(`Imported source checksum mismatch: ${path}\nExpected ${expected}\nActual   ${actual}`)
  return false
}

export function checkSdkImports(root) {
  let guides = 0, files = 0
  for (const name of ['octabam-363861e.json', 'tapehead-f890330.json']) {
    const record = JSON.parse(readFileSync(resolve(root, 'sdk/imports', name), 'utf8'))
    for (const item of record.files) {
      const parts = item.path.split('/')
      if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':')) || item.path.includes('\\')) throw new Error('Invalid import path: ' + item.path)
      const base = item.path.startsWith('modules/midi-scenes/') ? 'sdk/archive/midi-scenes-8.2' : 'sdk/octabam'
      const path = resolve(root, base, item.path)
      const moduleRoot = parts[0] === 'modules' ? resolve(root, 'sdk/octatrack/modules', parts[1]) : null
      if (verifyImportedFile(path, item.vendoredSha256, moduleRoot)) guides++
      files++
    }
  }
  // Vendored upstream trees (a record whose files land under vendor/): POSIX paths, and each hash is the committed file's bytes.
  for (const name of readdirSync(resolve(root, 'sdk/imports')).filter(name => name.endsWith('.json')).sort()) {
    const record = JSON.parse(readFileSync(resolve(root, 'sdk/imports', name), 'utf8'))
    if (!Array.isArray(record.files) || !record.files.some(item => typeof item?.to === 'string' && item.to.startsWith('vendor/'))) continue
    for (const item of record.files) {
      for (const path of [item.from, item.to]) if (typeof path !== 'string' || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error(`Invalid import path in sdk/imports/${name}: ${path} (relative, with forward slashes)`)
      verifyImportedFile(resolve(root, item.to), item.sha256)
      files++
    }
  }
  return { files, guides }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkSdkImports(fileURLToPath(new URL('../', import.meta.url)))
    console.log(`SDK imports: ${result.files} files checked; ${result.guides} local module guides remain editable.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
