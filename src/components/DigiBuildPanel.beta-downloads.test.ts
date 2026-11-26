// The Model:Cycles base downloads for beta testers before its review (DIGI_BETA_DOWNLOADS): in a released build
// (USB_LINK off), a beta tester's build panel offers the file, a visitor's says downloads open after review.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DigiMachine } from '../devices/digi-mods'
import type { useDigiFirmware } from '../hooks/useDigiFirmware'

vi.mock('../engine/protocol', async original => ({ ...(await original<typeof import('../engine/protocol')>()), USB_LINK: false }))
vi.mock('../community/usage', () => ({ trackFirmwareDownload: vi.fn() }))
vi.mock('../hooks/useDigiBuild', () => ({ useDigiBuild: () => ({
  state: { phase: 'built', key: 'completed-build', moduleIds: [], device: { default_version: '2.0a', version_len: 4 },
    result: { version: '2.0a', files: [{ name: 'preview.syx', data: new ArrayBuffer(4) }], bytes: 4, seconds: 1, mods: [] } },
  check: vi.fn(), build: vi.fn(), cancel: vi.fn(),
}) }))

const { CommunityContext, emptySession } = await import('../community/context')
const { DigiBuildPanel } = await import('./DigiBuildPanel')

const tester = { ...emptySession, user: { id: 'member', username: 'tester', displayName: 'Tester', verified: true, betaTester: true } }
const panel = (machine: DigiMachine, session: typeof emptySession) => renderToStaticMarkup(createElement(CommunityContext.Provider,
  { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
  createElement(DigiBuildPanel, { device: { id: machine, name: machine }, firmware: { state: 'empty' } as ReturnType<typeof useDigiFirmware>,
    moduleIds: [], onExport: vi.fn(), exported: false, canExport: false, results: null })))

describe('Model:Cycles downloads before review', () => {
  it('offers the built base to a beta tester', () => {
    expect(panel('model-cycles', tester)).toContain('Download .syx')
  })
  it('keeps it from a visitor', () => {
    expect(panel('model-cycles', emptySession)).not.toContain('Download .syx')
  })
  it('opens no other unreleased machine to beta testers', () => {
    expect(panel('digitakt-ii', tester)).not.toContain('Download .syx')
  })
  it('leaves a released machine open to everyone', () => {
    expect(panel('digitakt', emptySession)).toContain('Download .syx')
  })
})
