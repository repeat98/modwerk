// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityContext } from '../community/context'
import type { Session } from '../community/api'
import { OwnerStatementGate } from './OwnerStatement'

const member: Session = { available: true, admin: false, user: { id: 'm1', displayName: 'Member', username: 'member', verified: true, betaTester: false } }
const visitor: Session = { available: true, admin: false, user: null }
let root: Root, container: HTMLDivElement, due = true
const calls: Array<[string, string]> = []
beforeEach(() => {
  vi.useFakeTimers(); due = true; calls.length = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([init?.method ?? 'GET', String(url)])
    return String(url).includes('/auth/owner-statement') ? Response.json(init?.method === 'POST' ? { ok: true } : { show: due }) : new Response('{}', { status: 404 })
  }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear()
})

async function mount(session: Session) {
  const value = { session, loading: false, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} }
  await act(async () => root.render(createElement(CommunityContext.Provider, { value }, createElement(OwnerStatementGate, { enabled: true }))))
}
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const statement = () => container.querySelector<HTMLDialogElement>('dialog.owner-statement[open]')
const posts = () => calls.filter(([method, url]) => method === 'POST' && url.includes('/auth/owner-statement')).length

describe('the owner statement', () => {
  it('opens once for a visitor after the page settles, and stays closed in this browser', async () => {
    await mount(visitor); await wait(2000)
    expect(statement()).toBeNull()
    await wait(1500)
    expect(statement()?.textContent).toContain('The future of Modwerk is still uncertain')
    await act(async () => [...statement()!.querySelectorAll('button')].find(button => button.textContent === 'Close')!.click())
    expect(statement()).toBeNull()
    await act(async () => root.unmount()); root = createRoot(container)
    await mount(visitor); await wait(10000)
    expect(statement()).toBeNull()
    expect(posts()).toBe(0)
  })

  it('waits while another dialog is open', async () => {
    const other = document.createElement('dialog'); other.setAttribute('open', ''); document.body.append(other)
    await mount(visitor); await wait(10000)
    expect(statement()).toBeNull()
    other.remove(); await wait(3500)
    expect(statement()).not.toBeNull()
  })

  it('asks the server for a member and records the close on the account', async () => {
    await mount(member); await wait(3500)
    expect(statement()).not.toBeNull()
    await act(async () => statement()!.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(statement()).toBeNull()
    expect(posts()).toBe(1)
  })

  it('stays closed for a member who already read it on another device', async () => {
    due = false
    await mount(member); await wait(10000)
    expect(statement()).toBeNull()
  })

  it('carries a browser that already showed it into the account', async () => {
    await mount(visitor); await wait(3500)
    await act(async () => [...statement()!.querySelectorAll('button')].find(button => button.textContent === 'Close')!.click())
    await act(async () => root.unmount()); root = createRoot(container)
    await mount(member); await wait(10000)
    expect(statement()).toBeNull()
    expect(posts()).toBe(1)
  })
})
