import { ForumThreadView } from './ForumThreadView'
import { BackLink } from '../components/BackLink'
import { ForumProfile } from './ForumProfile'
import { useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { FORUM_CATEGORIES, FORUM_CATEGORY_DESCRIPTIONS, type ForumCategory, type ForumThread, type SharedConfiguration } from './forum-contract'
import { COMMUNITY_MODULES, communityModule, machineModules, nativeModule, moduleIssueHref } from './modules'
import { configurationDevice } from '../config/workspace'
import { MemberPrompt } from './MemberPrompt'
import type { Configuration } from '../config/workspace'
import { Icon } from '../components/Icon'
import { ForumMachines } from './ForumMachines'
import { ForumDirectory } from './ForumDirectory'
import { ForumRecentPosts } from './ForumRecentPosts'
import { ForumShoutbox } from './ForumShoutbox'
import { ForumShowcase } from './ForumShowcase'
import { ForumAvatar as Avatar } from './ForumIdentity'
import { ForumThreadList } from './ForumThreadList'
import { RichTextEditor } from './ForumEditor'
import { DEVICES, DEVICES_BY_ID, deviceHref, deviceTitle } from '../devices/registry'
import { DeviceImage } from '../devices/DeviceImage'
import { MediaPicker } from './ForumMedia'
import { mediaBusy, readyAttachments, type PendingMedia } from './forum-media-client'
import { ModuleIssueNotice } from './ModuleIssueNotice'
import { ModuleDiscussionDialog } from './ModuleDiscussionDialog'
import { moveDiscussionIssueDraft, saveDiscussionIssueDraft } from './discussion-issue-draft'
function errorText(error:unknown){return error instanceof Error?error.message:'The request could not be completed.'}
function ForumList({query,profile}:{query:URLSearchParams;profile?:string}){
  const {session}=useCommunity(),[data,setData]=useState<{threads:ForumThread[];hasMore:boolean}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  const serialized=query.toString(),category=query.get('category')??'',page=Number(query.get('page')??0)
  // Phones fold the topic and machine filters behind a toggle next to the search field.
  const [filtersOpen,setFiltersOpen]=useState(false)
  useEffect(()=>{let cancelled=false;void api<{threads:ForumThread[];hasMore:boolean}>('/forum/threads?'+serialized+(profile?'&author='+encodeURIComponent(profile):'')).then(value=>{if(!cancelled)setData(value)}).catch(error=>{if(!cancelled)setError(errorText(error))});return()=>{cancelled=true}},[serialized,profile,revision])
  function link(values:Record<string,string>){const next=new URLSearchParams(query);next.delete('page');for(const [key,value] of Object.entries(values)){if(value)next.set(key,value);else next.delete(key)}return (profile?'#forum/profile/'+encodeURIComponent(profile):'#forum')+(next.size?'?'+next.toString():'')}
  const saved=query.get('saved')==='1',following=query.get('following')==='1',moduleView=query.get('view')==='modules',machine=DEVICES_BY_ID[query.get('machine')??''],filtered=!!query.get('q')||!!query.get('module'),newest=query.get('sort')==='newest'
  const overview=!profile&&!saved&&!following&&!moduleView&&!category&&!filtered&&page===0,home=overview&&!machine
  const heading=(profile?'Public discussions':saved?'Your bookmarks':following?'Following':moduleView?'Module discussions':category&&Object.hasOwn(FORUM_CATEGORIES,category)?FORUM_CATEGORIES[category as ForumCategory]:query.get('q')?'Search results':newest?'New threads':'Latest activity')+(machine&&!profile?' · '+machine.name:'')
  const newParams=new URLSearchParams();if(category)newParams.set('category',category);if(machine)newParams.set('machine',machine.id);if(query.get('module'))newParams.set('module',query.get('module')!)
  const startHref=category==='issues'||session.user?.verified?'#forum/new'+(newParams.size?'?'+newParams.toString():''):session.user?'#account':'#account/register'
  const shareHref=session.user?.verified?'#forum/new?category=showcase'+(machine?'&machine='+machine.id:''):session.user?'#account':'#account/register'
  const showcase=overview&&<ForumShowcase machine={machine?.id} shareHref={shareHref}/>
  const gallery=!profile&&category==='showcase'&&!saved&&!following&&!filtered&&page===0&&<ForumShowcase layout="grid" category="showcase" machine={machine?.id} shareHref={shareHref}/>
  return <>
    {profile&&<BackLink href="#forum">All discussions</BackLink>}
    <div className="page-heading forum-heading"><div><span className="forum-eyebrow">Connect · Create · Explore</span><h1>{profile?'@'+profile:'Community forum'}</h1><p>{profile?'Public threads by this member.':'A place for the people who make their machines do more.'}</p></div><a className="button button-primary" href={startHref}><Icon name="plus" size={16}/><span className="forum-start-long">{category==='issues'?'Report an issue':'Start a thread'}</span><span className="forum-start-short">{category==='issues'?'Report':'New thread'}</span></a></div>
    {profile&&<ForumProfile key={profile} username={profile}/>}
    {home&&showcase}
    {!profile&&<>
      <div className="forum-toolbar"><nav className="forum-categories" aria-label="Discussion views">
        <a aria-current={!newest&&!saved&&!following&&!moduleView?'page':undefined} href={link({sort:'',saved:'',following:'',view:''})}>Latest activity</a>
        <a aria-current={newest&&!saved&&!following&&!moduleView?'page':undefined} href={link({sort:'newest',saved:'',following:'',view:''})}>New threads</a>
        <a aria-current={moduleView?'page':undefined} href={link({view:'modules',sort:'',saved:'',following:'',category:''})}>Module discussions</a>
        {session.user?.verified&&<><a aria-current={following?'page':undefined} href={link({following:'1',saved:'',sort:'',view:''})}><Icon name="message" size={14}/>Following</a><a aria-current={saved?'page':undefined} href={link({saved:'1',following:'',sort:'',view:''})}><Icon name="bookmark" size={14}/>Bookmarks</a></>}
      </nav>
      <form role="search" aria-label="Find discussions" className="forum-filters" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget),nextMachine=String(values.get('machine')??'');window.location.assign(link({q:String(values.get('q')??'').trim(),category:String(values.get('category')??''),machine:nextMachine,...(nextMachine!==(query.get('machine')??'')?{module:''}:{})}))}}>
        <label className="forum-search-field"><span className="sr-only">Search</span><span className="forum-search"><Icon name="search" size={16}/><input name="q" type="search" aria-label="Search discussions" defaultValue={query.get('q')??''} maxLength={120} placeholder="Search discussions…"/></span></label>
        <button type="button" className={'forum-filter-toggle'+(category||machine?' is-active':'')} aria-label="Topic and machine filters" aria-expanded={filtersOpen} aria-controls="forum-filter-fields" onClick={()=>setFiltersOpen(value=>!value)}><Icon name="sliders" size={18}/></button>
        <div id="forum-filter-fields" className={'forum-filter-fields'+(filtersOpen?' is-open':'')}>
        <label><span className="sr-only">Topic</span><select aria-label="Filter by category" name="category" defaultValue={category}><option value="">All topics</option>{Object.entries(FORUM_CATEGORIES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Machine</span><select aria-label="Filter by machine" name="machine" defaultValue={machine?.id??''}><option value="">All machines</option>{DEVICES.map(device=><option key={device.id} value={device.id}>{deviceTitle(device)}</option>)}</select></label>
        <button className="button button-quiet forum-filter-apply" aria-label="Apply filters"><Icon name="arrow" size={15}/><span className="forum-filter-apply-text">Apply</span></button>
        </div>
      </form></div>
    </>}
    {!profile&&(query.get('q')||category||query.get('module')||machine)&&<div className="forum-active-filters" aria-label="Active filters">
      <span>Showing</span>
      {query.get('q')&&<a href={link({q:''})} aria-label={'Remove search: '+query.get('q')}><span>“{query.get('q')}”</span><Icon name="close" size={12}/></a>}
      {category&&Object.hasOwn(FORUM_CATEGORIES,category)&&<a href={link({category:''})} aria-label={'Remove topic filter: '+FORUM_CATEGORIES[category as ForumCategory]}><span>{FORUM_CATEGORIES[category as ForumCategory]}</span><Icon name="close" size={12}/></a>}
      {machine&&<a href={link({machine:'',module:''})} aria-label={'Remove machine filter: '+machine.name}><span>{machine.name}</span><Icon name="close" size={12}/></a>}
      {query.get('module')&&<a href={link({module:''})} aria-label="Remove module filter"><span>{communityModule(query.get('module')!)?.name??query.get('module')}</span><Icon name="close" size={12}/></a>}
      <a className="forum-clear-filters" href={link({q:'',category:'',module:'',machine:''})}>Clear all</a>
    </div>}
    {!profile&&!saved&&!following&&machine&&<div className="forum-machine-header"><span className="forum-machine-art"><DeviceImage device={machine}/></span><div><h2>{machine.name}{machine.variants&&<small> {machine.variants.join(' · ')}</small>}</h2><p>{machine.summary}</p></div><a className="text-button" href={link({machine:'',module:''})}><Icon name="back" size={13}/>All machines</a></div>}
    {machine&&showcase}

    {home&&<details className="forum-machine-directory"><summary><Icon name="grid" size={16}/><span>Browse by machine</span><span>Every Elektron box</span><Icon name="back" size={16}/></summary><ForumMachines href={id=>link({machine:id,category:'',module:''})}/></details>}
    {category&&Object.hasOwn(FORUM_CATEGORIES,category)&&<p className="forum-category-description">{FORUM_CATEGORY_DESCRIPTIONS[category as ForumCategory]} <a className="text-button" href={link({category:''})}><Icon name="back" size={13}/>All topics</a></p>}
    {gallery}
    {moduleView&&<p className="forum-category-description">The home threads for catalog modules, with settings, questions and feedback collected in one place.</p>}
    <div className={overview?'forum-activity-layout':''}><section className="forum-discussions" aria-labelledby="forum-discussions-title">
      <div className="forum-list-heading"><h2 id="forum-discussions-title">{heading}</h2>{data&&!error&&<span>{data.threads.length}{data.hasMore?'+':''} {data.threads.length===1?'discussion':'discussions'}{page>0?' on this page':''}</span>}</div>
      {error?<div className="forum-empty" role="alert"><Icon name="message" size={26}/><h2>Discussions could not load</h2><p>{error}</p><button className="button button-quiet" onClick={()=>{setError('');setRevision(value=>value+1)}}>Try again</button></div>:!data?<div className="forum-loading" role="status" aria-busy="true"><span>Loading discussions…</span>{[0,1,2].map(row=><div className="forum-loading-row" key={row} aria-hidden="true"><span/><span/></div>)}</div>:data.threads.length?<ForumThreadList threads={data.threads}/>:<div className="forum-empty"><Icon name={saved?'bookmark':'message'} size={28}/><h2>{filtered?'No matching discussions':profile?'No public threads yet':saved?'No bookmarks yet':following?'No followed discussions yet':'Be the first to start a conversation'}</h2><p>{filtered?'Try another search or clear your filters.':saved?'Bookmark a thread to keep it close for later.':following?'Follow a thread to find it here. Threads you start or reply to are followed automatically.':profile?'Threads this member starts will appear here.':'Ask a question, share a discovery, or post a configuration you enjoy.'}</p><a className="button button-quiet" href={filtered?link({q:'',module:''}):saved||following||profile?'#forum':startHref}>{filtered?'Clear filters':saved||following||profile?'Browse discussions':category==='issues'?'Report an issue':'Start a thread'}</a></div>}
      {(page>0||data?.hasMore)&&<nav className="forum-pagination" aria-label="Discussion pages">{page>0?<a className="button button-quiet" href={link({page:String(page-1)})}><Icon name="back" size={14}/>Previous</a>:<span/>}<span>Page {page+1}</span>{data?.hasMore&&<a className="button button-quiet" href={link({page:String(page+1)})}>Next<Icon name="arrow" size={14}/></a>}</nav>}
    </section>{overview&&<div className="forum-overview-sidebar"><ForumDirectory machine={machine?.id} href={category=>link({category})}/><ForumRecentPosts machine={machine?.id}/></div>}</div><MemberPrompt/>
  </>
}

function NewThread({configuration:active,configurations,query}:{configuration?:Configuration;configurations:Configuration[];query:URLSearchParams}){
  const {session}=useCommunity()
  const initialCategory=(Object.hasOwn(FORUM_CATEGORIES,query.get('category')??'')?query.get('category'):'general') as ForumCategory
  const requestedMachine=DEVICES_BY_ID[query.get('machine')??'']?query.get('machine')!:communityModule(query.get('module')??'')?.machine??(initialCategory==='configs'&&active?configurationDevice(active):'')
  const initialMachine=initialCategory==='issues'&&requestedMachine&&!machineModules(requestedMachine).length?'':requestedMachine
  const [machine,setMachine]=useState(initialMachine),[category,setCategory]=useState(initialCategory),[configId,setConfigId]=useState(active?.id??'')
  const [moduleId,setModuleId]=useState(COMMUNITY_MODULES.some(module=>module.id===query.get('module')&&(!initialMachine||module.machine===initialMachine))?query.get('module')!:'')
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[media,setMedia]=useState<PendingMedia[]>([]),[body,setBody]=useState('')
  const composer=useRef<HTMLFormElement>(null),[pendingForm,setPendingForm]=useState<HTMLFormElement|null>(null)
  const modules=machine?machineModules(machine):COMMUNITY_MODULES
  const choices=configurations.filter(item=>configurationDevice(item)===machine)
  const configuration=choices.find(item=>item.id===configId)??choices[0]
  function changeMachine(value:string){setMachine(value);if(value&&communityModule(moduleId)?.machine!==value)setModuleId('')}
  function changeCategory(value:ForumCategory){setCategory(value);if(value==='configs'&&!['octatrack','digitakt','digitone'].includes(machine))changeMachine(active?configurationDevice(active):'octatrack')}
  function requestSubmit(form:HTMLFormElement){if(moduleId||category==='modules')setPendingForm(form);else void submit(form)}
  function reportIssue(){
    const title=String(composer.current?new FormData(composer.current).get('title')??'':'')
    if(body.trim()||title.trim())saveDiscussionIssueDraft(moduleId,{title,body})
    setPendingForm(null)
    window.location.assign(moduleId?moduleIssueHref(moduleId):'#forum/new?category=issues&draft=1'+(machine?'&machine='+encodeURIComponent(machine):''))
  }
  async function submit(form:HTMLFormElement){
    setBusy(true);setError('')
    try{
      const values=Object.fromEntries(new FormData(form)),payload:Record<string,unknown>={title:values.title,body:values.body,category,machine,moduleId:values.moduleId,...(media.length?{attachments:readyAttachments(media)}:{})}
      if(category==='configs'){
        if(!configuration)throw new Error('Create a local configuration for this machine first.')
        payload.configuration={name:configuration.name,...(machine!=='octatrack'?{device:machine}:{}),moduleIds:configuration.moduleIds,moduleVersions:configuration.moduleVersions,keepStockFx2:configuration.keepStockFx2}
      }
      const result=await post<{id:string}>('/forum/threads',payload);window.location.assign('#forum/thread/'+result.id)
    }catch(error){setError(errorText(error))}finally{setBusy(false)}
  }
  if(initialCategory==='issues')return <><BackLink href="#forum?category=issues">Bug reports</BackLink><div className="page-heading"><div><h1>Report a module issue</h1><p>Choose the affected module, then use its “Report an issue” form.</p></div></div><p className="service-note">Issue reports include the reproduction steps, configuration and device details developers need.</p><div className="community-form"><label>Machine<select value={machine} onChange={event=>changeMachine(event.target.value)}><option value="">Every machine</option>{DEVICES.filter(device=>machineModules(device.id).length).map(device=><option key={device.id} value={device.id}>{device.name}</option>)}</select></label><label>Affected module<select value={moduleId} onChange={event=>setModuleId(event.target.value)}><option value="">Choose a module</option>{modules.map(module=><option key={module.id} value={module.id}>{module.name}{!machine?' · '+DEVICES_BY_ID[module.machine].name:''}</option>)}</select></label>{moduleId&&<a className="button button-primary" href={moduleIssueHref(moduleId)} onClick={()=>{if(query.get('draft')==='1')moveDiscussionIssueDraft('',moduleId)}}>Continue to issue report<Icon name="arrow" size={15}/></a>}</div></>
  return <><BackLink href="#forum">All discussions</BackLink><div className="page-heading"><div><h1>Start a conversation</h1><p>A question, a discovery, or a configuration worth sharing.</p></div></div><MemberPrompt/>{session.user?.verified&&<div className="forum-compose-layout"><form ref={composer} className="community-form forum-composer" onSubmit={event=>{event.preventDefault();requestSubmit(event.currentTarget)}}>
    <div className="forum-composer-heading"><Avatar username={session.user.username} avatar={session.user.avatar}/><div><h2>Your discussion</h2><p>Posting as @{session.user.username}</p></div></div>
    <div className="form-two-columns"><label>Category<select value={category} onChange={event=>changeCategory(event.target.value as ForumCategory)}>{Object.entries(FORUM_CATEGORIES).filter(([value])=>value!=='issues').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Machine<select value={machine} onChange={event=>changeMachine(event.target.value)}>{category!=='configs'&&<option value="">General / every machine</option>}{DEVICES.filter(device=>category!=='configs'||machineModules(device.id).length).map(device=><option key={device.id} value={device.id}>{device.name}{device.variants?' '+device.variants.join(' / '):''}</option>)}</select></label></div>
    {!!modules.length&&<label>Related module (optional)<select name="moduleId" value={moduleId} onChange={event=>setModuleId(event.target.value)}><option value="">Choose a module</option>{modules.map(module=><option key={module.id} value={module.id}>{module.name}{!machine?' · '+DEVICES_BY_ID[module.machine].name:''}</option>)}</select></label>}
    <ModuleIssueNotice moduleId={moduleId} machine={machine} onReportIssue={reportIssue}/>
    <label>Title<input name="title" aria-label="Title" aria-describedby="forum-title-hint" required maxLength={160} placeholder="Give your discussion a clear title"/><span id="forum-title-hint" className="forum-field-hint">A specific title helps the right people find your thread.</span></label>
    {category==='configs'&&<aside className="forum-config"><label>Configuration to share<select value={configuration?.id??''} onChange={event=>setConfigId(event.target.value)}>{!choices.length&&<option value="">No configuration for this machine</option>}{choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><h2>{configuration?.name??'No configuration selected'}</h2><p>{configuration?.moduleIds.map(id=>(nativeModule(machine,id)?.name??id)+' '+configuration.moduleVersions[id]).join(' · ')||'Add modules to a local configuration first.'}</p><p>This publishes a fixed copy of the selected configuration. Firmware stays on your device.</p><a href={deviceHref(machine||'octatrack','configuration')}>Review your configuration →</a></aside>}
    <div className="forum-editor-field"><label htmlFor="forum-new-post">Your post</label><RichTextEditor id="forum-new-post" name="body" label="Your post" value={body} onChange={setBody} disabled={busy} placeholder="Share enough detail for others to join in…"/></div>{session.forumMedia&&<MediaPicker items={media} setItems={setMedia}/>}<p className="service-note">Posts are public. Share only original or properly licensed content, including samples in sound clips. Do not post firmware, dumps, passwords or personal information.</p><button className="button button-primary" disabled={busy||mediaBusy(media)||!body.trim()||body.length>12000||(category==='configs'&&!configuration?.moduleIds.length)}>{busy?'Publishing…':'Publish thread'}<Icon name="arrow" size={15}/></button></form><aside className="forum-compose-tips"><h2>A good conversation starts here</h2><p><strong>Give it context.</strong><br/>Share the module, what you tried, and what you want to explore.</p><p><strong>Make it useful.</strong><br/>Share a useful tip or a configuration others can try. Report module bugs with “Report an issue” on the module page.</p><p><strong>Keep it kind.</strong><br/>Credit the people behind your ideas and leave room for different approaches.</p></aside></div>}{pendingForm&&<ModuleDiscussionDialog onClose={()=>setPendingForm(null)} onPost={()=>{const form=pendingForm;setPendingForm(null);void submit(form)}} onReportIssue={reportIssue}/>} {error&&<p className="file-error" role="alert">{error}</p>}</>
}
export function ForumPage({route,configuration,configurations,onCopy}:{route:string;configuration?:Configuration;configurations:Configuration[];onCopy:(config:SharedConfiguration)=>void}){
  const [path,search='']=route.split('?'),query=new URLSearchParams(search),segments=path.split('/')
  return <div className={'community-page forum-page'+(segments[1]==='thread'?' forum-reading-page':'')}>{segments[1]==='shoutbox'?<><BackLink href="#forum">All discussions</BackLink><div className="page-heading"><div><h1>Shoutbox 8 archive</h1><p>A running conversation with the Modwerk community.</p></div></div><ForumShoutbox archive page={Number(query.get('page')??0)}/></>:segments[1]==='new'?<NewThread configuration={configuration} configurations={configurations} query={query}/>:segments[1]==='thread'&&segments[2]?<ForumThreadView key={segments[2]+'?'+search} id={segments[2]} query={query} onCopy={onCopy}/>:<ForumList key={search+segments[2]} query={query} profile={segments[1]==='profile'?segments[2]:undefined}/>}</div>
}
