import { describe, expect, it } from 'vitest'
import { canonicalRouteUrl, moduleHref, profileHref, routeFromUrl, threadHref } from './routing'

const moduleIds = ['analog-bassdrum', 'miniverb', 'tapeecho', 'synth']
const threadId = '0f3a1b2c-4d5e-4f60-8a9b-0c1d2e3f4a5b'

describe.each(['https://modwerk.app/', 'https://example.github.io/octamod/'])('module links at %s', root => {
  const appUrl = new URL(root)
  it('opens a direct module URL and its index.html on static hosting', () => {
    expect(routeFromUrl(new URL('module/analog-bassdrum/', appUrl), appUrl)).toBe('module/analog-bassdrum')
    expect(routeFromUrl(new URL('module/miniverb/index.html', appUrl), appUrl)).toBe('module/miniverb')
  })
  it('opens machine-qualified module paths and upgrades legacy Digi hashes', () => {
    for (const device of ['digitakt', 'digitone']) {
      for (const suffix of ['', 'index.html']) {
        const url = new URL(`${device}/module/digihealth/${suffix}`, appUrl)
        expect(routeFromUrl(url, appUrl)).toBe(`${device}/module/digihealth`)
        expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(`${root}${device}/module/digihealth/`)
      }
      expect(canonicalRouteUrl(new URL(`?utm_source=mail#${device}/module/digihealth`, appUrl), appUrl, moduleIds).href).toBe(`${root}${device}/module/digihealth/?utm_source=mail`)
      const report = new URL(`${device}/module/digihealth/?report=1`, appUrl)
      expect(canonicalRouteUrl(report, appUrl, moduleIds).href).toBe(report.href)
      const legacyReport = new URL(`#${device}/module/digihealth?report=1`, appUrl)
      expect(canonicalRouteUrl(legacyReport, appUrl, moduleIds).href).toBe(legacyReport.href)
    }
    expect(canonicalRouteUrl(new URL('#configuration', new URL('digitakt/module/digihealth/?report=1', appUrl)), appUrl, moduleIds).href).toBe(root + '?report=1#configuration')
  })
  it('opens FM Synth through its public slug and redirects upstream-ID links', () => {
    for (const path of ['module/fm-synth/', 'module/fm-synth/index.html', 'module/synth/', 'module/synth/index.html', '#module/synth', '#module/fm-synth']) {
      const url = new URL(path, appUrl)
      url.search = '?utm_source=forum'
      expect(routeFromUrl(url, appUrl)).toBe('module/synth')
      expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(root + 'module/fm-synth/?utm_source=forum')
    }
    expect(moduleHref('synth')).toMatch(/module\/fm-synth\/$/)
  })
  it('preserves the FM Synth report form in public hash links', () => {
    const url = new URL('#module/fm-synth?report=1', appUrl)
    expect(routeFromUrl(url, appUrl)).toBe('module/synth?report=1')
    expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(url.href)
    const legacy = new URL('#module/synth?report=1', appUrl)
    expect(canonicalRouteUrl(legacy, appUrl, moduleIds).href).toBe(url.href)
  })
  it('turns legacy links into shareable paths while preserving query parameters', () => {
    const url = new URL('?utm_source=forum#module/analog-bassdrum', appUrl)
    expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(root + 'module/analog-bassdrum/?utm_source=forum')
  })
  it('supports switching modules and leaving a module via the existing hash routes', () => {
    const current = new URL('module/analog-bassdrum/', appUrl)
    expect(canonicalRouteUrl(new URL('#module/tapeecho', current), appUrl, moduleIds).href).toBe(root + 'module/tapeecho/')
    expect(canonicalRouteUrl(new URL('#configuration', current), appUrl, moduleIds).href).toBe(root + '#configuration')
  })
  it('opens the remembered machine when the URL names no route', () => {
    expect(routeFromUrl(new URL('', appUrl), appUrl, 'digitakt')).toBe('digitakt')
    expect(routeFromUrl(new URL('#forum', appUrl), appUrl, 'digitakt')).toBe('forum')
    expect(routeFromUrl(new URL('', appUrl), appUrl)).toBe('library')
  })
  it('preserves old navigation aliases', () => {
    expect(routeFromUrl(new URL('#account', appUrl), appUrl)).toBe('account')
    expect(routeFromUrl(new URL('#activity', appUrl), appUrl)).toBe('account')
    expect(routeFromUrl(new URL('#remixes', appUrl), appUrl)).toBe('module-sets')
    expect(routeFromUrl(new URL('#remix/miniverb-solo', appUrl), appUrl)).toBe('module-set/miniverb-solo')
  })
  it('keeps unknown legacy modules on the app missing-page route', () => {
    const url = new URL('#module/octakit', appUrl)
    expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(url.href)
    expect(routeFromUrl(url, appUrl)).toBe('module/octakit')
  })
  it('does not intercept external links, files, API requests or paths outside the app', () => {
    for (const href of ['https://github.com/repeat98/octamod', 'licenses/THIRD_PARTY_NOTICES.html', 'module-thumbnails/miniverb.jpg', 'api/session', '../other/', 'forum/thread/', 'forum/thread/' + threadId, 'forum/profile/ab/', 'forum/feed.xml']) {
      expect(routeFromUrl(new URL(href, appUrl), appUrl)).toBeUndefined()
    }
  })
  it('opens thread paths with or without the title words, keeping the page and post in the search', () => {
    for (const path of ['forum/thread/' + threadId + '/', 'forum/thread/' + threadId + '/index.html', 'forum/thread/' + threadId + '-granular-pad-from-tapehead/']) {
      const url = new URL(path, appUrl)
      expect(routeFromUrl(url, appUrl)).toBe('forum/thread/' + threadId)
      expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(url.href)
      url.search = '?page=1&post=abc'
      expect(routeFromUrl(url, appUrl)).toBe('forum/thread/' + threadId + '?page=1&post=abc')
    }
    expect(routeFromUrl(new URL('forum/thread/module-miniverb/', appUrl), appUrl)).toBe('forum/thread/module-miniverb')
    expect(routeFromUrl(new URL('forum/profile/synth_fan/?category=showcase', appUrl), appUrl)).toBe('forum/profile/synth_fan?category=showcase')
  })
  it('turns thread and profile hash links into paths and keeps everything else on hashes', () => {
    expect(canonicalRouteUrl(new URL('#forum/thread/' + threadId, appUrl), appUrl, moduleIds).href).toBe(root + 'forum/thread/' + threadId + '/')
    expect(canonicalRouteUrl(new URL('?utm_source=mail#forum/thread/' + threadId + '?post=abc&page=2', appUrl), appUrl, moduleIds).href).toBe(root + 'forum/thread/' + threadId + '/?utm_source=mail&post=abc&page=2')
    expect(canonicalRouteUrl(new URL('#forum/thread/module-miniverb', appUrl), appUrl, moduleIds).href).toBe(root + 'forum/thread/module-miniverb/')
    expect(canonicalRouteUrl(new URL('#forum/profile/synth_fan?sort=newest', appUrl), appUrl, moduleIds).href).toBe(root + 'forum/profile/synth_fan/?sort=newest')
    for (const hash of ['#forum', '#forum?view=modules', '#forum/new', '#forum/messages/synth_fan', '#forum/thread/', '#account']) {
      expect(canonicalRouteUrl(new URL(hash, appUrl), appUrl, moduleIds).href).toBe(root + hash)
    }
  })
  it('leaves a thread page and its search behind when a hash link moves elsewhere', () => {
    const current = new URL('forum/thread/' + threadId + '-granular-pad/?page=1', appUrl)
    expect(canonicalRouteUrl(new URL('#forum', current), appUrl, moduleIds).href).toBe(root + '#forum')
    expect(canonicalRouteUrl(new URL('#forum/thread/' + threadId + '?page=2', current), appUrl, moduleIds).href).toBe(root + 'forum/thread/' + threadId + '/?page=2')
    expect(canonicalRouteUrl(new URL('#forum/thread/' + threadId, current), appUrl, moduleIds).href).toBe(root + 'forum/thread/' + threadId + '/')
    expect(canonicalRouteUrl(new URL('#module/tapeecho', current), appUrl, moduleIds).href).toBe(root + 'module/tapeecho/')
  })
  it('gives the Start developing page its own path and leaves module update links on hashes', () => {
    expect(routeFromUrl(new URL('submit/', appUrl), appUrl)).toBe('submit')
    expect(routeFromUrl(new URL('submit/index.html', appUrl), appUrl)).toBe('submit')
    expect(canonicalRouteUrl(new URL('#submit', appUrl), appUrl, moduleIds).href).toBe(root + 'submit/')
    expect(canonicalRouteUrl(new URL('submit/', appUrl), appUrl, moduleIds).href).toBe(root + 'submit/')
    expect(canonicalRouteUrl(new URL('#submit/miniverb', appUrl), appUrl, moduleIds).href).toBe(root + '#submit/miniverb')
  })
  it('opens and shares the external directory, and leaves its filters behind on navigation', () => {
    for (const suffix of ['', 'index.html']) {
      const url = new URL('projects/' + suffix + '?machine=digitakt-ii', appUrl)
      expect(routeFromUrl(url, appUrl)).toBe('projects?machine=digitakt-ii')
      expect(canonicalRouteUrl(url, appUrl, moduleIds).href).toBe(root + 'projects/?machine=digitakt-ii')
      expect(canonicalRouteUrl(new URL('#library', url), appUrl, moduleIds).href).toBe(root + '#library')
      expect(canonicalRouteUrl(new URL('#submit', url), appUrl, moduleIds).href).toBe(root + 'submit/')
    }
    expect(canonicalRouteUrl(new URL('#projects', appUrl), appUrl, moduleIds).href).toBe(root + 'projects/')
    expect(canonicalRouteUrl(new URL('#projects?machine=octatrack', appUrl), appUrl, moduleIds).href).toBe(root + 'projects/?machine=octatrack')
  })
  it('builds thread and profile links as paths with the title words after a UUID', () => {
    expect(threadHref(threadId, 'Granular pad from Tapehead!')).toMatch(/forum\/thread\/0f3a1b2c-4d5e-4f60-8a9b-0c1d2e3f4a5b-granular-pad-from-tapehead\/$/)
    expect(threadHref(threadId, null, '?page=1')).toMatch(/forum\/thread\/0f3a1b2c-4d5e-4f60-8a9b-0c1d2e3f4a5b\/\?page=1$/)
    expect(threadHref('module-miniverb', 'Miniverb discussion')).toMatch(/forum\/thread\/module-miniverb\/$/)
    expect(profileHref('synth_fan')).toMatch(/forum\/profile\/synth_fan\/$/)
  })
})
