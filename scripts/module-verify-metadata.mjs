// Guarded static placement facts must be refreshed before any chooser/composer
// import. This helper imports no engine code and makes no qualification claim.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const json = path => JSON.parse(readFileSync(path, 'utf8'))
const fields = ['schema', 'revision', 'sourceSha256', 'noneId', 'modules', 'customIds', 'payloads']

export function mergeStaticDspMetadata(committed, native, id) {
  for (const record of [committed, native]) {
    if (Object.keys(record).sort().join(',') !== [...fields].sort().join(',') || record.schema !== 1 || !Array.isArray(record.modules) || !Array.isArray(record.customIds)) throw new Error('Invalid static DSP metadata shape.')
    const seen = new Set()
    for (const row of record.modules) {
      if (Object.keys(row).sort().join(',') !== 'fxId,id,key,priority' || typeof row.id !== 'string' || seen.has(row.id) || typeof row.key !== 'string' || !Number.isSafeInteger(row.fxId) || row.fxId < 4 || row.fxId > 31 || !Number.isSafeInteger(row.priority)) throw new Error('Invalid static DSP module entry.')
      seen.add(row.id)
    }
    if (new Set(record.customIds).size !== record.customIds.length || record.customIds.some(value => !Number.isSafeInteger(value) || value < 4 || value > 31)) throw new Error('Invalid omitted custom DSP ids.')
  }
  const differing = fields.filter(key => !['modules', 'customIds'].includes(key) && JSON.stringify(native[key]) !== JSON.stringify(committed[key]))
  if (differing.length) throw new Error('Native static DSP layout differs in ' + differing.join(', ') + '. Compare this shared builder change by hand.')
  const others = record => record.modules.filter(row => row.id !== id)
  if (JSON.stringify(others(committed)) !== JSON.stringify(others(native))) throw new Error('Native static DSP entries for other modules differ. Compare this shared builder change by hand.')
  // The exporter derives the complete omitted-id set from the reviewed SDK;
  // legacy upstream ids need not remain in a vendored registry's output.
  return structuredClone(native)
}

export async function refreshStaticDspMetadata({ id, root, run, containerRun, container }) {
  await container('static DSP metadata', ['python3', '-B', '/app/scripts/export-static-dsp.py', '/native/octabam', containerRun + '/static-dsp.json', '--app', '/app', '--vendored-sdk'])
  const path = join(root, 'src/engine/assets/static-dsp.json')
  const committed = json(path), native = json(join(run, 'static-dsp.json'))
  const merged = mergeStaticDspMetadata(committed, native, id)
  if (JSON.stringify(merged) !== JSON.stringify(committed)) {
    writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
    console.log('Updated src/engine/assets/static-dsp.json for ' + id + '; commit it with the record.')
  }
  return merged
}
