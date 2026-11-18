import { describe, expect, it } from 'vitest'
import { tagDiscordLinks, tagMailLinks } from '../../server/site-link-tags'
import { welcomeEmail } from '../../server/welcome-email-template'
import { VISIT_SOURCES } from './usage-contract'
import { visitSource } from './visit-source'

const app = 'https://modwerk.app/'
describe('tagging site links in Modwerk mail', () => {
  it('tags links to the site, before the route, and leaves everything else alone', () => {
    const html = '<a href="https://modwerk.app/#forum?category=introductions">Say hello</a> <a href="https://modwerk.app/module/fm-synth/?tab=a&amp;b=1">FM</a>'
      + ' <img src="https://modwerk.app/thumb.jpg"> <a href="https://github.com/repeat98/modwerk">GitHub</a> <a href="https://modwerk.app/api/news/unsubscribe?token=x">Unsubscribe</a>'
      + ' <a href="https://modwerk.app/?utm_source=reddit">Already</a>'
    const { html: tagged } = tagMailLinks({ subject: 's', html }, app, 'news')
    expect(tagged).toContain('href="https://modwerk.app/?utm_source=mail-news#forum?category=introductions"')
    expect(tagged).toContain('href="https://modwerk.app/module/fm-synth/?tab=a&amp;b=1&amp;utm_source=mail-news"')
    expect(tagged).toContain('src="https://modwerk.app/thumb.jpg"')
    expect(tagged).toContain('href="https://github.com/repeat98/modwerk"')
    expect(tagged).toContain('href="https://modwerk.app/api/news/unsubscribe?token=x"')
    expect(tagged).toContain('href="https://modwerk.app/?utm_source=reddit"')
  })
  it('tags bare addresses in the text part without swallowing punctuation', () => {
    const text = 'Open https://modwerk.app/#forum. Or (https://modwerk.app/), please. Code: https://github.com/repeat98/modwerk'
    expect(tagMailLinks({ text }, app, 'activity').text).toBe('Open https://modwerk.app/?utm_source=mail-activity#forum. Or (https://modwerk.app/?utm_source=mail-activity), please. Code: https://github.com/repeat98/modwerk')
  })
  it('leaves a message untouched without a site address and changes nothing else in it', () => {
    const message = { subject: 'Hi', html: '<a href="https://modwerk.app/">x</a>', text: 'https://modwerk.app/' }
    expect(tagMailLinks(message, undefined, 'beta')).toBe(message)
    expect(tagMailLinks(message, app, 'beta').subject).toBe('Hi')
  })
  it('tags every site link of the welcome mail with a source the site counts as itself', () => {
    const message = tagMailLinks(welcomeEmail, app, 'welcome')
    const links = [...message.html.matchAll(/href="(https:\/\/modwerk\.app\/[^"]*)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
    expect(links.length).toBeGreaterThan(3)
    for (const link of links) { const url = new URL(link); expect(visitSource('', url.search, 'https://modwerk.app')).toBe('mail-welcome') }
    expect(VISIT_SOURCES).toContain('mail-welcome')
  })
})

describe('tagging site links in TARS replies', () => {
  it('tags links to the site in Discord markdown and leaves the rest of the reply as written', () => {
    expect(tagDiscordLinks('Try <https://modwerk.app/#module/fm-synth>, the [guide](https://modwerk.app/octatrack-setup/) or https://github.com/repeat98/modwerk.'))
      .toBe('Try <https://modwerk.app/?utm_source=discord-bot#module/fm-synth>, the [guide](https://modwerk.app/octatrack-setup/?utm_source=discord-bot) or https://github.com/repeat98/modwerk.')
    expect(visitSource('', '?utm_source=discord-bot', 'https://modwerk.app')).toBe('discord-bot')
  })
  it('keeps a reply as written when the tags would take it past 2000 characters', () => {
    const near = 'x'.repeat(1970) + ' https://modwerk.app/'
    expect(tagDiscordLinks(near)).toBe(near)
  })
})
