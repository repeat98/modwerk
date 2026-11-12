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

export const BASELINE_PATH = 'sdk/approvals/module-qualification-baseline.json'
export const WAIVERS_PATH = 'sdk/approvals/module-release-waivers.json'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
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
  for(const path of paths) hashes[path]=sha(await readFile(resolve(folder,path)))
  return sha(JSON.stringify(hashes))
}
export async function moduleFolderSha256(folder) { return fingerprint(folder,await inventory(folder)) }
export function qualificationReports(document) {
  const q=document.tests.qualification
  return q?[...new Set([...q.cycles.map(c=>c.report),q.memory.report,q.hardware.report])]:document.tests.releaseWaiver?[document.tests.releaseWaiver.report]:[]
}
export async function moduleNativeSourceSha256(folder, document) {
  const reports=new Set(qualificationReports(document))
  const paths=(await inventory(folder)).filter(path=>!['octamod.module.json','qualification.example.json'].includes(path)&&!path.startsWith('media/')&&!/\.md$/i.test(path)&&!/(^|\/)(LICENSE|LICENCE|COPYING)(\.|$)/i.test(path)&&!reports.has(path))
  return fingerprint(folder,paths)
}
// An owner-approved update publishes a new version without fresh evidence for
// what the owner names in `waived`. The approval lives in sdk/, outside the
// module folder, so a folder cannot grant it to itself, and binds this exact
// version and native source. Hardware is never claimed verified; anything not
// waived is still required.
const UPDATE_WAIVABLE=['current-build-hardware','chip-worst-case-cycles','complete-memory-bounds','release-documentation']
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
  if(existing?.version===document.version&&existing.folderSha256===await moduleFolderSha256(folder)) return 'retained'
  const declaration=document.tests.releaseWaiver
  if(document.id==='midi-scenes'&&document.version==='0.2.4-experimental'&&declaration?.approvedOn==='2026-10-03') {
    const approval=JSON.parse(await readFile(new URL('../sdk/approvals/midi-scenes-build-approval.json',import.meta.url),'utf8'))
    if(approval.id!=='midi-scenes'||approval.version!==document.version||approval.approvedBy!=='repeat98'||approval.approvedOn!=='2026-10-03'||JSON.stringify(approval.waived)!==JSON.stringify(['hardware-timing','complete-memory-bounds'])||approval.imageSha256!=='debb24090cada4be00bc70880136f14e813b0d3a9018b516f922d33671bd9b87'||approval.sourceSha256!==declaration.sourceSha256||approval.imageSha256!==declaration.imageSha256||await moduleNativeSourceSha256(folder,document)!==approval.sourceSha256||await moduleFolderSha256(folder)!==approval.folderSha256) throw new Error('MIDI Scenes: owner build approval does not cover this exact source, image and folder')
    if(document.build||document.tests.qualification||document.tests.hardwareStatus!=='reported'||document.compatibility.conflicts.length!==13) throw new Error('MIDI Scenes: standalone approval requires honest reported status and all companion exclusions')
    const report=JSON.parse(await readFile(resolve(folder,declaration.report),'utf8'))
    if(report.moduleVersion!==document.version||report.sourceSha256!==approval.sourceSha256||report.imageSha256!==approval.imageSha256||report.hardwareTiming!==null||report.completeMemoryBounds!==null||report.standaloneOnly!==true||report.sharedWorkerParity?.status!=='passed'||report.sharedWorkerParity.mixedSelectionsRefused!==13||report.sharedWorkerParity.mainSha256!==approval.imageSha256||report.sharedWorkerParity.updateSha256!=='d7c792e0ec9b28e1b674e92526b2fa9a8a8279655dbd66a7b59495e5d5c54007'||report.sharedWorkerParity.changedBaseRefused!==true) throw new Error('MIDI Scenes: incomplete or stale shared-worker verification')
    await requireModuleDocumentation(folder,document)
    return 'owner-approved-standalone'
  }
  if(document.id==='synth'&&document.version==='0.1.1-experimental'&&declaration?.approvedOn==='2026-10-06') return requireSynthRelease(options.root??fileURLToPath(new URL('../',import.meta.url)),folder,document,moduleNativeSourceSha256)
  const waiver=waivers.get(document.id)
  if(waiver?.version===document.version&&declaration) {
    if(declaration.moduleVersion!==document.version||declaration.sourceSha256!==waiver.sourceSha256||await moduleNativeSourceSha256(folder,document)!==waiver.sourceSha256||await moduleFolderSha256(folder)!==waiver.folderSha256) throw new Error(document.id+': owner waiver does not cover this exact source and complete module folder')
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

/** A pull request that gives a module a new version also says in its TESTING.md what was tested at that version: 84 of 87 modules
 * name their current version there, and a report left at the old one reads as evidence for the new. Every machine's manifests and drafts. */
export function testingVersionProblem({ root, base }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
  const specs = [':(glob)sdk/drafts/*/octamod.module.json', ':(glob)sdk/octatrack/modules/*/octamod.module.json', ':(glob)sdk/*/modules/*/modwerk.module.json']
  const changed = (git('diff', '--name-only', '--diff-filter=AM', base, '--', ...specs) + git('ls-files', '--others', '--exclude-standard', '--', ...specs)).split('\n').filter(Boolean)
  for (const path of new Set(changed)) {
    const version = JSON.parse(readFileSync(resolve(root, path), 'utf8')).version
    let before = null
    // An Octatrack module's manifest sat under sdk/octabam/modules/ before the folders moved (12 November 2026).
    for (const at of [path, path.replace(/^sdk\/octatrack\/modules\//, 'sdk/octabam/modules/')]) { try { before = JSON.parse(git('show', base + ':' + at)).version; break } catch { /* new here */ } }
    if (version === before || typeof version !== 'string') continue
    const folder = path.slice(0, path.lastIndexOf('/')), report = resolve(root, folder, 'TESTING.md')
    const text = (() => { try { return readFileSync(report, 'utf8') } catch { return '' } })(), short = version.replace(/-experimental$/, '')
    if (!text.includes(version) && !new RegExp('(?<![\\d.])' + short.replaceAll('.', '\\.') + '(?![\\d.])').test(text))
      return folder + '/TESTING.md does not name ' + version + '. Say what you ran on this version, and on which build, or write that it is not tested yet.'
  }
  return null
}
