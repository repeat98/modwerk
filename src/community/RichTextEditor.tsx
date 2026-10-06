import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { forumLink } from './forum-links'
import { mentionQueryAt } from './forum-contract'
import { MentionSuggestions, useMentionSuggestions, type MentionCandidate } from './mentions'
import type { Editor } from '@tiptap/react'

type Props = { id: string; label: string; value: string; onChange: (value: string)=>void; name?: string; placeholder?: string; disabled?: boolean }
export function RichTextEditor({id,label,value,onChange,name,placeholder='Write your post…',disabled=false}:Props) {
  const [source,setSource]=useState(false),[linkOpen,setLinkOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('')
  // The @name under the caret, as document positions; the key handler lives in a ref because the editor is created once.
  const [mention,setMention]=useState<{start:number;end:number;query:string}|null>(null),mentionKeys=useRef<(event:KeyboardEvent)=>boolean>(()=>false)
  function mentionAt(current:Editor){
    const {from,empty}=current.state.selection
    if(!empty||current.isActive('code')||current.isActive('codeBlock'))return null
    const $from=current.state.doc.resolve(from),before=$from.parent.textBetween(0,$from.parentOffset,undefined,' '),at=mentionQueryAt(before,before.length)
    return at?{start:from-(before.length-at.start),end:from,query:at.query}:null
  }
  const editor=useEditor({
    extensions:[StarterKit.configure({
      heading:{levels:[2,3]},underline:false,
      link:{openOnClick:false,defaultProtocol:'https',isAllowedUri:href=>!!forumLink(href),HTMLAttributes:{rel:'noopener noreferrer nofollow',target:'_blank'}},
    }),Markdown],
    content:value,contentType:'markdown',editable:!disabled,
    editorProps:{attributes:{id,role:'textbox','aria-label':label,'aria-multiline':'true','aria-describedby':id+'-editor-hint','data-placeholder':placeholder},handleKeyDown:(_view,event)=>mentionKeys.current(event)},
    onUpdate:({editor:current})=>{onChange(current.isEmpty?'':current.getMarkdown());setMention(mentionAt(current))},
    onSelectionUpdate:({editor:current})=>setMention(mentionAt(current)),
    onBlur:()=>setMention(null),
  })
  const suggestions=useMentionSuggestions(mention?.query??null)
  function pickMention(candidate:MentionCandidate){if(!editor||!mention)return;editor.chain().focus().insertContentAt({from:mention.start,to:mention.end},{type:'text',text:'@'+candidate.username+' '}).run();setMention(null)}
  useEffect(()=>{mentionKeys.current=event=>suggestions.onKey(event,pickMention)})
  const state=useEditorState({editor,selector:({editor:current})=>current?{
    bold:current.isActive('bold'),italic:current.isActive('italic'),strike:current.isActive('strike'),
    heading:current.isActive('heading',{level:2}),bullet:current.isActive('bulletList'),ordered:current.isActive('orderedList'),
    quote:current.isActive('blockquote'),code:current.isActive('codeBlock'),inline:current.isActive('code'),
    link:current.isActive('link'),undo:current.can().undo(),redo:current.can().redo(),
  }:null})
  useEffect(()=>{if(editor&&editor.getMarkdown()!==value&&!(editor.isEmpty&&!value))editor.commands.setContent(value,{contentType:'markdown',emitUpdate:false})},[editor,value])
  useEffect(()=>{editor?.setEditable(!disabled)},[editor,disabled])
  function saveLink(){
    const href=forumLink(url.trim())
    if(!href){setError('Enter a full http:// or https:// address.');return}
    if(!editor)return
    if(editor.state.selection.empty&&!editor.isActive('link'))editor.chain().focus().insertContent({type:'text',text:href,marks:[{type:'link',attrs:{href}}]}).run()
    else editor.chain().focus().extendMarkRange('link').setLink({href}).run()
    setLinkOpen(false);setError('')
  }
  const tools=[
    {label:'Bold',text:<strong>B</strong>,active:state?.bold,run:()=>editor?.chain().focus().toggleBold().run()},
    {label:'Italic',text:<em>I</em>,active:state?.italic,run:()=>editor?.chain().focus().toggleItalic().run()},
    {label:'Strikethrough',text:<s>S</s>,active:state?.strike,run:()=>editor?.chain().focus().toggleStrike().run()},
    {label:'Heading',text:'H2',active:state?.heading,run:()=>editor?.chain().focus().toggleHeading({level:2}).run()},
    {label:'Bullet list',text:'• List',active:state?.bullet,run:()=>editor?.chain().focus().toggleBulletList().run()},
    {label:'Numbered list',text:'1. List',active:state?.ordered,run:()=>editor?.chain().focus().toggleOrderedList().run()},
    {label:'Quote',text:'“ Quote',active:state?.quote,run:()=>editor?.chain().focus().toggleBlockquote().run()},
    {label:'Inline code',text:'<>',active:state?.inline,run:()=>editor?.chain().focus().toggleCode().run()},
    {label:'Code block',text:'{ }',active:state?.code,run:()=>editor?.chain().focus().toggleCodeBlock().run()},
  ]
  return <div className="forum-editor">
    <div className="forum-editor-toolbar" role="group" aria-label={label+' formatting'} aria-controls={id}>
      {tools.map(tool=><button key={tool.label} type="button" title={tool.label} aria-label={tool.label} aria-pressed={!!tool.active} disabled={disabled||source||!editor} onMouseDown={event=>event.preventDefault()} onClick={tool.run}>{tool.text}</button>)}
      <button type="button" title="Add or edit a link" aria-pressed={!!state?.link} disabled={disabled||source||!editor} onMouseDown={event=>event.preventDefault()} onClick={()=>{setUrl(String(editor?.getAttributes('link').href??''));setError('');setLinkOpen(current=>!current)}}>Link</button>
      <button type="button" aria-label="Undo" disabled={disabled||source||!state?.undo} onMouseDown={event=>event.preventDefault()} onClick={()=>editor?.chain().focus().undo().run()}>↶</button>
      <button type="button" aria-label="Redo" disabled={disabled||source||!state?.redo} onMouseDown={event=>event.preventDefault()} onClick={()=>editor?.chain().focus().redo().run()}>↷</button>
      <button type="button" className="forum-editor-source" aria-pressed={source} disabled={disabled} onClick={()=>{setSource(current=>!current);setLinkOpen(false)}}>Markdown</button>
    </div>
    {linkOpen&&<div className="forum-editor-link"><label htmlFor={id+'-link'}>Link address</label><input id={id+'-link'} type="url" value={url} placeholder="https://…" onChange={event=>setUrl(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();saveLink()}if(event.key==='Escape'){event.preventDefault();setLinkOpen(false);editor?.commands.focus()}}}/><button type="button" className="text-button" onClick={saveLink}>Apply</button>{state?.link&&<button type="button" className="text-button" onClick={()=>{editor?.chain().focus().extendMarkRange('link').unsetLink().run();setLinkOpen(false)}}>Remove link</button>}<button type="button" className="text-button" onClick={()=>setLinkOpen(false)}>Cancel</button>{error&&<p className="file-error" role="alert">{error}</p>}</div>}
    {!source&&<MentionSuggestions id={id+'-mentions'} items={suggestions.items} active={suggestions.active} onPick={pickMention} onHover={suggestions.setActive}/>}
    {source?<textarea id={id} aria-label={label+' Markdown'} aria-describedby={id+'-editor-hint'} value={value} disabled={disabled} maxLength={12000} rows={8} onChange={event=>onChange(event.target.value)} placeholder={placeholder}/>:<EditorContent editor={editor}/>}
    {name&&<input type="hidden" name={name} value={value}/>}
    <div className="forum-editor-footer"><span id={id+'-editor-hint'}>{source?'Edit Markdown directly.':'Select text to format it. Ctrl/⌘ + B or I works too.'}</span><span className={value.length>12000?'file-error':''}>{value.length.toLocaleString()} / 12,000</span></div>
  </div>
}
