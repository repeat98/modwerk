import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { renderBetaNewsEmail, renderNewsEmail } from '../../server/news-email-template'
import draft from '../../docs/news/008-beta-invitation.draft.json'
import announcement from '../../docs/announcements/beta-2026-10-13.draft.json'
import { PublicAnnouncementCard } from './PublicAnnouncement'
import { announcementLink } from '../../server/announcements'

it('preserves the prepared email shell, feature invitation, 50-person limit, CTA and site risk reminder', () => {
  const urls = { app: 'https://modwerk.app/', settings: 'https://modwerk.app/#account/notifications' }
  const message = renderBetaNewsEmail({ ...draft, id: '0'.repeat(32) }, urls)
  expect(message.html + '\n').toBe(readFileSync(new URL('../../docs/news/008-beta-invitation.preview.html', import.meta.url), 'utf8'))
  expect(message.text + '\n').toBe(readFileSync(new URL('../../docs/news/008-beta-invitation.preview.txt', import.meta.url), 'utf8'))
  expect(message.html).toContain('bgcolor="#5f6ac7"')
  expect(message.text).toContain('50 people')
  expect(message.text).toContain('Flash modules over USB')
  expect(message.text).toContain('All modules work together')
  expect(message.text).toContain('Smarter DSP use')
  expect(message.text).toContain('POLY8 and Air Chorus')
  expect(message.html).toContain('bgcolor="#1c1c1f"')
  expect(message.html).not.toContain('<ul')
  expect(message.text).toContain('details and risks on the site')
  expect(message.text).not.toMatch(/data loss|device unusable|Recovery is not guaranteed/)
  expect(message.text).toContain('development Discord')
  expect(message.html).not.toMatch(/<script|<iframe|<form/i)
  // The one picture is the site's own file, the same for every recipient.
  expect(message.html.match(/<img [^>]*>/g)).toEqual([expect.stringContaining('src="https://modwerk.app/news/beta-status.png"')])
  expect(renderBetaNewsEmail({ id: '0'.repeat(32), subject: 'x', body: '![x](https://elsewhere.example/p.png)\n\n![y](//elsewhere.example/p.png)' }, urls).html).not.toContain('<img')
  const generic = renderNewsEmail({ subject: 'Normal news', body: '[Join the beta](https://modwerk.app/#beta/join/public)\n\n- **Lead** rest\n\n![x](/news/beta-status.png)' }, urls)
  expect(generic.html).not.toContain('bgcolor="#5f6ac7"')
  expect(generic.html).toContain('<ul'); expect(generic.html).not.toContain('bgcolor="#1c1c1f"')
  expect(generic.html.match(/<img [^>]*>/g)).toEqual([expect.stringContaining('src="https://modwerk.app/news/beta-status.png"')])
  expect(announcementLink(announcement.url)).toBe('#beta/join/public')
  const card = renderToStaticMarkup(createElement(PublicAnnouncementCard, { line: { kind: 'announcement', text: announcement.title, excerpt: announcement.body, href: announcement.url, ids: ['preview'], seen: false, created_at: '', actor: null, official: true, avatar: null }, onDismiss() {}, onOpen() {} }))
  expect(card).toContain('Join the beta'); expect(card).toContain('50 people')
})
