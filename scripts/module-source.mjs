// Shared by the release importer and the frontend-only release stamp: the module source the compiler
// reads and the packages it produces. Both must describe the same inventory, or one could pass what the
// other refuses.
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'
export const PACKAGE_FILES = ['dsp-packages.json','coldfire-packages.json','resident-dsp.json','rom-packages.json','bootstrap-package.json','menu-recipes.json','descriptor-recipes.json','platform-writes.json','requested-packages.json','utility-packages.json','usb-audio-packages.json']
export const SOURCE_GROUPS = ['modules','platform','tools','dsp','licenses']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function inventory(folder,prefix) { const files=[];for(const item of await readdir(folder,{withFileTypes:true})){if(item.name==='__pycache__'||item.name.endsWith('.pyc')||item.name==='.DS_Store')continue;if(item.isSymbolicLink())throw new Error('Source symlinks are prohibited.');const path=prefix+'/'+item.name;if(item.isDirectory())files.push(...await inventory(resolve(folder,item.name),path));else if(item.isFile())files.push(path);else throw new Error('Source must be a regular file.')}return files }
/** Files in a module folder that no compiler reads: documentation, media, evidence reports and the qualification template.
 *  Editing them changes neither the compiled packages nor the code a release approval is bound to. */
export function isDocumentationPath(path) {
  const match = path.match(/^modules\/[^/]+\/(.+)$/)
  return !!match && (/^(media|presentation|evidence)\//.test(match[1]) || /\.md$/i.test(match[1]) || match[1] === 'qualification.example.json')
}
/** The only parts of a module manifest the compiler reads (scripts/build-module-packages.py, build-utility-packages.py): every other
 *  field is documentation. The projection is a plain array so that Node and Python hash identical bytes. */
export function manifestBuildFields(text) {
  const document = JSON.parse(text), source = document.source
  return JSON.stringify([document.id, document.version, document.key, document.author?.github ?? null, source ? [source.repository, source.revision, source.path] : null, document.compatibility?.effectId ?? null, document.build?.status ?? null])
}
/** Relative paths of every SDK file that can change a compiled package. */
/** A C runtime module (its USB package row has "sources") has no card form: no card compiler reads its folder. Mirrors build-module-packages.py. */
async function cardlessModules(root) {
  let text
  try { text=await readFile(resolve(root,'src/engine/assets/octatrack-module-packages.json'),'utf8') } catch(error) { if(error.code==='ENOENT') return new Set(); throw error } // a source tree without the USB package list
  return new Set(JSON.parse(text).packages.filter(row=>row.sources).map(row=>row.id))
}
export async function moduleSourcePaths(root) { const native=resolve(root,'sdk/octabam'),cardless=await cardlessModules(root),files=[];for(const group of SOURCE_GROUPS)files.push(...await inventory(resolve(native,group),group));return files.filter(path=>!isDocumentationPath(path)&&!(path.startsWith('modules/')&&cardless.has(path.split('/')[1]))).sort() }
/** The SHA-256 the compiler records for one source path: the file's bytes, or for a module manifest its build fields. */
export async function sourceEntryHash(root, path) {
  const bytes = await readFile(resolve(root,'sdk/octabam',path))
  return /^modules\/[^/]+\/octamod\.module\.json$/.test(path) ? sha(manifestBuildFields(bytes.toString('utf8'))) : sha(bytes)
}
/** The same SHA-256 tree fingerprint the compiler records as sourceTreeSha256. */
export async function moduleSourceFingerprint(root) {
  const sources={}
  for(const path of (await moduleSourcePaths(root)).sort((a,b)=>a<b?-1:a>b?1:0))sources[path]=await sourceEntryHash(root,path)
  return sha(JSON.stringify(sources))
}

/** Verified firmware package scope. Pending catalog imports remain bound by the full source inventory. */
export async function compiledModuleVersions(root, catalog) {
  const versions = {}, seen = new Set()
  for (const module of catalog.modules) {
    if (!/^[a-z][a-z0-9-]*$/.test(module.id) || seen.has(module.id)) throw new Error('Invalid catalog module id: ' + module.id)
    seen.add(module.id)
    const document = parseModuleDocument(JSON.parse(await readFile(resolve(root, 'sdk/octabam/modules', module.id, 'octamod.module.json'), 'utf8')))
    if (document.id !== module.id || document.version !== module.version) throw new Error('Stale catalog module version: ' + module.id)
    if (document.build?.status !== 'pending') versions[module.id] = module.version
  }
  for (const id of await cardlessModules(root)) delete versions[id]
  return versions
}
