import { MemberPrompt } from './MemberPrompt'
import { useEffect, useState } from 'react'
import { api, apiFetch, post } from './api'
import { apiUrl, assetUrl } from '../hosting'
import { moduleMediaDocument } from './module-media'
import { moduleMediaGuide } from '../catalog/module-media-guides'
import type { PublicMedia } from './api'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { AudioPlayer } from '../components/AudioPlayer'
import { MediaCredits } from '../components/MediaCredits'
import { ModulePopularity } from './ModulePopularity'
import { WORKS_REPORT_NOTE } from './ModuleWorksCount'
import { modulePageHref, moduleThreadId } from './modules'
import { useLoginPrompt } from './LoginPromptDialog'
import { ForumThreadView } from './ForumThreadView'
import { MODULE_STATISTICS_CHANGED } from './module-statistics'
import { SubmittedAudioPreviews } from '../components/SubmittedAudioPreviews'
import { useModuleAudioPreviews } from '../components/audio-preview-context'
type Data = {likes:number;liked:boolean;downloads?:number;downloadsStarted?:string|null;discussionCount?:number;sharedConfigurations?:number;worksReports?:number;media:PublicMedia[]}
function MediaPreview({item,privatePreview}:{item:PublicMedia;privatePreview:boolean}) {
  const [preview,setPreview]=useState<{id:string;url:string}|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    if(!privatePreview)return
    let cancelled=false,url=''
    void apiFetch('/media/'+item.id).then(async result=>{
      if(!result.ok)throw new Error('This preview could not be loaded.')
      const blob=await result.blob()
      if(cancelled)return
      url=URL.createObjectURL(blob);setPreview({id:item.id,url})
    }).catch(error=>{if(!cancelled)setError(error.message)})
    return()=>{cancelled=true;if(url)URL.revokeObjectURL(url)}
  },[item.id,privatePreview])
  const url=privatePreview?(preview?.id===item.id?preview.url:''):apiUrl('/media/'+item.id)
  return <figure>{error?<p className="file-error" role="alert">{error}</p>:!url?<p role="status">Loading preview…</p>:item.kind==='image'?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.caption} loading="lazy" /></a>:<AudioPlayer src={url} label={item.caption || 'audio preview'}/>}<figcaption>{item.caption}<span>{item.capture_type==='hardware'?'Hardware capture':item.capture_type==='emulator'?'Emulator capture':'Audio preview'}</span></figcaption></figure>
}
export function MediaGallery({media,privatePreview=false}:{media:PublicMedia[];privatePreview?:boolean}) {
  return <div className="media-gallery">{media.map(item=><MediaPreview key={item.id} item={item} privatePreview={privatePreview}/>)}</div>
}
type ModuleMedia = NonNullable<ReturnType<typeof moduleMediaDocument>>['media'][number]
function ModuleMediaGallery({id,version,media}:{id:string;version:string;media:readonly ModuleMedia[]}) {
  return <div className="media-gallery">{media.map(item=>{
    const url=assetUrl('module-media/'+id+'/'+version+'/'+item.path)
    return <figure key={item.path}>
      <a href={url} target="_blank" rel="noreferrer"><img className={item.lcd ? 'ot-ui-capture' : undefined} src={url} alt={item.alt} loading="lazy"/></a>
      <figcaption>{item.caption}</figcaption>
    </figure>
  })}</div>
}
export function ModuleCommunity({id,mode='all',onDiscuss,onReportIssue,onDiscussionCount}:{id:string;mode?:'all'|'media'|'discussion'|'overview'|'likes';onDiscuss?:()=>void;onReportIssue?:()=>void;onDiscussionCount?:(count:number)=>void}) {
  const {session,refresh} = useCommunity()
  const {onAdd:onAddPreview} = useModuleAudioPreviews(id)
  // Visitors see live buttons; pressing one opens the sign-in prompt and brings them back to this page.
  const {dialog,gate}=useLoginPrompt(modulePageHref(id).slice(1))
  const document=moduleMediaDocument(id),sourceMedia=document?.media??[]
  // Declared recordings already play in the main preview; the gallery contains screenshots only.
  const screenshots=sourceMedia.filter(item=>item.captureType!=='audio')
  const mediaGuide=moduleMediaGuide<ModuleMedia>(id,document?.version??'',screenshots)
  const [data,setData] = useState<Data | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('')
  useEffect(() => {
    let cancelled=false, latest=0
    // Also refresh when a feedback report is posted elsewhere on this page.
    function load() {
      if (!session.available) return
      const request=++latest
      void api<Data>('/modules/' + id).then(value => {if (!cancelled&&request===latest) {setData(value);setError('')}}).catch(error => {if(!cancelled&&request===latest)setError(error.message)})
    }
    load()
    window.addEventListener(MODULE_STATISTICS_CHANGED,load)
    return () => {cancelled=true;window.removeEventListener(MODULE_STATISTICS_CHANGED,load)}
  },[id,session.available,session.user?.id])
  const discussionCount=data?.discussionCount
  useEffect(()=>{if(discussionCount!==undefined)onDiscussionCount?.(discussionCount)},[discussionCount,onDiscussionCount])
  async function toggleLike() {
    setBusy(true);setError('');setNotice('')
    try {
      await post('/modules/' + id + '/like',{liked:!data?.liked})
      await refresh();setData(await api<Data>('/modules/' + id))
      window.dispatchEvent(new Event(MODULE_STATISTICS_CHANGED))
      setNotice(data?.liked?'Like removed.':'Liked.')
    } catch(error){setError(error instanceof Error?error.message:'Unable to save.')} finally{setBusy(false)}
  }
  const mediaSection = <section className="detail-section">
    <div className="section-title"><h2>{mode === 'media' ? 'Previews' : 'Screenshots'}</h2>{onAddPreview ? <button type="button" className="text-button" onClick={onAddPreview}>Add preview <Icon name="plus" size={15}/></button> : <a className="text-button" href={'#submit/' + id}>Add media <Icon name="plus" size={15}/></a>}</div>
    {mode === 'media' && <SubmittedAudioPreviews id={id}/>}
    {mode === 'media' && !!screenshots.length && <h3 className="module-preview-docs-title">Module screenshots</h3>}
    {!!mediaGuide.primary.length && <ModuleMediaGallery id={id} version={document!.version} media={mediaGuide.primary}/>}
    {!!mediaGuide.additional.length && <details key={id} className="module-disclosure">
      <summary><span>More screenshots<small>{mediaGuide.additional.length} additional {mediaGuide.additional.length===1?'page':'pages'}</small></span><Icon name="plus" size={16}/></summary>
      <div className="disclosure-content"><ModuleMediaGallery id={id} version={document!.version} media={mediaGuide.additional}/></div>
    </details>}
    <MediaCredits key={'credits-' + id} media={sourceMedia}/>
    {!!data?.media.length && <MediaGallery media={data.media}/>}
    {mode !== 'media' && !screenshots.length && !data?.media.length && <div className="media-empty"><Icon name="file" size={24}/><div><strong>Share a preview</strong><p>{onAddPreview ? 'Add an audio recording with Add preview. Screenshots can be submitted via PR.' : 'Share a screenshot or audio preview via PR.'}</p></div></div>}
  </section>
  // Working reports and likes are the community's verdict on a module. The like tile is the like button.
  const works=data?.worksReports
  const signals = (overview:boolean) => <section className={'community-signals'+(overview?'':' detail-section')} aria-label="Community feedback">
    <h2>Community</h2>
    <div className="signal-tiles">
      {mode!=='likes'&&<div className="signal-tile is-works" title={WORKS_REPORT_NOTE}><Icon name="check" size={16}/><strong>{works?.toLocaleString()??'—'}</strong><span>Working</span></div>}
      <button className="signal-tile is-like" title="Like this module" aria-label={(data?.liked?'Unlike ':'Like ')+id} aria-pressed={data?.liked??false} disabled={!session.available||!data||busy} onClick={gate('Sign in to like this module',()=>void toggleLike())}><Icon name="heart" size={16}/><strong>{data?.likes.toLocaleString()??'—'}</strong><span>{data?.liked?'Liked':'Likes'}</span></button>
    </div>
    <ModulePopularity statistics={data??undefined} id={id} secondary/>
    {overview&&<button className="button button-quiet" onClick={onDiscuss}>Join the discussion <Icon name="arrow" size={14}/></button>}
    <p className="service-note">{!session.available||(!data&&error)?'Community figures unavailable.':mode==='likes'?'Likes come from registered members.':'Working counts members who tried it on their instrument.'}</p>
    {!data&&error&&<button className="text-button" onClick={()=>{setError('');void api<Data>('/modules/'+id).then(value=>setData(value)).catch(error=>setError(error.message))}}>Try again</button>}
    {!overview&&<MemberPrompt/>}
  </section>
  if(mode==='overview')return <>
    <div className="module-showcase">
      {mediaSection}
      {signals(true)}
    </div>
    {error&&<p className="file-error" role="alert">{error}</p>}{notice&&<p className="success-note" role="status">{notice}</p>}{dialog}
  </>
  return <>
    {mode !== 'discussion' && mode !== 'likes' && mediaSection}
    {mode !== 'media' && <div className="community-grid">{mode !== 'likes' && <section className="detail-section module-discussion forum-page"><ForumThreadView key={id} id={moduleThreadId(id)} embedded onReportIssue={onReportIssue} onReplyCount={onDiscussionCount}/></section>}
    {signals(false)}</div>}
    {mode !== 'media' && <p className="community-privacy">{mode === 'likes' ? 'Likes are public.' : 'Usernames, posts and likes are public.'} Sign in to manage your activity across devices. Email addresses stay private. Older guest names remain unverified. Posts are moderated.</p>}
    {mode !== 'media' && !session.available && <p className="service-note">Community is unavailable. {mode === 'likes' ? 'Likes are paused.' : 'Discussions and likes are paused.'}</p>}
    {error&&<p className="file-error" role="alert">{error}</p>}{notice&&<p className="success-note" role="status">{notice}</p>}{dialog}
  </>
}
