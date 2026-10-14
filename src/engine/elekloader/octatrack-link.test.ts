import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { FAKE_BASE, fakeSession, fakeUnit } from '../../dev/octatrack-link-fake'
import { removalPackage } from './module-set'
import { LinkBusyError, OctatrackLink, tabLocks } from './octatrack-link'
import { UploadUnconfirmedError } from './upload-session'
import { UsbVendorTransport } from './upload-usb'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
async function linked(kind: 'base' | 'stock' | 'none' = 'base') {
  const unit = fakeUnit(kind), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
  link.start(); await settle(); await settle()
  return { unit, link }
}
// Each link gets its own in-tab lock; Node's own navigator.locks would be shared by every test.
beforeEach(() => { vi.stubGlobal('navigator', {}) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('finding the unit', () => {
  it('holds one cross-tab lock for the complete two-file backup and releases the interface before another read', async () => {
    const unit = fakeUnit(), locks = tabLocks()
    const a = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks), b = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks)
    const stopA = a.start(), stopB = b.start()
    await vi.waitFor(() => expect([a.getState().status, b.getState().status]).toEqual(['ready', 'ready']))
    await settle()
    const device = (await unit.usb.getDevices())[0], claim = vi.spyOn(device, 'claimInterface'), release = vi.spyOn(device, 'releaseInterface')
    let complete: () => void = () => {}, finished = false
    let backup: Promise<unknown> | undefined, reading: Promise<unknown> | undefined
    const snapshot = vi.spyOn(UsbVendorTransport.prototype, 'savedBackup').mockImplementationOnce(() => new Promise(resolve => { complete = () => resolve([]) }))
    try {
      backup = a.savedBackup(); await settle()
      reading = b.inventory().then(() => { finished = true }); await settle()
      expect(finished).toBe(false); expect(claim).toHaveBeenCalledTimes(1); expect(release).not.toHaveBeenCalled()
      complete(); await backup; await reading
      expect(finished).toBe(true); expect(claim).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(2)
      expect(a.getState().status).toBe('ready'); expect(b.getState().status).toBe('ready')
    } finally { complete(); await Promise.allSettled([backup, reading]); snapshot.mockRestore(); stopA(); stopB() }
  })
  it('does not read diagnostic status if consent is withdrawn while claiming the interface', async () => {
    const {unit,link}=await linked(),device=(await unit.usb.getDevices())[0]
    const transfer=vi.spyOn(device,'controlTransferIn'),release=vi.spyOn(device,'releaseInterface')
    let complete:()=>void=()=>{},allowed=true
    vi.spyOn(device,'claimInterface').mockImplementationOnce(()=>new Promise<void>(resolve=>{complete=resolve}))
    const controller=new AbortController(),reading=link.health(controller.signal,()=>allowed)
    const cancelled=expect(reading).rejects.toBeInstanceOf(LinkBusyError)
    await settle();allowed=false;controller.abort();complete();await cancelled
    expect(transfer).not.toHaveBeenCalled();expect(release).toHaveBeenCalledTimes(1)
  })
  it('reports a browser without WebUSB instead of offering a dead button', () => {
    expect(new OctatrackLink(undefined).getState().status).toBe('unsupported')
  })
  it('reopens an allowed unit and reads its base without the picker', async () => {
    const { link } = await linked()
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { base: FAKE_BASE, model: 'OCTATRACK MKII', canSubmit: true }, active: FAKE_BASE })
  })
  it('tells a stock unit apart, then finds the base when the unit restarts after its OS upgrade', async () => {
    const { unit, link } = await linked('stock')
    expect(link.getState().status).toBe('stock')
    unit.unplug(); expect(link.getState().status).toBe('idle')
    unit.plug('base'); await settle(); await settle()
    expect(link.getState().status).toBe('ready')
  })
  it('says when another tab or app holds the unit, and retries', async () => {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit))
    unit.taken = true; link.start(); await settle(); await settle()
    expect(link.getState().status).toBe('busy')
    unit.taken = false; await link.retry()
    expect(link.getState().status).toBe('ready')
  })
  it('stays connected while any view still uses it', async () => {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit))
    const card = link.start(), dialog = link.start(); await settle(); await settle()
    card(); card()
    expect(link.getState().status).toBe('ready')
    unit.unplug(); expect(link.getState().status).toBe('idle') // still listening
    dialog(); unit.plug('base'); await settle(); await settle()
    expect(link.getState().status).toBe('idle') // nobody listens any more
  })
  it('does not reopen after the last view leaves while allowed devices are still being read', async () => {
    const unit = fakeUnit(), devices = await unit.usb.getDevices(), gate = deferred()
    vi.spyOn(unit.usb, 'getDevices').mockImplementationOnce(async () => { await gate.promise; return devices })
    const open = vi.spyOn(devices[0], 'open'), link = new OctatrackLink(unit.usb, fakeSession(unit))
    const stop = link.start(); stop(); gate.resolve(); await settle(); await settle()
    expect(open).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
  })
  it('discards a late identity reply after the unit disconnects', async () => {
    const unit = fakeUnit(), device = (await unit.usb.getDevices())[0], gate = deferred(), entered = deferred()
    const transfer = device.controlTransferIn.bind(device)
    vi.spyOn(device, 'controlTransferIn').mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return transfer(...args) })
    const link = new OctatrackLink(unit.usb, fakeSession(unit)), stop = link.start()
    await entered.promise; unit.unplug(); gate.resolve(); await settle(); await settle()
    expect(link.getState().status).toBe('idle')
    expect(link.getState().identity).toBeUndefined()
    stop()
  })
  it('does not open a unit picked after the last view left', async () => {
    const unit = fakeUnit(), device = (await unit.usb.getDevices())[0], gate = deferred()
    vi.spyOn(unit.usb, 'getDevices').mockResolvedValue([])
    vi.spyOn(unit.usb, 'requestDevice').mockImplementationOnce(async () => { await gate.promise; return device })
    const link = new OctatrackLink(unit.usb, fakeSession(unit)), stop = link.start()
    const picking = link.connect(); stop(); gate.resolve(); await picking; await settle()
    expect(device.opened).toBe(false)
    expect(link.getState().status).toBe('idle')
  })
  it('refuses a late inventory reply from a disconnected unit', async () => {
    const { unit, link } = await linked(), device = (await unit.usb.getDevices())[0], gate = deferred(), entered = deferred()
    const transfer = device.controlTransferIn.bind(device)
    vi.spyOn(device, 'controlTransferIn').mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return transfer(...args) })
    const reading = expect(link.inventory()).rejects.toBeInstanceOf(LinkBusyError)
    await entered.promise; unit.unplug(); gate.resolve(); await reading
    expect(link.getState().status).toBe('idle')
  })
  it('does not claim a unit opened after the last view leaves', async () => {
    const unit = fakeUnit(), device = (await unit.usb.getDevices())[0], gate = deferred(), entered = deferred()
    const open = device.open.bind(device), claim = vi.spyOn(device, 'claimInterface')
    vi.spyOn(device, 'open').mockImplementationOnce(async () => { entered.resolve(); await gate.promise; await open() })
    const link = new OctatrackLink(unit.usb, fakeSession(unit)), stop = link.start()
    await entered.promise; stop(); gate.resolve(); await settle(); await settle()
    expect(claim).not.toHaveBeenCalled()
    expect(device.opened).toBe(false)
    expect(link.getState().status).toBe('idle')
  })
  it('does not read inventory after the last view leaves while claiming the interface', async () => {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit)), stop = link.start()
    await settle(); await settle()
    const device = (await unit.usb.getDevices())[0], gate = deferred(), entered = deferred(), released = deferred()
    const transfer = vi.spyOn(device, 'controlTransferIn')
    vi.spyOn(device, 'claimInterface').mockImplementationOnce(async () => { entered.resolve(); await gate.promise })
    vi.spyOn(device, 'releaseInterface').mockImplementationOnce(() => released.promise)
    const reading = expect(link.inventory()).rejects.toBeInstanceOf(LinkBusyError)
    await entered.promise; stop(); gate.resolve()
    try { await Promise.all([reading, settle().then(() => released.resolve())]) } finally { released.resolve() }
    expect(transfer).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
  })
})

describe('sending a module', () => {
  const data = new Uint8Array(10000), one = [{ module: 'PREVIEW VOL', data }]
  it('runs a trial, then keeps it', async () => {
    const { link } = await linked()
    const progress: number[] = []
    link.subscribe(() => { if (link.getState().status === 'sending') progress.push(link.getState().progress!) })
    await link.update('PREVIEW VOL', one)
    expect(link.getState()).toMatchObject({ status: 'trial', module: 'PREVIEW VOL', active: sha(data) })
    expect(progress.at(-1)).toBe(1)
    await link.keep()
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success' }, active: sha(data) })
    expect(link.getState().notice!.text).toMatch(/Kept\. PREVIEW VOL stays on your Octatrack, also after a restart/)
  })
  it('keeps the trial running when playback blocks keep, and finishes once stopped', async () => {
    const { unit, link } = await linked()
    await link.update('PREVIEW VOL', one)
    unit.playing = true; await link.undo()
    expect(link.getState()).toMatchObject({ status: 'trial', notice: { tone: 'error', text: expect.stringMatching(/Stop playback/) } })
    unit.playing = false; await link.undo()
    expect(link.getState()).toMatchObject({ active: FAKE_BASE, notice: { text: expect.stringMatching(/^Undone/) } })
  })
  it('goes ahead as soon as playback stops within the wait', async () => {
    const { unit, link } = await linked()
    unit.playing = true; setTimeout(() => { unit.playing = false }, 100) // the base pressing STOP, or the user
    await link.update('PREVIEW VOL', one)
    expect(link.getState().status).toBe('trial')
  })
  it('refuses to start while playing, without asking the user to unplug', async () => {
    const { unit, link } = await linked()
    unit.playing = true; await link.update('PREVIEW VOL', one)
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'error', text: 'Stop playback or finish recording on the Octatrack to continue.' } })
  })
  it('stress-tests an update before it can be kept, and undoes it when the test fails', async () => {
    const { link } = await linked(), seen: string[] = []
    link.subscribe(() => { seen.push(link.getState().status) })
    await link.update('My set', one, async () => null)
    expect(seen).toContain('testing')
    expect(link.getState()).toMatchObject({ status: 'trial', tested: true })
    await link.keep()
    await link.update('My set', one, async () => 'CPU over budget on track 3')
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'error', text: 'The self-test failed: CPU over budget on track 3. Nothing was kept.' } })
  })
  it('refuses a module bigger than the base can stage', async () => {
    const { link } = await linked()
    await link.update('HUGE', [{ module: 'HUGE', data: new Uint8Array(262145) }])
    expect(link.getState().notice?.text).toMatch(/too big/)
  })
  it('cancels a transfer cleanly', async () => {
    const { link } = await linked()
    link.subscribe(() => { if (link.getState().progress) link.cancel() }) // the button shows once sending has started
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toBe('Cancelled. Nothing changed on the Octatrack.')
  })
  it('says why the Octatrack rejected a module, from the base’s record', async () => {
    const { unit, link } = await linked()
    unit.refusal = 7 // a track plays the effect it would replace
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/A track is playing this module’s effect/)
    unit.refusal = 1 // malformed: the plain text
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toBe('The Octatrack can’t run this module file.')
  })
  it('stages again when the loader was busy for a moment', async () => {
    const { unit, link } = await linked()
    unit.refusal = 5 // DSP code moving: busy now, free a moment later
    setTimeout(() => { unit.refusal = undefined }, 50)
    await link.update('PREVIEW VOL', one)
    expect(link.getState().status).toBe('trial')
  })
  it('stages again when the loader refused the publication as busy (a controller quiescing before it leaves)', async () => {
    const { unit, link } = await linked()
    unit.publishRefusal = 5 // the board answers busy once and quiesces; the base dropped the staged package
    setTimeout(() => { unit.publishRefusal = undefined }, 50)
    await link.update('PREVIEW VOL', one)
    expect(link.getState().status).toBe('trial')
    await link.undo()
    unit.publishRefusal = 7 // anything else stays a refusal, in words
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/A track is playing this module’s effect/)
  })
  it('recovers from a missing reply without asking to unplug', async () => {
    const unit = fakeUnit(), base = fakeSession(unit)
    let calls = 0
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      if (++calls !== 2) return session
      let trusted = true // the update's session: a chunk's reply goes missing mid-transfer
      return Object.create(session, {
        connectionTrusted: { get: () => trusted },
        stage: { value: async () => { trusted = false; unit.staged = true; throw new UploadUnconfirmedError('chunk was not confirmed', session.status) } },
      })
    }
    const link = new OctatrackLink(unit.usb, connect, 300)
    link.start(); await settle(); await settle()
    await link.update('PREVIEW VOL', one)
    expect(calls).toBe(3)
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { text: 'The Octatrack missed a reply, so nothing changed. Try again.' } })
  })
  it('keeps the trial alive with a request every second, and explains an unplug mid-trial', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { unit, link } = await linked()
    await link.update('PREVIEW VOL', one)
    const device = (await unit.usb.getDevices())[0], identify = vi.spyOn(device, 'controlTransferIn')
    vi.advanceTimersByTime(3000)
    expect(identify).toHaveBeenCalledTimes(3)
    unit.unplug()
    expect(link.getState()).toMatchObject({ status: 'idle', notice: { text: expect.stringMatching(/undoes PREVIEW VOL by itself/) } })
    vi.advanceTimersByTime(3000)
    expect(identify).toHaveBeenCalledTimes(3)
  })
  it('does not activate a staged package when the USB cable disconnects before its late reply', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred(), activate = vi.fn()
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, {
        stage: { value: async (...stage: Parameters<typeof session.stage>) => { const result = await session.stage(...stage); entered.resolve(); await gate.promise; return result } },
        activate: { value: activate },
      })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle()
    const loading = link.update('PREVIEW VOL', one)
    await entered.promise; unit.unplug(); gate.resolve(); await loading
    expect(activate).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
    stop()
  })
  it('does not resurrect a trial when the self-test finishes after a disconnect', async () => {
    const { unit, link } = await linked(), gate = deferred(), entered = deferred()
    const loading = link.update('PREVIEW VOL', one, async () => { entered.resolve(); await gate.promise; return null })
    await entered.promise; unit.unplug(); gate.resolve(); await loading
    expect(link.getState().status).toBe('idle')
    expect(link.getState().notice?.text).toMatch(/undoes PREVIEW VOL/)
  })
  it('does not confirm Keep from a reply received after disconnecting', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred()
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, { accept: { value: async () => { const result = await session.accept(); entered.resolve(); await gate.promise; return result } } })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle(); await link.update('PREVIEW VOL', one)
    const keeping = link.keep()
    await entered.promise; unit.unplug(); gate.resolve(); await keeping
    expect(link.getState().status).toBe('idle')
    expect(link.getState().notice?.tone).toBe('error')
    stop()
  })
  it('stays idle when the last view leaves while a failed load cleans up', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred()
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, { rollback: { value: async () => { entered.resolve(); await gate.promise; return session.rollback() } } })
    }
    const link = new OctatrackLink(unit.usb, connect, 300), stop = link.start()
    await settle(); await settle()
    const loading = link.update('PREVIEW VOL', one, async () => 'CPU over budget')
    await entered.promise; stop(); gate.resolve(); await loading
    expect(link.getState().status).toBe('idle')
    const restart = link.start()
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    restart()
  })
  it('releases the tab lock after the last view leaves during a trial', async () => {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit)), stop = link.start()
    await settle(); await settle(); await link.update('PREVIEW VOL', one)
    stop(); expect(link.getState().status).toBe('idle')
    const restart = link.start(); await settle(); await settle()
    expect(link.getState().status).toBe('ready')
    restart()
  })
  it('does not load after the last view leaves while claiming the interface', async () => {
    const unit = fakeUnit(), connect = vi.fn(fakeSession(unit)), gate = deferred(), entered = deferred()
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle()
    const device = (await unit.usb.getDevices())[0]
    connect.mockClear()
    vi.spyOn(device, 'claimInterface').mockImplementationOnce(async () => { entered.resolve(); await gate.promise })
    const loading = link.update('PREVIEW VOL', one)
    await entered.promise; stop(); gate.resolve(); await loading
    expect(connect).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
  })
  it('discards a load queued before the link is stopped and restarted', async () => {
    const unit = fakeUnit(), locks = tabLocks(), gate = deferred(), entered = deferred()
    const link = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks), stop = link.start()
    await settle(); await settle()
    const holding = locks.request('modwerk-octatrack-usb', {}, async () => { entered.resolve(); await gate.promise })
    await entered.promise
    const loading = link.update('PREVIEW VOL', one)
    stop(); const restart = link.start(); gate.resolve(); await holding; await loading
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(unit.active).toBe(FAKE_BASE)
    restart()
  })
  it('does not start a trial after an activation reply arrives on a disconnected link', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred(), trial = vi.fn()
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      trial.mockImplementation(() => session.startTrial())
      return Object.create(session, {
        activate: { value: async () => { const result = await session.activate(); entered.resolve(); await gate.promise; return result } },
        startTrial: { value: trial },
      })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle()
    const loading = link.update('PREVIEW VOL', one)
    await entered.promise; unit.unplug(); gate.resolve(); await loading
    expect(trial).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
    stop()
  })
  it('does not accept Keep after the connection ends while stopping playback', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred(), accept = vi.fn()
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      accept.mockImplementation(() => session.accept())
      return Object.create(session, {
        holdTrial: { value: async () => { const result = await session.holdTrial(); entered.resolve(); await gate.promise; return result } },
        accept: { value: accept },
      })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle(); await link.update('PREVIEW VOL', one)
    const keeping = link.keep()
    await entered.promise; unit.unplug(); gate.resolve(); await keeping
    expect(accept).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
    stop()
  })
  it('does not leave upload mode after a saved-state reply arrives from a disconnected unit', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred(), leave = vi.fn()
    unit.status = true
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      leave.mockImplementation(() => session.leaveUploadMode())
      return Object.create(session, { leaveUploadMode: { value: leave } })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle(); await link.update('PREVIEW VOL', one)
    const device = (await unit.usb.getDevices())[0], transfer = device.controlTransferIn.bind(device)
    vi.spyOn(device, 'controlTransferIn').mockImplementationOnce(async (...args) => { const reply = await transfer(...args); entered.resolve(); await gate.promise; return reply })
    const keeping = link.keep()
    await entered.promise; unit.unplug(); gate.resolve(); await keeping
    expect(leave).not.toHaveBeenCalled()
    expect(link.getState().status).toBe('idle')
    stop()
  })
})

describe('loading a module set', () => {
  // Runtime packages as the builder makes them: an install has an image, a removal none (sdk/runtime/loader/README.md).
  const install = (id: string) => { const data = new Uint8Array(36); data.set([0x4d, 0x57, 0x52, 0x4d, 0, 4]); const view = new DataView(data.buffer); view.setUint32(8, 4); view.setUint32(28, Number.parseInt(id, 16)); return data }
  const change = (id: string, removes = false) => ({ module: 'M' + id.slice(-1), data: removes ? removalPackage(id) : install(id), undo: removes ? install(id) : removalPackage(id) })
  const set = [change('0000000a', true), change('0000000b'), change('0000000c')]
  async function loaded(stressTest?: () => Promise<string | null>) {
    const result = await linked(); result.unit.modules = ['0000000a']
    await result.link.update('Live', set, stressTest)
    return result
  }
  it('keeps each change before the last at once, runs the last as the trial, and keeps it', async () => {
    const { unit, link } = await loaded(async () => null)
    expect(link.getState()).toMatchObject({ status: 'trial', module: 'Live', tested: true })
    expect(unit.kept).toEqual(['-0000000a', '+0000000b'])
    await link.keep()
    expect(unit.kept).toEqual(['-0000000a', '+0000000b', '+0000000c'])
    expect(link.getState().notice).toMatchObject({ tone: 'success', text: 'Kept. Live stays on your Octatrack, also after a restart.' })
    expect((await link.inventory())!.map(item => item.module)).toEqual(['0000000b', '0000000c'])
  })
  it('undoes the whole set: the trial rolled back, then the kept changes put back newest first', async () => {
    const { unit, link } = await loaded()
    await link.undo()
    expect(unit.kept).toEqual(['-0000000a', '+0000000b', '-0000000b', '+0000000a'])
    expect(unit.modules).toEqual(['0000000a'])
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success', text: 'Undone. Your Octatrack is back to how it was.' } })
  })
  it('rolls back again while the loader cannot switch yet', async () => {
    const { unit, link } = await loaded()
    unit.stuck = 2; await link.undo()
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success', text: 'Undone. Your Octatrack is back to how it was.' } })
  })
  it('undoes the set when the self-test fails', async () => {
    const { unit, link } = await loaded(async () => 'the Octatrack’s DSP stopped')
    expect(unit.kept).toEqual(['-0000000a', '+0000000b', '-0000000b', '+0000000a'])
    expect(link.getState().notice?.text).toBe('The self-test failed: the Octatrack’s DSP stopped. Nothing was kept.')
  })
  it('puts back what it kept when the base refuses a change part way, and names the module', async () => {
    const unit = fakeUnit(), base = fakeSession(unit)
    let stages = 0
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, { stage: { value: (...stage: Parameters<typeof session.stage>) => { unit.refusal = ++stages === 2 ? 2 : undefined; return session.stage(...stage) } } })
    }
    const link = new OctatrackLink(unit.usb, connect, 300)
    link.start(); await settle(); await settle(); unit.modules = ['0000000a']
    await link.update('Live', set)
    expect(unit.kept).toEqual(['-0000000a', '+0000000a'])
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'error', text: 'Mb: There isn’t enough module memory left on the Octatrack. Remove a module, then try again.' } })
  })
  it('says which modules it could not put back', async () => {
    const { unit, link } = await linked(); unit.modules = ['0000000a']
    await link.update('Live', [{ ...set[0], undo: undefined }, set[1]])
    await link.undo()
    expect(link.getState().notice?.text).toBe('Undone, except: Ma couldn’t be put back: the site has no package for it.')
  })
  it('explains an unplug part way through a set', async () => {
    const { unit, link } = await loaded()
    unit.unplug()
    expect(link.getState()).toMatchObject({ status: 'idle', notice: { text: 'USB disconnected. Your Octatrack is between the two module sets: sync one of them again.' } })
  })
})

describe('several tabs of the site', () => {
  const data = (n: number) => new Uint8Array(4000).fill(n)
  async function tabs() {
    const unit = fakeUnit(), locks = tabLocks() // one lock for both, as navigator.locks is across tabs
    const a = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks), b = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks)
    a.start(); b.start()
    for (let i = 0; i < 6; i++) await settle()
    return { unit, a, b }
  }
  it('take turns: the other tab skips its reads during a load, and its own load waits instead of failing', async () => {
    const { unit, a, b } = await tabs()
    expect([a.getState().status, b.getState().status]).toEqual(['ready', 'ready'])
    await a.update('Set A', [{ module: 'A', data: data(1) }])
    expect(a.getState().status).toBe('trial')
    await expect(b.inventory()).rejects.toBeInstanceOf(LinkBusyError) // skipped this round, not "can't list"
    expect(await b.missing()).toBeUndefined() // a poll keeps what it had
    const waiting = b.update('Set B', [{ module: 'B', data: data(2) }])
    await settle()
    expect(b.getState().status).toBe('ready') // waiting for the unit, not failed
    await a.keep()
    await waiting
    // Tab B planned its load against the unit before A's: it refuses to send it.
    expect(b.getState().notice?.text).toBe('Another tab changed your Octatrack meanwhile, so nothing was synced. Review the sync again.')
    expect(unit.active).toBe(sha(data(1)))
  })
  it('lets the waiting tab load once the other tab undid its load', async () => {
    const { a, b } = await tabs()
    await a.update('Set A', [{ module: 'A', data: data(1) }])
    const waiting = b.update('Set B', [{ module: 'B', data: data(2) }])
    await a.undo()
    await waiting
    expect(b.getState()).toMatchObject({ status: 'trial', module: 'Set B' })
    await b.keep()
  })
})
