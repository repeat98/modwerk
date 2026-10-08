import { BugReportNotice, BugReportSuccess, ExistingIssues } from './BugReportNotice'
import { ReportNotifications } from './ReportNotifications'
import { refreshModuleIssues, useIssueTracker, type BugReportResult } from './issue-tracker'
import { useEffect, useId, useRef, useState } from 'react'
import { post } from './api'
import { useCommunity } from './context'
import { MemberPrompt } from './MemberPrompt'
import { CONFIGURATION_REQUIRED, FLASH_STATES, OT_MODELS } from './issue-context'
import type { FlashState, IssueContext, OtModel } from './issue-context'
import { describeOtLog, OT_LOG_MAX_BYTES, OT_LOG_NAME, OtLogError, parseOtLog } from './ot-log'
import type { OtLog } from './ot-log'
import { REPORT_OS, useWorkspaceReportContext, type WorkspaceReportContext } from './report-context'
import { useOpenIssueReport } from './useOpenIssueReport'
import { DiscussionIssueDraft } from './DiscussionIssueDraft'
import { useDiscussionIssueDraft } from './discussion-issue-draft'
import { ReportConfiguration } from './ReportConfiguration'
import { defaultConfigurationChoice, resolveReportConfiguration, type ConfigurationChoice } from './report-configuration'
import recipes from '../catalog/module-sets.json'
import { ReportMoreDetails } from './ReportMoreDetails'

export function IssueReport({id,author,openRequest=0,embedded=false,workspaceContext,baseOs=REPORT_OS,preview=false,onReported}:{id:string;author:string;openRequest?:number;embedded?:boolean;workspaceContext?:WorkspaceReportContext;baseOs?:string;preview?:boolean;onReported?:()=>void}){
 const {session,preview:contextPreview}=useCommunity(),isPreview=import.meta.env.DEV&&(preview||contextPreview)
 const report=useRef<HTMLDetailsElement>(null),title=useRef<HTMLInputElement>(null),success=useRef<HTMLDivElement>(null)
 const fileInput=useRef<HTMLInputElement>(null),readRequest=useRef(0),helpId=useId()
 useOpenIssueReport(report,title,openRequest)
 const {draft,clearDraft}=useDiscussionIssueDraft(id)
 const savedWorkspace=useWorkspaceReportContext(),workspace=workspaceContext??savedWorkspace
 const [opened,setOpened]=useState(embedded),tracker=useIssueTracker(id,opened)
 const [model,setModel]=useState<OtModel|''>(''),[flash,setFlash]=useState<FlashState>('flashed')
 const [log,setLog]=useState<OtLog|null>(null),[logError,setLogError]=useState('')
 const [reading,setReading]=useState(false),[logName,setLogName]=useState(''),[logNote,setLogNote]=useState('')
 const [sent,setSent]=useState<BugReportResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [formKey,setFormKey]=useState(0),[follow,setFollow]=useState(true)
 // A module set has no module of its own to check for; its modules are ticked when the reporter names the configuration by hand.
 const reportedModule=id.startsWith('remix-')?'':id
 const [configuration,setConfiguration]=useState<ConfigurationChoice>(()=>defaultConfigurationChoice(reportedModule?[id]:recipes.find(recipe=>'remix-'+recipe.id===id)?.moduleIds??[]))
 const resolved=resolveReportConfiguration(configuration,workspace,'octatrack',log?.summary??null)
 useEffect(()=>{if(sent){success.current?.focus();report.current?.scrollIntoView({block:'start'})}},[sent])
 useEffect(()=>{if(formKey)title.current?.focus()},[formKey])

 async function readLogs(files:File[]){
  const request=++readRequest.current
  setLog(null);setLogError('');setLogNote('');setReading(true)
  try{
   if(files.length>2)throw new OtLogError('Choose OCTAMOD.LOG and, if present, OCTAMOD1.LOG. Two files are enough.')
   const valid:{file:File;log:OtLog}[]=[],rejected:string[]=[]
   for(const file of files){
    try{
     if(file.size>OT_LOG_MAX_BYTES)throw new OtLogError('This file is larger than 64 KB. Choose a log from the top folder of the card.')
     valid.push({file,log:parseOtLog(new Uint8Array(await file.arrayBuffer()))})
    }catch(error){rejected.push(file.name+': '+(error instanceof Error?error.message:'Could not read this file.'))}
   }
   if(request!==readRequest.current)return
   // Card file dates can be wrong if the device clock is unset. Show the
   // choice explicitly and allow either file to be selected on its own.
   valid.sort((a,b)=>b.file.lastModified-a.file.lastModified)
   if(valid.length){
    setLog(valid[0].log);setLogName(valid[0].file.name)
    setLogNote(rejected.length?'The other file could not be checked; using this complete log.':valid.length>1?'Using the complete log with the newest file date. Choose either file on its own to change this.':'')
   }else if(rejected.length)setLogError(rejected.join(' '))
  }catch(error){if(request===readRequest.current)setLogError(error instanceof Error?error.message:'Unable to read the log.')}
  finally{if(request===readRequest.current)setReading(false)}
 }
 function removeLog(){
  ++readRequest.current;setReading(false);setLog(null);setLogError('');setLogNote('')
  if(fileInput.current)fileInput.current.value=''
 }
 /** A fresh form for the next bug; the Octatrack, running state and follow choice stay as answered. */
 function reportAnother(){removeLog();setSent(null);setError('');setFormKey(key=>key+1)}
 async function send(form:HTMLFormElement){
  if(!model||reading||busy)return
  setBusy(true);setError('')
  const fields=Object.fromEntries(new FormData(form)) as Record<string,string>
  if(isPreview){setSent({id:'local-preview',author,github:'none',githubUrl:null,forumThreadId:null});setBusy(false);onReported?.();return}
  if(fields.actual.length>2000){setError('Keep the description under 2,000 characters. Your complete discussion draft is available above for reference.');setBusy(false);return}
  if(!log&&!resolved.modules.length){setError(CONFIGURATION_REQUIRED);setBusy(false);return}
  // With a log the Worker reads the configuration from the log itself; this mirrors what the form showed.
  const context:IssueContext={model,flash,os:log?.summary.os??baseOs,modules:resolved.modules,keepStockFx2:resolved.keepStockFx2,build:resolved.build}
  try{
   const result=await post<BugReportResult>('/modules/'+id+'/issues',{title:fields.title,steps:fields.steps,expected:fields.expected,actual:fields.actual,context,visibility:'forum',notifyUpdates:fields.notifyUpdates==='on',...(log?{log:log.text}:{})})
   onReported?.()
   refreshModuleIssues(id)
   setSent(result)
   setFollow(fields.notifyUpdates==='on')
   window.dispatchEvent(new Event('modwerk-module-updates'))
   clearDraft()
  }catch(error){setError(error instanceof Error?error.message:'Unable to send issue.')}
  finally{setBusy(false)}
 }

 return <details ref={report} className="issue-report" open={embedded||undefined} onToggle={event=>{if(event.currentTarget.open)setOpened(true)}}><summary>Report an issue <span>For @{author}</span></summary>
  {sent?<div ref={success} className="issue-report-success" role="status" tabIndex={-1}>
   <BugReportSuccess report={sent} onReportAnother={reportAnother}/>
  </div>:!session.user?.verified?<MemberPrompt/>:
  <form key={formKey} className="community-form" aria-busy={busy} onSubmit={event=>{event.preventDefault();void send(event.currentTarget)}}>
   {!embedded&&<ExistingIssues id={id} tracker={tracker}/>}
   {draft&&<DiscussionIssueDraft body={draft.body}/>}
   <label>Title<input ref={title} name="title" required maxLength={160} defaultValue={draft?.title??''} placeholder="What went wrong, in one line"/></label>
   <label>What happened?<textarea name="actual" required maxLength={2000} rows={3} defaultValue={draft?.body??''} placeholder="What you did and what you heard or saw: sound, screen message, freeze, reboot …"/></label>
   <div className="issue-report-row">
    <label>Octatrack<select required value={model} onChange={event=>setModel(event.target.value as OtModel)}><option value="" disabled>Choose…</option>{(Object.keys(OT_MODELS) as OtModel[]).map(key=><option key={key} value={key}>{OT_MODELS[key]}</option>)}</select></label>
    {!embedded&&<label>It is running<select required value={flash} onChange={event=>setFlash(event.target.value as FlashState)}>{(Object.keys(FLASH_STATES) as FlashState[]).map(key=><option key={key} value={key}>{FLASH_STATES[key]}</option>)}</select></label>}
   </div>
   <ReportMoreDetails embedded={embedded}>
   <details className="issue-report-more"><summary>Steps to reproduce <span>Optional</span></summary>
    {embedded&&<label>It is running<select value={flash} onChange={event=>setFlash(event.target.value as FlashState)}>{(Object.keys(FLASH_STATES) as FlashState[]).map(key=><option key={key} value={key}>{FLASH_STATES[key]}</option>)}</select></label>}
    <label>Steps to reproduce<textarea name="steps" maxLength={3000} rows={3} placeholder={'1. Load a project with …\n2. Set FX1 to …\n3. Turn …'}/></label>
    <label>Expected result<textarea name="expected" maxLength={1000} rows={2}/></label>
   </details>
   <details className="issue-report-more issue-report-log"><summary>{log?logName+' attached':'Attach '+OT_LOG_NAME}<span>{log?'Ready, with the exact configuration':'Optional. Records the exact configuration; helps most after a crash or freeze'}</span></summary>
    <ol className="issue-report-steps" id={helpId}>
     <li>Stop playback, wait 30 seconds, save the project, then open <kbd>PROJECT</kbd> › SYSTEM › USB DISK MODE. A card reader works too.</li>
     <li>Choose <strong>OCTAMOD.LOG</strong> and <strong>OCTAMOD1.LOG</strong> from the top folder of the card. They are checked on this device and only sent when you post.</li>
     <li>Eject the card before leaving USB disk mode. After a crash, copy the logs soon: the last events may be missing.</li>
    </ol>
    <input ref={fileInput} type="file" multiple accept=".log,.LOG,text/plain" aria-label="Choose log files" disabled={busy} aria-describedby={helpId} onChange={event=>void readLogs(Array.from(event.target.files??[]))}/>
    {reading&&<p className="service-note" role="status">Checking your log on this device…</p>}
    {log&&<div className="issue-report-log-preview">
     <p className="success-note" role="status"><strong>{logName} is ready.</strong> {describeOtLog(log.summary)}.</p>
     {logNote&&<p className="service-note">{logNote}</p>}
     <details><summary>Preview the log</summary><pre tabIndex={0}>{log.text.trimEnd()}</pre></details>
     <button type="button" className="button button-quiet" disabled={busy} onClick={removeLog}>Remove log</button>
    </div>}
    {logError&&<p className="file-error" role="alert">{logError} Try the other log, or post without one.</p>}
   </details>
   {embedded&&!log?<details className="issue-report-more"><summary>Downloaded build <span>{workspace.modules.length} modules attached</span></summary><ReportConfiguration machine="octatrack" moduleId={reportedModule} workspace={workspace} log={null} value={configuration} onChange={setConfiguration} disabled={busy} os={baseOs}/></details>:<ReportConfiguration machine="octatrack" moduleId={reportedModule} workspace={workspace} log={log?.summary??null} value={configuration} onChange={setConfiguration} disabled={busy} os={baseOs}/>}
   </ReportMoreDetails>
   {isPreview?<p className="service-note">Local preview — nothing is sent.</p>:embedded?<p className="service-note">Your report is public and notifies the module’s developers. The configuration and any log stay private to you, the maintainers and the administrator.</p>:<BugReportNotice tracker={tracker}/>}
   <ReportNotifications id={id} defaultChecked={follow}/>
   <button className="button button-primary" disabled={busy||reading}>{busy?'Posting…':'Post report'}</button>
  </form>}
  {error&&<p className="file-error" role="alert">{error}</p>}</details>
}
