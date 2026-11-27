import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { FAKE_BASE, fakeBaseOf, fakeSession, fakeUnit } from '../../dev/octatrack-link-fake'
import { packSection } from '../elektron/codec/pack.ts'
import { encodeBin } from '../../../vendor/elekloader/kit/src/elek.ts'
import { removalPackage } from './module-set'
import { BaseTooBigError, LinkBusyError, OctatrackLink, POWER_CYCLE_MS, RECONNECT_WAIT_MS, StaleLoadError, inUseHint, inUseSlotHint, linkBusy, octatrackRank, openFailure, pickOctatrack, tabLocks, type LinkDevice, type LinkUsb } from './octatrack-link'
import { UploadUnconfirmedError } from './upload-session'
import { UsbVendorTransport, VendorTransportError, parseBaseSlots } from './upload-usb'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
async function linked(kind: 'base' | 'stock' | 'none' = 'base', moduleSets = false) {
  const unit = fakeUnit(kind), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
  unit.moduleSets = moduleSets
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
  it('says why the unit can’t be opened where a retry alone won’t help', () => {
    expect(openFailure('Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0')).toContain('Can’t connect? in Setup')
    expect(openFailure('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0')).toContain('install the base from the card first')
    expect(openFailure('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0')).toBe('Chrome couldn’t open the Octatrack. Unplug it, plug it back in and try again.')
    expect(openFailure('Mozilla/5.0 (Linux; Android 15) Chrome/141.0')).toContain('Unplug it')
  })
  it('names the computer, not only another tab, when Windows can’t claim the unit', () => {
    expect(linkBusy('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0')).toContain('install the latest base from the card once')
    expect(linkBusy('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0')).not.toContain('card')
  })
  it('names the Octatrack itself first when a claim fails: starting, or stuck after a save (#2212)', () => {
    const mac = linkBusy('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0')
    expect(mac.startsWith('Your Octatrack isn’t answering this page.')).toBe(true)
    expect(mac).toContain('wait until its screen responds')
    expect(mac).toContain('another tab or browser')
  })
  it('reports a browser without WebUSB instead of offering a dead button', () => {
    expect(new OctatrackLink(undefined).getState().status).toBe('unsupported')
  })
  it('reopens an allowed unit and reads its base without the picker', async () => {
    const { link } = await linked()
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { base: FAKE_BASE, model: 'OCTATRACK MKII', canSubmit: true }, active: FAKE_BASE })
  })
  it('undoes a sync whose page closed during its trial, instead of failing every sync until the cable is pulled', async () => {
    const unit = fakeUnit()
    unit.orphan = '77'.repeat(32) // the base waits for 10 s without any USB request, which this page's reads prevent
    const link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    link.start()
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(unit.orphan).toBeUndefined()
    expect(link.getState()).toMatchObject({ status: 'ready', active: FAKE_BASE, notice: { tone: 'success', text: 'The last sync wasn’t finished, so the Octatrack undid it.' } })
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
  it('connects by itself once the other window or app lets go', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit))
    unit.taken = true; link.start()
    await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
    unit.taken = false; await vi.advanceTimersByTimeAsync(3000)
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
  })
  it('stays busy through a retry that finds the unit still held, so the sidebar card does not flicker', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit))
    unit.taken = true; link.start()
    await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
    const seen: string[] = []; link.subscribe(() => seen.push(link.getState().status))
    await vi.advanceTimersByTimeAsync(3000)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(status => status === 'busy')).toBe(true)
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
    expect(link.getState().notice!.text).toMatch(/Synced\. PREVIEW VOL stays on your Octatrack, also after a restart/)
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
  it('says and records what kept an unsafe sync from beginning, as base 0.8.2 reports it (#2211)', async () => {
    for (const [busy, text] of [[0x31, /^Track 4’s recorder is still recording\. Let it finish or press STOP/], [0x72, /^Track 8’s recorder/],
      [3, /^Stop playback or finish recording/], [0x94, /^Stop playback or finish recording/], [5, /still finishing its last change/],
      [0, /^Stop playback or finish recording/]] as const) {
      const { unit, link } = await linked(), failures: unknown[] = []
      link.subscribeDiagnostics(event => { if (event.event === 'sync_failed') failures.push({ result: event.result, busy: event.busy, refusal: event.refusal }) })
      unit.playing = true; unit.busy = busy
      await link.update('PREVIEW VOL', one)
      expect(link.getState().notice).toMatchObject({ tone: 'error', text: expect.stringMatching(text) })
      expect(failures).toEqual([{ result: 'unsafe', busy, refusal: undefined }])
    }
  })
  it('installs an update without running a self-test', async () => {
    const { link } = await linked(), seen: string[] = []
    link.subscribe(() => { seen.push(link.getState().status) })
    const selftest = vi.spyOn(UsbVendorTransport.prototype, 'selftest')
    await link.update('My set', one)
    expect(seen).not.toContain('testing')
    expect(link.getState()).toMatchObject({ status: 'trial', module: 'My set' })
    await link.keep()
    expect(selftest.mock.calls.filter(([start]) => start)).toEqual([])
    selftest.mockRestore()
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
  it('reports the step a sync failed at', async () => {
    const { unit, link } = await linked()
    const failures: unknown[] = []
    link.subscribeDiagnostics(event => { if (event.event === 'sync_failed') failures.push({ error: event.error, step: event.step, refusal: event.refusal }) })
    unit.refusal = 7 // the fake unit refuses the package as it is staged
    await link.update('PREVIEW VOL', one)
    expect(failures).toEqual([{ error: 'device', step: 'stage', refusal: 7 }])
  })
  it('reports what stopped a sync whose transfer was never confirmed, with the base’s EP0 counters over it', async () => {
    const networkError = new DOMException('private text', 'NetworkError')
    const causes = [networkError, Object.assign(new Error('private text'), { name: 'TimeoutError' }), undefined,
      new VendorTransportError('unconfirmed OUT', false, networkError), new VendorTransportError('device refusal')], failures: unknown[] = []
    for (const [i, cause] of causes.entries()) {
      const unit = fakeUnit(), base = fakeSession(unit)
      if (i) unit.ep0 = [10, 0xfffffffe, 2, 50, 50, 0] // the first base stalls DIAG
      let calls = 0
      const connect: typeof base = async (...args) => {
        const session = await base(...args)
        if (++calls !== 2) return session
        let trusted = true // the update's session: a chunk's reply goes missing mid-transfer
        return Object.create(session, {
          connectionTrusted: { get: () => trusted },
          stage: { value: async () => {
            trusted = false; unit.staged = true
            if (unit.ep0) unit.ep0 = [10, 6, 2, 50, 50, 0, 0x0fc00020] // eight submissions refused at their SETUP, across the wrap; a data buffer error
            throw new UploadUnconfirmedError('chunk was not confirmed', session.status, cause, {command: 'chunk', chunkOffset: 4043, sequence: 9})
          } },
        })
      }
      const link = new OctatrackLink(unit.usb, connect, 300)
      link.subscribeDiagnostics(event => { if (event.event === 'sync_failed') failures.push({ error: event.error, kind: event.kind, usb: event.usb, upload: event.upload }) })
      link.start(); await settle(); await settle()
      await link.update('PREVIEW VOL', one)
    }
    const upload = {command: 'chunk', chunkOffset: 4043}
    expect(failures).toEqual([{ error: 'transport', kind: 'NetworkError', upload },
      ...['TimeoutError', 'OtherError', 'NetworkError', 'VendorTransportError'].map(kind => ({ error: 'transport', kind, usb: [0, 8, 0, 0, 0, 0, 0x20], upload }))])
  })
  it.each([[56, 0, 1, 56], [0, 0, 1, 0], [65535, 0, 1, undefined], [56, 1, 1, undefined], [56, 0, 0, undefined]] as const)(
    'matches an EP0 sample (%s bytes, %s resets, %s primes) to the failed attempt', async (residual, resets, primes, expected) => {
      const unit = fakeUnit(), [device] = await unit.usb.getDevices(), base = fakeSession(unit)
      const reads: number[][] = [], read = device.controlTransferIn.bind(device)
      vi.spyOn(device, 'controlTransferIn').mockImplementation((setup, length) => {
        if (setup.request !== 4) return read(setup, length)
        reads.push([setup.value, length])
        const data = new DataView(new ArrayBuffer(length))
        data.setUint32(0, 0x4d575544); data.setUint8(4, 3); data.setUint8(5, 1)
        if (length === 70) {
          data.setUint32(28, resets); data.setUint32(32, primes)
          data.setUint16(68, residual)
        }
        return Promise.resolve({ status: 'ok', data })
      })
      const connect: typeof base = async (...args) => {
        const session = await base(...args)
        return Object.create(session, { stage: { value: () => {
          throw new UploadUnconfirmedError('fixture', session.status, undefined, {command: 'chunk', chunkOffset: 0, sequence: 32})
        } } })
      }
      const link = new OctatrackLink(unit.usb, connect, 300), uploads: unknown[] = []
      link.subscribeDiagnostics(event => { if (event.event === 'sync_failed') uploads.push(event.upload) })
      await link.connect(); await link.update('PREVIEW VOL', one)
      expect(reads).toEqual([[0, 68], [32, 70]])
      expect(uploads).toEqual([{command: 'chunk', chunkOffset: 0, ...(expected !== undefined ? {remainingBytes: expected} : {})}])
    })
  it.each(['cancel', 'timeout'] as const)('closes a pending diagnostic read before continuing from %s', async outcome => {
    const unit = fakeUnit(), [device] = await unit.usb.getDevices()
    const connect = vi.fn(fakeSession(unit)), link = new OctatrackLink(unit.usb, connect, 300)
    const failures: unknown[] = []
    link.subscribeDiagnostics(event => { if (event.event === 'sync_failed') failures.push(event) })
    await link.connect()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const close = vi.spyOn(device, 'close'), open = vi.spyOn(device, 'open'), claim = vi.spyOn(device, 'claimInterface')
    const read = device.controlTransferIn.bind(device), pending = deferred()
    vi.spyOn(device, 'controlTransferIn').mockImplementation((setup, length) => {
      if (setup.request !== 4) return read(setup, length)
      pending.resolve()
      return new Promise<never>(() => {})
    })

    const update = link.update('PREVIEW VOL', one)
    await pending.promise
    if (outcome === 'cancel') link.cancel()
    await vi.advanceTimersByTimeAsync(outcome === 'cancel' ? 0 : 1000)
    expect(close).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)
    expect(claim).toHaveBeenCalledTimes(2)
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0])
    await vi.runAllTimersAsync()
    await update

    if (outcome === 'cancel') {
      expect(connect).toHaveBeenCalledTimes(1)
      expect(link.getState()).toMatchObject({ status: 'ready', active: FAKE_BASE,
        notice: { text: 'Cancelled. Nothing changed on the Octatrack.' } })
      expect(failures).toMatchObject([{ error: 'cancelled' }])
    } else {
      expect(connect).toHaveBeenCalledTimes(2)
      expect(connect.mock.calls[1][0]).not.toBe(connect.mock.calls[0][0])
      expect(claim.mock.invocationCallOrder[1]).toBeLessThan(connect.mock.invocationCallOrder[1])
      expect(link.getState().status).toBe('trial')
      expect(failures).toEqual([])
      const undo = link.undo()
      await vi.runAllTimersAsync()
      await undo
    }
  })

  it.each(['reopened', 'reopen failed'] as const)('settles a lost upload reply when the diagnostic read hangs and USB %s', async outcome => {
    const unit = fakeUnit(), [device] = await unit.usb.getDevices()
    unit.ep0 = [10, 0, 0, 10, 10, 0]
    const base = fakeSession(unit)
    let connections = 0
    const connect = vi.fn<typeof base>(async (...args) => {
      const session = await base(...args)
      if (++connections !== 2) return session
      return Object.create(session, {
        connectionTrusted: { get: () => false },
        stage: { value: async () => {
          unit.staged = true
          throw new UploadUnconfirmedError('chunk was not confirmed', session.status, new DOMException('fixture', 'NetworkError'))
        } },
      })
    })
    const link = new OctatrackLink(unit.usb, connect, 300), failures: unknown[] = []
    link.subscribeDiagnostics(event => {
      if (event.event === 'sync_failed') failures.push({ step: event.step, error: event.error, kind: event.kind, usb: event.usb })
    })
    await link.connect()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const close = vi.spyOn(device, 'close'), open = vi.spyOn(device, 'open')
    if (outcome === 'reopen failed') open.mockRejectedValueOnce(new DOMException('fixture', 'NetworkError'))
    const read = device.controlTransferIn.bind(device), pending = deferred()
    let reads = 0
    vi.spyOn(device, 'controlTransferIn').mockImplementation((setup, length) => {
      if (setup.request !== 4 || ++reads === 1) return read(setup, length)
      pending.resolve()
      return new Promise<never>(() => {})
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const update = link.update('PREVIEW VOL', one)
      await vi.advanceTimersByTimeAsync(0)
      await pending.promise
      expect(unit.staged).toBe(true)
      await vi.advanceTimersByTimeAsync(1000)
      expect(close).toHaveBeenCalledTimes(1)
      expect(open).toHaveBeenCalledTimes(1)
      await vi.runAllTimersAsync()
      await update

      expect(failures).toEqual([{ step: 'stage', error: 'transport', kind: 'NetworkError', usb: undefined }])
      if (outcome === 'reopened') {
        expect(connect).toHaveBeenCalledTimes(3)
        expect(connect.mock.calls[2][0]).not.toBe(connect.mock.calls[1][0])
        expect(unit.staged).toBe(false)
        expect(link.getState()).toMatchObject({ status: 'ready', active: FAKE_BASE,
          notice: { text: 'The Octatrack missed a reply, so nothing changed. Try again.' } })
      } else {
        expect(connect).toHaveBeenCalledTimes(2)
        expect(unit.staged).toBe(true)
        expect(link.getState()).toMatchObject({ status: 'idle', notice: { text: expect.stringContaining('Unplug the USB cable') } })
      }
    } finally { log.mockRestore() }
  })

  it('says why the Octatrack rejected a module, from the base’s record', async () => {
    const { unit, link } = await linked()
    unit.refusal = 7 // a track plays the effect it would replace
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/A track is using a module this sync changes or removes, as its effect or its machine/)
    expect(link.getState().notice?.text).not.toContain('Look for') // nothing in this change was marked as on the unit
    unit.refusal = 10 // RUNTIME_FEATURE: the key bus cannot come up this boot
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/can’t start the key bus this module needs until it restarts/)
    unit.refusal = 8 // RUNTIME_STOCK: a site's stock bytes are not the ones the package names
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/doesn’t match what is running on your Octatrack, so nothing changed/)
    unit.refusal = 1 // malformed: the plain text
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toBe('The Octatrack can’t run this module file.')
  })
  it('names the track and effect slot that runs a module in use, when the base says which', async () => {
    const { unit, link } = await linked()
    unit.refusal = 7
    unit.inUseSlot = 14 // T6's FX2
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/A track is using a module this sync changes or removes.* Track 6 runs it as its FX2 effect in the current Part\.$/)
    expect(link.getState().notice?.text).not.toContain('Look for')
    expect(inUseSlotHint(3, ['Tape Echo', 'Tape Echo'])).toBe(' Track 3 runs Tape Echo as its FX1 effect in the current Part.')
  })
  it('says the saved modules are still loading when a sync comes before this start’s restore', async () => {
    const { unit, link } = await linked()
    unit.restoring = true // rejected with no loader refusal, the record's saved still 0
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/hasn’t loaded its saved modules yet, so nothing changed/)
  })
  it('says the last change is not on the card yet when a sync comes while its save keeps failing', async () => {
    const { unit, link } = await linked()
    unit.saveFailed = true // rejected with no loader refusal, the record's saved 8
    await link.update('PREVIEW VOL', one)
    expect(link.getState().notice?.text).toMatch(/^The Octatrack couldn’t save your last change to its card yet, so nothing changed\./)
  })
  it('names the modules a track may be using, once each and at most five', () => {
    expect(inUseHint([])).toBe('')
    expect(inUseHint(['Tape Echo', 'Tape Echo'])).toBe(' Look for Tape Echo on the tracks.')
    expect(inUseHint(['Tape Echo', 'BBD Delay', 'Deja Vu'])).toBe(' Look for Tape Echo, BBD Delay, or Deja Vu on the tracks.')
    expect(inUseHint(['A', 'B', 'C', 'D', 'E'])).toBe(' Look for A, B, C, D, or E on the tracks.')
    expect(inUseHint(['A', 'B', 'C', 'D', 'E', 'F'])).toBe(' Look for A, B, C, D, or 2 more on the tracks.')
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
    expect(link.getState().notice?.text).toMatch(/A track is using a module this sync changes or removes, as its effect or its machine/)
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
  it('does not resurrect a trial when its start finishes after a disconnect', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), gate = deferred(), entered = deferred()
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, { startTrial: { value: async () => { await session.startTrial(); entered.resolve(); await gate.promise } } })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    await settle(); await settle()
    const loading = link.update('PREVIEW VOL', one)
    await entered.promise; unit.unplug(); gate.resolve(); await loading
    expect(link.getState().status).toBe('idle')
    expect(link.getState().notice?.text).toMatch(/undoes the unfinished load/)
    stop()
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
      return Object.create(session, {
        startTrial: { value: async () => { await session.startTrial(); throw new StaleLoadError() } }, // a load that fails once trialled
        rollback: { value: async () => { entered.resolve(); await gate.promise; return session.rollback() } },
      })
    }
    const link = new OctatrackLink(unit.usb, connect, 300), stop = link.start()
    await settle(); await settle()
    const loading = link.update('PREVIEW VOL', one)
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

describe('a sync that changes the unit’s USB configuration', () => {
  // USB Audio's package (SetChange.reconnects): the base takes the unit off USB and back once, with the trial open.
  const audio = [{ module: 'USB Audio', data: new Uint8Array(4000), reconnects: true }]
  async function reconnecting() {
    const { unit, link } = await linked()
    await link.update('USB Audio', audio)
    expect(link.getState().status).toBe('trial')
    unit.orphan = link.getState().active ?? 'trial' // what a fresh session finds: this page's trial, still open
    unit.unplug()
    expect(link.getState()).toMatchObject({ status: 'trial', reconnecting: true, notice: undefined })
    return { unit, link }
  }
  it('waits for the unit, resumes the open trial and keeps Undo working', async () => {
    const { unit, link } = await reconnecting()
    await link.undo() // Keep and Undo wait while it reconnects
    expect(link.getState()).toMatchObject({ status: 'trial', reconnecting: true })
    unit.plug('base')
    await vi.waitFor(() => expect(link.getState().reconnecting).toBeUndefined())
    expect(link.getState()).toMatchObject({ status: 'trial', module: 'USB Audio' })
    await link.undo()
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success', text: 'Undone. Your Octatrack is back to how it was.' } })
  })
  it('leaves another client’s USB Audio trial running when the paired page opens', async () => {
    const unit = fakeUnit(), candidate = '79'.repeat(32)
    unit.orphan = candidate
    const probe = vi.spyOn(UsbVendorTransport.prototype, 'hasUsbFunctionChanges').mockResolvedValue(true)
    const link = new OctatrackLink(unit.usb, fakeSession(unit)), stop = link.start()
    try {
      await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
      expect(unit.orphan).toBe(candidate)
      expect(probe).toHaveBeenCalledOnce()
    } finally { stop(); probe.mockRestore() }
  })
  it('keeps its trial while the returning USB Audio interface is briefly busy', async () => {
    const { unit, link } = await linked()
    await link.update('USB Audio', audio)
    const diagnostic = vi.fn()
    link.subscribeDiagnostics(diagnostic)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    unit.orphan = link.getState().active!
    unit.unplug()
    const back = link.reconnected()
    unit.taken = true
    unit.plug('base')
    await vi.advanceTimersByTimeAsync(0)
    expect(link.getState()).toMatchObject({ status: 'trial', reconnecting: true })
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ event: 'link_failed', phase: 'trial', failure: 'claim-failed' }))
    unit.taken = false
    await vi.advanceTimersByTimeAsync(3000)
    await vi.waitFor(() => expect(link.getState().reconnecting).toBeUndefined())
    expect(await back).toBe(true)
    vi.useRealTimers()
    await link.keep()
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success' } })
  })
  it('stops retrying the returned interface at the original trial deadline', async () => {
    const { unit, link } = await linked()
    await link.update('USB Audio', audio)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    unit.orphan = link.getState().active!
    unit.unplug()
    const back = link.reconnected()
    unit.taken = true
    unit.plug('base')
    const [device] = await unit.usb.getDevices()
    const claim = vi.spyOn(device, 'claimInterface')
    await vi.advanceTimersByTimeAsync(RECONNECT_WAIT_MS)
    expect(await back).toBe(false)
    expect(link.getState().status).toBe('idle')
    const attempts = claim.mock.calls.length
    expect(attempts).toBeGreaterThan(1)
    unit.taken = false
    await vi.advanceTimersByTimeAsync(3000)
    expect(claim).toHaveBeenCalledTimes(attempts)
  })
  it('releases a different trial that appeared while this page was waiting for its USB Audio trial', async () => {
    const { unit, link } = await reconnecting()
    unit.orphan = 'a8'.repeat(32)
    unit.plug('base')
    await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
    expect(unit.orphan).toBe('a8'.repeat(32))
  })
  it('leaves a newer trial of the same USB Audio package with its owner', async () => {
    const { unit, link } = await reconnecting()
    const candidate = unit.orphan
    unit.orphanTransaction = 8
    unit.plug('base')
    await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
    expect(unit.orphan).toBe(candidate)
  })
  it('leaves a matching USB Audio trial from a different boot session with its owner', async () => {
    const { unit, link } = await reconnecting()
    const candidate = unit.orphan
    unit.bootSession = '17'.repeat(32)
    unit.plug('base')
    await vi.waitFor(() => expect(link.getState().status).toBe('busy'))
    expect(unit.orphan).toBe(candidate)
  })
  it('resumes the same USB Audio trial after a second format change from the panel', async () => {
    const { unit, link } = await reconnecting()
    for (let i=0; i<2; i++) {
      unit.plug('base')
      await vi.waitFor(() => expect(link.getState().reconnecting).toBeUndefined())
      expect(link.getState().status).toBe('trial')
      if (!i) unit.unplug()
    }
    await link.undo()
    expect(link.getState().status).toBe('ready')
  })
  it('says so when the unit came back with the sync no longer open', async () => {
    const { unit, link } = await reconnecting()
    unit.orphan = undefined // the base undid it: the host did not reach it in time
    unit.plug('base')
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(link.getState()).toMatchObject({ notice: { tone: 'error', text: expect.stringMatching(/USB Audio was no longer open/) } })
  })
  it('gives up when the unit does not come back', async () => {
    const { unit, link } = await linked()
    await link.update('USB Audio', audio)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    unit.unplug()
    expect(RECONNECT_WAIT_MS).toBeGreaterThan(20000) // the base waits 20 s for a host to come back
    vi.advanceTimersByTime(RECONNECT_WAIT_MS - 1)
    expect(link.getState()).toMatchObject({ status: 'trial', reconnecting: true })
    vi.advanceTimersByTime(1)
    expect(link.getState()).toMatchObject({ status: 'idle', notice: { tone: 'error', text: expect.stringMatching(/didn’t come back on USB.*undoes USB Audio by itself/) } })
  })
  it('lets the Load dialog keep only once the reconnect is over', async () => {
    const { unit, link } = await linked()
    await link.update('USB Audio', audio)
    const back = link.reconnected()
    let settled: boolean | undefined
    void back.then(value => { settled = value })
    await settle()
    expect(settled).toBeUndefined() // the base has not reconnected yet
    unit.orphan = link.getState().active ?? 'trial'
    unit.unplug(); await settle()
    expect(settled).toBeUndefined()
    unit.plug('base')
    expect(await back).toBe(true)
    expect(link.getState()).toMatchObject({ status: 'trial' })
    await link.keep()
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success' } })
  })
  it('tells the Load dialog when the trial ended during the reconnect', async () => {
    const { unit, link } = await linked()
    await link.update('USB Audio', audio)
    const back = link.reconnected()
    unit.unplug(); await settle()
    unit.plug('base') // no trial open any more: the base undid it
    expect(await back).toBe(false)
  })
  it('does not wait when nothing in the sync reconnects', async () => {
    const { link } = await linked()
    await link.update('PREVIEW VOL', [{ module: 'PREVIEW VOL', data: new Uint8Array(4000) }])
    expect(await link.reconnected()).toBe(true)
  })
  it('handles an unplug as before when the sync does not reconnect', async () => {
    const { unit, link } = await linked()
    await link.update('PREVIEW VOL', [{ module: 'PREVIEW VOL', data: new Uint8Array(4000) }])
    unit.unplug()
    expect(link.getState()).toMatchObject({ status: 'idle', notice: { text: expect.stringMatching(/undoes PREVIEW VOL by itself/) } })
  })
})

describe('loading a module set', () => {
  // Runtime packages as the builder makes them: an install has an image, a removal none (sdk/runtime/loader/README.md).
  const install = (id: string) => { const data = new Uint8Array(36); data.set([0x4d, 0x57, 0x52, 0x4d, 0, 4]); const view = new DataView(data.buffer); view.setUint32(8, 4); view.setUint32(28, Number.parseInt(id, 16)); return data }
  const change = (id: string, removes = false) => ({ module: 'M' + id.slice(-1), data: removes ? removalPackage(id) : install(id), undo: removes ? install(id) : removalPackage(id) })
  const set = [change('0000000a', true), change('0000000b'), change('0000000c')]
  async function loaded() {
    const result = await linked('base', true); result.unit.modules = ['0000000a']
    await result.link.update('Live', set)
    return result
  }
  it('names what the sync removes or replaces when a track is using one of them', async () => {
    const { unit, link } = await linked('base', true); unit.modules = ['0000000a']
    unit.refusal = 7 // a track plays the effect the sync would remove
    await link.update('Live', [{ ...set[0], module: 'Tape Echo', replaces: true }, { ...set[1], module: 'Deja Vu', replaces: false }])
    const text = link.getState().notice?.text
    expect(text).toMatch(/^A track is using a module this sync changes or removes/)
    expect(text).toContain('then try again. Look for Tape Echo on the tracks.')
    expect(text).not.toContain('Deja Vu') // added by this sync: no track can be using it yet
  })
  it('trials the complete set without accepting any change before Keep', async () => {
    const { unit, link } = await loaded()
    expect(link.getState()).toMatchObject({ status: 'trial', module: 'Live' })
    expect(unit.kept).toEqual([])
    await link.keep()
    expect(unit.kept).toEqual(['-0000000a', '+0000000b', '+0000000c'])
    expect(link.getState().notice).toMatchObject({ tone: 'success', text: 'Synced. Live stays on your Octatrack, also after a restart.' })
    expect((await link.inventory())!.map(item => item.module)).toEqual(['0000000b', '0000000c'])
  })
  it('says a kept set is still to be saved when the unit has not saved it in time, and that a save failed only when it did', async () => {
    const reading = (saved: number) => ({ state: 0, failed: 0, modules: 0, dsp: 0, intact: 0, ran: 0, peaks: { cpu: 0, tracks1to4: 0, tracks5to8: 0 }, done: 0, total: 0, frameGap: 0, saved, savedCount: 0, live: 2, culprit: 0, culpritName: '', refusal: 0 })
    for (const [saved, tone, text, event] of [[2, 'success', /^Synced\. The Octatrack is still busy and saves Live to the card once/, 'kept'], [8, 'error', /^Kept, but the Octatrack couldn’t save Live to the card yet\. It keeps trying/, 'sync_failed']] as const) {
      const { link } = await loaded(), events: string[] = []
      link.subscribeDiagnostics(diagnostic => events.push(diagnostic.event))
      vi.spyOn(UsbVendorTransport.prototype, 'selftest').mockResolvedValue(reading(saved))
      vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
      const keeping = link.keep()
      await vi.advanceTimersByTimeAsync(21000)
      vi.useRealTimers(); await keeping
      expect(link.getState().notice).toMatchObject({ tone, text: expect.stringMatching(text) })
      expect(events.filter(name => name === 'kept' || name === 'sync_failed')).toEqual([event])
      vi.restoreAllMocks()
    }
  })
  it('undoes the whole set on the device without sending inverse packages', async () => {
    const { unit, link } = await loaded()
    await link.undo()
    expect(unit.kept).toEqual([])
    expect(unit.modules).toEqual(['0000000a'])
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success', text: 'Undone. Your Octatrack is back to how it was.' } })
  })
  it('rolls back again while the loader cannot switch yet', async () => {
    const { unit, link } = await loaded()
    unit.stuck = 2; await link.undo()
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'success', text: 'Undone. Your Octatrack is back to how it was.' } })
  })
  it('finishes an acknowledged twenty-row rollback without reporting a failed sync', async () => {
    const unit = fakeUnit(), base = fakeSession(unit), rollback = vi.fn()
    unit.moduleSets = true
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, { rollback: { value: () => { rollback(); return session.rollback() } } })
    }
    const link = new OctatrackLink(unit.usb, connect), stop = link.start()
    try {
      await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
      const changes = Array.from({ length: 20 }, (_, i) => change((256 + i).toString(16).padStart(8, '0')))
      await link.update('Large set', changes)
      expect(link.getState().status).toBe('trial')
      // The real backend restores one row per acknowledged engine turn.
      unit.stuck = changes.length - 1
      vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
      const undo = link.undo()
      await vi.advanceTimersByTimeAsync(5000)
      await undo
      expect(rollback).toHaveBeenCalledTimes(20)
      expect(unit.kept).toEqual([])
      expect(unit.modules).toEqual([])
      expect(link.getState()).toMatchObject({ status: 'ready', active: FAKE_BASE, notice: { tone: 'success', text: 'Undone. Your Octatrack is back to how it was.' } })
    } finally { stop() }
  })
  it('keeps the baseline when the device refuses a complete set', async () => {
    const unit = fakeUnit(), base = fakeSession(unit)
    unit.moduleSets = true
    let stages = 0
    const connect: typeof base = async (...args) => {
      const session = await base(...args)
      return Object.create(session, { stage: { value: (...stage: Parameters<typeof session.stage>) => { ++stages; unit.refusal = 2; return session.stage(...stage) } } })
    }
    const link = new OctatrackLink(unit.usb, connect, 300)
    link.start(); await settle(); await settle(); unit.modules = ['0000000a']
    await link.update('Live', set)
    expect(stages).toBe(1); expect(unit.kept).toEqual([]); expect(unit.modules).toEqual(['0000000a'])
    expect(link.getState()).toMatchObject({ status: 'ready', notice: { tone: 'error', text: 'There isn’t enough module memory left on the Octatrack in one piece: modules taken out since it started can leave gaps. Restart the Octatrack, then sync again. If it is refused again, remove a module.' } })
  })
  it('does not need the website to retain packages for Undo', async () => {
    const { unit, link } = await linked('base', true); unit.modules = ['0000000a']
    await link.update('Live', [{ ...set[0], undo: undefined }, set[1]])
    await link.undo()
    expect(unit.kept).toEqual([]); expect(unit.modules).toEqual(['0000000a'])
    expect(link.getState().notice?.text).toBe('Undone. Your Octatrack is back to how it was.')
  })
  it('explains an unplug part way through a set', async () => {
    const { unit, link } = await loaded()
    unit.unplug()
    expect(unit.kept).toEqual([])
    expect(link.getState()).toMatchObject({ status: 'idle', notice: { text: 'USB disconnected. The Octatrack undoes Live by itself as soon as playback is stopped.' } })
  })
  it('refuses a multi-change sync to an older base before sending the first package', async () => {
    const { unit, link } = await linked(); unit.modules = ['0000000a']
    const transfer = vi.spyOn((await unit.usb.getDevices())[0], 'controlTransferOut')
    await link.update('Live', set)
    expect(unit.kept).toEqual([]); expect(unit.modules).toEqual(['0000000a']); expect(transfer).not.toHaveBeenCalled()
    expect(link.getState().notice?.text).toContain('Install the latest Modwerk base')
  })
})

describe('the self-test from Status', () => {
  afterEach(() => { vi.restoreAllMocks() })
  const record = (state: number, failed = 0) => ({ state, failed, modules: 1, dsp: 1, intact: 1, ran: 1, peaks: { cpu: 0, tracks1to4: 0, tracks5to8: 0 }, done: 1, total: 2, frameGap: 0, saved: 0, savedCount: 0, live: 1, culprit: 0, culpritName: '', refusal: 0 })
  it('runs on its own while idle, shows progress, and leaves the result to the base’s record', async () => {
    const { link } = await linked(), seen: string[] = []
    const stop = link.subscribe(() => seen.push(link.getState().status))
    vi.spyOn(UsbVendorTransport.prototype, 'selftest').mockResolvedValueOnce(record(1)).mockResolvedValueOnce(record(3, 4))
    expect(await link.test()).toBeNull()
    expect(seen).toContain('testing'); expect(link.getState().status).toBe('ready')
    stop()
  })
  it('says why when the base won’t start it', async () => {
    const { link } = await linked()
    vi.spyOn(UsbVendorTransport.prototype, 'selftest').mockResolvedValue(record(0))
    expect(await link.test()).toBe('the Octatrack couldn’t start it; stop playback and try again')
    expect(link.getState().status).toBe('ready')
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

// flash.h's SLOTS record: "MWSS", layout, the running slot, flags, then per slot generation, state, tries.
function record(layout: number, running: number, flags: number, a: [number, number, number], b: [number, number, number]) {
  const view = new DataView(new ArrayBuffer(24))
  ;[0x4d, 0x57, 0x53, 0x53, layout, running, flags].forEach((byte, i) => view.setUint8(i, byte))
  ;[a, b].forEach(([generation, state, tries], k) => { view.setUint32(8 + 8 * k, generation); view.setUint8(12 + 8 * k, state); view.setUint8(13 + 8 * k, tries) })
  return new Uint8Array(view.buffer)
}

describe('updating the base over USB', () => {
  // A card file as buildBase makes one: the kit's container around a small packed image.
  function fakeBin() {
    const image = new Uint8Array(70000)
    for (let i = 0; i < image.length; i++) image[i] = (i * 7) & 0xff
    image.set([0x4f, 0xef, 0xff, 0xe4])
    const section = packSection(image), head = new TextEncoder().encode('ELEK0178     1.40C')
    const container = new Uint8Array(Math.ceil((head.length + section.length) / 4) * 4)
    container.set(head); container.set(section, head.length)
    return { bin: encodeBin(container, 0x2f1349d2), image, expected: fakeBaseOf(image) }
  }
  const dedupe = (steps: string[]) => steps.filter((step, i) => step !== steps[i - 1])
  it('RAM-boots the new base, has it write itself to NOR and comes back on it', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = [], shown = new Set<string>()
    link.subscribe(() => { const { status, baseUpdate } = link.getState(); shown.add(status + ':' + baseUpdate) })
    await link.updateBase(bin, expected, step => steps.push(step))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { base: expected }, active: expected, baseUpdate: undefined })
    // Every view shows the update, also while the unit restarts and the link is idle in between.
    expect(shown).toContain('idle:starting'); expect(shown).toContain('idle:restarting'); expect(shown).toContain('ready:writing')
  })
  it('arms the trial again from the flashed base when the unit was running another from RAM', async () => {
    const unit = fakeUnit(), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    unit.base = 'cc'.repeat(32) // a RAM-booted twin: its gate does not read the mailbox
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    const { bin, expected } = fakeBin(), steps: string[] = []
    await link.updateBase(bin, expected, step => steps.push(step))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'staging', 'starting', 'started', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
  })
  it('refuses a base larger than the unit’s base stages before anything is sent', async () => {
    const { unit, link } = await linked(), { bin, image, expected } = fakeBin(), steps: string[] = []
    unit.capacity = image.length - 1
    const refused = await link.updateBase(bin, expected, step => steps.push(step)).catch(error => error)
    expect(refused).toBeInstanceOf(BaseTooBigError)
    expect(refused).toMatchObject({ bytes: image.length, capacity: image.length - 1 })
    expect(dedupe(steps)).toEqual(['staging'])
    expect(unit.base).toBe(FAKE_BASE); expect(unit.flashed).toBe(FAKE_BASE)
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(link.getState().baseUpdate).toBeUndefined()
  })
  it('after the step base, arms once more when the unit restarts on the same base from flash', async () => {
    // The step base saved itself and runs on out of RAM: its first arming only restarts it from NOR, on the same identity.
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.fromRam = true
    await expect(link.updateBase(bin, expected)).rejects.toThrow('not the new one')
    expect(unit.flashed).toBe(FAKE_BASE)
    unit.fromRam = true
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    await link.updateBase(bin, expected, step => steps.push(step), undefined, true)
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'staging', 'starting', 'started', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
  })
  it('skips the trial when the new base already runs, and refuses after the trial when the new base cannot write itself', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.base = expected; unit.unplug(); unit.plug('base'); await vi.waitFor(() => expect(link.getState().identity?.base).toBe(expected))
    await link.updateBase(bin, expected, step => steps.push(step))
    expect(dedupe(steps)).toEqual(['started', 'writing', 'saving', 'restarting', 'done'])
    const older = fakeUnit(); older.updatesBase = false
    const old = new OctatrackLink(older.usb, fakeSession(older), 300)
    old.start(); await vi.waitFor(() => expect(old.getState().status).toBe('ready'))
    const steps2: string[] = []
    await expect(old.updateBase(bin, expected, step => steps2.push(step))).rejects.toThrow('install it from the card')
    expect(dedupe(steps2)).toEqual(['staging', 'starting', 'started']) // the trial ran; nothing was written
    expect(older.flashed).toBe(FAKE_BASE); expect(older.base).toBe(expected)
  })
  it('says why the new base refused to write itself, and leaves upload mode', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.writeRefusal = 5 // flash.h FLASH_PROTECTED: every write was refused this way before the boot snapshot
    await expect(link.updateBase(bin, expected, step => steps.push(step))).rejects.toThrow(
      'The new base refused to write itself (reason 105), so nothing was written. A power cycle returns the Octatrack to its current base and modules.')
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving'])
    expect(unit.flashed).toBe(FAKE_BASE); expect(unit.base).toBe(expected)
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(link.getState().baseUpdate).toBeUndefined()
  })
  // With fake timers: the reconnects wait for the unit to stay connected for seconds.
  async function run(update: Promise<void>) {
    let done = false
    update.then(() => { done = true }, () => { done = true })
    while (!done) await vi.advanceTimersByTimeAsync(100)
    return update
  }
  it('carries on through a USB dropout during the write until the unit is back on the new base from NOR', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.writeDropouts = 1
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await run(link.updateBase(bin, expected, step => steps.push(step)))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving', 'reconnecting', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { base: expected }, baseUpdate: undefined })
  })
  // "The Octatrack stopped answering" at Save: a reply lost while the container was still being sent ended the update,
  // though nothing was written (14 November 2026).
  it('sends the container again when a reply is lost before the write began', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.stageLosses = 2
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await run(link.updateBase(bin, expected, step => steps.push(step)))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'started', 'writing', 'started', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
  })
  it('ends with the lost reply once the container could not be sent in four tries, nothing written', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin()
    unit.stageLosses = 9
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await expect(run(link.updateBase(bin, expected))).rejects.toThrow(UploadUnconfirmedError)
    expect(unit.flashed).toBe(FAKE_BASE)
  })
  it('writes again after a failed verify, the unit staying up from RAM', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.writeFails = 1
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await run(link.updateBase(bin, expected, step => steps.push(step)))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving', 'reconnecting', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
  })
  it('asks to keep the unit on when the save is never confirmed', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.writeFails = 9
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await expect(run(link.updateBase(bin, expected, step => steps.push(step)))).rejects.toThrow('Keep it switched on')
    expect(steps.filter(step => step === 'reconnecting')).toHaveLength(3)
    expect(unit.flashed).toBe(''); expect(unit.base).toBe(expected) // still up from RAM, for the next try
    expect(link.getState().baseUpdate).toBeUndefined()
  })
  // At most one restart per update (owner, 25 October 2026).
  async function counting(unit: ReturnType<typeof fakeUnit>, layout: number) {
    unit.slots = record(layout, layout === 1 ? 0 : 0xff, 0, layout === 1 ? [2, 3, 1] : [0, 0, 0], [0, 0, 0])
    const link = new OctatrackLink(unit.usb, fakeSession(unit), 300), plug = unit.plug.bind(unit)
    let starts = 0
    unit.plug = kind => { starts++; plug(kind) }
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    return { link, restarts: () => starts }
  }
  // The running base writing another's container quiesced stock, and the DSP stall that followed hung units (30 October
  // 2026): on two slots the new base starts from RAM too and saves itself into the spare slot while it runs on.
  it('updates a unit on two slots with one restart: the trial, then the new base saves itself into the spare slot', async () => {
    const unit = fakeUnit(), { link, restarts } = await counting(unit, 1), { bin, expected } = fakeBin(), steps: string[] = []
    expect(link.getState().slots).toMatchObject({ layout: 'two' })
    await link.updateBase(bin, expected, step => steps.push(step))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving', 'done'])
    expect(unit.flashed).toBe(expected); expect(unit.base).toBe(expected); expect(restarts()).toBe(1)
  })
  // A restart can lose USB until the power is cycled (reported, not yet measured on a Modwerk base): past POWER_CYCLE_MS
  // the site asks for one instead of waiting out 90 s, and still takes a late return.
  const noting = (steps: string[]) => (step: string, _fraction?: number, slow?: boolean) => { steps.push(slow ? step + ' slow' : step) }
  // A tester's unit saved the new base, then hung at the logo on the restart: the site said "reconnecting", wrote again
  // and ended on the text about MIDI recovery. A verified save is not written again; the restart's failure ends it.
  it('ends an update whose restart after the saved write never comes back, without writing again', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.restartHangs = true
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await expect(run(link.updateBase(bin, expected, noting(steps)))).rejects.toThrow('Switch it off and on: it starts on the new base.')
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving', 'restarting', 'restarting slow'])
    expect(unit.flashed).toBe(expected)
  })
  it('does not ask for a power cycle when the unit is back in time', async () => {
    const { link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await run(link.updateBase(bin, expected, noting(steps)))
    await vi.advanceTimersByTimeAsync(2 * POWER_CYCLE_MS)
    expect(steps.filter(step => step.endsWith('slow'))).toEqual([])
  })
  it('asks for a power cycle when the trial’s restart is not back, then carries on from the base the unit starts', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.bootHangs = 1
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const update = link.updateBase(bin, expected, noting(steps))
    await vi.advanceTimersByTimeAsync(POWER_CYCLE_MS - 1000)
    expect(steps.at(-1)).toBe('starting')
    await vi.advanceTimersByTimeAsync(2000) // the sends before the restart take a few fake timer turns too
    expect(steps.at(-1)).toBe('starting slow')
    unit.base = unit.active = unit.flashed; unit.plug('base') // switched off and on: the flashed base starts
    await run(update)
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'starting slow', 'staging', 'starting', 'started', 'writing', 'saving', 'restarting', 'done'])
    expect(unit.flashed).toBe(expected)
  })
  it('still takes the new base when it comes back late by itself after the ask', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.bootHangs = 1
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const update = link.updateBase(bin, expected, noting(steps))
    await vi.advanceTimersByTimeAsync(POWER_CYCLE_MS + 15000)
    unit.plug('base') // still on the new base from RAM
    await run(update)
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'starting slow', 'started', 'writing', 'saving', 'restarting', 'done'])
  })
  it('ends with the power cycle when the trial’s restart never comes back, nothing saved', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin()
    unit.bootHangs = 1
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await expect(run(link.updateBase(bin, expected))).rejects.toThrow('Switch it off and on, then start the update again.')
    expect(unit.flashed).toBe(FAKE_BASE)
  })
  it('stops when the unit comes back on its current base twice after asking for the power cycle', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.bootHangs = 2
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const update = link.updateBase(bin, expected, noting(steps)), failed = expect(update).rejects.toThrow('not the new one')
    for (let cycle = 0; cycle < 2; cycle++) {
      await vi.advanceTimersByTimeAsync(POWER_CYCLE_MS + 2000)
      unit.base = unit.active = unit.flashed; unit.plug('base')
    }
    await run(update.catch(() => {})); await failed
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'starting slow', 'staging', 'starting', 'starting slow'])
    expect(unit.flashed).toBe(FAKE_BASE)
  })
  it('converts a unit with one copy with one restart: the trial, then the new base saves itself and runs on', async () => {
    const unit = fakeUnit(), { link, restarts } = await counting(unit, 0), { bin, expected } = fakeBin(), steps: string[] = []
    await link.updateBase(bin, expected, step => steps.push(step))
    expect(dedupe(steps)).toEqual(['staging', 'starting', 'started', 'writing', 'saving', 'done'])
    expect(unit.flashed).toBe(expected); expect(unit.base).toBe(expected); expect(restarts()).toBe(1)
    expect(link.getState()).toMatchObject({ status: 'ready', baseUpdate: undefined, slots: { layout: 'two' } })
  })
  // The write publishes the container, so the unit's active digest is the container's now; without a restart, no HELLO
  // reads it again. The first sync then failed as changed by another tab, and only its retry went through.
  it('syncs straight after a base update that saved itself without a restart, not as changed by another tab', async () => {
    const unit = fakeUnit(), { link } = await counting(unit, 0), { bin, expected } = fakeBin()
    await link.updateBase(bin, expected)
    expect(link.getState().active).toBe(unit.active)
    await link.update('Set', [{ module: 'M', data: new Uint8Array(4000).fill(3) }])
    expect(link.getState()).toMatchObject({ status: 'trial', module: 'Set' })
    expect(link.getState().notice).toBeUndefined()
    await link.keep()
    expect(unit.active).toBe(sha(new Uint8Array(4000).fill(3)))
  })
  it('still refuses a sync planned before another tab loaded, after a base update', async () => {
    const unit = fakeUnit(), locks = tabLocks()
    unit.slots = record(0, 0xff, 0, [0, 0, 0], [0, 0, 0])
    const a = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks), b = new OctatrackLink(unit.usb, fakeSession(unit), 300, locks)
    a.start(); b.start()
    await vi.waitFor(() => expect([a.getState().status, b.getState().status]).toEqual(['ready', 'ready']))
    const { bin, expected } = fakeBin()
    await a.updateBase(bin, expected)
    await a.update('Set A', [{ module: 'A', data: new Uint8Array(4000).fill(1) }])
    const waiting = b.update('Set B', [{ module: 'B', data: new Uint8Array(4000).fill(2) }])
    await a.keep()
    await waiting
    expect(b.getState().notice?.text).toBe('Another tab changed your Octatrack meanwhile, so nothing was synced. Review the sync again.')
  })
  it('stops at once when flash holds neither layout: nothing was written (refusal 108)', async () => {
    const { unit, link } = await linked(), { bin, expected } = fakeBin(), steps: string[] = []
    unit.writeRefusal = 8 // flash.h FLASH_LAYOUT
    await expect(link.updateBase(bin, expected, step => steps.push(step))).rejects.toThrow('(reason 108), so nothing was written')
    expect(steps).not.toContain('reconnecting')
  })
})

describe('the base slots', () => {
  it('reads the layout, the running slot and the stub going back to the previous base', () => {
    expect(parseBaseSlots(new DataView(record(1, 0, 1, [2, 3, 1], [3, 1, 4]).buffer))).toEqual({ layout: 'two', running: 0, fellBack: true, confirmed: false,
      slots: [{ generation: 2, whole: true, confirmed: true, tries: 1 }, { generation: 3, whole: true, confirmed: false, tries: 4 }] })
    expect(parseBaseSlots(new DataView(record(0, 0xff, 0, [0, 0, 0], [0, 0, 0]).buffer))).toMatchObject({ layout: 'one', running: null })
    expect(parseBaseSlots(new DataView(new ArrayBuffer(24)))).toBeNull() // before the base's first look
    expect(() => parseBaseSlots(new DataView(new ArrayBuffer(12)))).toThrow()
  })
  it('says so on connect when the new base did not start and the previous one runs', async () => {
    const unit = fakeUnit()
    unit.slots = record(1, 0, 1, [2, 3, 1], [3, 1, 4])
    const link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    link.start(); await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(link.getState().notice).toMatchObject({ tone: 'error', text: expect.stringContaining('went back to its previous base') })
    const quiet = fakeUnit(), other = new OctatrackLink(quiet.usb, fakeSession(quiet), 300) // a base before the slots stalls SLOTS
    other.start(); await vi.waitFor(() => expect(other.getState().status).toBe('ready'))
    expect(other.getState().notice).toBeUndefined()
  })
})

it('uploads a capable base’s complete set once and accepts nothing before the user presses Keep', async () => {
  const unit = fakeUnit(), device = (await unit.usb.getDevices())[0], transfer = device.controlTransferIn.bind(device)
  vi.spyOn(device, 'controlTransferIn').mockImplementation(async (...args) => {
    const reply = await transfer(...args)
    if (args[0].request === 29 && reply.data) reply.data.setUint16(6, reply.data.getUint16(6) | 512)
    return reply
  })
  const baseline = '72'.repeat(32), identity = vi.spyOn(UsbVendorTransport.prototype, 'setIdentity').mockResolvedValue(baseline)
  const connect = fakeSession(unit), staged: Uint8Array[] = [], accept = vi.fn(), rollback = vi.fn()
  const link = new OctatrackLink(unit.usb, async () => {
    const session = await connect(), stage = session.stage.bind(session), keep = session.accept.bind(session), undo = session.rollback.bind(session)
    return { ...session, get status() { return session.status }, stage: async (pkg, options) => { staged.push(pkg.data); return stage(pkg, options) },
      accept: async () => { accept(); return keep() }, rollback: async () => { rollback(); return undo() } }
  }, 300)
  const stop = link.start()
  const data = (id: number) => {
    const bytes = new Uint8Array(36), view = new DataView(bytes.buffer)
    view.setUint32(0, 0x4d57524d); view.setUint16(4, 4); view.setUint32(8, 4); view.setUint32(28, id); return bytes
  }
  try {
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    const changes = [{ module: 'A', data: data(11) }, { module: 'B', data: data(22) }]
    await link.update('Live', changes)
    expect(link.getState().status).toBe('trial'); expect(staged).toHaveLength(1); expect(accept).not.toHaveBeenCalled()
    const header = new DataView(staged[0].buffer)
    expect(header.getUint32(0)).toBe(0x4d574d53); expect(header.getUint16(6)).toBe(2)
    await link.undo()
    expect(rollback).toHaveBeenCalledTimes(1); expect(staged).toHaveLength(1) // device restores; no inverse packages
    await link.update('Live', changes); await link.keep()
    expect(staged).toHaveLength(2); expect(accept).toHaveBeenCalledTimes(1)
    expect(identity).toHaveBeenCalledTimes(2)
  } finally { stop(); identity.mockRestore() }
})

describe('several Elektron devices allowed on the site', () => {
  // A pretend Digitakt or Syntakt: any Elektron product but the Octatrack, without the base's interface.
  const other = (productName = 'Digitakt'): LinkDevice & { open: ReturnType<typeof vi.fn> } => ({
    vendorId: 0x1935, productId: 0x7f, productName, opened: false,
    configuration: { interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 1, interfaceSubclass: 1, interfaceProtocol: 0, endpoints: [] }] }] },
    open: vi.fn(async () => {}), async close() {}, async selectConfiguration() {}, async claimInterface() {}, async releaseInterface() {},
    async controlTransferOut() { return { status: 'stall', bytesWritten: 0 } }, async controlTransferIn() { return { status: 'stall' } },
  })
  /** The fake unit's USB, listing `extra` before the unit and letting a test plug in any device. */
  function usbWith(unit: ReturnType<typeof fakeUnit>, extra: LinkDevice[]) {
    const connect = new Set<(event: { device: LinkDevice }) => void>()
    const usb: LinkUsb = { ...unit.usb, async getDevices() { return [...extra, ...await unit.usb.getDevices()] },
      addEventListener(type, listener) { unit.usb.addEventListener(type, listener); if (type === 'connect') connect.add(listener) },
      removeEventListener(type, listener) { unit.usb.removeEventListener(type, listener); connect.delete(listener) } }
    return { usb, plug: (device: LinkDevice) => { for (const listener of connect) listener({ device }) } }
  }
  it('ranks the base’s interface first, then an Octatrack by product id or name, and nothing else', async () => {
    const [base] = await fakeUnit('base').usb.getDevices(), [stock] = await fakeUnit('stock').usb.getDevices()
    expect([base, stock, other(), other('OCTATRACK MKII')].map(octatrackRank)).toEqual([2, 1, 0, 1])
    expect(pickOctatrack([other(), stock, base])).toBe(base)
    expect(pickOctatrack([other(), stock])).toBe(stock)
    expect(pickOctatrack([other()])).toBeUndefined()
  })
  it('opens the Octatrack on the base when a Digitakt is listed first', async () => {
    const unit = fakeUnit(), digitakt = other(), { usb } = usbWith(unit, [digitakt])
    const link = new OctatrackLink(usb, fakeSession(unit), 300), stop = link.start()
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    expect(digitakt.open).not.toHaveBeenCalled()
    stop()
  })
  it('does not call another Elektron device an Octatrack on the original OS', async () => {
    const unit = fakeUnit('none'), digitakt = other(), { usb, plug } = usbWith(unit, [digitakt])
    const link = new OctatrackLink(usb, fakeSession(unit), 300), stop = link.start()
    await settle(); await settle()
    plug(other('Syntakt')); await settle(); await settle()
    expect(link.getState().status).toBe('idle')
    expect(digitakt.open).not.toHaveBeenCalled()
    stop()
  })
  it('stays on the unit when another Elektron device is plugged in while it is busy or on the original OS', async () => {
    const busyUnit = fakeUnit(), busy = usbWith(busyUnit, [])
    busyUnit.taken = true
    const held = new OctatrackLink(busy.usb, fakeSession(busyUnit), 300), stopHeld = held.start()
    await vi.waitFor(() => expect(held.getState().status).toBe('busy'))
    const digitakt = other(); busy.plug(digitakt); await settle(); await settle()
    expect(held.getState().status).toBe('busy'); expect(digitakt.open).not.toHaveBeenCalled()
    const [stockUnit] = await fakeUnit('stock').usb.getDevices(), opened = vi.spyOn(stockUnit, 'open')
    busy.plug(stockUnit); await settle(); await settle()
    expect(opened).not.toHaveBeenCalled() // a stock Octatrack does not take over from one on the base
    stopHeld()

    const unit = fakeUnit('stock'), stock = usbWith(unit, [])
    const link = new OctatrackLink(stock.usb, fakeSession(unit), 300), stop = link.start()
    await vi.waitFor(() => expect(link.getState().status).toBe('stock'))
    const syntakt = other('Syntakt'); stock.plug(syntakt); await settle(); await settle()
    expect(link.getState().status).toBe('stock'); expect(syntakt.open).not.toHaveBeenCalled()
    unit.plug('base') // a unit with the base does take over
    await vi.waitFor(() => expect(link.getState().status).toBe('ready'))
    stop()
  })
  it('lists only Octatracks in Chrome’s picker', async () => {
    const unit = fakeUnit(), request = vi.spyOn(unit.usb, 'requestDevice'), link = new OctatrackLink(unit.usb, fakeSession(unit), 300)
    await link.connect()
    expect(request).toHaveBeenCalledWith({ filters: [{ vendorId: 0x1935, productId: 0x0002 }] })
  })
})
