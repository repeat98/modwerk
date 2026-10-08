import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { escape } from './account-email-template'
import { SUPPORT_EMAIL } from '../src/support'
import { forumLink } from '../src/community/forum-links'

/** Bump when the layout changes; a campaign keeps the version it was written with. */
export const NEWS_EMAIL_VERSION = 'modwerk-news-002'

type Node = { type: string; value?: string; url?: string; depth?: number; ordered?: boolean; start?: number | null; children?: Node[] }
const TEXT = 'color:#c4c4ce;font-size:15px;line-height:25px;'
const LINK = 'color:#c4c9ff;text-decoration:underline;'
const CODE = 'font-family:Consolas,Menlo,monospace;font-size:14px;'

/** The same GFM parser as the forum preview, so what the operator sees in the admin workspace is what members read. */
export function parseNews(markdown: string): Node { return unified().use(remarkParse).use(remarkGfm).parse(markdown) as Node }

const plain = (node: Node): string => node.value ?? (node.children ?? []).map(plain).join('')
/** Inline HTML: everything is escaped; only web links become links, as in the forum. Raw HTML in the markdown stays text. */
function inline(node: Node): string {
  const inner = () => (node.children ?? []).map(inline).join('')
  switch (node.type) {
    case 'text': case 'html': return escape(node.value ?? '')
    case 'strong': return `<strong style="color:#f4f4f8;">${inner()}</strong>`
    case 'emphasis': return `<em>${inner()}</em>`
    case 'delete': return `<del>${inner()}</del>`
    case 'inlineCode': return `<code style="${CODE}color:#f4f4f8;background-color:#303036;padding:1px 5px;border-radius:4px;">${escape(node.value ?? '')}</code>`
    case 'break': return '<br>'
    case 'link': { const href = forumLink(node.url ?? ''); return href ? `<a href="${escape(href)}" style="${LINK}">${inner()}</a>` : inner() }
    case 'image': return escape(plain(node))
    default: return inner()
  }
}
function inlineText(node: Node): string {
  const inner = () => (node.children ?? []).map(inlineText).join('')
  switch (node.type) {
    case 'text': case 'html': case 'inlineCode': return node.value ?? ''
    case 'break': return '\n'
    case 'link': { const href = forumLink(node.url ?? ''), label = inner(); return href && label !== href ? `${label} (${href})` : label || href || '' }
    case 'image': return plain(node)
    default: return inner()
  }
}
function block(node: Node, last: boolean): string {
  const gap = last ? '0' : '18px'
  switch (node.type) {
    case 'paragraph': {
      // A standalone Markdown link is the campaign's action; links within prose stay inline.
      const child = node.children?.length === 1 ? node.children[0] : null
      const href = child?.type === 'link' ? forumLink(child.url ?? '') : null
      if (child && href && plain(child).trim()) return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 ${last ? '0' : '24px'};"><tr><td bgcolor="#c7a16c" style="border-radius:7px;text-align:center;">
<a href="${escape(href)}" style="display:inline-block;padding:15px 22px;border:1px solid #c7a16c;border-radius:7px;color:#171719;font-size:15px;font-weight:bold;line-height:22px;text-decoration:none;">${escape(plain(child))}</a>
</td></tr></table>`
      return `<p style="margin:0 0 ${gap};${TEXT}">${(node.children ?? []).map(inline).join('')}</p>`
    }
    case 'heading': return node.depth === 1 || node.depth === 2
      ? `<h2 style="margin:26px 0 12px;color:#f4f4f8;font-size:20px;line-height:28px;font-weight:bold;letter-spacing:-0.3px;">${(node.children ?? []).map(inline).join('')}</h2>`
      : `<h3 style="margin:22px 0 10px;color:#f4f4f8;font-size:16px;line-height:24px;font-weight:bold;">${(node.children ?? []).map(inline).join('')}</h3>`
    case 'list': return `<${node.ordered ? `ol${node.start && node.start !== 1 ? ` start="${node.start}"` : ''}` : 'ul'} style="margin:0 0 ${gap};padding:0 0 0 22px;${TEXT}">${(node.children ?? []).map(item => `<li style="margin:0 0 8px;">${blocks(item.children ?? [], true)}</li>`).join('')}</${node.ordered ? 'ol' : 'ul'}>`
    case 'blockquote': return `<blockquote style="margin:0 0 ${gap};padding:0 0 0 14px;border-left:3px solid #c7a16c;color:#a8a8b8;">${blocks(node.children ?? [], true)}</blockquote>`
    case 'code': return `<pre style="margin:0 0 ${gap};padding:12px 14px;background-color:#171719;border:1px solid #36363e;border-radius:7px;${CODE}color:#ededf2;line-height:21px;white-space:pre-wrap;">${escape(node.value ?? '')}</pre>`
    case 'thematicBreak': return `<hr style="border:0;border-top:1px solid #41414a;margin:22px 0;">`
    case 'html': return `<p style="margin:0 0 ${gap};${TEXT}">${escape(node.value ?? '')}</p>`
    case 'table': return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${gap};${TEXT}">${(node.children ?? []).map(row => `<tr>${(row.children ?? []).map(cell => `<td style="padding:4px 14px 4px 0;vertical-align:top;">${(cell.children ?? []).map(inline).join('')}</td>`).join('')}</tr>`).join('')}</table>`
    case 'definition': case 'footnoteDefinition': return ''
    default: return node.children ? blocks(node.children, last) : ''
  }
}
/** Inside a list item a single paragraph is unwrapped, so bullets read as one line. */
function blocks(nodes: Node[], tight = false): string {
  if (tight && nodes.length === 1 && nodes[0].type === 'paragraph') return (nodes[0].children ?? []).map(inline).join('')
  return nodes.map((node, index) => block(node, index === nodes.length - 1)).join('\n')
}
function blockText(node: Node, indent = ''): string {
  const line = (children: Node[]) => children.map(inlineText).join('').split('\n').map(text => indent + text).join('\n')
  switch (node.type) {
    case 'paragraph': return line(node.children ?? [])
    case 'heading': return indent + plain(node).toUpperCase()
    case 'list': return (node.children ?? []).map((item, index) => {
      const marker = node.ordered ? `${(node.start ?? 1) + index}. ` : '- '
      const body = (item.children ?? []).map(child => blockText(child, indent + ' '.repeat(marker.length))).join('\n')
      return indent + marker + body.slice(indent.length + marker.length)
    }).join('\n')
    case 'blockquote': return (node.children ?? []).map(child => blockText(child, indent + '> ')).join('\n')
    case 'code': return (node.value ?? '').split('\n').map(text => indent + '    ' + text).join('\n')
    case 'thematicBreak': return indent + '---'
    case 'html': return indent + (node.value ?? '')
    case 'table': return (node.children ?? []).map(row => indent + (row.children ?? []).map(cell => (cell.children ?? []).map(inlineText).join('')).join(' · ')).join('\n')
    case 'definition': case 'footnoteDefinition': return ''
    default: return node.children ? node.children.map(child => blockText(child, indent)).join('\n\n') : ''
  }
}

/** Same scriptless, image-free shell as the welcome news and account emails. */
export function renderNewsEmail(campaign: { subject: string; body: string }, urls: { app: string; settings: string }) {
  const tree = parseNews(campaign.body), children = tree.children ?? []
  const subject = campaign.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 150)
  const preheader = (children.find(node => node.type === 'paragraph') ? plain(children.find(node => node.type === 'paragraph')!) : subject).replace(/\s+/g, ' ').trim().slice(0, 140)
  const footer = 'You’re receiving this because you opted in to Modwerk news. You can turn news emails off in your account settings at any time.'
  const body = children.map(node => blockText(node)).filter(Boolean).join('\n\n')
  const text = [subject, '', body, '', footer, urls.settings, '', `Modwerk · ${urls.app}`, `Need help? ${SUPPORT_EMAIL}`].join('\n')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#171719;color:#ededf2;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171719"><tr><td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;font-size:26px;font-weight:bold;letter-spacing:-1px;color:#ffffff;">Modwerk<span style="color:#c7a16c;"> ▪</span></td></tr>
<tr><td bgcolor="#c7a16c" height="3" style="height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="#232327" style="padding:32px 28px;border:1px solid #36363e;border-top:0;border-radius:0 0 12px 12px;">
<p style="margin:0 0 16px;color:#c7a16c;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase;">Modwerk news</p>
<h1 style="margin:0 0 22px;color:#f4f4f8;font-size:28px;line-height:36px;font-weight:bold;letter-spacing:-0.5px;">${escape(subject)}</h1>
${blocks(children)}
</td></tr>
<tr><td style="padding:24px 8px 8px;color:#90909e;font-size:12px;line-height:21px;">
<p style="margin:0 0 8px;">You’re receiving this because you opted in to Modwerk news. You can turn news emails off in your <a href="${escape(urls.settings)}" style="color:#b9bdd7;text-decoration:underline;">account settings</a> at any time.</p>
<p style="margin:0;">Modwerk · <a href="${escape(urls.app)}" style="color:#b9bdd7;text-decoration:underline;">modwerk.app</a> · Need help? <a href="mailto:${escape(SUPPORT_EMAIL)}" style="color:#b9bdd7;text-decoration:underline;">Contact support</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`
  return { subject, text, html }
}
