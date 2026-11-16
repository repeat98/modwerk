import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ModulePreview } from './ModulePreview'
import { AudioPreviewPlayer } from './AudioPreviewPlayer'
import { useModuleAudioPreviews } from './audio-preview-context'
import { Icon } from './Icon'
import type { AudioPreviewClip } from './audio-preview'
import './audio-preview.css'

/** The dock is a sibling of the cover link, so seeking never opens the module page. */
export function ModuleAudioCardCover({ id, name, href, onBrowse, inert, prepare, onPrepare, clip, children }: {
  id: string; name: string; href: string; onBrowse?: () => void; inert?: boolean; prepare: boolean
  onPrepare: () => void; clip: AudioPreviewClip; children: ReactNode
}) {
  return <div className="module-cover module-audio-cover" data-module={id} inert={inert} onPointerEnter={event => { if (event.pointerType !== 'touch') onPrepare() }} onFocus={onPrepare}>
    <a className="module-audio-cover-link" href={href} onClick={onBrowse} onAuxClick={onBrowse} aria-label={'View ' + name + ' (audio preview available)'}>{children}</a>
    <span className="audio-preview-hint" aria-hidden="true"><span className="audio-preview-hint-idle"><Icon name="play" size={13}/></span><span className="audio-preview-hint-playing"><Icon name="wave" size={13}/></span></span>
    <div className="audio-preview-dock"><AudioPreviewPlayer key={clip.id} clip={clip} name={name} prepare={prepare} variant="dock"/></div>
  </div>
}

export function ModuleAudioDetailPreview({ id, name, children }: { id: string; name: string; children?: ReactNode }) {
  const { clips, onAdd, onRemove, added, error, guide } = useModuleAudioPreviews(id)
  const guideId = useId(), addButton = useRef<HTMLButtonElement>(null)
  const [guideDismissed, setGuideDismissed] = useState(false)
  const showGuide = guide && !guideDismissed && !!onAdd
  useEffect(() => {
    if (!showGuide) return
    addButton.current?.focus({ preventScroll: true })
    addButton.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
  }, [showGuide])
  const [selection, setSelection] = useState({ id:'', added:'' })
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const selected = selection.added === added ? selection.id : added
  if (!clips.length && !onAdd) return children ?? <ModulePreview id={id}/>
  const index = Math.max(0, clips.findIndex(clip => clip.id === selected))
  const clip = clips[index]
  function step(direction: number) { setSelection({id:clips[(index + direction + clips.length) % clips.length].id,added}) }
  async function remove() {
    if (!clip || !onRemove || !window.confirm('Remove this audio preview?')) return
    setRemoving(true); setRemoveError('')
    try { await onRemove(clip.id) } catch (failure) { setRemoveError(failure instanceof Error ? failure.message : 'This preview could not be removed.') }
    finally { setRemoving(false) }
  }
  return <div className={'module-audio-detail' + (clip ? ' has-audio' : '')} data-module={id}>
    <div className="module-audio-art">
      {children ?? <ModulePreview id={id}/>}
      {clip && <div className="audio-preview-dock"><AudioPreviewPlayer key={clip.id} clip={clip} name={name}/></div>}
    </div>
    {showGuide && <div className="audio-preview-upload-guide" id={guideId} role="status">
      <div><strong>Add your recording</strong><p>Click <strong>Add preview</strong> below to upload a recording of {name}. You’ll find the same button on every module page.</p><small>Verified account · WAV, MP3 or Ogg · up to 12 MB</small></div>
      <button type="button" className="icon-button" aria-label="Dismiss upload tip" onClick={() => setGuideDismissed(true)}><Icon name="close" size={16}/></button>
    </div>}
    {(clips.length > 1 || onAdd) && <div className={'audio-preview-navigation' + (showGuide ? ' is-guided' : '')}>
      {clips.length > 1 && <div className="audio-preview-carousel" role="group" aria-label="Audio previews">
        <button type="button" onClick={() => step(-1)} aria-label="Previous audio preview"><Icon name="back" size={16}/></button>
        <span aria-live="polite" aria-atomic="true"><strong>{index + 1}</strong> / {clips.length}</span>
        <button type="button" onClick={() => step(1)} aria-label="Next audio preview"><Icon name="back" size={16}/></button>
      </div>}
      {onAdd && <button ref={addButton} type="button" className="text-button audio-preview-add" aria-describedby={showGuide ? guideId : undefined} onClick={() => { setGuideDismissed(true); onAdd() }}><Icon name="plus" size={15}/>Add preview</button>}
      {clip?.canRemove && onRemove && <button type="button" className="icon-button audio-preview-remove" aria-label="Remove this audio preview" onClick={() => void remove()} disabled={removing}><Icon name="close" size={16}/></button>}
    </div>}
    {(removeError||error) && <p className="file-error" role="alert">{removeError||error}</p>}
  </div>
}
