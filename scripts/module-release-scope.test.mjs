import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const python = process.platform === 'win32' ? 'python' : 'python3'
function metadataCheck(body) {
  // Loading these standard-library-only definitions never evaluates SDK manifests or assembles code.
  const setup = `import runpy, json
r = runpy.run_path('scripts/build-module-packages.py')
ORDER, REQUESTED = r['ORDER'], r['REQUESTED']
scope, retain = r['requested_release_scope'], r['retain_pending_requested']
`
  return execFileSync(python, ['-B', '-c', setup + body], { cwd: root, encoding: 'utf8' }).trim()
}
describe('source compilation with standalone MIDISC2.0', () => {
  it('excludes the local-stock recipe from compilation while retaining the reviewed requested modules', () => {
    const actual = metadataCheck(`catalog = json.load(open('sdk/catalog.json'))
ids = [m['id'] for m in catalog['modules'] if json.load(open('sdk/octabam/modules/' + m['id'] + '/octamod.module.json')).get('build', {}).get('status') != 'pending']
print(json.dumps(scope(ids)))
`)
    expect(JSON.parse(actual)).toEqual(['analog-bassdrum', 'usb-audio-out-tracks-main-cue', 'quantizer', 'synth', 'vector', 'playmodes', 'mute-modes', 'recorder-loop-fix', 'poly8', 'output-matrix'])
  })
  it('removes legacy 8.2 objects and preserves the other authored package inventory', () => {
    expect(metadataCheck(`baseline = json.load(open('src/engine/assets/requested-packages.json'))
ids = [id for id in REQUESTED if id != 'midi-scenes']
compiled = {field: [dict(row, compiled=True) for row in baseline[field]] for field in ['objects', 'groups']}
for field in ['objects', 'groups']:
    baseline[field].append({'moduleId': 'midi-scenes', 'label': 'legacy-8.2'})
result = retain(compiled, baseline, ids, standalone=True)
for field in ['objects', 'groups']:
    assert all(row['moduleId'] != 'midi-scenes' and row['compiled'] is True for row in result[field])
    assert len(result[field]) == len(baseline[field]) - 1
print('preserved')
`)).toBe('preserved')
  })
  it('fails closed on unsupported scope, changed active object inventory, and a pending version pin', () => {
    expect(metadataCheck(`def rejects(action):
    try: action()
    except ValueError: return
    raise AssertionError('Expected rejection')
for invalid in [ORDER + ['unknown'], ORDER[:-1], ORDER + REQUESTED + ['midi-scenes'], ORDER + ['midi-scenes']]:
    rejects(lambda: scope(invalid))
baseline = json.load(open('src/engine/assets/requested-packages.json'))
ids = [id for id in REQUESTED if id != 'midi-scenes']
compiled = {field: [row for row in baseline[field] if row['moduleId'] != 'midi-scenes'] for field in ['objects', 'groups']}
compiled['objects'] = compiled['objects'][1:]
rejects(lambda: retain(compiled, baseline, ids))
baseline['moduleVersions']['midi-scenes'] = 'unverified'
rejects(lambda: retain(compiled, baseline, ids))
print('rejected')
`)).toBe('rejected')
  })
})
