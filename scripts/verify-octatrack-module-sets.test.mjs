import { describe, expect, it, vi } from 'vitest'
import { DSP_MODULES, STAGED_MODULES, verifierTools, verifyModuleSets, main } from './verify-octatrack-module-sets.mjs'
const base = 'ab'.repeat(32), active = 'cd'.repeat(32), packageHash = 'ef'.repeat(32), undoHash = '12'.repeat(32)
function fixture() {
  const baseline = { state: { status: 'ready', identity: { base, canSubmit: true }, active }, inventory: { moduleIds: ['everb'], removedStockFx: [] }, capabilities: { abi: 8, features: 7, maxSites: 128, maxCopies: 128 }, diagnostics: { savedCount: 1 } }
  const call = vi.fn(async (name, args) => {
    if (name === 'site_catalogue') return { modules: STAGED_MODULES.map(id => ({ id, usb: true })) }
    if (name === 'device_status') return structuredClone(baseline)
    if (name === 'site_selection') {
      expect(args.current).toEqual(baseline.inventory); expect(args.capabilities).toEqual(baseline.capabilities)
      return { changes: args.moduleIds.filter(id => !baseline.inventory.moduleIds.includes(id)).map(module => ({ module, sha256: packageHash, undoSha256: undoHash })) }
    }
    if (name === 'device_review') return { review: 'review', base, active, changes: [{ sha256: packageHash, undoAvailable: true }] }
    if (name === 'device_trial') return { trial: 'trial', state: { status: 'trial', identity: { base } } }
    if (name === 'device_undo') return structuredClone(baseline)
    throw new Error('Unexpected tool: ' + name)
  })
  return { baseline, call, run: options => verifyModuleSets(call, options) }
}
const trial = { trial: true, expectBase: base }
describe('safe module verification through the frontend MCP', () => {
  it('defaults to read-only preparation and retains the installed baseline in every selection', async () => {
    const f = fixture(), receipt = await f.run()
    expect(receipt).toMatchObject({ mode: 'read-only-preflight', startingModules: ['everb'], fullSet: { moduleIds: [...DSP_MODULES].sort(), physicalTrial: false }, kept: false })
    expect(f.call.mock.calls.every(([name]) => ['site_catalogue', 'device_status', 'site_selection'].includes(name))).toBe(true)
    expect(f.call.mock.calls.filter(([name]) => name === 'site_selection').every(([, args]) => args.moduleIds.includes('everb'))).toBe(true)
  })
  it('preflights all six with actual limits, then trials each addition once and Undoes to the starting set', async () => {
    const f = fixture(), receipt = await f.run({ ...trial, allStaged: true })
    expect(receipt.fullSet).toEqual({ moduleIds: [...STAGED_MODULES].sort(), preparedChanges: 5, physicalTrial: false })
    expect(receipt.packages).toHaveLength(5); expect(receipt.packages.every(item => item.trialPassed && item.undoVerified)).toBe(true)
    expect(f.call.mock.calls.filter(([name]) => name === 'device_trial')).toHaveLength(5)
    expect(f.call.mock.calls.filter(([name]) => name === 'device_undo')).toHaveLength(5)
    expect(f.call.mock.calls.some(([name]) => name === 'device_keep')).toBe(false)
    const firstWrite = f.call.mock.calls.findIndex(([name]) => name === 'device_trial')
    expect(f.call.mock.calls.slice(0, firstWrite).filter(([name]) => name === 'site_selection')).toHaveLength(6)
    expect(f.call.mock.calls.filter(([name]) => name === 'device_review').every(([, args]) => args.moduleIds.length === 2 && args.moduleIds.includes('everb'))).toBe(true)
  })
  it('requires exact base opt-in before any tool call or service construction', async () => {
    const f = fixture(), create = vi.fn()
    await expect(f.run({ trial: true })).rejects.toThrow(/expect-base/); expect(f.call).not.toHaveBeenCalled()
    await expect(main(['--socket', '/unused', '--data-dir', '/unused', '--trial'], create)).rejects.toThrow(/expect-base/)
    expect(create).not.toHaveBeenCalled()
  })
  it('refuses an unexpected base before sending a trial', async () => {
    const f = fixture(); await expect(f.run({ trial: true, expectBase: '00'.repeat(32) })).rejects.toThrow(/does not match/)
    expect(f.call.mock.calls.some(([name]) => name === 'device_trial')).toBe(false)
  })
  it('refuses --all-staged on a frontend that only publishes four packages', async () => {
    const f = fixture(); f.call.mockResolvedValueOnce({ modules: DSP_MODULES.map(id => ({ id, usb: true })) })
    await expect(f.run({ allStaged: true })).rejects.toThrow(/previewvol/); expect(f.call).toHaveBeenCalledTimes(1)
  })
  it('does not invent capabilities for an older base', async () => {
    const f = fixture(); f.baseline.capabilities = undefined; const real = f.call.getMockImplementation()
    f.call.mockImplementation(async (name, args) => { if (name === 'site_selection') { expect(args.capabilities).toBeUndefined(); throw new Error('Base update required') } return real(name, args) })
    await expect(f.run({ ...trial, allStaged: true })).rejects.toThrow(/Base update/)
    expect(f.call.mock.calls.some(([name]) => name === 'device_trial')).toBe(false)
  })
  it('finishes every package preflight before allowing the first write', async () => {
    const f = fixture(), real = f.call.getMockImplementation()
    f.call.mockImplementation(async (name, args) => { if (name === 'site_selection' && args.moduleIds.length === 2 && args.moduleIds.includes('repitch')) throw new Error('Missing exact package'); return real(name, args) })
    await expect(f.run({ ...trial, allStaged: true })).rejects.toThrow(/Missing exact/)
    expect(f.call.mock.calls.some(([name]) => name === 'device_trial')).toBe(false)
  })
  it.each(['base', 'active'])('refuses changed %s in a fresh review', async field => {
    const f = fixture(), real = f.call.getMockImplementation()
    f.call.mockImplementation(async (name, args) => { const result = await real(name, args); return name === 'device_review' ? { ...result, [field]: '00'.repeat(32) } : result })
    await expect(f.run(trial)).rejects.toThrow(/changed/); expect(f.call.mock.calls.some(([name]) => name === 'device_trial')).toBe(false)
  })
  it('refuses multi-change reviews in single-package verification', async () => {
    const f = fixture(), real = f.call.getMockImplementation()
    f.call.mockImplementation(async (name, args) => { const result = await real(name, args); return name === 'device_review' ? { ...result, changes: [...result.changes, ...result.changes] } : result })
    await expect(f.run(trial)).rejects.toThrow(/Single-package/); expect(f.call.mock.calls.some(([name]) => name === 'device_trial')).toBe(false)
  })
  it('trials and Undoes one complete set on a capable base, without Keep', async () => {
    const f = fixture(), real = f.call.getMockImplementation()
    f.baseline.capabilities.features |= 512
    f.call.mockImplementation(async (name, args) => {
      const result = await real(name, args)
      if (name === 'device_review') result.changes = args.moduleIds.filter(id => id !== 'everb').map(() => ({ sha256: packageHash, undoAvailable: true }))
      return result
    })
    const receipt = await f.run({ ...trial, wholeSet: true })
    expect(receipt).toMatchObject({ mode: 'whole-set-trial', fullSet: { physicalTrial: true }, kept: false, rebootVerified: false })
    expect(receipt.packages.every(item => item.trialPassed && item.undoVerified)).toBe(true)
    expect(f.call.mock.calls.filter(([name]) => name === 'device_trial')).toHaveLength(1)
    expect(f.call.mock.calls.filter(([name]) => name === 'device_undo')).toHaveLength(1)
  })
  it('refuses whole-set verification without the device capability before a write', async () => {
    const f = fixture()
    await expect(f.run({ ...trial, wholeSet: true })).rejects.toThrow(/module-set transactions/)
    expect(f.call.mock.calls.some(([name]) => name === 'device_trial')).toBe(false)
  })
  it('Undoes an owned trial even if its state is invalid', async () => {
    const f = fixture(), real = f.call.getMockImplementation()
    f.call.mockImplementation(async (name, args) => { const result = await real(name, args); if (name === 'device_trial') result.state.status = 'ready'; return result })
    await expect(f.run(trial)).rejects.toThrow(/unaccepted/); expect(f.call.mock.calls.filter(([name]) => name === 'device_undo')).toHaveLength(1)
  })
  it.each(['inventory', 'active', 'savedCount'])('stops without a success receipt when Undo changes %s', async field => {
    const f = fixture(), real = f.call.getMockImplementation()
    f.call.mockImplementation(async (name, args) => {
      const result = await real(name, args)
      if (name === 'device_undo') {
        if (field === 'inventory') result.inventory.moduleIds = []
        if (field === 'active') result.state.active = '00'.repeat(32)
        if (field === 'savedCount') result.diagnostics.savedCount = 2
      }
      return result
    })
    await expect(f.run(trial)).rejects.toThrow(/restore|changed/); expect(f.call.mock.calls.filter(([name]) => name === 'device_trial')).toHaveLength(1)
  })
  it('excludes Keep and unrelated tools from the verifier service adapter', () => {
    const service = { call: vi.fn() }, call = verifierTools(service)
    expect(() => call('device_keep', {})).toThrow(/cannot Keep/); expect(() => call('api_request', {})).toThrow(/unrelated/)
    expect(service.call).not.toHaveBeenCalled()
  })
  it('starts read-only with an explicit candidate root and closes the service on failure without printing raw results', async () => {
    const create = vi.fn(async () => ({ call: vi.fn(async () => { throw new Error('failure') }), close: vi.fn() })), log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await expect(main(['--socket', '/selected', '--data-dir', '/isolated', '--frontend-root', '/candidate'], create)).rejects.toThrow(/failure/)
      expect(create).toHaveBeenCalledWith({ root: '/candidate', dataDir: '/isolated', deviceSocket: '/selected', allowDeviceWrites: false })
      expect((await create.mock.results[0].value).close).toHaveBeenCalledTimes(1); expect(log).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })
})
