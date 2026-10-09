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
import { ModulePopularity } from './ModulePopularity'
import { modulePageHref, moduleThreadId } from './modules'
import { useLoginPrompt } from './LoginPromptDialog'
import { ForumThreadView } from './ForumThreadView'
import { MODULE_STATISTICS_CHANGED } from './module-statistics'
type Data = {ratings:{average:number|null;count:number};ownRating:number;likes:number;liked:boolean;downloads?:number;downloadsStarted?:string|null;discussionCount?:number;sharedConfigurations?:number;worksReports?:number;media:PublicMedia[]}
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
      {item.captureType==='audio'?<AudioPlayer src={url} label={item.caption || 'audio preview'}/>:<a href={url} target="_blank" rel="noreferrer"><img className={item.lcd ? 'ot-ui-capture' : undefined} src={url} alt={item.alt} loading="lazy"/></a>}
      <figcaption>{item.caption}<span>{item.captureType==='hardware'?'Hardware capture':item.captureType==='emulator'?'Emulator capture':item.captureType==='audio'?'Audio preview':'LCD capture'} · {item.credit} · {item.license}</span>{item.source!=='original'&&<a href={item.source} target="_blank" rel="noreferrer">Original source ↗</a>}</figcaption>
    </figure>
  })}</div>
}
export function ModuleCommunity({id,mode='all',onDiscuss,onReportIssue,onDiscussionCount}:{id:string;mode?:'all'|'media'|'discussion'|'overview'|'ratings';onDiscuss?:()=>void;onReportIssue?:()=>void;onDiscussionCount?:(count:number)=>void}) {
  const {session,refresh} = useCommunity()
  // Visitors see live buttons; pressing one opens the sign-in prompt and brings them back to this page.
  const {dialog,gate}=useLoginPrompt(modulePageHref(id).slice(1))
  const document=moduleMediaDocument(id),sourceMedia=document?.media??[]
  const mediaGuide=moduleMediaGuide<ModuleMedia>(id,document?.version??'',sourceMedia)
  const [data,setData] = useState<Data | null>(null), [rating,setRating] = useState(0), [error,setError] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('')
  useEffect(() => {
    let cancelled=false, latest=0
    // Also refresh when a feedback report is posted elsewhere on this page.
    function load() {
      if (!session.available) return
      const request=++latest
      void api<Data>('/modules/' + id).then(value => {if (!cancelled&&request===latest) {setData(value);setRating(value.ownRating);setError('')}}).catch(error => {if(!cancelled&&request===latest)setError(error.message)})
    }
    load()
    window.addEventListener(MODULE_STATISTICS_CHANGED,load)
    return () => {cancelled=true;window.removeEventListener(MODULE_STATISTICS_CHANGED,load)}
  },[id,session.available,session.user?.id])
  const discussionCount=data?.discussionCount
  useEffect(()=>{if(discussionCount!==undefined)onDiscussionCount?.(discussionCount)},[discussionCount,onDiscussionCount])
  async function send(kind:'rating'|'like') {
    setBusy(true);setError('');setNotice('')
    try {
      await post('/modules/' + id + '/' + kind,kind==='like'?{liked:!data?.liked}:{value:rating})
      await refresh();setData(await api<Data>('/modules/' + id))
      setNotice(kind==='like'?(data?.liked?'Like removed.':'Liked.'):'Rating saved.')
    } catch(error){setError(error instanceof Error?error.message:'Unable to save.')} finally{setBusy(false)}
  }
  const mediaSection = <section className="detail-section">
    <div className="section-title"><h2>Screenshots & audio</h2><a className="text-button" href={'#submit/' + id}>Add media <Icon name="plus" size={15}/></a></div>
    {!!mediaGuide.primary.length && <ModuleMediaGallery id={id} version={document!.version} media={mediaGuide.primary}/>}
    {!!mediaGuide.additional.length && <details key={id} className="module-disclosure">
      <summary><span>More screenshots<small>{mediaGuide.additional.length} additional {mediaGuide.additional.length===1?'page':'pages'}</small></span><Icon name="plus" size={16}/></summary>
      <div className="disclosure-content"><ModuleMediaGallery id={id} version={document!.version} media={mediaGuide.additional}/></div>
    </details>}
    {!!data?.media.length && <MediaGallery media={data.media}/>}
    {!sourceMedia.length && !data?.media.length && <div className="media-empty"><Icon name="file" size={24}/><div><strong>No media yet</strong><p>Share a screenshot or audio preview via PR.</p></div></div>}
  </section>
  if(mode==='overview')return <>
    <div className="module-showcase">
      {mediaSection}
      <section className="ratings-overview" aria-label="Module ratings">
        <div className="section-title"><h2>Ratings</h2><button className="button button-quiet like-button" aria-label={(data?.liked?'Unlike ':'Like ')+id} aria-pressed={data?.liked??false} disabled={!session.available||!data||busy} onClick={gate('Sign in to like this module',()=>void send('like'))}>{data?.liked?'♥':'♡'} {data?.likes??'—'}</button></div>
        <ModulePopularity statistics={data??undefined} id={id}/>
        <div className="rating-empty"><strong>{data?.ratings.average?.toFixed(1)??'—'}</strong><div><span className="star-line" aria-hidden="true">{[1,2,3,4,5].map(i=><span key={i} className={data?.ratings.average && i<=Math.round(data.ratings.average)?'is-filled':''}><Icon name="star" size={16}/></span>)}</span><span role="status">{!session.available||(!data&&error)?'Ratings unavailable':!data?'Loading ratings…':data.ratings.count?data.ratings.count+(data.ratings.count===1?' rating':' ratings'):'No ratings yet'}</span></div></div>
        <button className="button button-quiet" onClick={onDiscuss}>Rate & discuss <Icon name="arrow" size={14}/></button>
        <p className="service-note">Ratings from registered members.</p>
        {!data&&error&&<button className="text-button" onClick={()=>{setError('');void api<Data>('/modules/'+id).then(value=>{setData(value);setRating(value.ownRating)}).catch(error=>setError(error.message))}}>Try again</button>}
      </section>
    </div>
    {error&&<p className="file-error" role="alert">{error}</p>}{notice&&<p className="success-note" role="status">{notice}</p>}{dialog}
  </>
  return <>
    {mode !== 'discussion' && mode !== 'ratings' && mediaSection}
    {mode !== 'media' && <div className="community-grid">{mode !== 'ratings' && <section className="detail-section module-discussion forum-page"><ForumThreadView key={id} id={moduleThreadId(id)} embedded onReportIssue={onReportIssue} onReplyCount={onDiscussionCount}/></section>}
    <section className="detail-section ratings-section"><div className="section-title"><h2>Ratings</h2><button className="button button-quiet like-button" aria-label={(data?.liked?'Unlike ':'Like ')+id} aria-pressed={data?.liked??false} disabled={!session.available||busy} onClick={gate('Sign in to like this module',()=>void send('like'))}>{data?.liked?'♥':'♡'} {data?.likes??0}</button></div><ModulePopularity statistics={data??undefined} id={id}/><div className="rating-empty"><strong>{data?.ratings.average?.toFixed(1) ?? '—'}</strong><div><span className="star-line">{[1,2,3,4,5].map(i=><span key={i} className={data?.ratings.average && i<=Math.round(data.ratings.average)?'is-filled':''}><Icon name="star" size={16}/></span>)}</span><span>{data?.ratings.count ? data.ratings.count+(data.ratings.count===1?' rating':' ratings'):'No ratings yet'}</span></div></div><fieldset className="rating-picker" disabled={!session.available}><legend>Your rating</legend><div>{[1,2,3,4,5].map(i=><button key={i} className={rating>=i?'is-filled':''} aria-label={i+(i===1?' star':' stars')} aria-pressed={rating===i} onClick={gate('Sign in to rate this module',()=>setRating(i))}><Icon name="star" size={23}/></button>)}</div></fieldset><button className="button button-quiet rating-save" disabled={!session.available||busy||!rating} onClick={gate('Sign in to rate this module',()=>void send('rating'))}>Save rating</button><MemberPrompt/></section></div>}
    {mode !== 'media' && <p className="community-privacy">{mode === 'ratings' ? 'Ratings and likes are public.' : 'Usernames, posts, ratings and likes are public.'} Sign in to manage your activity across devices. Email addresses stay private. Older guest names remain unverified. Posts are moderated.</p>}
    {mode !== 'media' && !session.available && <p className="service-note">Community is unavailable. {mode === 'ratings' ? 'Ratings are paused.' : 'Discussions and ratings are paused.'}</p>}
    {error&&<p className="file-error" role="alert">{error}</p>}{notice&&<p className="success-note" role="status">{notice}</p>}{dialog}
  </>
}
