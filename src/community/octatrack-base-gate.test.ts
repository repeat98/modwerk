import { describe, expect, it } from 'vitest'
import { hasBetaAccess, hasBetaUi, hasOctatrackBase, hasUsbLinkAccess } from './beta-access'
import { emptySession } from './context'
import { availableModules, BETA_MODULE_IDS, moduleAvailabilityError } from '../catalog/availability'
import { memberBetaAccess, memberOctatrackBase } from '../../server/beta-testers'
import type { User } from '../../server/platform'

const member = { id: 'member', username: 'plain', displayName: 'Plain', verified: true }
const plain = { ...emptySession, user: member }, tester = { ...emptySession, user: { ...member, betaTester: true } }

describe('the Octatrack base path gate, apart from the rest of the beta', () => {
  it('released, gives a member who is not a beta tester the Octatrack path but not the beta', () => {
    expect(hasOctatrackBase(plain, true)).toBe(true)
    expect(hasUsbLinkAccess(plain, false, true)).toBe(true)
    expect(hasUsbLinkAccess(plain, true, true)).toBe(false) // still a computer only
    // The Zoom pedal pages and beta modules stay with the beta (outside a dev build).
    expect(hasBetaUi(plain, false)).toBe(false)
    expect(hasBetaAccess(plain)).toBe(false)
    const offered = availableModules(hasBetaAccess(plain)).map(module => module.id)
    for (const id of BETA_MODULE_IDS) expect(offered).not.toContain(id)
    expect(moduleAvailabilityError([...BETA_MODULE_IDS], hasBetaAccess(plain))).not.toBe('')
  })
  it('unreleased, changes nothing: beta testers and verified administrators only', () => {
    expect(hasOctatrackBase(plain, false)).toBe(false)
    expect(hasUsbLinkAccess(plain, false, false)).toBe(false)
    expect(hasOctatrackBase(emptySession, false)).toBe(false)
    expect(hasOctatrackBase(tester, false)).toBe(true)
    expect(hasOctatrackBase({ ...emptySession, admin: true, user: member }, false)).toBe(true)
    expect(hasOctatrackBase({ ...tester, user: { ...member, betaTester: false } }, false)).toBe(false) // revoked
    for (const session of [plain, tester, emptySession]) expect(hasOctatrackBase(session, false)).toBe(hasBetaUi(session, false))
  })
  it('on the server, reaches every verified member once released, and only the beta before', () => {
    const user = (fields: Partial<User>): User => ({ id: 'u', display_name: 'U', username: 'u', email_verified: 1, suspended: 0, beta_tester: 0, is_admin: 0, ...fields })
    expect(memberOctatrackBase(user({}), false)).toBe(false)
    expect(memberOctatrackBase(user({}), true)).toBe(true)
    expect(memberOctatrackBase(user({ email_verified: 0 }), true)).toBe(false)
    expect(memberOctatrackBase(user({ suspended: 1 }), true)).toBe(false)
    expect(memberOctatrackBase(user({ beta_tester: 1 }), false)).toBe(true)
    expect(memberOctatrackBase(user({ is_admin: 1 }), false)).toBe(true)
    expect(memberBetaAccess(user({}))).toBe(false) // beta modules stay with the beta
  })
})
