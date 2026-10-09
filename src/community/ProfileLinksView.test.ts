// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountSettings } from './AccountSettings'
import { ForumProfile } from './ForumProfile'
import { CommunityContext } from './context'
import { api, post } from './api'
import type { MemberProfile } from './forum-contract'

vi.mock('./api', () => ({ api: vi.fn(), post: vi.fn() }))
vi.mock('./AvatarPicker', () => ({ AvatarPicker: () => null }))
const links = { instagramUrl: 'https://www.instagram.com/jannik.assfalg/', soundcloudUrl: 'https://soundcloud.com/jannik-asfalg', bandcampUrl: '' }
const publicProfile: MemberProfile = { username: 'musician', displayName: 'Musician', bio: '', avatar: null, memberSince: '2026-10-09', role: 'user', threads: 0, replies: 0, likesReceived: 0, reports: 0, maintains: [], recentReplies: [], ...links }
const privateProfile = { ...publicProfile, showOnline: true, email: 'musician@example.test', passwordRequired: true, freshLogin: true, methods: ['credential'] }
const refresh = vi.fn(async () => {})
const context = { session: { available: true, admin: false, user: { id: 'member', username: 'musician', displayName: 'Musician', verified: true } }, developer: null, catalog: [], refresh, refreshDeveloper: async () => {} }
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('FormData', window.FormData)
  vi.clearAllMocks()
  vi.mocked(post).mockResolvedValue({ ok: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = (view: ReturnType<typeof createElement>) => act(async () => root.render(createElement(CommunityContext.Provider, { value: context }, view)))

it('shows the saved links with clear labels and omits empty and unsafe links', async () => {
  vi.mocked(api).mockResolvedValue(publicProfile)
  await render(createElement(ForumProfile, { username: 'musician' }))
  const nav = container.querySelector('nav[aria-label="Social and music profiles"]')!
  const anchors = [...nav.querySelectorAll('a')]
  expect(anchors.map(anchor => [anchor.textContent, anchor.getAttribute('href')])).toEqual([['Instagram', links.instagramUrl], ['SoundCloud', links.soundcloudUrl]])
  for (const anchor of anchors) {
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
    expect(anchor.getAttribute('aria-label')).toContain('opens in a new tab')
  }
  expect(container.querySelector('iframe,script')).toBeNull()
  vi.mocked(api).mockResolvedValue({ ...publicProfile, instagramUrl: 'javascript:alert(1)', soundcloudUrl: '', bandcampUrl: '' })
  await render(createElement(ForumProfile, { username: 'another' }))
  expect(container.querySelector('.forum-profile-links')).toBeNull()
})

it('loads editable fields, submits a removal and a new Bandcamp URL, and confirms the save', async () => {
  vi.mocked(api).mockResolvedValue(privateProfile)
  await render(createElement(AccountSettings))
  const instagram = container.querySelector<HTMLInputElement>('input[name="instagramUrl"]')!
  const bandcamp = container.querySelector<HTMLInputElement>('input[name="bandcampUrl"]')!
  expect(instagram.value).toBe(links.instagramUrl)
  expect(container.querySelector<HTMLInputElement>('input[name="soundcloudUrl"]')!.value).toBe(links.soundcloudUrl)
  expect(bandcamp.value).toBe('')
  expect(container.textContent).toContain('These links appear on your public profile')
  instagram.value = ''; bandcamp.value = 'https://artist.bandcamp.com/'
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(post).toHaveBeenCalledWith('/auth/profile', expect.objectContaining({ instagramUrl: '', soundcloudUrl: links.soundcloudUrl, bandcampUrl: bandcamp.value, showOnline: true }), 'PATCH')
  expect(refresh).toHaveBeenCalledOnce()
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Profile updated.')
})

it('keeps the entered links available to correct after a failed save', async () => {
  vi.mocked(api).mockResolvedValue(privateProfile)
  vi.mocked(post).mockRejectedValue(new Error('Enter an HTTPS Bandcamp profile URL, or leave it empty.'))
  await render(createElement(AccountSettings))
  const bandcamp = container.querySelector<HTMLInputElement>('input[name="bandcampUrl"]')!
  bandcamp.value = 'https://wrong.example.test/'
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('HTTPS Bandcamp profile URL')
  expect(bandcamp.value).toBe('https://wrong.example.test/')
  expect(container.querySelector('fieldset')?.disabled).toBe(false)
  expect(refresh).not.toHaveBeenCalled()
})
