import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE_BASE, fakeSession, fakeUnit } from '../../dev/octatrack-link-fake'
import { OctatrackLink, type LinkDiagnostic } from './octatrack-link'
import { LinkTrail, TRAIL_EVENTS } from './link-trail'
import { baseLayout, baseVersion, DEFAULT_LAYOUT, describeBase, layoutIdentity, layoutName } from './base-variants'
import { USB_AUDIO_LAYOUTS } from '../../config/usb-audio'
import baseVersions from '../../../sdk/machines/octatrack/base-versions.json' with { type: 'json' }

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const one = [{ module: 'PREVIEW VOL', data: new Uint8Array(64) }]
async function linked() {
  const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
  link.start(); await settle(); await settle()
  return { unit, link }
}
beforeEach(() => { vi.stubGlobal('navigator', {}) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('the link’s local trail', () => {
  it('keeps a failed sync’s events for a member who doesn’t share diagnostics', async () => {
    const { unit, link } = await linked()
    unit.refusal = 7
    await link.update('PREVIEW VOL', one)
    const events = link.trail.recent().map(entry => entry.event)
    expect(events.map(event => event.event)).toEqual(['connected', 'sync_started', 'sync_failed'])
    expect(events[2]).toMatchObject({ error: 'device', step: 'stage', refusal: 7, base: FAKE_BASE })
    // The notice the page shows is kept for Report a problem, never in the events.
    expect(link.trail.lastError?.text).toBe(link.getState().notice?.text)
    expect(JSON.stringify(events)).not.toContain('PREVIEW VOL')
  })
  it('changes nothing on USB without a sharing listener: the EP0 counters are read only for shared diagnostics', async () => {
    for (const sharing of [false, true]) {
      const { unit, link } = await linked()
      unit.ep0 = [1, 0, 0, 1, 1, 0]
      const device = (await unit.usb.getDevices())[0], asked = vi.spyOn(device, 'controlTransferIn')
      const shared: LinkDiagnostic[] = []
      if (sharing) link.subscribeDiagnostics(event => shared.push(event))
      await link.update('PREVIEW VOL', one)
      expect(asked.mock.calls.some(([setup]) => (setup as { request: number }).request === 4)).toBe(sharing)
      // Sharing members get the same events as before, and the trail holds them too.
      if (sharing) expect(shared.map(event => event.event)).toEqual(link.trail.recent().slice(1).map(entry => entry.event.event))
    }
  })
  it('holds the newest events only, and never more than its size', () => {
    let now = 0
    const trail = new LinkTrail(3, () => ++now)
    for (const phase of ['idle', 'connecting', 'ready', 'sending', 'trial'] as const) trail.record({ event: 'connected', phase })
    expect(trail.recent().map(entry => [entry.at, entry.event.phase])).toEqual([[3, 'ready'], [4, 'sending'], [5, 'trial']])
    expect(trail.recent(1).map(entry => entry.event.phase)).toEqual(['trial'])
    expect(trail.recent(0)).toEqual([])
    expect(new LinkTrail().recent()).toEqual([])
    expect(TRAIL_EVENTS).toBe(100) // OctatrackDiagnostics.tsx and the privacy page say 100
  })
  it('copies an event, so a listener changing it later does not change the trail', () => {
    const trail = new LinkTrail(), event: LinkDiagnostic = { event: 'sync_failed', phase: 'ready', usb: [1, 2, 3, 4, 5, 6] }
    trail.record(event); event.usb![0] = 9
    expect(trail.recent()[0].event.usb).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('names the unit with its base version and layout, and keeps the last base while the unit is away', async () => {
    const { unit, link } = await linked()
    const attached = link.supportAttachment()
    expect(attached.unit).toEqual({ base: FAKE_BASE, version: baseVersion(FAKE_BASE), layout: baseLayout(FAKE_BASE), model: 'OCTATRACK MKII', active: FAKE_BASE })
    expect(attached.events[0]).toMatchObject({ event: 'connected', phase: 'ready', base: FAKE_BASE })
    expect(attached.events[0].at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(attached.client).toEqual({ browser: 'other', os: 'other' })
    unit.unplug(); await settle()
    expect(link.supportAttachment().unit).toEqual({ base: FAKE_BASE, version: baseVersion(FAKE_BASE), layout: baseLayout(FAKE_BASE), active: FAKE_BASE })
    expect(link.supportAttachment(1).events.map(event => event.event)).toEqual(['disconnected'])
  })
  it('attaches a failure before the link existed with its reason alone, as shared diagnostics send it', async () => {
    const unit = fakeUnit('none'), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    link.start(); await settle()
    await link.connect()
    expect(link.supportAttachment().events).toEqual([{ at: expect.any(String), event: 'link_failed', phase: 'idle', failure: 'no-device' }])
  })
})

describe('naming a base in a failed base update', () => {
  it('adds the layout when two bases share a version, so a same-version layout change never reads as the same base', () => {
    // A release published in every layout (0.7 to 0.7.11): its first identity runs Tracks + Main + Cue, its last USB Audio off.
    const release = baseVersions.bases.find(base => base.identities.length === 7)!, [audio, , , , , , off] = release.identities
    expect(describeBase(off, audio)).toBe(release.version + ' (' + layoutName('off') + ')')
    expect(describeBase(audio, off)).toBe(release.version + ' (' + layoutName(USB_AUDIO_LAYOUTS[0].id) + ')')
    expect(describeBase(off)).toBe(release.version + ' (' + layoutName('off') + ')')
    // Two versions tell themselves apart; a base from before versions is named by its identity.
    const current = layoutIdentity(DEFAULT_LAYOUT)!
    expect(describeBase(current, off)).toBe(baseVersion(current))
    expect(describeBase('a6b457a1' + '0'.repeat(56), off)).toBe('a6b457a1')
  })
})
