// @vitest-environment jsdom
import { publishedUsbAudioPackage } from '../config/published-usb-audio.fixture'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { LINK_BUSY, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UploadUnconfirmedError } from '../engine/elekloader/upload-session'
import { pendingBaseInstall, waitForBaseInstall } from '../config/octatrack-progress'
import { BaseInstallDialog } from './BaseInstallDialog'
import { pendingReask, resetReask } from '../community/diagnostics-reask'
import { publishedBinding as baseBinding } from '../engine/elekloader/published-octatrack.fixture'
import { USB_AUDIO_MODULE } from '../config/usb-audio'

// The browser's download of the .bin; the guide's own steps are what is tested here.
vi.mock('../config/firmware-filename', () => ({ saveFirmware: vi.fn() }))
import { saveFirmware } from '../config/firmware-filename'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollTo = () => {}
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear(); resetReask() })
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
  const handlers = { onClose: vi.fn(), onReady: vi.fn(), onStage: vi.fn(), onStep: vi.fn(), onChooseFirmware: vi.fn() }
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
    expect(container.textContent).toContain('Install once from the CompactFlash card. Later base updates go over USB.')
    const recovery = container.querySelector('[aria-labelledby="base-recovery-title"]')
    expect(recovery?.textContent).toContain('CompactFlash card reader')
    expect(recovery?.textContent).toContain('MIDI interface')
    expect(recovery?.querySelector('a')?.getAttribute('href')).toBe('#faq/recover')
    expect(container.querySelector('.base-download-file [role="status"]')?.textContent).toBe('Verified')
    expect(buttonNamed('Download base .bin')?.disabled).toBe(true)
    expect(container.textContent).not.toMatch(/beta/i)
  })
  it('copies the file over the cable in USB DISK MODE or with a card reader, and resumes at that step after a reload', async () => {
    const { link } = await connected('stock')
    const guide = open({ link }); await guide.render()
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Download base .bin')!); await settle(); await settle()
    expect(guide.onStage.mock.calls).toEqual([['opened', undefined], ['file-downloaded', undefined]])
    // Named by the base's identity, the number the module file dialog and the update prompt show (issue from a member, 16 November 2026).
    expect(saveFirmware).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'base', expected)
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Copy the file to your card')
    expect(container.textContent).toContain('USB DISK MODE')
    expect(container.textContent).toContain('put it in a card reader')
    // An older .bin left on the card can be the one OS UPGRADE installs (issue 1624).
    expect(container.textContent).toContain('remove every other .bin there')
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
  it('counts each step a run reaches once, from the Download step to Connect pressed', async () => {
    const { link } = await connected('stock')
    const guide = open({ link, firmwareReady: false }); await guide.render()
    await act(() => root.render(createElement(BaseInstallDialog, { link, firmwareReady: false, firmwareError: 'This is not the original OS 1.40C.', buildBase: guide.buildBase, onClose: guide.onClose, onReady: guide.onReady, onStage: guide.onStage, onStep: guide.onStep, onChooseFirmware: guide.onChooseFirmware })))
    await act(() => root.render(createElement(BaseInstallDialog, { link, firmwareReady: true, buildBase: guide.buildBase, onClose: guide.onClose, onReady: guide.onReady, onStage: guide.onStage, onStep: guide.onStep, onChooseFirmware: guide.onChooseFirmware })))
    click(container.querySelector('.risk-accept input')!); click(container.querySelector('.risk-accept input')!); click(container.querySelector('.risk-accept input')!)
    click(buttonNamed('Download base .bin')!); await settle(); await settle()
    click(buttonNamed('File copied')!); click(buttonNamed('Back')!); click(buttonNamed('File copied')!) // a step met twice counts once
    click(buttonNamed('Octatrack has started')!)
    expect(container.textContent).toContain('Press Connect Octatrack and choose your Octatrack')
    expect(container.textContent).toContain('Your Octatrack isn’t in the list?')
    vi.spyOn(link, 'retry').mockResolvedValue(undefined)
    click(buttonNamed('Connect Octatrack')!); click(buttonNamed('Connect Octatrack')!)
    expect(guide.onStep.mock.calls.map(call => call[0])).toEqual(['card-download', 'os-file-refused', 'os-file-ready', 'risk-accepted', 'card-copy', 'card-install', 'card-connect', 'connect-pressed'])
  })
  it('builds the first install in the layout of a set with the USB Audio module, else with USB Audio off, and says nothing of USB Audio going off', async () => {
    const { link } = await connected('stock')
    const withAudio = open({ link, set: { name: 'Live', moduleIds: ['everb', USB_AUDIO_MODULE], usbAudio: { layout: 'master' } } }); await withAudio.render()
    expect(container.textContent).not.toContain('USB Audio is off in this base')
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Download base .bin')!); await settle(); await settle()
    expect(withAudio.buildBase.mock.calls).toEqual([[publishedUsbAudioPackage ? undefined : 'master']])
    await act(() => root.unmount()); root = createRoot(container); sessionStorage.clear()
    const without = open({ link, set: { name: 'Live', moduleIds: ['everb'] } }); await without.render()
    expect(container.textContent).not.toContain('USB Audio is off in this base')
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Download base .bin')!); await settle(); await settle()
    expect(without.buildBase.mock.calls).toEqual([[undefined]]) // session.ts builds MEMBER_LAYOUT: USB Audio off
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
  it('says at the last step when Modwerk in another tab or browser holds the unit, and finishes once it lets go', async () => {
    const { unit, link } = await connected('stock')
    waitForBaseInstall('ab'.repeat(32), expected)
    const guide = open({ link }); await guide.render()
    unit.base = expected; unit.taken = true; unit.unplug(); unit.plug('base')
    await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
    expect(container.querySelector('.base-install-note')?.textContent).toBe(LINK_BUSY)
    unit.taken = false; await act(() => link.retry())
    await vi.waitFor(() => expect(guide.onReady).toHaveBeenCalledOnce())
  })
  it('without a diagnostics step, finishes as soon as the unit connects on the new base', async () => {
    const { unit, link } = await connected('stock')
    waitForBaseInstall('ab'.repeat(32), expected)
    const guide = open({ link }); await guide.render()
    unit.base = expected; unit.unplug(); unit.plug('base')
    await vi.waitFor(() => expect(guide.onReady).toHaveBeenCalledOnce())
    expect(guide.onStage.mock.calls.map(call => call[0])).toEqual(['opened', 'first-connection'])
  })
  it('says to remove other .bin files when the unit comes back on the base it ran before (issue 1624)', async () => {
    const previous = 'cc'.repeat(32)
    const { unit, link } = await connected('base', previous)
    waitForBaseInstall('ab'.repeat(32), expected, previous)
    const guide = open({ link }); await guide.render()
    // OS UPGRADE took an older Modwerk .bin left on the card, so the unit restarts on the base it had.
    unit.unplug(); unit.plug('base')
    await vi.waitFor(() => expect(link.getState().identity?.base).toBe(previous))
    await settle()
    const note = container.querySelector('.base-install-note')?.textContent
    expect(note).toContain('still runs the base it had before')
    expect(note).toContain('Remove every other .bin')
    expect(guide.onReady).not.toHaveBeenCalled()
    expect(pendingBaseInstall()?.expectedBase).toBe(expected)
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
    // Signing in is not needed for the install, and the account doesn't hold the module sets: they stay in this browser.
    expect(container.textContent).toContain('Signing in is optional: it lets you report problems and have the site remember that your Octatrack has the base. Your module sets stay in this browser.')
    expect(container.textContent).not.toMatch(/with your account/)
    expect(buttonNamed('Show me how')?.disabled).toBe(false)
    await open({ link, launch: true, account: 'unverified' }).render()
    expect(container.querySelector('.base-install-account a')?.getAttribute('href')).toBe('#account')
  })
})

describe('a browser without WebUSB', () => {
  it('says first that USB needs a Chromium browser on a computer and leads through the card, and reports the missing WebUSB once', async () => {
    const link = new OctatrackLink(null), seen: string[] = []
    link.subscribeDiagnostics(event => seen.push(event.event + ':' + event.failure))
    const guide = open({ link }); await guide.render(); await settle()
    // Before the steps, as a note: the card route is this browser's way, not a failure.
    const route = container.querySelector('.base-install-route')!
    expect(route.getAttribute('role')).toBe('note')
    expect(route.textContent).toContain('USB needs Chrome, Edge or another Chromium browser on a computer.')
    expect(route.textContent).toContain('Use the card to install the base and load modules.')
    expect(route.compareDocumentPosition(container.querySelector('.base-install-progress')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('[role=alert]')).toBeNull()
    expect([...container.querySelectorAll('.base-install-progress li')].map(item => item.textContent)).toEqual(['1Download', '2Copy', '3Install', '4Load modules'])
    expect(guide.onStage.mock.calls).toEqual([['opened', undefined], ['failed', 'no-webusb']])
    expect(seen).toEqual(['link_failed:no-webusb'])
    click(container.querySelector('.risk-accept input')!); click(buttonNamed('Download base .bin')!); await settle(); await settle()
    expect(container.querySelector('.base-install-route')).toBeNull()
    click(buttonNamed('File copied')!); click(buttonNamed('Octatrack has started')!)
    expect(container.querySelector('#base-stage-title')?.textContent).toBe('Now load your modules from the card')
    expect(buttonNamed('Connect Octatrack')).toBeUndefined(); expect(buttonNamed('Open Setup')).toBeDefined()
    expect(guide.onStep.mock.calls.map(call => call[0])).toEqual(['card-download', 'os-file-ready', 'risk-accepted', 'card-copy', 'card-install', 'card-load-from-card'])
  })
  it('says it on the first view too, as a note instead of a failure', async () => {
    await open({ link: new OctatrackLink(null), launch: true }).render(); await settle()
    expect(container.querySelector('.base-install-route')?.textContent).toContain('USB needs Chrome, Edge or another Chromium browser on a computer.')
    expect(container.querySelector('.link-needs.is-missing')).toBeNull(); expect(container.querySelector('[role=alert]')).toBeNull()
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
    // A member who doesn't share diagnostics is asked once more after the guide closes (diagnostics-reask.ts).
    expect(pendingReask()?.reason).toBe('base-update-failed')
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
