import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { forumLink } from './forum-links'
import { splitMentions } from './forum-contract'

type Node = { type: string; value?: string; url?: string; children?: Node[]; data?: Record<string, unknown> }
/** Turns @names in text into profile links, leaving code and existing links alone. The href is rebuilt in the `a` renderer. */
function remarkMentions() {
  function walk(node: Node) {
    if (!node.children) return
    for (let index = 0; index < node.children.length; index++) {
      const child = node.children[index]
      if (child.type === 'text' && child.value && node.type !== 'link' && node.type !== 'linkReference') {
        const parts = splitMentions(child.value)
        if (!parts.some(part => part.type === 'mention')) continue
        const nodes: Node[] = parts.map(part => part.type === 'mention' ? { type: 'link', url: 'mention:' + part.value, data: { hProperties: { className: 'forum-mention' } }, children: [{ type: 'text', value: '@' + part.value }] } : { type: 'text', value: part.value })
        node.children.splice(index, 1, ...nodes); index += nodes.length - 1
      } else if (child.type !== 'inlineCode' && child.type !== 'code') walk(child)
    }
  }
  return (tree: Node) => { walk(tree) }
}
const mentionName = (node: unknown) => { const text = (node as { children?: { value?: string }[] })?.children?.[0]?.value ?? ''; return text.startsWith('@') ? text.slice(1) : '' }

const allowed = ['p','br','strong','em','del','a','code','pre','blockquote','ul','ol','li','h2','h3','hr']
export function ForumPostBody({ body }: { body: string }) {
  return <div className="forum-post-body"><Markdown remarkPlugins={[remarkGfm, remarkMentions]} allowedElements={allowed} unwrapDisallowed
    urlTransform={value=>forumLink(value)??''}
    components={{code:({children})=><code>{typeof children==='string'?children.replace(/\n$/,''):children}</code>,a:({href,children,className,node})=>String(className??'').includes('forum-mention')&&mentionName(node)?<a className="forum-mention" href={'#forum/profile/'+encodeURIComponent(mentionName(node))}>{children}</a>:href?<a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>:<span>{children}</span>}}>{body}</Markdown></div>
}
