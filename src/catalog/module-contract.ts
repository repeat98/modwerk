import { compareModuleVersions } from './versions.ts'
import { parseModuleContributors, type ModuleContributor } from './module-authors.ts'
// Shared by the web catalog and stock-free PR validation. No Python is evaluated.
export type EvidenceMethod = 'unmeasured' | 'static' | 'emulator' | 'hardware'
export type ModuleMetric = { label: string; display: string; value: number | null; unit: string; method: EvidenceMethod; conditions: string; source: string }
export type ResourceLoadLevel = 'minimal' | 'low' | 'moderate' | 'high'
export type ResourceLoadEstimate = { level: ResourceLoadLevel; basis: 'source-estimate' | 'measured-comparison'; rationale: string; source: string }
export type ModuleResourceImpact = { conditions: string; cpu: ResourceLoadEstimate; dsp: ResourceLoadEstimate; memory: ResourceLoadEstimate }
export type ModuleControl = { name: string; default: number; count: number; doc: string; labels: string[] | null }
export type ModuleUiCapture = { page: string; shows: 'location' | 'controls' | 'location-and-controls'; firmware: '1.40C'; moduleVersion: string; imageSha256: string; setup: string }
export type QualificationConditions = { parameterExtremes: string; parameterModulation: string; modeSwitching: string; maxLoad: string; inputConditions: string }
export type DetailedHardwareQualification = { status: 'pending' | 'failed' | 'passed'; model: 'MKI' | 'MKII'; testedOn: string; tester: string; project: { name: string; sha256: string; recipe: string }; durationMinutes: number; audioTracks: number; midiTracks: number; maxInstances: number; conditions: QualificationConditions; checks: { audioContinuity: 'passed' | 'failed'; transport: 'passed' | 'failed'; controls: 'passed' | 'failed'; memoryIntegrity: 'passed' | 'failed'; recovery: 'passed' | 'failed' }; report: string }
export type FunctionalHardwareQualification = { kind: 'functional'; status: 'reported'; model: 'MKI' | 'MKII' | null; testedOn: string; tester: string; sourceRevision: string; imageSha256: string; summary: string; limitations: string[]; report: string }
export type OwnerWaivedHardwareQualification = { kind: 'owner-waived'; status: 'waived'; approvedBy: 'repeat98'; approvedOn: '2026-10-05' | '2026-10-06' | '2026-10-09'; reason: string; report: string }
export type ModuleQualification = {
  documentation: { tutorial: { title: string; steps: string[] }; screenshots: string[]; screenshotStyle: 'black-and-white' }
  moduleVersion: string; sourceSha256: string; imageSha256: string
  cycles: { processor: 'dsp' | 'coldfire'; worstCase: number; maxConfiguration: number; maxInstances: number; budget: number; unit: 'cycles/sample' | 'cycles/block' | 'cycles/event'; method: 'static' | 'emulator' | 'hardware'; conditions: QualificationConditions; report: string }[]
  memory: { regions: { name: string; space: 'dsp-p' | 'dsp-x' | 'dsp-y' | 'cpu-flash' | 'cpu-ram' | 'sdram'; words: number; wordBits: 8 | 16 | 24 | 32; bytes: number; scope: 'instance' | 'shared' }[]; perInstanceBytes: number; sharedBytes: number; maxInstances: number; totalBytes: number; conditions: string; report: string }
  hardware: DetailedHardwareQualification | FunctionalHardwareQualification | OwnerWaivedHardwareQualification
}
// This declaration cannot approve a submission. Repository validation also
// requires an owner record pinned to the complete, exact module folder.
export type ModuleReleaseWaiver = {
  moduleVersion: string; sourceSha256: string; imageSha256: string
  approvedBy: 'repeat98'; approvedOn: '2026-10-02' | '2026-10-03' | '2026-10-06'; reason: string; report: string
  documentation: ModuleQualification['documentation']
}
export const MODULE_CATEGORIES = ['effects', 'playback', 'machines', 'scenes', 'midi-usb', 'system'] as const
export type ModuleDocument = {
  schemaVersion: 2; id: string; key: string; name: string; version: string; category: typeof MODULE_CATEGORIES[number]
  source?: { repository: string; revision: string; path: string }
  build?: { status: 'pending'; reason: string }
  author: { github: string; name?: string; contributors?: ModuleContributor[]; credits: string[] }; nativeManifest: string
  presentation: { label: string; family: string; summary: string; overview: string; highlights: string[]; usage: string[] }
  access?: { location: string; steps: string[]; screenshots: string[]; noUiReason?: string }
  controls: ModuleControl[]
  compatibility: { firmware: '1.40C'; effectId: number | null; location: 'FX1' | 'FX2' | 'FX1 / FX2' | 'Flex / Static' | 'Track machine' | 'Audio tracks' | 'MIDI tracks' | 'Project sequencer' | 'USB'; conflicts: string[]; limitations: string[] }
  resources: { recorded: string; storage: ModuleMetric; processing: ModuleMetric; impact?: ModuleResourceImpact }
  tests: { report: string; summary: string; hardwareStatus: 'untested' | 'historical' | 'reported' | 'verified'; evidenceRevision: string; gates: string[]; documentation?: ModuleQualification['documentation']; qualification?: ModuleQualification; releaseWaiver?: ModuleReleaseWaiver; retainedEvidence?: { commit: string; moduleVersion: string; documentation: ModuleQualification['documentation'] } }
  license: { spdx: string; file: string; declaration: string }
  media: { path: string; captureType: 'hardware' | 'emulator' | 'audio'; caption: string; alt: string; credit: string; license: string; source: string; otUi?: ModuleUiCapture }[]
}
function fail(path: string, message: string): never { throw new Error(path + ': ' + message) }
function object(value: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object')
  const item = value as Record<string, unknown>
  for (const key of Object.keys(item)) if (!keys.includes(key) && !optional.includes(key)) fail(path + '.' + key, 'unknown field')
  for (const key of keys) if (!(key in item)) fail(path + '.' + key, 'required field is missing')
  return item
}
function text(value: unknown, path: string, maximum=4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || Array.from(value).some(character=>{const code=character.charCodeAt(0);return code<32&&![9,10,13].includes(code)})) fail(path, 'expected nonempty plain text within ' + maximum + ' characters')
  return value.trim()
}
function enumeration<T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) fail(path, 'expected ' + choices.join(', '))
  return value as T
}
function list(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, 'expected an array of at most ' + maximum + ' items')
  return value
}
function texts(value: unknown, path: string, maximum: number): string[] { return list(value,path,maximum).map((v,i)=>text(v,path+'['+i+']')) }
function integer(value: unknown, path: string, minimum=0, maximum=Number.MAX_SAFE_INTEGER): number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<minimum||value>maximum) fail(path,'expected an exact integer between '+minimum+' and '+maximum)
  return value
}
function sha256(value: unknown, path: string): string {
  const hash=text(value,path,64)
  if(!/^[a-f0-9]{64}$/.test(hash)) fail(path,'expected an exact SHA-256 identity')
  return hash
}
function qualificationConditions(value: unknown, path: string): QualificationConditions {
  const keys=['parameterExtremes','parameterModulation','modeSwitching','maxLoad','inputConditions'] as const
  const c=object(value,path,keys)
  return Object.fromEntries(keys.map(key=>[key,text(c[key],path+'.'+key)])) as QualificationConditions
}
function qualificationReport(value: unknown, path: string): string {
  const file=modulePath(value,path)
  if(file!=='TESTING.md'&&(!file.startsWith('evidence/')||!/\.(md|json|txt)$/.test(file))) fail(path,'use TESTING.md or a text report under evidence/, never firmware or a project/card dump')
  return file
}
function qualificationDocumentation(value: unknown, path: string, noUi=false): ModuleQualification['documentation'] {
  const docs=object(value,path+'.documentation',['tutorial','screenshots','screenshotStyle'])
  const tutorial=object(docs.tutorial,path+'.documentation.tutorial',['title','steps'])
  const steps=texts(tutorial.steps,path+'.documentation.tutorial.steps',12)
  if(steps.length<3) fail(path+'.documentation.tutorial.steps','require at least three practical tutorial steps: setup/select, use controls and verify the result')
  const screenshots=list(docs.screenshots,path+'.documentation.screenshots',8).map((value,i)=>modulePath(value,path+'.documentation.screenshots['+i+']'))
  if((!screenshots.length&&!noUi)||new Set(screenshots).size!==screenshots.length) fail(path+'.documentation.screenshots','require real documentation screenshots without duplicates')
  return {tutorial:{title:text(tutorial.title,path+'.documentation.tutorial.title',100),steps},screenshots,screenshotStyle:enumeration(docs.screenshotStyle,path+'.documentation.screenshotStyle',['black-and-white'])}
}
function releaseWaiver(value: unknown): ModuleReleaseWaiver {
  const path='tests.releaseWaiver', q=object(value,path,['moduleVersion','sourceSha256','imageSha256','approvedBy','approvedOn','reason','report','documentation'])
  const moduleVersion=text(q.moduleVersion,path+'.moduleVersion',80); compareModuleVersions(moduleVersion,moduleVersion)
  return {moduleVersion,sourceSha256:sha256(q.sourceSha256,path+'.sourceSha256'),imageSha256:sha256(q.imageSha256,path+'.imageSha256'),approvedBy:enumeration(q.approvedBy,path+'.approvedBy',['repeat98']),approvedOn:enumeration(q.approvedOn,path+'.approvedOn',['2026-10-02','2026-10-03','2026-10-06']),reason:text(q.reason,path+'.reason'),report:qualificationReport(q.report,path+'.report'),documentation:qualificationDocumentation(q.documentation,path)}
}
function qualification(value: unknown): ModuleQualification {
  const path='tests.qualification', q=object(value,path,['moduleVersion','sourceSha256','imageSha256','cycles','memory','hardware','documentation'])
  const moduleVersion=text(q.moduleVersion,path+'.moduleVersion',80); compareModuleVersions(moduleVersion,moduleVersion)
  const documentation=qualificationDocumentation(q.documentation,path)
  const cycles=list(q.cycles,path+'.cycles',2).map((value,i):ModuleQualification['cycles'][number]=>{
    const p=path+'.cycles['+i+']', c=object(value,p,['processor','worstCase','maxConfiguration','maxInstances','budget','unit','method','conditions','report'])
    const worstCase=integer(c.worstCase,p+'.worstCase',1), maxConfiguration=integer(c.maxConfiguration,p+'.maxConfiguration',1), budget=integer(c.budget,p+'.budget',1)
    if(maxConfiguration<worstCase) fail(p+'.maxConfiguration','maximum configuration cannot cost less than one instance')
    return {processor:enumeration(c.processor,p+'.processor',['dsp','coldfire']),worstCase,maxConfiguration,maxInstances:integer(c.maxInstances,p+'.maxInstances',1,16),budget,unit:enumeration(c.unit,p+'.unit',['cycles/sample','cycles/block','cycles/event']),method:enumeration(c.method,p+'.method',['static','emulator','hardware']),conditions:qualificationConditions(c.conditions,p+'.conditions'),report:qualificationReport(c.report,p+'.report')}
  })
  if(!cycles.length||new Set(cycles.map(c=>c.processor)).size!==cycles.length) fail(path+'.cycles','require one worst-case count for every processor used, without duplicates')
  const p=path+'.memory', m=object(q.memory,p,['regions','perInstanceBytes','sharedBytes','maxInstances','totalBytes','conditions','report'])
  const regions=list(m.regions,p+'.regions',64).map((value,i):ModuleQualification['memory']['regions'][number]=>{
    const r=p+'.regions['+i+']', region=object(value,r,['name','space','words','wordBits','bytes','scope'])
    const words=integer(region.words,r+'.words',1), wordBits=integer(region.wordBits,r+'.wordBits'), bytes=integer(region.bytes,r+'.bytes',1)
    if(![8,16,24,32].includes(wordBits)||!Number.isSafeInteger(words*wordBits/8)||bytes!==words*wordBits/8) fail(r,'word count, word width and exact byte count must agree')
    return {name:text(region.name,r+'.name',120),space:enumeration(region.space,r+'.space',['dsp-p','dsp-x','dsp-y','cpu-flash','cpu-ram','sdram']),words,wordBits:wordBits as 8|16|24|32,bytes,scope:enumeration(region.scope,r+'.scope',['instance','shared'])}
  })
  if(!regions.length||new Set(regions.map(r=>r.space+':'+r.name)).size!==regions.length) fail(p+'.regions','require an exact allocation inventory without duplicates')
  const perInstanceBytes=integer(m.perInstanceBytes,p+'.perInstanceBytes'),sharedBytes=integer(m.sharedBytes,p+'.sharedBytes'),maxInstances=integer(m.maxInstances,p+'.maxInstances',1,16),totalBytes=integer(m.totalBytes,p+'.totalBytes',1)
  if(regions.filter(r=>r.scope==='instance').reduce((sum,r)=>sum+r.bytes,0)!==perInstanceBytes||regions.filter(r=>r.scope==='shared').reduce((sum,r)=>sum+r.bytes,0)!==sharedBytes||perInstanceBytes*maxInstances+sharedBytes!==totalBytes) fail(p,'region sums and maximum-instance total must match the exact byte counts')
  const result={documentation,moduleVersion,sourceSha256:sha256(q.sourceSha256,path+'.sourceSha256'),imageSha256:sha256(q.imageSha256,path+'.imageSha256'),cycles,memory:{regions,perInstanceBytes,sharedBytes,maxInstances,totalBytes,conditions:text(m.conditions,p+'.conditions'),report:qualificationReport(m.report,p+'.report')}}
  if(q.hardware && typeof q.hardware==='object' && 'kind' in q.hardware && q.hardware.kind==='owner-waived') {
    const hpath=path+'.hardware',h=object(q.hardware,hpath,['kind','status','approvedBy','approvedOn','reason','report'])
    return {...result,hardware:{kind:'owner-waived',status:enumeration(h.status,hpath+'.status',['waived']),approvedBy:enumeration(h.approvedBy,hpath+'.approvedBy',['repeat98']),approvedOn:enumeration(h.approvedOn,hpath+'.approvedOn',['2026-10-05','2026-10-06','2026-10-09']),reason:text(h.reason,hpath+'.reason'),report:qualificationReport(h.report,hpath+'.report')}}
  }
  if(q.hardware && typeof q.hardware==='object' && 'kind' in q.hardware && q.hardware.kind==='functional') {
    const hpath=path+'.hardware',h=object(q.hardware,hpath,['kind','status','model','testedOn','tester','sourceRevision','imageSha256','summary','limitations','report'])
    const testedOn=text(h.testedOn,hpath+'.testedOn',10),sourceRevision=text(h.sourceRevision,hpath+'.sourceRevision',40),limitations=texts(h.limitations,hpath+'.limitations',16)
    if(!/^\d{4}-\d{2}-\d{2}$/.test(testedOn)||!Number.isFinite(Date.parse(testedOn))||new Date(testedOn).toISOString().slice(0,10)!==testedOn) fail(hpath+'.testedOn','record a valid YYYY-MM-DD test date')
    if(!/^[a-f0-9]{40}$/.test(sourceRevision)) fail(hpath+'.sourceRevision','pin the exact tested source commit')
    if(!limitations.length) fail(hpath+'.limitations','record the limits of the reported hardware test')
    return {...result,hardware:{kind:'functional',status:enumeration(h.status,hpath+'.status',['reported']),model:h.model===null?null:enumeration<'MKI'|'MKII'>(h.model,hpath+'.model',['MKI','MKII']),testedOn,tester:text(h.tester,hpath+'.tester',100),sourceRevision,imageSha256:sha256(h.imageSha256,hpath+'.imageSha256'),summary:text(h.summary,hpath+'.summary'),limitations,report:qualificationReport(h.report,hpath+'.report')}}
  }
  const hpath=path+'.hardware', h=object(q.hardware,hpath,['status','model','testedOn','tester','project','durationMinutes','audioTracks','midiTracks','maxInstances','conditions','checks','report'])
  const project=object(h.project,hpath+'.project',['name','sha256','recipe']),checks=object(h.checks,hpath+'.checks',['audioContinuity','transport','controls','memoryIntegrity','recovery'])
  const testedOn=text(h.testedOn,hpath+'.testedOn',10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(testedOn)||!Number.isFinite(Date.parse(testedOn))||new Date(testedOn).toISOString().slice(0,10)!==testedOn) fail(hpath+'.testedOn','record a valid YYYY-MM-DD test date')
  return {...result,hardware:{status:enumeration(h.status,hpath+'.status',['pending','failed','passed']),model:enumeration<'MKI'|'MKII'>(h.model,hpath+'.model',['MKI','MKII']),testedOn,tester:text(h.tester,hpath+'.tester',100),project:{name:text(project.name,hpath+'.project.name',120),sha256:sha256(project.sha256,hpath+'.project.sha256'),recipe:text(project.recipe,hpath+'.project.recipe')},durationMinutes:integer(h.durationMinutes,hpath+'.durationMinutes'),audioTracks:integer(h.audioTracks,hpath+'.audioTracks',0,8),midiTracks:integer(h.midiTracks,hpath+'.midiTracks',0,8),maxInstances:integer(h.maxInstances,hpath+'.maxInstances',1,16),conditions:qualificationConditions(h.conditions,hpath+'.conditions'),checks:Object.fromEntries(Object.entries(checks).map(([key,value])=>[key,enumeration(value,hpath+'.checks.'+key,['passed','failed'])])) as DetailedHardwareQualification['checks'],report:qualificationReport(h.report,hpath+'.report')}}
}
export function modulePath(value: unknown, path='file'): string {
  const result=text(value,path,240)
  if (!result.split('/').every(part=>/^[a-zA-Z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..') || result.startsWith('/') || /\.(bin|syx|exe|dll|so|dylib|zip)$/i.test(result)) fail(path,'expected a relative source/document/media path inside the module folder')
  return result
}
function metric(value: unknown, path: string): ModuleMetric {
  const m=object(value,path,['label','display','value','unit','method','conditions','source'])
  const method=enumeration(m.method,path+'.method',['unmeasured','static','emulator','hardware'])
  if (m.value!==null && (typeof m.value!=='number'||!Number.isFinite(m.value)||m.value<0)) fail(path+'.value','expected a nonnegative finite measurement or null')
  if (method==='unmeasured'&&m.value!==null) fail(path+'.value','unmeasured costs must be null')
  const unit=text(m.unit,path+'.unit',60)
  if (unit==='%' && typeof m.value==='number' && m.value>100) fail(path+'.value','percentage cannot exceed 100')
  return {label:text(m.label,path+'.label',100),display:text(m.display,path+'.display',100),value:m.value as number|null,unit,method,conditions:text(m.conditions,path+'.conditions'),source:modulePath(m.source,path+'.source')}
}
export function parseModuleResourceImpact(value: unknown, path='resources.impact'): ModuleResourceImpact {
  const impact=object(value,path,['conditions','cpu','dsp','memory'])
  const estimate=(key:'cpu'|'dsp'|'memory'):ResourceLoadEstimate=>{
    const p=path+'.'+key, record=object(impact[key],p,['level','basis','rationale','source'])
    return {level:enumeration(record.level,p+'.level',['minimal','low','moderate','high']),basis:enumeration(record.basis,p+'.basis',['source-estimate','measured-comparison']),rationale:text(record.rationale,p+'.rationale',1600),source:modulePath(record.source,p+'.source')}
  }
  return {conditions:text(impact.conditions,path+'.conditions',1000),cpu:estimate('cpu'),dsp:estimate('dsp'),memory:estimate('memory')}
}
export function parseModuleDocument(value: unknown): ModuleDocument {
  const d=object(value,'module',['schemaVersion','id','key','name','version','category','author','nativeManifest','presentation','controls','compatibility','resources','tests','license','media'],['source','build','access'])
  if(d.schemaVersion!==2) fail('schemaVersion','expected 2')
  const id=text(d.id,'id',60); if(!/^[a-z][a-z0-9-]*$/.test(id)) fail('id','use lowercase letters, numbers and hyphens')
  const version=text(d.version,'version',80); compareModuleVersions(version,version)
  let source: ModuleDocument['source'], build: ModuleDocument['build']
  if ('source' in d) {
    const s=object(d.source,'source',['repository','revision','path'])
    const repository=text(s.repository,'source.repository',240), revision=text(s.revision,'source.revision',40)
    if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('source.repository','use a canonical HTTPS GitHub repository URL')
    if(!/^[a-f0-9]{40}$/.test(revision)) fail('source.revision','pin an exact source commit')
    source={repository,revision,path:modulePath(s.path,'source.path')}
  }
  if ('build' in d) {
    const b=object(d.build,'build',['status','reason'])
    build={status:enumeration(b.status,'build.status',['pending']),reason:text(b.reason,'build.reason',400)}
    if(!source) fail('build','pending imports require an exact source pin')
  }
  const a=object(d.author,'author',['github','credits'],['name','contributors']), github=text(a.github,'author.github',39)
  if(!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(github)) fail('author.github','invalid GitHub login')
  const authorName={...('name' in a ? { name:text(a.name,'author.name',100) } : {}),...('contributors' in a ? {contributors:parseModuleContributors(a.contributors,github,'author.contributors')} : {})}
  const p=object(d.presentation,'presentation',['label','family','summary','overview','highlights','usage'])
  const c=object(d.compatibility,'compatibility',['firmware','effectId','location','conflicts','limitations'])
  if(c.effectId!==null&&(typeof c.effectId!=='number'||!Number.isInteger(c.effectId)||c.effectId<4||c.effectId>31))fail('compatibility.effectId','expected a valid effect ID or null for contributions without an effect slot')
  if(c.firmware!=='1.40C') fail('compatibility.firmware','only 1.40C is supported')
  const r=object(d.resources,'resources',['recorded','storage','processing'],['impact'])
  const impact='impact' in r?parseModuleResourceImpact(r.impact):undefined
  const t=object(d.tests,'tests',['report','summary','hardwareStatus','evidenceRevision','gates'],['qualification','releaseWaiver','retainedEvidence','documentation'])
  let retainedEvidence: ModuleDocument['tests']['retainedEvidence']
  if ('retainedEvidence' in t) {
    const p='tests.retainedEvidence', value=object(t.retainedEvidence,p,['commit','moduleVersion','documentation'])
    const commit=text(value.commit,p+'.commit',40), moduleVersion=text(value.moduleVersion,p+'.moduleVersion',80)
    if(!/^[a-f0-9]{40}$/.test(commit)) fail(p+'.commit','expected a full approved Git commit SHA')
    compareModuleVersions(moduleVersion,moduleVersion)
    retainedEvidence={commit,moduleVersion,documentation:qualificationDocumentation(value.documentation,p)}
  }
  const proof='qualification' in t?qualification(t.qualification):undefined
  const waiver='releaseWaiver' in t?releaseWaiver(t.releaseWaiver):undefined
  if(proof&&waiver) fail('tests','use measured qualification or an owner release waiver, never both')
  const evidenceRevision=text(t.evidenceRevision,'tests.evidenceRevision',40)
  if(!/^[a-f0-9]{40}$/.test(evidenceRevision)) fail('tests.evidenceRevision','pin the exact evidence source commit')
  const l=object(d.license,'license',['spdx','file','declaration'])
  const nativeManifest=modulePath(d.nativeManifest,'nativeManifest'); if(nativeManifest!=='manifest.py') fail('nativeManifest','use manifest.py alongside this document')
  const controls=list(d.controls,'controls',64).map((v,i):ModuleControl=>{
    const path='controls['+i+']', control=object(v,path,['name','default','count','doc','labels'])
    const count=control.count, initial=control.default
    if(typeof count!=='number'||!Number.isInteger(count)||count<1||count>256) fail(path+'.count','expected 1–256 values')
    if(typeof initial!=='number'||!Number.isInteger(initial)||initial<0||initial>=count) fail(path+'.default','default is outside the declared range')
    const labels=control.labels===null?null:texts(control.labels,path+'.labels',256)
    if(labels&&labels.length!==count) fail(path+'.labels','one label is required for every value')
    return {name:text(control.name,path+'.name',40),default:initial,count,doc:text(control.doc,path+'.doc'),labels}
  })
  if(new Set(controls.map(control=>control.name)).size!==controls.length) fail('controls','control names must be unique')
  const media=list(d.media,'media',8).map((v,i):ModuleDocument['media'][number]=>{
    const path='media['+i+']', m=object(v,path,['path','captureType','caption','alt','credit','license','source'],['otUi']), file=modulePath(m.path,path+'.path')
    const captureType=enumeration(m.captureType,path+'.captureType',['hardware','emulator','audio'])
    if(!file.startsWith('media/')||!(captureType==='audio'?/\.(wav|mp3|ogg)$/i:/\.(png|jpe?g|webp)$/i).test(file)) fail(path+'.path','media type and extension must agree within media/')
    const source=text(m.source,path+'.source',1000)
    if(source!=='original'){ let url:URL;try{url=new URL(source)}catch{fail(path+'.source','use original or an HTTPS attribution URL')}if(url.protocol!=='https:'||url.username||url.password)fail(path+'.source','use an HTTPS attribution URL') }
    let otUi: ModuleUiCapture | undefined
    if ('otUi' in m) {
      if(captureType==='audio') fail(path+'.otUi','OT UI evidence must be a hardware or emulator image')
      const ui=object(m.otUi,path+'.otUi',['page','shows','firmware','moduleVersion','imageSha256','setup'])
      const captureVersion=text(ui.moduleVersion,path+'.otUi.moduleVersion',80); compareModuleVersions(captureVersion,captureVersion)
      const imageSha256=text(ui.imageSha256,path+'.otUi.imageSha256',64)
      if(!/^[a-f0-9]{64}$/.test(imageSha256)) fail(path+'.otUi.imageSha256','record the SHA-256 of the locally captured image build; never include its bytes')
      otUi={page:text(ui.page,path+'.otUi.page',120),shows:enumeration(ui.shows,path+'.otUi.shows',['location','controls','location-and-controls']),firmware:enumeration(ui.firmware,path+'.otUi.firmware',['1.40C']),moduleVersion:captureVersion,imageSha256,setup:text(ui.setup,path+'.otUi.setup',1000)}
    }
    return {path:file,captureType,caption:text(m.caption,path+'.caption',400),alt:text(m.alt,path+'.alt',300),credit:text(m.credit,path+'.credit',200),license:text(m.license,path+'.license',100),source,...(otUi?{otUi}:{})}
  })
  if(new Set(media.map(item=>item.path)).size!==media.length) fail('media','media paths must be unique')
  let access: ModuleDocument['access']
  if ('access' in d) {
    const a=object(d.access,'access',['location','steps','screenshots'],['noUiReason'])
    const steps=texts(a.steps,'access.steps',16), screenshots=list(a.screenshots,'access.screenshots',8).map((v,i)=>modulePath(v,'access.screenshots['+i+']'))
    if(!steps.length) fail('access.steps','document the button/menu sequence and any prerequisites')
    if(new Set(screenshots).size!==screenshots.length) fail('access.screenshots','screenshot paths must be unique')
    for(const path of screenshots) if(!media.some(item=>item.path===path&&item.otUi)) fail('access.screenshots','reference declared OT UI images in media: '+path)
    const noUiReason='noUiReason' in a?text(a.noUiReason,'access.noUiReason',1000):undefined
    if(noUiReason&&(controls.length||c.effectId!==null||c.location!=='USB'||screenshots.length)) fail('access.noUiReason','only automatic USB modules without OT controls or screenshots may declare no dedicated OT UI')
    access={location:text(a.location,'access.location',300),steps,screenshots,...(noUiReason?{noUiReason}:{})}
  }
  const documentation='documentation' in t?qualificationDocumentation(t.documentation,'tests',!!access?.noUiReason):undefined
  return {schemaVersion:2,id,key:text(d.key,'key',60),name:text(d.name,'name',100),version,category:enumeration(d.category,'category',MODULE_CATEGORIES),...(source?{source}:{}),...(build?{build}:{}),...(access?{access}:{}),author:{github,...authorName,credits:texts(a.credits,'author.credits',30)},nativeManifest,presentation:{label:text(p.label,'presentation.label',80),family:text(p.family,'presentation.family',80),summary:text(p.summary,'presentation.summary',300),overview:text(p.overview,'presentation.overview'),highlights:texts(p.highlights,'presentation.highlights',12),usage:texts(p.usage,'presentation.usage',12)},controls,compatibility:{firmware:'1.40C',effectId:c.effectId as number|null,location:enumeration(c.location,'compatibility.location',['FX1','FX2','FX1 / FX2','Flex / Static','Track machine','Audio tracks','MIDI tracks','Project sequencer','USB']),conflicts:texts(c.conflicts,'compatibility.conflicts',64),limitations:texts(c.limitations,'compatibility.limitations',24)},resources:{recorded:text(r.recorded,'resources.recorded',100),storage:metric(r.storage,'resources.storage'),processing:metric(r.processing,'resources.processing'),...(impact?{impact}:{})},tests:{report:modulePath(t.report,'tests.report'),summary:text(t.summary,'tests.summary'),hardwareStatus:enumeration(t.hardwareStatus,'tests.hardwareStatus',['untested','historical','reported','verified']),evidenceRevision,gates:texts(t.gates,'tests.gates',64),...(documentation?{documentation}:{}),...(proof?{qualification:proof}:{}),...(waiver?{releaseWaiver:waiver}:{}),...(retainedEvidence?{retainedEvidence}:{})},license:{spdx:text(l.spdx,'license.spdx',100),file:modulePath(l.file,'license.file'),declaration:text(l.declaration,'license.declaration')},media}
}

/** New modules and updates need real UI evidence; unchanged legacy publications remain readable. */
export function requireModuleUiForPublication(document: ModuleDocument, retainedVersion?: string): void {
  const access=document.access
  if(access?.noUiReason) return // Owner review must verify the absence of any dedicated OT page.
  if(!access?.screenshots.length) fail(document.id+'.access','publication requires OT UI access instructions and actual screenshots')
  const captures=access.screenshots.map(path=>document.media.find(item=>item.path===path)!.otUi!)
  if(captures.some(capture=>capture.moduleVersion!==document.version&&capture.moduleVersion!==retainedVersion)) fail(document.id+'.access','OT UI captures must document this module version')
  if(!captures.some(capture=>capture.shows!=='controls')) fail(document.id+'.access','include a capture showing where the module is selected or enabled')
  if(document.controls.length&&!captures.some(capture=>capture.shows!=='location')) fail(document.id+'.access','include a capture of the module controls')
}

/** Publication requires bounded resource records and attributed hardware evidence. */
export function requireModuleQualificationForPublication(document: ModuleDocument): void {
  const q=document.tests.qualification, path=document.id+'.tests.qualification'
  if(!q) fail(path,'publication requires worst-case cycles, exact memory and hardware test evidence')
  if(q.moduleVersion!==document.version) fail(path+'.moduleVersion','qualification must cover this module version')
  if(q.cycles.some(c=>c.maxConfiguration>c.budget)) fail(path+'.cycles','worst-case maximum configuration exceeds the declared real-time budget')
  if('kind' in q.hardware && q.hardware.kind==='owner-waived') {
    if(document.id==='sidechain-compressor' && document.version==='0.1.1-experimental' && document.tests.hardwareStatus==='historical' && q.hardware.approvedOn==='2026-10-05') {
      if(document.tests.hardwareStatus!=='historical'||q.cycles.length!==2||!q.cycles.some(c=>c.processor==='coldfire')||!q.cycles.some(c=>c.processor==='dsp')||q.memory.maxInstances!==16) fail(path,'hardware-only approval still requires both processor bounds and complete sixteen-instance memory')
    } else if(document.id==='vector' && ((document.version==='0.2.3-experimental' && q.hardware.approvedOn==='2026-10-06') || (document.version==='0.2.4-experimental' && q.hardware.approvedOn==='2026-10-09'))) {
      if(document.tests.hardwareStatus!=='untested'||q.cycles.length!==1||q.cycles[0].processor!=='coldfire'||q.cycles[0].maxInstances!==8||q.memory.maxInstances!==8) fail(path,'VECTOR hardware-only approval requires honest untested status, ColdFire bounds and complete eight-track memory')
    } else fail(path+'.hardware','hardware-only owner approval covers only exact approved releases')
  } else if('kind' in q.hardware) {
    if(document.tests.hardwareStatus!=='reported'||q.hardware.imageSha256!==q.imageSha256||q.hardware.sourceRevision!==document.tests.evidenceRevision) fail(path+'.hardware','the attributed hardware report must match the tested source and image; it is reported evidence, not verified stress qualification')
  } else {
    const hardware=q.hardware
    if(document.tests.hardwareStatus!=='verified'||q.hardware.status!=='passed'||Object.values(q.hardware.checks).some(status=>status!=='passed')) fail(path+'.hardware','require passed hardware checks; historical, emulator-only, pending or failed results cannot qualify')
    if(hardware.maxInstances!==q.memory.maxInstances||q.cycles.some(c=>c.maxInstances>hardware.maxInstances)) fail(path+'.hardware.maxInstances','the detailed hardware record must match its declared maximum instance count')
  }
  if(!document.presentation.usage.length||!document.presentation.highlights.length) fail(path+'.documentation','complete the usage, features and control documentation')
  for(const path of q.documentation.screenshots) {
    const image=document.media.find(item=>item.path===path)
    if(!image||image.captureType==='audio'||!image.path.endsWith('.png')) fail(document.id+'.tests.qualification.documentation','tutorial screenshots must reference real PNG hardware/emulator images declared in media')
  }
}
