import { ForumThreadView } from './ForumThreadView'
import { BackLink } from '../components/BackLink'
import { ForumProfile, ForumProfileReplies } from './ForumProfile'
import { ForumHighlights } from './ForumHighlights'
import { useReconnectRetry } from './useReconnectRetry'
import { ForumOnlineNow } from './MembersOnline'
import type { MemberProfile } from './forum-contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { FORUM_CATEGORIES, FORUM_CATEGORY_DESCRIPTIONS, REQUEST_STATUSES, type ForumCategory, type ForumThread, type ForumVisit, type SharedConfiguration } from './forum-contract'
import { ForumTime } from './ForumTime'
import { COMMUNITY_MODULES, communityModule, machineModules, nativeModule, moduleIssueHref } from './modules'
import { configurationDevice } from '../config/workspace'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { assetUrl } from '../hosting'
import { MemberInvite } from './MemberPrompt'
import type { Configuration } from '../config/workspace'
import { Icon } from '../components/Icon'
import { ForumMachines } from './ForumMachines'
import { ForumDirectory } from './ForumDirectory'
import { ForumRecentPosts } from './ForumRecentPosts'
import { ForumShoutbox } from './ForumShoutbox'
import { ForumShowcase } from './ForumShowcase'
import { ForumMessages } from './ForumMessages'
import { ForumAvatar as Avatar } from './ForumIdentity'
import { ForumThreadList, ForumThreadListSkeleton } from './ForumThreadList'
import { Skeleton } from './ForumSkeleton'
import { RichTextEditor } from './ForumEditor'
import { DEVICES, DEVICES_BY_ID, deviceHref, deviceTitle } from '../devices/registry'
import { DeviceImage } from '../devices/DeviceImage'
import { isZoomSetDevice } from '../devices/zoom-effects'
import { zoomHubHref } from '../devices/zoom-hub-route'
import { MediaPicker } from './ForumMedia'
import { mediaBusy, readyAttachments, type PendingMedia } from './forum-media-client'
import { ModuleIssueNotice } from './ModuleIssueNotice'
import { ModuleDiscussionDialog } from './ModuleDiscussionDialog'
import { moveDiscussionIssueDraft, saveDiscussionIssueDraft } from './discussion-issue-draft'
import { readForumThreadDraft, saveForumThreadDraft } from './forum-thread-draft'
import { profileHref } from '../routing'
import { GetStarted } from './GetStarted'
/** A view name with a shorter form that phones show, so the strip fits more views. */
const short=(long:string,brief:string)=><><span className="forum-start-long">{long}</span><span className="forum-start-short">{brief}</span></>
function errorText(error:unknown){return error instanceof Error?error.message:'The request could not be completed.'}
/** Unread activity since the member's previous visit, above the list it points into. Hidden on the first visit and once everything is read. */
function SinceVisit({visit,onReadAll}:{visit?:ForumVisit|null;onReadAll:()=>void}){
  const [busy,setBusy]=useState(false)
  if(!visit?.since||(!visit.newThreads&&!visit.newReplies&&!visit.unreadFollowed))return null
  async function readAll(){setBusy(true);try{await post('/forum/read-all',{});onReadAll()}catch{/* the list keeps its markers; the next visit tries again */}finally{setBusy(false)}}
  return <section className="forum-since-visit" aria-labelledby="forum-since-title">
    <div className="forum-since-copy"><h3 id="forum-since-title">Since your last visit</h3><p><ForumTime value={visit.since} relative/></p></div>
    <ul>
      {!!visit.newThreads&&<li><a href="#forum?sort=newest&unread=1"><strong>{visit.newThreads}</strong>new {visit.newThreads===1?'thread':'threads'}</a></li>}
      {!!visit.newReplies&&<li><a href="#forum?following=1&unread=1"><strong>{visit.newReplies}</strong>new {visit.newReplies===1?'reply':'replies'} in threads you follow</a></li>}
      {!!visit.unreadFollowed&&<li><a href="#forum?following=1&unread=1"><strong>{visit.unreadFollowed}</strong>unread followed {visit.unreadFollowed===1?'thread':'threads'}</a></li>}
    </ul>
    <button type="button" className="button button-quiet" disabled={busy} onClick={()=>void readAll()}><Icon name="check" size={14}/>Mark all as read</button>
  </section>
}
function ForumList({query,profile,machineHint}:{query:URLSearchParams;profile?:string;machineHint?:string}){
  const {session,settled=true}=useCommunity(),[data,setData]=useState<{threads:ForumThread[];hasMore:boolean}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  const serialized=query.toString(),category=query.get('category')??'',page=Number(query.get('page')??0)
  // Phones fold the topic and machine filters behind a toggle next to the search field.
  const [filtersOpen,setFiltersOpen]=useState(false),[member,setMember]=useState<MemberProfile|null>(null),[profileFailed,setProfileFailed]=useState(false)
  const profileFail=useCallback(()=>setProfileFailed(true),[])
  useEffect(()=>{let cancelled=false;void api<{threads:ForumThread[];hasMore:boolean}>('/forum/threads?'+serialized+(profile?'&author='+encodeURIComponent(profile):'')).then(value=>{if(!cancelled){setData(value);setError('')}}).catch(error=>{if(!cancelled)setError(errorText(error))});return()=>{cancelled=true}},[serialized,profile,revision])
  useReconnectRetry(!!error,setRevision)
  function link(values:Record<string,string>){const next=new URLSearchParams(query);next.delete('page');next.delete('welcome');for(const [key,value] of Object.entries(values)){if(value)next.set(key,value);else next.delete(key)}return (profile?profileHref(profile):'#forum')+(next.size?'?'+next.toString():'')}
  const saved=query.get('saved')==='1',following=query.get('following')==='1',unreadOnly=query.get('unread')==='1'&&!!session.user?.verified,moduleView=query.get('view')==='modules',machine=DEVICES_BY_ID[query.get('machine')??''],filtered=!!query.get('q')||!!query.get('module')||!!query.get('status')||unreadOnly
  // Feature requests open on the most voted ideas; the other views keep recent activity unless an order is chosen.
  const sort=query.get('sort')||(category==='requests'?'top':'active'),newest=sort==='newest',top=sort==='top',status=query.get('status')??''
  const overview=!profile&&!saved&&!following&&!moduleView&&!category&&!filtered&&page===0,home=overview&&!machine
  // The visit banner sits above the list and arrives with it, so it never pushes loaded threads down.
  const wantVisit=home&&!!session.user?.verified,[visit,setVisit]=useState<ForumVisit|null|undefined>(undefined)
  useEffect(()=>{if(!wantVisit)return;let cancelled=false;void api<ForumVisit>('/forum/visit').then(value=>{if(!cancelled)setVisit(value)}).catch(()=>{if(!cancelled)setVisit(null)});return()=>{cancelled=true}},[wantVisit])
  const listReady=!!data&&(!wantVisit||visit!==undefined)
  // An empty list with no filter invites the first thread; a search that found nothing offers to ask instead.
  const invite=!unreadOnly&&!filtered&&!saved&&!following&&!profile,askInstead=filtered&&!unreadOnly&&category!=='issues'
  const heading=(profile?'Public discussions':saved?'Your bookmarks':following&&unreadOnly?'Unread in Following':following?'Following':unreadOnly?'Unread discussions':moduleView?'Module discussions':category&&Object.hasOwn(FORUM_CATEGORIES,category)?FORUM_CATEGORIES[category as ForumCategory]:query.get('q')?'Search results':newest?'New threads':top?'Top voted':'Latest activity')+(machine&&!profile&&(saved||following)?' · '+machine.name:'')
  const newParams=new URLSearchParams();if(category)newParams.set('category',category);if(machine)newParams.set('machine',machine.id);if(query.get('module'))newParams.set('module',query.get('module')!)
  const startHref=category==='issues'||session.user?.verified?'#forum/new'+(newParams.size?'?'+newParams.toString():''):session.user?'#account':'#account/register'
  const shareHref=session.user?.verified?'#forum/new?category=showcase'+(machine?'&machine='+machine.id:''):session.user?'#account':'#account/register'
  // With shares to show they run as a strip above the discussions; with none, one slim row in the side column invites them.
  const showcase=overview&&<ForumShowcase machine={machine?.id} shareHref={shareHref} holdPlace={false}/>
  // Guests get one invitation card at the top of the side column (before the list on narrow screens).
  const join=<MemberInvite id="forum-home-join" title="Join the community" text="Everyone can read the forum. A free account lets you post, like modules and follow threads." next={profile?'forum/profile/'+encodeURIComponent(profile):'forum'}/>
  const gallery=!profile&&category==='showcase'&&!saved&&!following&&!filtered&&page===0&&<ForumShowcase layout="grid" category="showcase" machine={machine?.id} shareHref={shareHref}/>
  // On a member's page the one primary action is about that person: write to them, or edit your own profile. It waits
  // for the session check, so the buttons appear once instead of swapping.
  const self=!!profile&&session.user?.username?.toLowerCase()===profile.toLowerCase(),canMessage=!!profile&&!profileFailed&&!!session.user?.verified&&!self
  const pageHeading=<>
    {profile&&<BackLink href="#forum">All discussions</BackLink>}
    <div className={'page-heading forum-heading' + (profile ? ' forum-profile-heading' : '')}><div><h1>{profile?'@'+profile:'Community forum'}</h1></div>{(settled||!profile)&&<div className="forum-heading-actions">{canMessage&&<a className="button button-primary" href={'#forum/messages/'+encodeURIComponent(profile!)}><Icon name="mail" size={16}/><span className="forum-start-long">Send a message</span><span className="forum-start-short">Message</span></a>}{self&&<a className="button button-quiet" href="#account">Edit profile</a>}<a className={'button ' + (category==='issues'?'button-quiet module-issue-action':canMessage?'button-quiet':'button-primary')} href={startHref}><Icon name={category==='issues'?'message':'plus'} size={16}/><span className="forum-start-long">{category==='issues'?'Report an issue':'Start a thread'}</span><span className="forum-start-short">{category==='issues'?'Report':'New thread'}</span></a><a className="button development-discord-button" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Join Discord (opens in a new tab)"><img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" aria-hidden="true"/><span className="forum-start-long">Join Discord</span></a></div>}</div>
  </>
  // The strip scrolls sideways on phones: bring the current view into sight without moving the page.
  const tabs=useRef<HTMLElement>(null)
  useEffect(()=>{const nav=tabs.current,current=nav?.querySelector<HTMLElement>('[aria-current="page"]');if(!nav||!current||nav.scrollWidth<=nav.clientWidth)return;nav.scrollLeft+=current.getBoundingClientRect().left-nav.getBoundingClientRect().left-(nav.clientWidth-current.offsetWidth)/2},[settled])
  // With a stored session the member's own blocks (Get started, Following, the visit banner) belong on the page. Until
  // that session is checked the page shows only its heading, then builds once, instead of drawing the visitor layout
  // and rearranging it a moment later.
  if(!settled)return <>{pageHeading}<div className="forum-pending" role="status" aria-busy="true"><span className="sr-only">Loading the forum…</span></div></>
  return <>
    {pageHeading}
    {profile&&<ForumProfile key={profile} username={profile} onLoad={setMember} onFail={profileFail}/>}
    {home&&session.user?.verified&&<GetStarted key={session.user.id} machine={machineHint}/>}
    {!profile&&<>
      <div className="forum-toolbar"><nav ref={tabs} className="forum-categories" aria-label="Discussion views">
        <a aria-current={sort==='active'&&!saved&&!following&&!moduleView?'page':undefined} href={link({sort:category==='requests'?'active':'',saved:'',following:'',view:''})}>{short('Latest activity','Latest')}</a>
        <a aria-current={newest&&!saved&&!following&&!moduleView?'page':undefined} href={link({sort:'newest',saved:'',following:'',view:''})}>{short('New threads','New')}</a>
        <a aria-current={top&&!saved&&!following&&!moduleView?'page':undefined} href={link({sort:category==='requests'?'':'top',saved:'',following:'',view:''})}>Top voted</a>
        <a aria-current={moduleView?'page':undefined} href={link({view:'modules',sort:'',saved:'',following:'',category:''})}>{short('Module discussions','Modules')}</a>
        {session.user?.verified&&<><a aria-current={following?'page':undefined} href={link({following:'1',saved:'',sort:'',view:''})}><Icon name="message" size={14}/>Following</a><a aria-current={saved?'page':undefined} href={link({saved:'1',following:'',sort:'',view:''})}><Icon name="bookmark" size={14}/>Bookmarks</a><a href="#forum/messages"><Icon name="mail" size={14}/>Messages</a></>}
      </nav>
      <form role="search" aria-label="Find discussions" className="forum-filters" onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget),nextMachine=String(values.get('machine')??'');window.location.assign(link({q:String(values.get('q')??'').trim(),category:String(values.get('category')??''),machine:nextMachine,...(nextMachine!==(query.get('machine')??'')?{module:''}:{}),...(values.get('category')!=='requests'?{status:''}:{})}))}}>
        <label className="forum-search-field"><span className="sr-only">Search</span><span className="forum-search"><Icon name="search" size={16}/><input name="q" type="search" aria-label="Search discussions" defaultValue={query.get('q')??''} maxLength={120} placeholder="Search discussions…"/></span></label>
        <button type="button" className={'forum-filter-toggle'+(category||machine?' is-active':'')} aria-label="Topic and machine filters" aria-expanded={filtersOpen} aria-controls="forum-filter-fields" onClick={()=>setFiltersOpen(value=>!value)}><Icon name="sliders" size={18}/></button>
        <div id="forum-filter-fields" className={'forum-filter-fields'+(filtersOpen?' is-open':'')}>
        <label><span className="sr-only">Topic</span><select aria-label="Filter by category" name="category" defaultValue={category}><option value="">All topics</option>{Object.entries(FORUM_CATEGORIES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Machine</span><select aria-label="Filter by machine" name="machine" defaultValue={machine?.id??''}><option value="">All machines</option>{DEVICES.map(device=><option key={device.id} value={device.id}>{deviceTitle(device)}</option>)}</select></label>
        <button className="button button-quiet forum-filter-apply" aria-label="Apply filters">Apply</button>
        </div>
      </form></div>
    </>}
    {!profile&&(query.get('q')||category||query.get('module')||machine||status||unreadOnly)&&<div className="forum-active-filters" aria-label="Active filters">
      <span>Showing</span>
      {unreadOnly&&<a href={link({unread:''})} aria-label="Remove unread filter"><span>Unread only</span><Icon name="close" size={12}/></a>}
      {/* Search, topic and machine also show in the toolbar's fields; wide screens show them only there. */}
      {query.get('q')&&<a data-mirrored href={link({q:''})} aria-label={'Remove search: '+query.get('q')}><span>“{query.get('q')}”</span><Icon name="close" size={12}/></a>}
      {category&&Object.hasOwn(FORUM_CATEGORIES,category)&&<a data-mirrored href={link({category:''})} aria-label={'Remove topic filter: '+FORUM_CATEGORIES[category as ForumCategory]}><span>{FORUM_CATEGORIES[category as ForumCategory]}</span><Icon name="close" size={12}/></a>}
      {machine&&<a data-mirrored href={link({machine:'',module:''})} aria-label={'Remove machine filter: '+machine.name}><span>{machine.name}</span><Icon name="close" size={12}/></a>}
      {query.get('module')&&<a href={link({module:''})} aria-label="Remove module filter"><span>{communityModule(query.get('module')!)?.name??query.get('module')}</span><Icon name="close" size={12}/></a>}
      {status&&Object.hasOwn(REQUEST_STATUSES,status)&&<a href={link({status:''})} aria-label={'Remove status filter: '+REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES]}><span>{REQUEST_STATUSES[status as keyof typeof REQUEST_STATUSES]}</span><Icon name="close" size={12}/></a>}
      <a className="forum-clear-filters" href={link({q:'',category:'',module:'',machine:'',status:'',unread:''})}>Clear all</a>
    </div>}
    {!profile&&!saved&&!following&&machine&&<div className="forum-machine-header"><span className="forum-machine-art"><DeviceImage device={machine}/></span><div><h2>{machine.name}{machine.variants&&<small> {machine.variants.join(' · ')}</small>}</h2><p>{machine.summary}</p></div></div>}

    {home&&<details className="forum-machine-directory"><summary><Icon name="grid" size={16}/><span>Browse by machine</span><Icon name="back" size={16}/></summary><ForumMachines href={id=>link({machine:id,category:'',module:''})}/></details>}
    {category&&Object.hasOwn(FORUM_CATEGORIES,category)&&<p className="forum-category-description">{FORUM_CATEGORY_DESCRIPTIONS[category as ForumCategory]}</p>}
    {!profile&&category==='requests'&&<nav className="forum-status-filter" aria-label="Request status">{[['','All'],...Object.entries(REQUEST_STATUSES)].map(([value,label])=><a key={value} aria-current={status===value?'page':undefined} data-status={value||undefined} href={link({status:value})}>{label}</a>)}</nav>}
    {gallery}
    {moduleView&&<p className="forum-category-description">The home threads for catalog modules, with settings, questions and feedback collected in one place.</p>}
    <div className={profile&&profileFailed?'':'forum-activity-layout'}><section className="forum-discussions" aria-labelledby="forum-discussions-title">
      <div className="forum-list-heading"><h2 id="forum-discussions-title">{heading}</h2>{!error&&(data&&listReady?!!data.threads.length&&<span>{data.threads.length}{data.hasMore?'+':''} {data.threads.length===1?'discussion':'discussions'}{page>0?' on this page':''}</span>:<span aria-hidden="true"><Skeleton width="84px"/></span>)}</div>
      {listReady&&!error&&<SinceVisit visit={visit} onReadAll={()=>{setVisit(current=>current&&{...current,newThreads:0,newReplies:0,unreadFollowed:0});setRevision(value=>value+1)}}/>}
      {error?<div className="forum-empty" role="alert"><Icon name="message" size={26}/><h2>Discussions could not load</h2><p>{error}</p><button className="button button-quiet" onClick={()=>{setError('');setRevision(value=>value+1)}}>Try again</button></div>:!data||!listReady?<ForumThreadListSkeleton/>:data.threads.length?<ForumThreadList threads={data.threads} context={{category:moduleView?'modules':category,machine:machine?.id,author:profile}}/>:<div className="forum-empty" data-invite={invite||undefined}><Icon name={saved?'bookmark':'message'} size={28}/><h2>{unreadOnly?'Nothing unread':filtered?'No matching discussions':profile?'No public threads yet':saved?'No bookmarks yet':following?'No followed discussions yet':'Be the first to start a conversation'}</h2><p>{unreadOnly?'You have read everything here. New replies will show up as they arrive.':filtered?(askInstead?'Try other words or fewer filters, or ask in a new thread.':'Try another search or clear your filters.'):saved?'Bookmark a thread to keep it close for later.':following?'Follow a thread to find it here. Threads you start or reply to are followed automatically.':profile?'Threads this member starts will appear here.':'Ask a question, share a discovery, or post a configuration you enjoy.'}</p><div className="forum-empty-actions"><a className={'button button-quiet' + (invite&&category==='issues'?' module-issue-action':'')} href={unreadOnly?link({unread:''}):filtered?link({q:'',module:'',status:''}):saved||following||profile?'#forum':startHref}>{invite&&category==='issues'&&<Icon name="message" size={16}/>} {unreadOnly?'Show all':filtered?'Clear filters':saved||following||profile?'Browse discussions':category==='issues'?'Report an issue':'Start a thread'}</a>{askInstead&&<a className="button button-quiet" href={startHref}><Icon name="plus" size={16}/>Start a thread</a>}</div></div>}
      {(page>0||data?.hasMore)&&<nav className="forum-pagination" aria-label="Discussion pages">{page>0?<a className="button button-quiet" href={link({page:String(page-1)})}><Icon name="back" size={14}/>Previous</a>:<span/>}<span>Page {page+1}</span>{data?.hasMore&&<a className="button button-quiet" href={link({page:String(page+1)})}>Next<Icon name="arrow" size={14}/></a>}</nav>}
    </section>{showcase}{!profile&&<div className="forum-overview-sidebar">{join}{home&&<ForumOnlineNow/>}<ForumDirectory machine={machine?.id} href={category=>link({category,saved:'',following:'',view:'',status:''})}/>{overview&&<ForumShowcase layout="invite" machine={machine?.id} shareHref={shareHref}/>}{home&&<ForumHighlights/>}<ForumRecentPosts machine={machine?.id}/></div>}{profile&&!profileFailed&&<div className="forum-overview-sidebar">{join}<ForumProfileReplies items={member?.recentReplies}/></div>}</div>
  </>
}

// The empty editor suggests what a first post in this topic might say.
const POST_PLACEHOLDERS:Partial<Record<ForumCategory,string>>={
  introductions:'Say hello. What do you play, and what brought you here?',
  showcase:'What are people hearing or seeing, and how did you make it?',
  requests:'What would you like to do, and how would it help your music?',
  configs:'What is this set good for, and how do you use it?',
}
function NewThread({configuration:active,configurations,query}:{configuration?:Configuration;configurations:Configuration[];query:URLSearchParams}){
  const {session}=useCommunity()
  const initialCategory=(Object.hasOwn(FORUM_CATEGORIES,query.get('category')??'')?query.get('category'):'general') as ForumCategory
  const requestedMachine=DEVICES_BY_ID[query.get('machine')??'']?query.get('machine')!:communityModule(query.get('module')??'')?.machine??''
  const activeMachine = active ? configurationDevice(active) : ''
  const fallbackShareMachine = machineModules(activeMachine).length ? activeMachine : 'octatrack'
  const initialMachine = machineModules(requestedMachine).length ? requestedMachine
    : initialCategory === 'configs' ? fallbackShareMachine : initialCategory === 'issues' ? '' : requestedMachine
  const [machine,setMachine]=useState(initialMachine),[category,setCategory]=useState(initialCategory),[configId,setConfigId]=useState(active?.id??'')
  const initialModule=COMMUNITY_MODULES.some(module=>module.id===query.get('module')&&(!initialMachine||module.machine===initialMachine))?query.get('module')!:''
  const [moduleId,setModuleId]=useState(initialModule)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[media,setMedia]=useState<PendingMedia[]>([]),[body,setBody]=useState(''),[title,setTitle]=useState('')
  const composer=useRef<HTMLFormElement>(null),[pendingForm,setPendingForm]=useState<HTMLFormElement|null>(null)
  // Once the member is known, their unpublished thread in this tab comes back; a topic, machine or module in the address keeps those selects.
  const memberId=session.user?.id??'',[draftFor,setDraftFor]=useState(''),[restored,setRestored]=useState(false)
  if(initialCategory!=='issues'&&memberId!==draftFor){
    const draft=readForumThreadDraft(memberId)
    setDraftFor(memberId);setTitle(draft?.title??'');setBody(draft?.body??'');setRestored(!!draft)
    if(draft&&!['category','machine','module'].some(key=>query.has(key))){setCategory(draft.category);setMachine(draft.machine);setModuleId(draft.moduleId)}
  }
  useEffect(()=>{if(draftFor&&initialCategory!=='issues')saveForumThreadDraft(draftFor,{title,body,category,machine,moduleId})},[draftFor,initialCategory,title,body,category,machine,moduleId])
  function discardDraft(){setTitle('');setBody('');setCategory(initialCategory);setMachine(initialMachine);setModuleId(initialModule);setRestored(false)}
  const modules=machine?machineModules(machine):COMMUNITY_MODULES
  const choices=configurations.filter(item=>configurationDevice(item)===machine)
  const chosen = choices.find(item => item.id === configId) ?? choices.find(item => item.id === active?.id)
  const configuration = chosen ?? [...choices].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  function changeMachine(value:string){setMachine(value);if(value&&communityModule(moduleId)?.machine!==value)setModuleId('')}
  function changeCategory(value:ForumCategory){setCategory(value);if(value==='configs'&&!machineModules(machine).length)changeMachine(fallbackShareMachine)}
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
        payload.configuration={name:configuration.name,...(machine!=='octatrack'?{device:machine}:{}),moduleIds:configuration.moduleIds,moduleVersions:configuration.moduleVersions,keepStockFx2:configuration.keepStockFx2,...(configuration.usbAudio?{usbAudio:configuration.usbAudio}:{})}
      }
      const result=await post<{id:string}>('/forum/threads',payload);saveForumThreadDraft(memberId);window.location.assign('#forum/thread/'+result.id)
    }catch(error){setError(errorText(error))}finally{setBusy(false)}
  }
  if(initialCategory==='issues')return <><BackLink href="#forum?category=issues">Bug reports</BackLink><div className="page-heading"><div><h1>Report a module issue</h1><p>Choose the affected module, then use its “Report an issue” form.</p></div></div><p className="service-note">Issue reports include the reproduction steps, configuration and device details developers need.</p><div className="community-form"><label>Machine<select value={machine} onChange={event=>changeMachine(event.target.value)}><option value="">Every machine</option>{DEVICES.filter(device=>machineModules(device.id).length).map(device=><option key={device.id} value={device.id}>{device.name}</option>)}</select></label><label>Affected module<select value={moduleId} onChange={event=>setModuleId(event.target.value)}><option value="">Choose a module</option>{modules.map(module=><option key={module.id} value={module.id}>{module.name}{!machine?' · '+DEVICES_BY_ID[module.machine].name:''}</option>)}</select></label>{moduleId&&<a className="button button-quiet module-issue-action" href={moduleIssueHref(moduleId)} onClick={()=>{if(query.get('draft')==='1')moveDiscussionIssueDraft('',moduleId)}}><Icon name="message" size={16}/>Report an issue</a>}</div></>
  const emptyConfig=category==='configs'&&!configuration?.moduleIds.length
  return <><BackLink href="#forum">All discussions</BackLink><div className="page-heading"><div><h1>Start a thread</h1><p>Ask a question, share a discovery or show what you made.</p></div></div>
    <MemberInvite id="forum-new-join" title="Sign in to start a thread" text="Everyone can read the forum. A free account lets you post, reply and follow threads." next={'forum/new'+(String(query)?'?'+query:'')}/>
    {session.user?.verified&&<div className="forum-compose-layout"><form ref={composer} className="community-form forum-composer" onSubmit={event=>{event.preventDefault();requestSubmit(event.currentTarget)}}>
    <div className="forum-composer-heading"><Avatar username={session.user.username} avatar={session.user.avatar}/><p>Posting as <strong>@{session.user.username}</strong></p></div>
    {restored&&<p className="service-note">Draft restored. <button type="button" className="text-button" onClick={discardDraft}>Discard</button></p>}
    <label className="forum-compose-title">Title<input name="title" aria-label="Title" aria-describedby="forum-title-hint" required maxLength={160} placeholder="What is your thread about?" value={title} onChange={event=>setTitle(event.target.value)}/><span id="forum-title-hint" className="forum-field-hint">A specific title helps the right people find your thread.</span></label>
    <div className="forum-compose-meta"><label>Topic<select value={category} aria-describedby="forum-topic-hint" onChange={event=>changeCategory(event.target.value as ForumCategory)}>{Object.entries(FORUM_CATEGORIES).filter(([value])=>value!=='issues').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span id="forum-topic-hint" className="forum-field-hint">{FORUM_CATEGORY_DESCRIPTIONS[category]}</span></label>
    <label>Machine<select value={machine} onChange={event=>changeMachine(event.target.value)}>{category!=='configs'&&<option value="">General / every machine</option>}{DEVICES.filter(device=>category!=='configs'||machineModules(device.id).length).map(device=><option key={device.id} value={device.id}>{device.name}{device.variants?' '+device.variants.join(' / '):''}</option>)}</select></label>
    {!!modules.length&&<label>Module (optional)<select name="moduleId" value={moduleId} onChange={event=>setModuleId(event.target.value)}><option value="">Choose a module</option>{modules.map(module=><option key={module.id} value={module.id}>{module.name}{!machine?' · '+DEVICES_BY_ID[module.machine].name:''}</option>)}</select></label>}
    </div>
    <ModuleIssueNotice moduleId={moduleId} machine={machine} onReportIssue={reportIssue}/>
    {category==='configs'&&<aside className="forum-config forum-shared-config forum-config-preview">{choices.length>1&&<label>Configuration to share<select value={configuration?.id??''} onChange={event=>setConfigId(event.target.value)}>{choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<h2>{configuration?.name??'No configuration selected'}</h2>{configuration?.moduleIds.length?<ul>{configuration.moduleIds.map(id=><li key={id}>{nativeModule(machine,id)?.name??id} <span className="forum-hardware-version">{configuration.moduleVersions[id]}</span></li>)}</ul>:<p className="forum-config-empty">{configuration?'This configuration has no modules yet.':'Create a configuration for this machine first.'}</p>}<p>This publishes a fixed copy of the selected configuration. Firmware stays on your device.</p><a className="text-button" href={isZoomSetDevice(machine) ? zoomHubHref(machine, 'set') : deviceHref(machine, 'configuration')}>{emptyConfig?'Add modules':'Review your configuration'}<Icon name="arrow" size={13}/></a></aside>}
    <div className="forum-editor-field"><label htmlFor="forum-new-post">Your post</label><RichTextEditor id="forum-new-post" name="body" label="Your post" value={body} onChange={setBody} disabled={busy} placeholder={POST_PLACEHOLDERS[category]??'A few sentences are enough. What did you try, and what would you like to know?'}/></div>{session.forumMedia&&<MediaPicker items={media} setItems={setMedia}/>}
    <div className="forum-composer-footer"><p className="service-note">Posts are public. Share only original or properly licensed content, including samples in sound clips. Do not post firmware, dumps, passwords or personal information. <a href="#community-rules">Community rules</a></p>{emptyConfig&&<span id="forum-publish-hint" className="sr-only">Add modules to this configuration to share it.</span>}<button className="button button-primary" aria-describedby={emptyConfig?'forum-publish-hint':undefined} disabled={busy||mediaBusy(media)||!body.trim()||body.length>12000||emptyConfig}>{busy?'Publishing…':'Publish thread'}<Icon name="arrow" size={15}/></button></div></form>
    <aside className="forum-compose-tips"><h2>Tips for a good thread</h2><p><strong>Give it context.</strong>Share the module, what you tried, and what you want to explore.</p><p><strong>Make it easy to follow.</strong>A short sound clip, a screenshot or the configuration you used helps others try it.</p><p><strong>Keep it kind.</strong>Module authors build in their spare time and owe no fix or reply time. Criticise the work, not the person, credit the people behind your ideas and leave room for different approaches.</p></aside></div>}{pendingForm&&<ModuleDiscussionDialog onClose={()=>setPendingForm(null)} onPost={()=>{const form=pendingForm;setPendingForm(null);void submit(form)}} onReportIssue={reportIssue}/>} {error&&<p className="file-error" role="alert">{error}</p>}</>
}
export function ForumPage({route,configuration,configurations,onCopy}:{route:string;configuration?:Configuration;configurations:Configuration[];onCopy:(config:SharedConfiguration)=>void}){
  const [path,search='']=route.split('?'),query=new URLSearchParams(search),segments=path.split('/')
  return <div className={'community-page forum-page'+(segments[1]==='thread'||segments[1]==='messages'?' forum-reading-page':'')}>{segments[1]==='shoutbox'?<><BackLink href="#forum">All discussions</BackLink><div className="page-heading forum-heading"><div><h1>Shoutbox 8 archive</h1><p>Quick questions. Small discoveries. Say hello.</p></div></div><ForumShoutbox archive page={Number(query.get('page')??0)}/></>:segments[1]==='messages'?<ForumMessages username={segments[2]}/>:segments[1]==='new'?<NewThread configuration={configuration} configurations={configurations} query={query}/>:segments[1]==='thread'&&segments[2]?<ForumThreadView key={segments[2]+'?'+search} id={segments[2]} query={query} onCopy={onCopy}/>:<ForumList key={search+segments[2]} query={query} profile={segments[1]==='profile'?segments[2]:undefined} machineHint={configuration?configurationDevice(configuration):undefined}/>}</div>
}
