import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { escape } from './account-email-template'
import { SUPPORT_EMAIL } from '../src/support'
import { forumLink } from '../src/community/forum-links'
import { betaInvitationRoute, BETA_INVITATION_PLACEHOLDER } from '../src/config/beta-invitation'

/** Bump when the layout changes; a campaign keeps the version it was written with. */
export const NEWS_EMAIL_VERSION = 'modwerk-news-002'
export const BETA_NEWS_EMAIL_VERSION = 'modwerk-news-beta-001'

type Node = { type: string; value?: string; url?: string; alt?: string | null; depth?: number; ordered?: boolean; start?: number | null; children?: Node[] }
const TEXT = 'color:#c4c4ce;font-size:15px;line-height:25px;'
const LINK = 'color:#c4c9ff;text-decoration:underline;'
const CODE = 'font-family:Consolas,Menlo,monospace;font-size:14px;'

/** The same GFM parser as the forum preview, so what the operator sees in the admin workspace is what members read. */
export function parseNews(markdown: string): Node { return unified().use(remarkParse).use(remarkGfm).parse(markdown) as Node }

const plain = (node: Node): string => node.type === 'break' ? ' ' : node.value ?? (node.children ?? []).map(plain).join('')
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
function block(node: Node, last: boolean, cta?: string, app?: string): string {
  const gap = last ? '0' : '18px'
  if (app && node.type === 'list' && !node.ordered && node.children?.length && node.children.every(item => item.children?.[0]?.type === 'paragraph' && sitePicture(item.children[0].children?.[0]))) return cards(node, gap, app)
  if (cta && node.type === 'paragraph' && node.children?.length === 1 && node.children[0].type === 'link' && node.children[0].url === cta) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;"><tr><td bgcolor="#5f6ac7" style="border-radius:7px;"><a href="${escape(cta)}" style="display:inline-block;padding:15px 22px;border:1px solid #727dde;border-radius:7px;color:#ffffff;font-size:15px;font-weight:bold;line-height:20px;text-decoration:none;">Join the beta</a></td></tr></table>`
  }
  if (cta && node.type === 'list' && !node.ordered) return features(node, gap)
  // One picture from the site's own files, the same URL for every recipient: no third-party or per-recipient loads.
  const image = node.type === 'paragraph' && node.children?.length === 1 ? sitePicture(node.children[0]) : undefined
  if (app && image) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 ${gap === '0' ? '0' : '24px'};"><tr><td><img src="${escape(new URL(image.url!, app).href)}" alt="${escape(image.alt ?? '')}" width="502" style="display:block;width:100%;max-width:502px;height:auto;border:1px solid #36363e;border-radius:8px;"></td></tr></table>`
  switch (node.type) {
    case 'paragraph': return `<p style="margin:0 0 ${gap};${TEXT}">${(node.children ?? []).map(inline).join('')}</p>`
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
/** The beta mail's bullets become a feature panel: the Modwerk mark, a bold lead on its own line, the rest below it. */
function features(node: Node, gap: string): string {
  const rows = (node.children ?? []).map((item, index) => {
    const [first, ...more] = item.children ?? [], parts = first?.type === 'paragraph' ? first.children ?? [] : []
    const lead = parts[0]?.type === 'strong' ? (parts[0].children ?? []).map(inline).join('') : ''
    const rest = lead ? parts.slice(1).map(inline).join('').trim() + (more.length ? blocks(more) : '') : blocks(item.children ?? [], true)
    return `<tr><td style="padding:14px 18px;${index ? 'border-top:1px solid #36363e;' : ''}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" style="width:22px;color:#c7a16c;font-size:15px;line-height:24px;">▪</td><td style="color:#a8a8b8;font-size:14px;line-height:22px;">${lead ? `<span style="display:block;margin:0 0 2px;color:#f4f4f8;font-size:16px;line-height:24px;font-weight:bold;">${lead}</span>` : ''}${rest}</td></tr></table></td></tr>`
  })
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1c1c1f" style="margin:4px 0 ${gap === '0' ? '0' : '24px'};border:1px solid #36363e;border-radius:10px;">${rows.join('')}</table>`
}
const PANEL = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1c1c1f"', CARD = 'border:1px solid #36363e;border-radius:10px;border-collapse:separate;'
const sitePicture = (node?: Node) => node?.type === 'image' && /^\/[\w-]/.test(node.url ?? '') ? node : undefined
const firstLink = (nodes: Node[]): string | undefined => nodes.reduce<string | undefined>((found, node) => found ?? (node.type === 'link' ? forumLink(node.url ?? '') : firstLink(node.children ?? [])), undefined)
const titleInline = (node: Node): string => { const href = node.type === 'link' ? forumLink(node.url ?? '') : undefined; return href ? `<a href="${escape(href)}" style="color:#f4f4f8;text-decoration:none;">${(node.children ?? []).map(inline).join('')}</a>` : inline(node) }
const cardCopy = (children: Node[]) => `<p style="margin:6px 0 0;color:#a8a8b8;font-size:14px;line-height:22px;">${children.map(inline).join('').trim()}</p>`
/** A list whose items each open with one of the site's pictures becomes module cards: pictures alone on their line make a grid of library cards,
 * a picture before text a compact row. A bold title and the words after it, up to the first line break, are the heading; the rest is the description. */
function cards(node: Node, gap: string, app: string): string {
  const out: string[] = []
  let rows: string[] = [], tiles: string[] = []
  const flush = () => {
    if (rows.length) out.push(`<table ${PANEL} style="margin:0 0 16px;${CARD}">${rows.join('')}</table>`)
    // Two cards side by side in the 502 px column, one under the other on a phone; Outlook for Windows ignores max-width and stacks them too.
    if (tiles.length) out.push(`<div style="font-size:0;line-height:0;text-align:center;">${tiles.join('')}</div>`)
    rows = []; tiles = []
  }
  for (const item of node.children ?? []) {
    const [first, ...more] = item.children ?? [], [picture, ...after] = first.children ?? []
    const wide = after.every(part => part.type === 'text' && !part.value?.trim())
    const [lead, ...rest] = wide ? more : [{ ...first, children: after.slice(after[0]?.type === 'text' && !after[0].value?.trim() ? 1 : 0) }, ...more]
    const parts = lead?.type === 'paragraph' ? lead.children ?? [] : [], cut = parts.findIndex(part => part.type === 'break')
    const head = cut < 0 ? parts : parts.slice(0, cut), body = cut < 0 ? [] : parts.slice(cut + 1), href = firstLink(head)
    const title = head.map(part => part.type === 'strong' ? `<span style="${wide ? 'display:block;' : ''}color:#f4f4f8;font-size:16px;line-height:22px;font-weight:bold;">${(part.children ?? []).map(titleInline).join('')}</span>` : `<span style="color:#90909e;font-size:13px;line-height:20px;">${wide ? inline(part).trimStart() : inline(part)}</span>`).join('')
    const copy = (body.length ? cardCopy(body) : '') + (lead && lead.type !== 'paragraph' ? blocks([lead]) : '') + rest.map(part => part.type === 'paragraph' ? cardCopy(part.children ?? []) : blocks([part])).join('')
    const img = (width: number, style: string) => `<img src="${escape(new URL(picture.url!, app).href)}" alt="${escape(picture.alt ?? '')}" width="${width}" style="display:block;height:auto;${style}">`
    const linked = (html: string) => href ? `<a href="${escape(href)}" style="display:block;text-decoration:none;">${html}</a>` : html
    if (wide) {
      if (rows.length) flush()
      tiles.push(`<div style="display:inline-block;width:100%;max-width:234px;margin:0 8px 16px;vertical-align:top;text-align:left;"><table ${PANEL} style="${CARD}"><tr><td style="padding:0;">${linked(img(232, 'width:100%;border:0;border-radius:10px 10px 0 0;'))}</td></tr><tr><td style="padding:12px 14px 14px;">${title}${copy}</td></tr></table></div>`)
    } else {
      if (tiles.length) flush()
      const line = rows.length ? 'border-top:1px solid #36363e;' : ''
      rows.push(`<tr><td valign="top" width="96" style="width:96px;padding:14px 0 14px 14px;${line}">${linked(img(96, 'width:96px;border:1px solid #36363e;border-radius:6px;'))}</td><td valign="top" style="padding:12px 16px 14px 14px;${line}">${title}${copy}</td></tr>`)
    }
  }
  flush()
  out.push(out.pop()!.replace('margin:0 0 16px;', `margin:0 0 ${gap === '0' ? '0' : '24px'};`))
  return out.join('\n')
}
/** Inside a list item a single paragraph is unwrapped, so bullets read as one line. */
function blocks(nodes: Node[], tight = false, cta?: string, app?: string): string {
  if (tight && nodes.length === 1 && nodes[0].type === 'paragraph') return (nodes[0].children ?? []).map(inline).join('')
  return nodes.map((node, index) => block(node, index === nodes.length - 1, cta, app)).join('\n')
}
function blockText(node: Node, indent = ''): string {
  // A card's picture has no text of its own, so its line starts with the title.
  const line = (children: Node[]) => children.map(inlineText).join('').trimStart().split('\n').map(text => indent + text).join('\n')
  switch (node.type) {
    case 'paragraph': return line(node.children ?? [])
    case 'heading': return indent + plain(node).toUpperCase()
    case 'list': return (node.children ?? []).map((item, index) => {
      const marker = node.ordered ? `${(node.start ?? 1) + index}. ` : '- '
      const body = (item.children ?? []).map(child => blockText(child, indent + ' '.repeat(marker.length))).filter(text => text.trim()).join('\n')
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

/** Same scriptless shell as the welcome news and account emails; pictures only from the site's own files. */
export function renderNewsEmail(campaign: { subject: string; body: string }, urls: { app: string; settings: string; unsubscribe?: string }, cta?: string) {
  const tree = parseNews(campaign.body), children = tree.children ?? []
  const subject = campaign.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 150)
  const preheader = (children.find(node => node.type === 'paragraph') ? plain(children.find(node => node.type === 'paragraph')!) : subject).replace(/\s+/g, ' ').trim().slice(0, 140)
  const footer = urls.unsubscribe
    ? 'You’re receiving this because you follow module updates on Modwerk. You can change your follows or turn off update emails in account settings.'
    : 'You’re receiving this because you opted in to Modwerk news. You can turn news emails off in your account settings at any time.'
  const footerHtml = urls.unsubscribe
    ? `${escape(footer)} <a href="${escape(urls.settings)}" style="color:#b9bdd7;text-decoration:underline;">Account settings</a> · <a href="${escape(urls.unsubscribe)}" style="color:#b9bdd7;text-decoration:underline;">Unsubscribe from activity email</a>`
    : `You’re receiving this because you opted in to Modwerk news. You can turn news emails off in your <a href="${escape(urls.settings)}" style="color:#b9bdd7;text-decoration:underline;">account settings</a> at any time.`
  const body = children.map(node => blockText(node)).filter(Boolean).join('\n\n')
  const text = [subject, '', body, '', footer, urls.settings, ...(urls.unsubscribe ? ['Unsubscribe from activity email: ' + urls.unsubscribe] : []), '', `Modwerk · ${urls.app}`, `Need help? ${SUPPORT_EMAIL}`].join('\n')
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
${blocks(children, false, cta, urls.app)}
</td></tr>
<tr><td style="padding:24px 8px 8px;color:#90909e;font-size:12px;line-height:21px;">
<p style="margin:0 0 8px;">${footerHtml}</p>
<p style="margin:0;">Modwerk · <a href="${escape(urls.app)}" style="color:#b9bdd7;text-decoration:underline;">modwerk.app</a> · Need help? <a href="mailto:${escape(SUPPORT_EMAIL)}" style="color:#b9bdd7;text-decoration:underline;">Contact support</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`
  return { subject, text, html }
}

/** A separate, immutable beta template version keeps queued generic news payloads unchanged. */
export function renderBetaNewsEmail(campaign: { id: string; subject: string; body: string }, urls: { app: string; settings: string }) {
  if (!/^[a-f0-9]{32}$/.test(campaign.id)) throw new Error('Invalid beta invitation campaign.')
  const destination = new URL(urls.app); destination.search = ''; destination.hash = betaInvitationRoute(campaign.id)
  return renderNewsEmail({ ...campaign, body: campaign.body.replaceAll(BETA_INVITATION_PLACEHOLDER, destination.href) }, urls, destination.href)
}
