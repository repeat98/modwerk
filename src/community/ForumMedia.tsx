import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { apiFetch } from './api'
import { apiUrl } from '../hosting'
import { Icon } from '../components/Icon'
import { AudioPlayer } from '../components/AudioPlayer'
import { FORUM_MEDIA, type ForumAttachment } from './forum-contract'
import { compressAudio, compressImage, type PendingMedia } from './forum-media-client'
function size(bytes:number){return bytes<1024*1024?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1024/1024).toFixed(1)+' MB'}
/** Picks, compresses and uploads files as soon as they are chosen; the post sends only their IDs and descriptions. */
export function MediaPicker({items,setItems}:{items:PendingMedia[];setItems:Dispatch<SetStateAction<PendingMedia[]>>}){
  const input=useRef<HTMLInputElement>(null),previews=useRef(new Set<string>())
  useEffect(()=>{const urls=previews.current;return()=>{for(const url of urls)URL.revokeObjectURL(url)}},[])
  const update=(key:string,change:Partial<PendingMedia>)=>setItems(current=>current.map(item=>item.key===key?{...item,...change}:item))
  async function add(file:File){
    const kind=file.type.startsWith('image/')?'image':file.type.startsWith('audio/')||/\.(wav|aiff?|flac|mp3|ogg|opus|m4a)$/i.test(file.name)?'audio':null,key=crypto.randomUUID()
    if(!kind){setItems(current=>[...current,{key,kind:'image',name:file.name,preview:'',caption:'',status:'error',error:'Choose an image or a sound file.'}]);return}
    setItems(current=>[...current,{key,kind,name:file.name,preview:'',caption:'',status:'preparing'}])
    try{
      const blob=kind==='image'?await compressImage(file):await compressAudio(file),preview=URL.createObjectURL(blob)
      previews.current.add(preview);update(key,{preview,status:'uploading',bytes:blob.size})
      const result=await apiFetch('/forum/media',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob})
      const body=await result.json().catch(()=>({})) as {id?:string;error?:string}
      if(!result.ok||!body.id)throw new Error(body.error??'The file could not be uploaded.')
      update(key,{id:body.id,status:'ready'})
    }catch(error){update(key,{status:'error',error:error instanceof Error?error.message:'The file could not be uploaded.'})}
  }
  function remove(item:PendingMedia){
    // Unused uploads are purged within a day anyway; removing now frees the file sooner.
    if(item.id)void apiFetch('/forum/media/'+item.id,{method:'DELETE'}).catch(()=>undefined)
    setItems(current=>current.filter(entry=>entry.key!==item.key))
  }
  const room=FORUM_MEDIA.perPost-items.filter(item=>item.status!=='error').length
  return <div className="forum-media-picker">
    {!!items.length&&<ul className="forum-media-pending">{items.map(item=><li key={item.key} data-status={item.status} data-kind={item.kind}>
      <div className="forum-media-pending-preview">{item.preview?item.kind==='image'?<img src={item.preview} alt=""/>:<AudioPlayer src={item.preview} label={item.name} variant="compact"/>:<Icon name={item.kind==='image'?'file':'wave'} size={20}/>}</div>
      <div className="forum-media-pending-details">
        <span className="forum-media-name">{item.name}</span>
        <span className="forum-media-status" role={item.status==='error'?'alert':'status'}>{item.status==='preparing'?'Compressing…':item.status==='uploading'?'Uploading '+size(item.bytes??0)+'…':item.status==='ready'?(item.kind==='image'?'Image':'Sound clip')+' · '+size(item.bytes??0):item.error}</span>
        {item.status!=='error'&&<label><span className="sr-only">Description of {item.name}</span><input value={item.caption} maxLength={FORUM_MEDIA.captionLength} onChange={event=>update(item.key,{caption:event.target.value})} placeholder={item.kind==='image'?'Describe the image for people who cannot see it':'What does this clip demonstrate? (optional)'}/></label>}
      </div>
      <button type="button" className="text-button" onClick={()=>remove(item)} disabled={item.status==='preparing'}><Icon name="close" size={13}/>Remove</button>
    </li>)}</ul>}
    <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,audio/*,.wav,.aif,.aiff,.flac,.mp3,.ogg,.opus,.m4a" onChange={event=>{for(const file of [...event.target.files??[]].slice(0,Math.max(room,0)))void add(file);event.target.value=''}}/>
    <button type="button" className="button button-quiet" disabled={room<=0} onClick={()=>input.current?.click()}><Icon name="plus" size={14}/>Add image or sound</button>
    <span className="forum-field-hint">Up to {FORUM_MEDIA.perPost} files. Images become WebP and sound becomes Opus in your browser; photo location data is removed.</span>
  </div>
}
// Hidden posts are visible only to the administrator, whose session is a header, so those files are fetched instead of linked.
function useMediaUrl(id:string,privateFetch:boolean){
  const [fetched,setFetched]=useState<{id:string;url:string}|null>(null)
  useEffect(()=>{
    if(!privateFetch)return
    let cancelled=false,objectUrl=''
    void apiFetch('/forum/media/'+id).then(async result=>{if(!result.ok)return;const blob=await result.blob();if(cancelled)return;objectUrl=URL.createObjectURL(blob);setFetched({id,url:objectUrl})}).catch(()=>undefined)
    return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[id,privateFetch])
  return privateFetch?(fetched?.id===id?fetched.url:''):apiUrl('/forum/media/'+id)
}
function Attachment({item,privateFetch,onRemove}:{item:ForumAttachment;privateFetch:boolean;onRemove?:()=>void}){
  const url=useMediaUrl(item.id,privateFetch)
  return <figure className="forum-attachment" data-kind={item.kind}>
    {!url?<p role="status">Loading…</p>:item.kind==='image'?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.caption||'Attached image'} loading="lazy"/></a>:<AudioPlayer src={url} label={item.caption || 'sound clip'}/>}
    {(item.caption||onRemove)&&<figcaption>{item.caption}{onRemove&&<button type="button" className="text-button" onClick={onRemove}><Icon name="close" size={13}/>Remove</button>}</figcaption>}
  </figure>
}
export function ForumAttachments({items,privateFetch=false,onRemove}:{items:ForumAttachment[];privateFetch?:boolean;onRemove?:(item:ForumAttachment)=>void}){
  if(!items.length)return null
  const sounds=items.filter(item=>item.kind==='audio'),images=items.filter(item=>item.kind==='image')
  return <div className="forum-attachments">
    {!!sounds.length&&<div className="forum-attachment-sounds">{sounds.map(item=><Attachment key={item.id} item={item} privateFetch={privateFetch} onRemove={onRemove&&(()=>onRemove(item))}/>)}</div>}
    {!!images.length&&<div className="forum-attachment-images" data-count={images.length}>{images.map(item=><Attachment key={item.id} item={item} privateFetch={privateFetch} onRemove={onRemove&&(()=>onRemove(item))}/>)}</div>}
  </div>
}
