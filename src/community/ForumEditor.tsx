import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'
import type { RichTextEditor as Editor } from './RichTextEditor'
import { RenderBoundary } from '../components/RenderBoundary'

const RichEditor=lazy(()=>import('./RichTextEditor').then(module=>({default:module.RichTextEditor})))
/** The same controlled draft and form field, without depending on the formatting bundle. */
export function EditorFallback({id,label,value,onChange,name,placeholder='Write your post…',disabled=false}:ComponentProps<typeof Editor>){
  return <div className="forum-editor">
    <p className="service-note" role="status" id={id+'-editor-hint'}>Formatting is unavailable. You can still write in Markdown.</p>
    <textarea id={id} name={name} aria-label={label} aria-describedby={id+'-editor-hint'} value={value} disabled={disabled} maxLength={12000} rows={8} onChange={event=>onChange(event.target.value)} placeholder={placeholder}/>
  </div>
}
export function RichTextEditor(props:ComponentProps<typeof Editor>){
  return <RenderBoundary key={props.id} fallback={<EditorFallback {...props}/>}><Suspense fallback={<div className="forum-editor forum-editor-loading" role="status"><span className="sr-only">Loading editor…</span></div>}><RichEditor {...props}/></Suspense></RenderBoundary>
}
