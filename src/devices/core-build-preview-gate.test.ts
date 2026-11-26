// A research machine's core build preview is beta-only until the owner releases it (MACHINE_RECIPE.md, Beta first):
// as a released build (USB_LINK off), a visitor's machine page offers no local build, a beta tester's does.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../engine/protocol', async original => ({ ...(await original<typeof import('../engine/protocol')>()), USB_LINK: false }))

const { CommunityContext, emptySession } = await import('../community/context')
const { EmptyMachine } = await import('./MachinePages')
const { DEVICES_BY_ID } = await import('./registry')
const { coreBuildPreviewOpen } = await import('../engine/elekloader/protocol')
const { hasBetaUi } = await import('../community/beta-access')

const member = { id: 'member', username: 'tester', displayName: 'Tester', verified: true }
const tester = { ...emptySession, user: { ...member, betaTester: true } }
const page = (session: typeof emptySession) => renderToStaticMarkup(createElement(CommunityContext.Provider,
  { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
  createElement(EmptyMachine, { device: DEVICES_BY_ID['model-cycles'] })))

describe('the Model:Cycles core build preview', () => {
  it('is open to beta testers only in a released build', () => {
    expect(hasBetaUi(emptySession)).toBe(false)
    expect(coreBuildPreviewOpen('model-cycles', hasBetaUi(emptySession))).toBe(false)
    expect(coreBuildPreviewOpen('model-cycles', hasBetaUi(tester))).toBe(true)
    expect(coreBuildPreviewOpen('digitakt-ii', true)).toBe(false)
  })
  it('shows the local build button to a beta tester, not to a visitor', () => {
    expect(page(emptySession)).not.toContain('#model-cycles/configuration')
    expect(page(tester)).toContain('#model-cycles/configuration')
  })
  it('shows the Status page button to a beta tester, not to a visitor', () => {
    expect(page(emptySession)).not.toContain('#model-cycles/unit')
    expect(page(tester)).toContain('#model-cycles/unit')
  })
})
