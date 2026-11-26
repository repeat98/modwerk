// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { OctatrackLink, tabLocks } from '../engine/elekloader/octatrack-link'
import { OctatrackLinkContext } from '../hooks/useOctatrackLink'
import { CommunityContext } from '../community/context'
import type { Session } from '../community/api'
import { setWorkspaceReportContext } from '../community/report-context'
import { communityModule } from '../community/modules'
import { ConfigurationReportDialog } from '../community/ConfigurationReport'
import { parseSupportFile } from '../community/support-report'
import { SupportActions } from './SupportActions'

const member = { available: true, admin: false, user: { id: 'u1', username: 'tester', verified: true } } as unknown as Session
let root: Root, container: HTMLDivElement, link: OctatrackLink, stop: () => void
const button = (text: string) => [...document.querySelectorAll('button')].find(element => element.textContent === text)
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  // A sync the loader refused, with sharing off: nobody listens to the link's diagnostics.
  const unit = fakeUnit()
  link = new OctatrackLink(unit.usb, fakeSession(unit), 300, tabLocks())
  stop = link.start()
  await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
  unit.refusal = 7
  await link.update('Grain', [{ module: 'Grain', data: new Uint8Array(2048) }])
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); stop(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Copy details and Save report', () => {
  it('copy what failed with the recent events, and save them as a file, without sending anything', async () => {
    const writeText = vi.fn(async () => {}), fetch = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } }); vi.stubGlobal('fetch', fetch)
    await act(() => root.render(createElement(SupportActions, { link, what: 'Sync to Octatrack', error: link.getState().notice!.text })))
    await act(async () => button('Copy details')!.click())
    const copied = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(copied).toContain('What failed: Sync to Octatrack')
    expect(copied).toMatch(/sync_failed · sending · error device · at stage/)
    expect(container.textContent).toContain('Copied')
    let saved: Blob | undefined
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => { saved = blob; return 'blob:report' }, revokeObjectURL: () => {} }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toMatch(/^modwerk-support-\d{8}-\d{6}\.txt$/) })
    await act(async () => button('Save report')!.click())
    expect(click).toHaveBeenCalledOnce()
    expect(parseSupportFile(await saved!.text())?.events.map(event => event.event)).toEqual(['connected', 'sync_started', 'sync_failed'])
    expect(fetch).not.toHaveBeenCalled()
  })
  it('says so when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async () => { throw new Error('denied') } } })
    await act(() => root.render(createElement(SupportActions, { link, what: 'USB link' })))
    await act(async () => button('Copy details')!.click())
    expect(container.textContent).toContain('Copy failed')
  })
})

describe('Report a problem after a failed sync', () => {
  const ids = ['sidechain-compressor', 'miniverb']
  async function open() {
    setWorkspaceReportContext({ configurationName: 'Live', modules: ids.map(id => ({ id: communityModule(id)!.moduleId, version: communityModule(id)!.version })), keepStockFx2: null, build: '', activeId: 'set1',
      configurations: [{ id: 'set1', name: 'Live', modules: ids.map(id => ({ id: communityModule(id)!.moduleId, version: communityModule(id)!.version })), keepStockFx2: null }] })
    await act(() => root.render(createElement(CommunityContext.Provider, { value: { session: member, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
      createElement(OctatrackLinkContext.Provider, { value: link }, createElement(ConfigurationReportDialog, { machine: 'octatrack', configurationId: 'set1', onClose: () => {} })))))
  }
  it('fills in what the link knows, shows the events it attaches and lets the member remove them', async () => {
    await open()
    const form = document.querySelector('form')!
    expect((form.querySelector('textarea[name="actual"]') as HTMLTextAreaElement).value).toBe(link.getState().notice!.text)
    expect([...form.querySelectorAll('select')].map(select => select.value)).toEqual(['', 'usb']) // model is the member's choice
    expect(form.textContent).toContain('Attached: the last 3 USB events from this page.')
    expect(form.querySelector('.issue-report-usb pre')!.textContent).toContain('sync_failed · sending · error device')
    await act(async () => button('Remove USB events')!.click())
    expect(form.textContent).toContain('USB events not attached.')
    await act(async () => button('Attach them')!.click())
    expect(form.textContent).toContain('Attached: the last 3 USB events')
  })
  it('sends the events only with the report, and not once removed', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return Response.json({ ok: true, id: 'r', author: 'a', modules: 2, forumThreadId: null, github: 'none', githubUrl: null }, { status: 201 }) }))
    await open()
    expect(bodies).toEqual([])
    const form = document.querySelector('form')!, model = form.querySelector('select')!
    await act(async () => { model.value = 'mk2'; model.dispatchEvent(new Event('change', { bubbles: true })) })
    ;(form.querySelector('input[name="title"]') as HTMLInputElement).value = 'Sync refused'
    await act(async () => form.requestSubmit())
    await vi.waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].usbEvents).toEqual(JSON.parse(JSON.stringify(link.supportAttachment(50))))
    expect(bodies[0].context).toMatchObject({ model: 'mk2', flash: 'usb' })
  })
})
