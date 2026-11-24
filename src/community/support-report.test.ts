import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE_BASE, fakeSession, fakeUnit } from '../dev/octatrack-link-fake'
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { baseLayout, baseVersion, layoutName } from '../engine/elekloader/base-variants'
import { issueMarkdown } from '../../server/github'
import { validateSupportAttachment } from '../../server/support-attachment'
import { parseSupportFile, SUPPORT_ATTACHED_EVENTS, SUPPORT_COPY_EVENTS, supportFile, supportFileName, supportText, type SupportAttachment } from './support-report'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const windowsChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
/** A real trail: a sync the loader refused (a module in use), then the unit unplugged. */
async function failedSync() {
  const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
  link.start(); await settle(); await settle()
  unit.refusal = 7
  await link.update('Grain', [{ module: 'Grain', data: new Uint8Array(2048) }])
  return { unit, link, attachment: link.supportAttachment(SUPPORT_ATTACHED_EVENTS) }
}
beforeEach(() => { vi.stubGlobal('navigator', { userAgent: windowsChrome }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('what a member copies or saves after a USB error', () => {
  it('says what failed, the base with its layout, the model, the browser and the events, in words', async () => {
    const { link, attachment } = await failedSync()
    const text = supportText(attachment, { what: 'Sync to Octatrack', error: link.getState().notice!.text })
    const base = baseVersion(FAKE_BASE) + ' (' + layoutName(baseLayout(FAKE_BASE)!) + ') · ' + FAKE_BASE.slice(0, 8)
    expect(text.split('\n').slice(0, 7)).toEqual(['Modwerk support details', 'What failed: Sync to Octatrack', 'Message: ' + link.getState().notice!.text,
      'Base: ' + base, 'Octatrack: OCTATRACK MKII', 'Running set: ' + FAKE_BASE.slice(0, 8), 'Browser: Chrome 131 on Windows'])
    expect(text).toMatch(/sync_started · sending · 1 package, 2 KB/)
    expect(text).toMatch(/sync_failed · sending · error device · at stage · unit answered rejected · refusal 7/)
    // The module's name stays out of the events; only the message the member saw names it.
    expect(text.replace(/^Message: .*$/m, '')).not.toContain('Grain')
  })
  it('copies the newest events only, and saves every event as JSON lines that read back the same', async () => {
    const { attachment } = await failedSync()
    const many: SupportAttachment = { ...attachment, events: Array.from({ length: 30 }, (_, i) => ({ ...attachment.events[0], at: new Date(Date.UTC(2026, 10, 24, 12, 0, i)).toISOString() })) }
    const copied = supportText(many)
    expect(copied).toContain(`(${SUPPORT_COPY_EVENTS} of 30)`)
    expect(copied).not.toContain('12:00:09 · connected')
    expect(copied).toContain('12:00:10 · connected')
    const saved = supportFile(many, { what: 'Sync to Octatrack', error: 'Free text the member saw' })
    expect(saved).toContain('12:00:00 · connected')
    expect(parseSupportFile(saved)).toEqual(many)
    expect(parseSupportFile('pasted on Discord without the JSON lines')).toBeUndefined()
    expect(supportFileName(new Date('2026-11-24T12:03:04.567Z'))).toBe('modwerk-support-20261124-120304.txt')
  })
  it('says so when the page has no events', () => {
    expect(supportText({ schema: 1, events: [] })).toBe('Modwerk support details\nBase: not connected\nNo USB events since this page opened.\n')
  })
})

describe('USB events attached to a problem report', () => {
  it('are taken as the link wrote them', async () => {
    const { attachment } = await failedSync()
    expect(validateSupportAttachment(JSON.parse(JSON.stringify(attachment)))).toEqual(attachment)
  })
  it('refuse free text, names and anything outside the shared diagnostics’ fields', async () => {
    const { attachment } = await failedSync()
    const [first] = attachment.events, refused = (value: unknown) => expect(() => validateSupportAttachment(value)).toThrow(/unreadable/)
    refused({ ...attachment, note: 'hello' })
    refused({ ...attachment, schema: 2 })
    refused({ ...attachment, events: [] })
    refused({ ...attachment, events: Array.from({ length: SUPPORT_ATTACHED_EVENTS + 1 }, () => first) })
    refused({ ...attachment, events: [{ ...first, message: 'USB disconnected while Grain ran' }] })
    refused({ ...attachment, events: [{ ...first, modules: [{ id: 'miniverb', catalogVersion: '1.0.0' }] }] })
    refused({ ...attachment, events: [{ ...first, event: 'browser_error' }] })
    refused({ ...attachment, events: [{ ...first, at: 'yesterday' }] })
    refused({ ...attachment, unit: { ...attachment.unit, model: 'OT ```' } })
    refused({ ...attachment, unit: { ...attachment.unit, layout: 'my layout' } })
    refused({ ...attachment, unit: { ...attachment.unit, name: 'My Octatrack' } })
    refused({ ...attachment, client: { browser: 'chrome', os: 'windows', agent: windowsChrome } })
  })
  it('appear in the GitHub issue in a collapsed block, readable and as JSON lines, beside the log', async () => {
    const { attachment } = await failedSync()
    const issue = { id: 'i', module_id: 'miniverb', scope: 'configuration' as const, moduleIds: ['miniverb'], title: 'Sync refused', reporter: 'tester', owners: [],
      details: { device: 'Octatrack MKII · OS 1.40C', version: '1 module', steps: '', expected: '', actual: 'It refused.', modules: [{ id: 'miniverb', name: 'Miniverb', version: '1.0.0' }], full: true } }
    const body = issueMarkdown({ ...issue, usb: attachment, log: 'x'.repeat(80000) })
    expect(body).toContain('### USB events')
    expect(body).toContain('<details><summary>USB events from the reporter’s browser (3)</summary>')
    expect(body).toContain(JSON.stringify(attachment.events[2]))
    expect(body.indexOf('### USB events')).toBeLessThan(body.indexOf('### Device log'))
    expect(body.length).toBeLessThanOrEqual(60000)
    expect(body).toContain('### Module maintainer actions') // the log makes room for the events, not the other way round
    expect(issueMarkdown(issue)).not.toContain('USB events')
  })
})
