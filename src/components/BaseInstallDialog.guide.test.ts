// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UploadUnconfirmedError } from '../engine/elekloader/upload-session'
import { pendingBaseInstall, waitForBaseInstall } from '../config/octatrack-progress'
import { BaseInstallDialog } from './BaseInstallDialog'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }

// The browser's download of the .bin; the guide's own steps are what is tested here.
vi.mock('../config/firmware-filename', () => ({ saveFirmware: vi.fn() }))

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollTo = () => {}
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear() })
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const buttonNamed = (text: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)))
const expected = baseBinding.identity

async function connected(kind: 'stock' | 'base' | 'none', base?: string) {
  const unit = fakeUnit(kind), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
  if (base) unit.base = base
  link.start()
  if (kind !== 'none') await vi.waitFor(() => expect(link.getState().status).toBe(kind === 'stock' ? 'stock' : 'ready'))
  return { unit, link }
}
type Props = Partial<Parameters<typeof BaseInstallDialog>[0]> & { link: OctatrackLink }
function open(props: Props) {
  const handlers = { onClose: vi.fn(), onReady: vi.fn(), onStage: vi.fn(), onChooseFirmware: vi.fn() }
  const buildBase = vi.fn(async () => ({ buffer: new Uint8Array([1, 2]).buffer, sha256: 'ab'.repeat(32), base: expected }))
  const render = () => act(() => root.render(createElement(BaseInstallDialog, { firmwareReady: true, buildBase, ...handlers, ...props })))
  return { ...handlers, buildBase, render }
}

describe('the guided first install, for a member on the original OS', () => {
  it('starts with a first view that says the card does the first install and USB every later update, with no beta framing', async () => {
    const { link } = await connected('stock')
    const guide = open({ link, launch: true }); await guide.render()
    const text = container.textContent!
    expect(container.querySelector('h2')?.textContent).toBe('Install the Modwerk base')
    expect(text).toContain('The original OS has no USB link for Modwerk, so this first install goes through the card')
    expect(text).toContain('Later base updates go over USB.')
    expect(text).toContain('MKI or MKII')
    expect(text).not.toMatch(/beta/i)
    expect(container.querySelector('.module-beta-badge')).toBeNull()
    expect(buttonNamed('Update over USB')).toBeUndefined()
    // No countdown: the member opened Your Octatrack themselves.
    expect(buttonNamed('Later')?.textContent).toBe('Later'); expect(buttonNamed('Later')?.disabled).toBe(false)
    expect(guide.onStage.mock.calls).toEqual([['opened', undefined]])
    click(buttonNamed('Show me how')!)
    expect([...container.querySelectorAll('.base-install-progress li')].map(item => item.textContent)).toEqual(['1Download', '2Copy', '3Install', '4Connect'])
    expect(container.textContent).toContain('A one-time install from the card: the original OS has no USB link for Modwerk.')
    expect(container.textContent).toContain('Before you install the Modwerk base, make sure you can recover without the Octatrack’s USB')
    expect(container.textContent).not.toMatch(/beta/i)
  })
  it('copies the file over the cable in USB DISK MODE or with a card reader, and resumes at that step after a reload', async () => {
    const { link } = await connected('stock')
    const guide = open({ link }); await guide.render()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Download base .bin')!); await settle(); await settle()
    expect(guide.onStage.mock.calls).toEqual([['opened', undefined], ['file-downloaded', undefined]])
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Copy the file to your card')
    expect(container.textContent).toContain('USB DISK MODE')
    expect(container.textContent).toContain('put it in a card reader')
    click(buttonNamed('File copied')!)
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Install it on your Octatrack')
    expect(container.textContent).toContain('PROJECT → SYSTEM → OS UPGRADE')
    expect(container.textContent).toContain('Report a problem on the Your Octatrack page')
    expect(container.textContent).not.toContain('#beta-testers')
    // A reload in this tab: the guide comes back at the step it left, with the downloaded base still awaited.
    await act(() => root.unmount()); root = createRoot(container)
    await open({ link }).render()
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Install it on your Octatrack')
    expect(pendingBaseInstall()?.expectedBase).toBe(expected)
  })
  it('ends with the diagnostics step once the unit first connects on the new base, and never waits on it', async () => {
    const { unit, link } = await connected('stock')
    waitForBaseInstall('ab'.repeat(32), expected)
    const guide = open({ link, diagnosticsStep: createElement('p', { className: 'diagnostics-slot' }, 'Share diagnostics?') }); await guide.render()
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Waiting for your Octatrack')
    unit.base = expected; unit.unplug(); unit.plug('base')
    await vi.waitFor(() => expect(container.querySelector('.diagnostics-slot')).not.toBeNull())
    expect(container.querySelector('h2')?.textContent).toBe('The Modwerk base is installed')
    expect(guide.onStage.mock.calls.map(call => call[0])).toEqual(['opened', 'first-connection'])
    expect(guide.onReady).not.toHaveBeenCalled()
    expect(container.querySelector('.base-install-close')).not.toBeNull()
    click(buttonNamed('Continue')!)
    expect(guide.onReady).toHaveBeenCalledOnce()
    expect(pendingBaseInstall()).toBeUndefined()
  })
  it('without a diagnostics step, finishes as soon as the unit connects on the new base', async () => {
    const { unit, link } = await connected('stock')
    waitForBaseInstall('ab'.repeat(32), expected)
    const guide = open({ link }); await guide.render()
    unit.base = expected; unit.unplug(); unit.plug('base')
    await vi.waitFor(() => expect(guide.onReady).toHaveBeenCalledOnce())
    expect(guide.onStage.mock.calls.map(call => call[0])).toEqual(['opened', 'first-connection'])
  })
  it('closes by itself when the unit turns out to run the current base already', async () => {
    const { unit, link } = await connected('none')
    const guide = open({ link, launch: true }); await guide.render()
    expect(container.textContent).toContain('Already installed the base? Connect your Octatrack, and this guide closes by itself.')
    unit.base = expected; unit.plug('base')
    await vi.waitFor(() => expect(guide.onClose).toHaveBeenCalledWith(true))
  })
  it('leads a visitor to sign in, and an unverified member to their account, without holding up the install', async () => {
    const { link } = await connected('stock')
    await open({ link, launch: true, account: 'visitor' }).render()
    expect(container.querySelector('.base-install-account a')?.getAttribute('href')).toBe('#account/login?next=octatrack')
    expect(container.textContent).toContain('Sign in first')
    expect(buttonNamed('Show me how')?.disabled).toBe(false)
    await open({ link, launch: true, account: 'unverified' }).render()
    expect(container.querySelector('.base-install-account a')?.getAttribute('href')).toBe('#account')
  })
})

describe('a later base update', () => {
  it('goes over USB in one step, and reports each failure category once per run', async () => {
    const { link } = await connected('base', 'cc'.repeat(32))
    const update = vi.spyOn(link, 'updateBase').mockImplementation(async () => { throw new UploadUnconfirmedError('hello was not confirmed') })
    const guide = open({ link }); await guide.render()
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Update over USB')
    expect(container.querySelector('.base-install-progress')).toBeNull()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    click(buttonNamed('Try again')!); await settle(); await settle()
    expect(update).toHaveBeenCalledTimes(2)
    expect(guide.onStage.mock.calls).toEqual([['opened', undefined], ['failed', 'link-lost']])
    expect(buttonNamed('Update from the card')).toBeDefined()
  })
  it('says when it is done', async () => {
    const { link } = await connected('base', 'cc'.repeat(32))
    vi.spyOn(link, 'updateBase').mockImplementation(async (_bin, _base, report) => { report?.('done') })
    const guide = open({ link }); await guide.render()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    expect(guide.onStage.mock.calls.map(call => call[0])).toEqual(['opened', 'usb-update-done'])
  })
  it('names a base that cannot be built', async () => {
    const { link } = await connected('base', 'cc'.repeat(32))
    const guide = open({ link, buildBase: vi.fn(async () => { throw new Error('Not the original OS 1.40C.') }) }); await guide.render()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Update over USB')!); await settle(); await settle()
    expect(guide.onStage).toHaveBeenLastCalledWith('failed', 'build-failed')
    expect(container.textContent).toContain('Not the original OS 1.40C.')
  })
})
