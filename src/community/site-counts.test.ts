// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { VISIT_SOURCES } from './usage-contract'
import { visitSource } from './visit-source'

const origin = 'https://modwerk.app'
describe('where a page load came from', () => {
  it.each([
    ['', '', 'direct'], ['https://www.google.com/', '', 'google'], ['https://www.google.co.uk/', '', 'google'], ['https://gemini.google.com/app', '', 'gemini'],
    ['https://mail.google.com/', '', 'mail'], ['https://search.brave.com/search?q=octatrack', '', 'brave'], ['https://duckduckgo.com/', '', 'duckduckgo'],
    ['https://chatgpt.com/', '', 'chatgpt'], ['https://claude.ai/chat/x', '', 'claude'], ['https://www.perplexity.ai/', '', 'perplexity'],
    ['https://out.reddit.com/t3_x', '', 'reddit'], ['https://old.reddit.com/r/Elektron/', '', 'reddit'], ['https://m.youtube.com/watch?v=1', '', 'youtube'], ['https://l.instagram.com/', '', 'instagram'],
    ['https://t.co/abc', '', 'x'], ['https://discord.com/channels/1/2', '', 'discord'], ['https://70b185.github.io/', '', 'github'], ['https://www.elektronauts.com/t/x', '', 'elektronauts'],
    ['https://www.gearnews.de/x', '', 'gearnews'], ['https://www.synthtopia.com/', '', 'synthtopia'], ['https://cdm.link/', '', 'cdm'], ['https://www.bonedo.de/', '', 'bonedo'],
    ['https://www.qwant.com/', '', 'other-search'], ['https://example.org/blog', '', 'other'], ['not a url', '', 'other'],
    ['android-app://com.google.android.gm/', '', 'mail'], ['android-app://com.reddit.frontpage/', '', 'reddit'], ['android-app://org.unknown/', '', 'other'],
    ['https://www.google.com/', '?utm_source=newsletter', 'mail'], ['', '?utm_source=Reddit&utm_medium=social', 'reddit'], ['', '?utm_source=youtube.com', 'youtube'], ['', '?utm_source=my-friend', 'other'],
  ])('%s %s → %s', (referrer, search, expected) => {
    expect(visitSource(referrer, search, origin)).toBe(expected)
  })
  it('counts nothing for a page reached from the site itself, and only ever returns a listed category', () => {
    expect(visitSource('https://modwerk.app/module/fm-synth/', '', origin)).toBeNull()
    for (const referrer of ['https://a.b.c.example/', 'https://google.evil.test/', 'https://reddit.com.evil.test/']) expect(VISIT_SOURCES).toContain(visitSource(referrer, '', origin))
    expect(visitSource('https://reddit.com.evil.test/', '', origin)).toBe('other')
  })
})

describe('site counts in the browser', () => {
  let usage: typeof import('./usage'), request: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    vi.resetModules(); vi.stubEnv('VITE_COMMUNITY_API_URL', ''); localStorage.clear()
    request = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', request)
    usage = await import('./usage')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear() })
  const sent = () => request.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])
  it('sends one category per page load with no address, credentials or identifier, and stores nothing', () => {
    usage.countVisitSource('https://www.reddit.com/r/Elektron/comments/abc/octatrack_mods/', '', origin)
    usage.countVisitSource('https://www.google.com/', '', origin)
    expect(sent()).toEqual([['/api/usage/count', { event: 'visit_source', detail: 'reddit' }]])
    expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(localStorage.length).toBe(0)
  })
  it('drops campaign tags from the address once read, keeping the route and other parameters', () => {
    history.replaceState(null, '', '/module/fm-synth/?tab=sound&utm_source=mail-news&utm_medium=email#forum?category=introductions')
    usage.countVisitSource('', location.search, location.origin)
    expect(sent()).toEqual([['/api/usage/count', { event: 'visit_source', detail: 'mail-news' }]])
    expect(location.pathname + location.search + location.hash).toBe('/module/fm-synth/?tab=sound#forum?category=introductions')
    history.replaceState(null, '', '/')
  })
  it('counts nothing after an objection to identifier-free counts', () => {
    usage.setAnonymousCountsAllowed(false)
    usage.countVisitSource('https://www.google.com/', '', origin); usage.countSignInPrompt('gate-shown')
    expect(request).not.toHaveBeenCalled()
  })
  it('counts how the build prompt and a member-action prompt are answered', async () => {
    const { LoginPromptDialog } = await import('./LoginPromptDialog')
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false }
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host), onClose = vi.fn(), onSkip = vi.fn()
    await act(async () => root.render(createElement(LoginPromptDialog, { next: 'configuration', onClose, onSkip })))
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Cancel"]')!.click() })
    await act(async () => root.render(createElement(LoginPromptDialog, { next: 'forum', action: 'Sign in to like this module', onClose })))
    await act(async () => { [...host.querySelectorAll('a')].find(link => link.textContent === 'Create account')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    await act(async () => root.unmount())
    expect(sent().map(([, body]) => body.detail)).toEqual(['gate-shown', 'gate-closed', 'other-shown', 'other-create-account'])
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
