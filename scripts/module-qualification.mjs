// Read-only qualification checks. Never import/evaluate submitted native source.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireSynthRelease } from './synth-release.mjs'
import { requireRetainedEvidence } from './retained-evidence.mjs'
import { requireModuleQualificationForPublication, requireModuleUiForPublication } from '../src/catalog/module-contract.ts'
import { compareModuleVersions } from '../src/catalog/versions.ts'
import { requireModuleDocumentation } from './module-documentation.mjs'
import { CPU_PRICE_RECORD, manifestWithoutPrice } from './module-cpu-price.mjs'

export const BASELINE_PATH = 'sdk/approvals/module-qualification-baseline.json'
export const WAIVERS_PATH = 'sdk/approvals/module-release-waivers.json'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
/** The bytes Git stores for a file under this repository's `* text=auto eol=lf` (.gitattributes): a file Git takes for text keeps
 * its CRLF line endings as LF, anything else is stored as it is. Every hash here reads these, so a working tree with CRLF (a file
 * written on Windows) hashes as CI's LF checkout does (Mackity, #2148: a CRLF thumbnail.svg passed locally and failed in CI).
 * Git's own test (convert.c: gather_stats, convert_is_binary): binary if the file has a NUL, a CR not followed by LF, or more
 * than one non-printable byte in 128 printable ones. A file committed with CRLF before the attribute stays CRLF in Git; no
 * module file is (25 November 2026). */
export function gitStoredBytes(bytes) {
  let crlf=0, lonecr=0, nul=0, printable=0, nonprintable=0
  for(let i=0;i<bytes.length;i++) {
    const c=bytes[i]
    if(c===13) { if(bytes[i+1]===10) { crlf++; i++ } else lonecr++; continue }
    if(c===10) continue
    if(c===127) nonprintable++
    else if(c<32) { if([8,9,12,27].includes(c)) printable++; else { if(c===0) nul++; nonprintable++ } }
    else printable++
  }
  if(bytes.length&&bytes[bytes.length-1]===26) nonprintable-- // a trailing Ctrl-Z (DOS end of file) is not counted
  if(!crlf||lonecr||nul||(printable>>7)<nonprintable) return bytes
  const stored=Buffer.allocUnsafe(bytes.length-crlf)
  let at=0
  for(let i=0;i<bytes.length;i++) if(!(bytes[i]===13&&bytes[i+1]===10)) stored[at++]=bytes[i]
  return stored
}
async function inventory(folder, prefix='') {
  const files=[]
  for(const entry of await readdir(folder,{withFileTypes:true})) {
    if(entry.name==='__pycache__'||entry.name.endsWith('.pyc')||entry.name==='.DS_Store') continue
    const path=prefix+entry.name
    if(entry.isSymbolicLink()) throw new Error(path+': module symlinks are prohibited')
    if(entry.isDirectory()) files.push(...await inventory(resolve(folder,entry.name),path+'/'))
    else if(entry.isFile()) files.push(path)
    else throw new Error(path+': expected a regular module file')
  }
  return files.sort()
}
async function fingerprint(folder, paths) {
  const hashes={}
  for(const path of paths) hashes[path]=sha(gitStoredBytes(await readFile(resolve(folder,path))))
  return sha(JSON.stringify(hashes))
}
/** The module's files whose bytes here differ from what Git stores: text with CRLF line endings. */
export async function crlfModuleFiles(folder) {
  const found=[]
  for(const path of await inventory(folder)) { const bytes=await readFile(resolve(folder,path)); if(gitStoredBytes(bytes)!==bytes) found.push(path) }
  return found
}
export async function moduleFolderSha256(folder) { return fingerprint(folder,await inventory(folder)) }
// A measured CPU price changes no module (owner, 18 November 2026): the folder without the price's readings and its
// manifest without resources.cpuPrice must still be the folder that was qualified; modules:check recomputes the price
// from those readings itself (module-cpu-price.mjs).
export async function modulePricelessFolderSha256(folder) {
  const hashes={}
  for(const path of (await inventory(folder)).filter(path=>path!==CPU_PRICE_RECORD)) {
    const bytes=gitStoredBytes(await readFile(resolve(folder,path)))
    hashes[path]=sha(path==='octamod.module.json'?manifestWithoutPrice(bytes.toString('utf8'))??bytes:bytes)
  }
  return sha(JSON.stringify(hashes))
}
export function qualificationReports(document) {
  const q=document.tests.qualification
  return q?[...new Set([...q.cycles.map(c=>c.report),q.memory.report,q.hardware.report])]:document.tests.releaseWaiver?[document.tests.releaseWaiver.report]:[]
}
async function nativePaths(folder, document) {
  const reports=new Set(qualificationReports(document))
  return (await inventory(folder)).filter(path=>!['octamod.module.json','qualification.example.json',CPU_PRICE_RECORD].includes(path)&&!path.startsWith('media/')&&!/\.md$/i.test(path)&&!/(^|\/)(LICENSE|LICENCE|COPYING)(\.|$)/i.test(path)&&!reports.has(path))
}
export async function moduleNativeSourceSha256(folder, document) {
  return fingerprint(folder,await nativePaths(folder,document))
}
// The source a performance record was measured on: the native source without evidence/, so the stamp written into
// evidence/performance.json (npm run perf:audit -- check FILE --stamp) does not change what it stamps, and without
// presentation/ (the library card's art; media/ is never native source), which no compiler reads, as the compiled-package
// fingerprint leaves it out (module-source.mjs): new art needs no new numbers.
export async function modulePerformanceSourceSha256(folder, document) {
  return fingerprint(folder,(await nativePaths(folder,document)).filter(path=>!path.startsWith('evidence/')&&!path.startsWith('presentation/')))
}
// What a stamp written before 25 November 2026 names: the same source with presentation/. A record stamped then still
// holds while that source is unchanged; the next --stamp writes the hash above.
export async function moduleEarlierPerformanceSourceSha256(folder, document) {
  return fingerprint(folder,(await nativePaths(folder,document)).filter(path=>!path.startsWith('evidence/')))
}
// An owner-approved update publishes a new version without fresh evidence for
// what the owner names in `waived`. The approval lives in sdk/, outside the
// module folder, so a folder cannot grant it to itself, and binds this exact
// version and native source. Hardware is never claimed verified; anything not
// waived is still required.
const UPDATE_WAIVABLE=['current-build-hardware','chip-worst-case-cycles','complete-memory-bounds','release-documentation','release-cost']
async function requireOwnerApprovedUpdate(root, folder, document) {
  let approval
  try { approval=JSON.parse(await readFile(resolve(root,'sdk','approvals',document.id+'-build-approval.json'),'utf8')) } catch(error) { if(error.code==='ENOENT') return null; throw error }
  if(approval?.kind!=='owner-approved-update') return null
  const fail=message=>{ throw new Error(document.id+': owner-approved update '+message) }
  const keys=Object.keys(approval).filter(key=>key!=='retainedUiVersion').sort().join(',')
  if(keys!=='approvedBy,approvedOn,id,kind,ownerStatement,reason,sourceSha256,version,waived') fail('record has unexpected or missing fields')
  if(approval.id!==document.id||approval.version!==document.version) fail('does not cover this module version')
  if(approval.approvedBy!=='repeat98'||!/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn)) fail('needs the owner and an approval date')
  if(![approval.ownerStatement,approval.reason].every(value=>typeof value==='string'&&value.trim())) fail('needs the owner statement and a reason')
  if(!Array.isArray(approval.waived)||!approval.waived.length||new Set(approval.waived).size!==approval.waived.length||approval.waived.some(item=>!UPDATE_WAIVABLE.includes(item))) fail('waives only '+UPDATE_WAIVABLE.join(', '))
  if(approval.sourceSha256!==await moduleNativeSourceSha256(folder,document)) fail('does not cover this exact native source')
  if(document.tests.hardwareStatus==='verified') fail('cannot claim verified hardware')
  if(approval.retainedUiVersion!==undefined && (!approval.waived.includes('release-documentation') || typeof approval.retainedUiVersion!=='string' || compareModuleVersions(approval.retainedUiVersion,document.version)>=0)) fail('retained UI must name an earlier version and explicitly waive release documentation')
  if(approval.waived.includes('release-documentation')) requireModuleUiForPublication(document,approval.retainedUiVersion)
  else await requireModuleDocumentation(folder,document)
  return 'owner-approved-update'
}
export function parseQualificationBaseline(value) {
  if(!value||value.schemaVersion!==1||value.recorded!=='2026-10-02'||!Array.isArray(value.modules)||Object.keys(value).some(key=>!['schemaVersion','recorded','modules'].includes(key))) throw new Error('Invalid frozen module qualification baseline')
  const result=new Map()
  for(const entry of value.modules) {
    if(!entry||Object.keys(entry).sort().join(',')!=='folderSha256,id,version'||typeof entry.id!=='string'||!/^[a-z][a-z0-9-]*$/.test(entry.id)||typeof entry.version!=='string'||!(/^[a-f0-9]{64}$/).test(entry.folderSha256)||result.has(entry.id)) throw new Error('Invalid or duplicate qualification baseline entry')
    compareModuleVersions(entry.version,entry.version)
    result.set(entry.id,entry)
  }
  return result
}
// The owner's 2 October exception is limited to these exact releases. It is
// separate from the frozen baseline and cannot be extended to another version.
export function parseReleaseWaivers(value) {
  if(!value||value.schemaVersion!==1||value.approvedBy!=='repeat98'||value.approvedOn!=='2026-10-02'||JSON.stringify(value.waived)!==JSON.stringify(['hardware-stress','chip-worst-case-cycles'])||!Array.isArray(value.modules)||value.modules.length!==2||Object.keys(value).some(k=>!['schemaVersion','approvedBy','approvedOn','waived','reason','modules'].includes(k))||typeof value.reason!=='string'||!value.reason.trim()) throw new Error('Invalid owner release waiver')
  const records=new Map()
  for(const entry of value.modules) {
    if(!entry||!['cc-map','previewvol'].includes(entry.id)||entry.version!=='0.1.2-experimental'||records.has(entry.id)||Object.keys(entry).sort().join(',')!=='folderSha256,id,sourceSha256,version'||![entry.folderSha256,entry.sourceSha256].every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h))) throw new Error('Release waivers cover only the two exact owner-approved utility versions')
    records.set(entry.id,entry)
  }
  return records
}
export async function requireFolderQualification(folder, document, baseline, waivers=new Map(), options={}) {
  if(document.tests.retainedEvidence) {
    const root=options.root??fileURLToPath(new URL('../',import.meta.url))
    return requireRetainedEvidence(root,folder,document,baseline,waivers,requireFolderQualification,options)
  }
  const existing=baseline.get(document.id)
  if(existing?.version===document.version&&(existing.folderSha256===await moduleFolderSha256(folder)||existing.folderSha256===await modulePricelessFolderSha256(folder))) return 'retained'
  const declaration=document.tests.releaseWaiver
  if(document.id==='synth'&&document.version==='0.1.1-experimental'&&declaration?.approvedOn==='2026-10-06') return requireSynthRelease(options.root??fileURLToPath(new URL('../',import.meta.url)),folder,document,moduleNativeSourceSha256)
  const waiver=waivers.get(document.id)
  if(waiver?.version===document.version&&declaration) {
    if(declaration.moduleVersion!==document.version||declaration.sourceSha256!==waiver.sourceSha256||await moduleNativeSourceSha256(folder,document)!==waiver.sourceSha256||await moduleFolderSha256(folder)!==waiver.folderSha256&&await modulePricelessFolderSha256(folder)!==waiver.folderSha256) throw new Error(document.id+': owner waiver does not cover this exact source and complete module folder')
    if(document.tests.hardwareStatus!=='untested'||document.tests.qualification||document.build||document.resources.processing.value!==null||document.resources.processing.method!=='unmeasured') throw new Error(document.id+': owner-waived hardware and chip timing must remain explicitly untested/unmeasured')
    const report=JSON.parse(await readFile(resolve(folder,declaration.report),'utf8'))
    if(report.schemaVersion!==1||report.id!==document.id||report.moduleVersion!==document.version||report.sourceSha256!==waiver.sourceSha256||report.imageSha256!==declaration.imageSha256||report.hardwareStatus!=='untested'||report.chipWorstCaseCycles!==null||report.nativeBrowserParity?.status!=='passed'||report.nativeBrowserParity.selections!==1024||report.nativeBrowserParity.exactImages!==522||report.nativeBrowserParity.matchingRefusals!==502||report.nativePackaging?.status!=='passed'||report.nativePackaging.exactContainersAndUpgrades!==8||report.rejections?.status!=='passed'||!report.memory?.romBytes) throw new Error(document.id+': incomplete or stale software verification report')
    await requireModuleDocumentation(folder,document)
    return 'owner-waived'
  }
  if(!document.tests.qualification&&!declaration) {
    const approved=await requireOwnerApprovedUpdate(options.root??fileURLToPath(new URL('../',import.meta.url)),folder,document)
    if(approved) return approved
  }
  requireModuleQualificationForPublication(document)
  if(document.tests.qualification.sourceSha256!==await moduleNativeSourceSha256(folder,document)) throw new Error(document.id+': qualification source SHA-256 differs from current native source; remeasure and retest this source')
  if(document.tests.qualification.hardware.kind==='owner-waived') {
    // The owner waived only fresh hardware evidence, for this exact version, source and image. Documentation and media are not part of that binding. The approval is a
    // separate record, so the module folder cannot grant it to itself; every software record must still describe the same build.
    const q=document.tests.qualification
    const approval=JSON.parse(await readFile(new URL('../sdk/approvals/'+document.id+'-build-approval.json',import.meta.url),'utf8'))
    if(approval.id!==document.id||approval.version!==document.version||approval.approvedBy!=='repeat98'||approval.approvedOn!==q.hardware.approvedOn||JSON.stringify(approval.waived)!==JSON.stringify(['current-build-hardware'])||approval.sourceSha256!==q.sourceSha256||approval.imageSha256!==q.imageSha256) throw new Error(document.id+': hardware-only approval does not cover this exact version, source and image')
    const software=JSON.parse(await readFile(resolve(folder,'evidence/software.json'),'utf8'))
    if(software.sourceSha256!==q.sourceSha256||software.imageSha256!==q.imageSha256||software.moduleVersion!==document.version||software.hardwareStatus!==document.tests.hardwareStatus||software.currentBuildHardware!=='owner-waived'||software.chipWallClockCycles!==null||software.memory?.totalBytes!==q.memory.totalBytes||software.memory?.hardwareCanaries!==null) throw new Error(document.id+': software evidence does not match the qualification record')
    if(document.id==='sidechain-compressor') {
      const builder=JSON.parse(await readFile(resolve(folder,'evidence/common-builder.json'),'utf8'))
      if(software.cycles?.staticPerCore!==q.cycles[0].maxConfiguration) throw new Error(document.id+': processor bounds differ from the software evidence')
      if(builder.moduleVersion!==document.version||builder.images?.sharedBuilderNative?.sha256!==q.imageSha256||builder.differenceFromStandalone?.sidechainOwnedBytesDiffering!==0||builder.composition?.platformOrLoggerWritesOverlappingModuleOwnedWrites!==0||builder.composition?.browserRefusalsMatchNative!==builder.composition?.nativeRefused||builder.composition?.browserModuleOwnedWritesMatchNativeOutsidePlatformWrites!==builder.composition?.nativeBuilt) throw new Error(document.id+': shared-builder evidence does not show matching composition')
    } else if(document.id==='vector') {
      const capture=JSON.parse(await readFile(resolve(folder,'media/capture.json'),'utf8'))
      if(software.cycles?.staticPerEvent!==q.cycles[0].maxConfiguration||software.cycles?.mode!=='conditional-static-bound'||software.sequenceChecks!=='passed'||software.poolChecks!=='passed'||capture.imageSha256!==q.imageSha256||capture.sourceSha256!==q.sourceSha256) throw new Error(document.id+': current emulator behavior and resource evidence must cover the qualified source and image')
    }

  }
  for(const path of qualificationReports(document)) {
    const report=await readFile(resolve(folder,path),'utf8')
    if(!report.trim()) throw new Error(document.id+': qualification report is empty: '+path)
  }
  await requireModuleDocumentation(folder,document)
  return 'qualified'
}

/** A module new to the library was never on main, so a tested commit already on main cannot be the one its tests ran on (DATAMATIC, #1103,
 * named a main commit without its draft). Commits from the author's own repository or octabam are not judged: this clone does not know them. */
export function evidenceOnBaseProblem({ root, base }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
  const succeeds = (...args) => { try { git(...args); return true } catch { return false } }
  const specs = [':(glob)sdk/drafts/*/octamod.module.json', ':(glob)sdk/octatrack/modules/*/octamod.module.json']
  const changed = (git('diff', '--name-only', '--diff-filter=AM', base, '--', ...specs) + git('ls-files', '--others', '--exclude-standard', '--', ...specs)).split('\n').filter(Boolean)
  for (const path of new Set(changed)) {
    const id = path.split('/').at(-2), rev = JSON.parse(readFileSync(resolve(root, path), 'utf8')).tests?.evidenceRevision
    if (!/^[a-f0-9]{40}$/.test(rev ?? '')) continue
    const listedOnBase = ['sdk/drafts/' + id, 'sdk/octatrack/modules/' + id, 'sdk/octabam/modules/' + id].some(folder => succeeds('cat-file', '-e', base + ':' + folder + '/octamod.module.json'))
    if (!listedOnBase && succeeds('merge-base', '--is-ancestor', rev, base)) return path + ': tests.evidenceRevision names ' + rev.slice(0, 8) + ', a commit already on main, which has no ' + id + '. Name the commit your tests ran on: one of this branch\'s, or your own repository\'s (docs/MODULE_QUALIFICATION.md).'
  }
  return null
}

/** The module folders this branch gives a new version, every machine's manifests and drafts: { folder, version, text } with text its TESTING.md. */
function newVersions({ root, base }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
  const specs = [':(glob)sdk/drafts/*/octamod.module.json', ':(glob)sdk/octatrack/modules/*/octamod.module.json', ':(glob)sdk/*/modules/*/modwerk.module.json']
  const changed = (git('diff', '--name-only', '--diff-filter=AM', base, '--', ...specs) + git('ls-files', '--others', '--exclude-standard', '--', ...specs)).split('\n').filter(Boolean)
  const found = []
  for (const path of new Set(changed)) {
    const version = JSON.parse(readFileSync(resolve(root, path), 'utf8')).version
    let before = null
    // An Octatrack module's manifest sat under sdk/octabam/modules/ before the folders moved (12 November 2026).
    for (const at of [path, path.replace(/^sdk\/octatrack\/modules\//, 'sdk/octabam/modules/')]) { try { before = JSON.parse(git('show', base + ':' + at)).version; break } catch { /* new here */ } }
    if (version === before || typeof version !== 'string') continue
    const folder = path.slice(0, path.lastIndexOf('/'))
    found.push({ folder, version, text: (() => { try { return readFileSync(resolve(root, folder, 'TESTING.md'), 'utf8') } catch { return '' } })() })
  }
  return found
}

/** A pull request that gives a module a new version also says in its TESTING.md what was tested at that version: 84 of 87 modules
 * name their current version there, and a report left at the old one reads as evidence for the new. */
export function testingVersionProblem({ root, base }) {
  for (const { folder, version, text } of newVersions({ root, base })) {
    const short = version.replace(/-experimental$/, '')
    if (!text.includes(version) && !new RegExp('(?<![\\d.])' + short.replaceAll('.', '\\.') + '(?![\\d.])').test(text))
      return folder + '/TESTING.md does not name ' + version + '. Say what you ran on this version, and on which build, or write that it is not tested yet.'
  }
  return null
}

/** Every new version, first release or update, goes through docs/TEST_PROCEDURE.md (owner, 26 November 2026): its TESTING.md holds the
 * record of `npm run test:procedure -- <id>`, and for an Octatrack module the shipped package's SHA-256, so the record is of the build
 * that ships. Five of the ten Octatrack releases before this had only a typed "Tested on a unit" line. Drafts in sdk/drafts/ ship nothing. */
export function procedureRecordProblem({ root, base }) {
  for (const { folder, version, text } of newVersions({ root, base })) {
    if (folder.startsWith('sdk/drafts/')) continue
    const id = folder.split('/').at(-1), see = ' Every new version goes through the test procedure on the build it ships, with a unit or without one, and its record goes in TESTING.md (docs/TEST_PROCEDURE.md#where-the-record-goes).'
    if (!new RegExp('test:procedure -- (?:[a-z0-9-]+:)?' + id + '(?![\\w-])').test(text)) return folder + '/TESTING.md has no record of `npm run test:procedure -- ' + id + '` for ' + version + '.' + see
    // shortcut: only an Octatrack package has a fixed path here, so other machines' records are not matched to a package; add theirs when they commit one.
    const pkg = resolve(root, 'public/octatrack-modules', id, version + '.mwrm')
    const sha = (() => { try { return createHash('sha256').update(readFileSync(pkg)).digest('hex') } catch { return null } })()
    if (sha && !text.includes(sha.slice(0, 8))) return folder + '/TESTING.md does not name the package that ships, public/octatrack-modules/' + id + '/' + version + '.mwrm (SHA-256 ' + sha.slice(0, 12) + '…), so its test procedure record is of another build.' + see
  }
  return null
}
