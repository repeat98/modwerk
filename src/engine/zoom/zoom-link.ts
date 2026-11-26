// The site's link to a Zoom MultiStomp over Web MIDI: identify the pedal, list its files, read them (the backup),
// install or remove one effect file the way the project's editor proved safe on the MS-70CDR 2.10, and flash a base
// in update mode the way zoomms' updater does.
// The commands are in zoom-protocol.ts.
import { CURRENT_PATCH, PATCH_COMMANDS, PATCH_PROGRAMS, canEditPatches, liveSlots, ZOOM_DEVICE_IDS, ZOOM_FILE_WRITE_REQUIREMENT, editCurrentPatch, isCurrentPatchReply, parseCurrentPatch, EFFECT_LIST, EFFECT_LIST_SIZE, FILE, LOCAL_IDS, canFlashBase, canWriteFiles, FLASH_BAD_CRC, FLASH_OK, IDENTITY_REQUEST, MST, flashSteps, isMstReply, mstSysex, parseHello, parseLoad, isFlashReply, isUpdateMode, WRITE_BLOCK, effectInfo, installRefusal, isAddedEffect, isFileReply, isLocalId, localIdFor, withEffectId, listRecords, listWith, listWithout, parseBlock, parseIdentity, parseListEntry, parseUsage, zoomSysex, type ZoomIdentity, type ZoomCurrentPatch, type ZoomPatchChange } from './zoom-protocol'
import { zoomEffectControls, type ZoomEffectControls } from './zoom-effect-controls'
import { storedZip } from './zip'

// Tabs of the site take turns on the pedal, as octatrack-link.ts's USB jobs do; without Web Locks, `op` keeps one job at a time in this tab.
const locked = <T>(work: () => Promise<T>): Promise<T> => {
  const locks = (globalThis.navigator as { locks?: { request<R>(name: string, job: () => Promise<R>): Promise<R> } } | undefined)?.locks
  return locks ? locks.request('modwerk-zoom-midi', work) : work()
}

export type ZoomLinkStatus = 'unsupported' | 'idle' | 'connecting' | 'ready' | 'reading' | 'writing'
export type ZoomFile = { name: string; size: number; inEffectList?: boolean; effect?: { gid: number; fxid: number; version: string } }
export type ZoomPatchEffect = { file: ZoomFile; controls?: ZoomEffectControls }
const patchEffectKey = ({ gid, fxid }: { gid: number; fxid: number }) => gid + '/' + fxid
export type ZoomLinkState = {
  readonly status: ZoomLinkStatus
  readonly connection?: number
  readonly identity?: ZoomIdentity
  readonly notice?: { tone: 'error' | 'info'; text: string }
  /** While reading: what, and how far. */
  readonly progress?: { label: string; done: number; total: number }
  /** The program (0-49) the pedal plays, once a program change has said so (one turned on the pedal, or one this page sent). */
  readonly program?: number
}

/** The parts of Web MIDI the link uses (MIDIAccess in a browser, a fake in tests). */
export type MidiPort = { readonly id: string; readonly name?: string | null; readonly state?: string }
export type MidiIn = MidiPort & { onmidimessage: ((event: { data: Uint8Array }) => void) | null }
export type MidiOut = MidiPort & { send(data: number[], timestamp?: number): void }
export type MidiAccessLike = { readonly inputs: Iterable<[string, MidiIn]> | Map<string, MidiIn>; readonly outputs: Iterable<[string, MidiOut]> | Map<string, MidiOut>; onstatechange: ((event: unknown) => void) | null }

const PEDAL = /zoom|ms-?(50g|60b|70cdr)/i
const isPedal = (port: MidiPort) => PEDAL.test(port.name ?? '') && port.state !== 'disconnected'
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

let nextConnection = 0

export class ZoomLink {
  private operationConnection?: number
  private state: ZoomLinkState
  private readonly listeners = new Set<() => void>()
  private access?: MidiAccessLike
  private input?: MidiIn
  private output?: MidiOut
  private sysex: number[] | null = null
  private nextSend = 0
  private waitReply?: (m: number[]) => void
  private waitIdentity?: (m: number[]) => void
  private waitMst?: (m: number[]) => void
  private nonce = 0
  private op: Promise<unknown> = Promise.resolve()
  /** Effect headers already read (upper-case name -> size and header); a write or delete forgets that file. */
  private readonly heads = new Map<string, { size: number; effect?: ZoomFile['effect'] }>()
  private readonly controls = new Map<string, { size: number; controls?: ZoomEffectControls }>()
  /** A reply timed out: one may still arrive, so the next operation first waits for the line to go quiet. */
  private stale = false
  private programByte = false
  private editModeAt = -Infinity
  private readonly requestAccess: (() => Promise<MidiAccessLike>) | null
  private readonly timeout: number
  private readonly retry: number

  /** `timeout`: how long a reply may take; `retry`: how often a pedal just plugged in is asked again (reconnect). */
  constructor(requestAccess: (() => Promise<MidiAccessLike>) | null = defaultAccess(), timeout = 1500, retry = 1000) {
    this.requestAccess = requestAccess; this.timeout = timeout; this.retry = retry
    this.state = { status: requestAccess ? 'idle' : 'unsupported' }
  }

  readonly getState = () => this.state
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(state: ZoomLinkState) { this.state = state; for (const listener of this.listeners) listener() }

  /** Connects by itself when the browser already allows MIDI with SysEx (no prompt); otherwise waits for Connect. */
  start() {
    let live = true
    void midiAllowed().then(allowed => { if (live && allowed && this.state.status === 'idle') void this.connect() })
    return () => { live = false }
  }

  async connect() {
    if (!this.requestAccess || this.state.status === 'connecting' || this.state.status === 'reading') return
    this.set({ status: 'connecting' })
    try {
      this.access ??= await this.requestAccess()
      // Unplugged: lost. Plugged in again (in update mode, or restarted after a flash): connect by itself.
      this.access.onstatechange = () => {
        if (this.output && this.output.state === 'disconnected') this.lost()
        if (this.state.status === 'idle' && this.pedalPresent()) void this.reconnect()
      }
      const inputs = [...portsOf(this.access.inputs)], outputs = [...portsOf(this.access.outputs)]
      const input = inputs.find(isPedal), output = outputs.find(isPedal)
      if (!input || !output) return this.set({ status: 'idle', notice: { tone: 'error', text: 'No Zoom pedal found. Connect it by USB, switch it on, then try again.' } })
      if (this.input) this.input.onmidimessage = null
      this.input = input; this.output = output; this.sysex = null
      input.onmidimessage = event => this.receive(Array.from(event.data))
      const reply = await new Promise<number[] | null>(resolve => {
        const timer = setTimeout(() => { this.waitIdentity = undefined; resolve(null) }, this.timeout)
        this.waitIdentity = m => { clearTimeout(timer); this.waitIdentity = undefined; resolve(m) }
        this.send(IDENTITY_REQUEST)
      })
      const identity = reply ? parseIdentity(reply) : undefined
      if (!identity) return this.set({ status: 'idle', notice: { tone: 'error', text: 'The pedal didn’t answer. Close other apps that use it (Zoom Effect Manager, editors), then try again.' } })
      this.heads.clear()
      this.controls.clear()
      this.set({ status: 'ready', identity, connection: ++nextConnection })
      if (!isUpdateMode(identity)) void this.quiet(() => this.hello())
    } catch {
      this.set({ status: 'idle', notice: { tone: 'error', text: 'This browser didn’t allow MIDI. Allow MIDI with SysEx for this site, then try again.' } })
    }
  }

  private pedalPresent = () => !!this.access && [...portsOf(this.access.outputs)].some(isPedal)
  // A pedal just plugged in is on USB before it answers (the base shows its boot screen first): ask again for a while.
  private retrying = false
  private async reconnect() {
    if (this.retrying) return
    this.retrying = true
    try {
      for (let i = 0; i < 10 && this.state.status === 'idle' && this.pedalPresent(); i++) {
        if (i) await new Promise(resolve => setTimeout(resolve, this.retry))
        if (this.state.status === 'idle') await this.connect()
      }
    } finally { this.retrying = false }
  }

  private lost() {
    if (this.input) this.input.onmidimessage = null
    this.input = this.output = undefined
    this.set({ status: 'idle', notice: { tone: 'info', text: 'The pedal was disconnected.' } })
  }

  // SysEx can arrive split over several events, with real-time bytes in between: rebuild F0 … F7.
  private receive(data: number[]) {
    for (const b of data) {
      if (b >= 0xf8) continue
      if (b === 0xf0) { this.sysex = [b]; this.programByte = false; continue }
      // A program change from the pedal (turned on it, or the echo of one sent): which patch it plays now.
      if (b >= 0xc0 && b <= 0xcf && !this.sysex) { this.programByte = true; continue }
      if (this.programByte) { this.programByte = false; if (b <= 0x7f && this.state.status !== 'idle') this.set({ ...this.state, program: b }); continue }
      if (!this.sysex) continue
      if (b === 0xf7) { const m = [...this.sysex, b]; this.sysex = null; this.dispatch(m); continue }
      if (b <= 0x7f) this.sysex.push(b)
    }
  }
  private dispatch(m: number[]) {
    if (isMstReply(m)) { this.waitMst?.(m); return }
    if (m[1] === 0x7e && m[3] === 0x06 && m[4] === 0x02) { this.waitIdentity?.(m); return }
    const id = this.state.identity?.deviceId
    if (id !== undefined && (isFileReply(m, id) || isFlashReply(m, id) || isCurrentPatchReply(m, id))) this.waitReply?.(m)
  }

  // Paced like the project's editor: a long message gets 22 ms, a short one 3 ms.
  private send(bytes: number[]) {
    const t = Math.max(now(), this.nextSend)
    this.output?.send(bytes, t)
    this.nextSend = t + (bytes.length >= 64 ? 22 : 3)
  }
  private ask(body: number[], timeout = this.timeout): Promise<number[] | null> {
    if (this.operationConnection !== this.state.connection) throw new Error('The pedal connection changed.')
    const id = this.state.identity?.deviceId
    if (id === undefined || !this.output) return Promise.resolve(null)
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.waitReply = undefined; this.stale = true; resolve(null) }, timeout)
      const patch = body[0] === CURRENT_PATCH.request
      this.waitReply = m => {
        if (isCurrentPatchReply(m, id) !== patch) return
        clearTimeout(timer)
        this.waitReply = undefined
        resolve(m)
      }
      this.send(zoomSysex(id, body))
    })
  }
  /** A reply the operation can't do without: none in time ends the operation, so a backup is whole or nothing. */
  private async answer(body: number[]) {
    const reply = await this.ask(body)
    if (!reply) throw new Error('The pedal stopped answering. Nothing was saved; check the cable and try again.')
    return reply
  }
  private async close() { for (const body of FILE.close) await this.ask(body) }
  // After a timeout a late reply would be taken as the answer to the next request: swallow replies until the
  // line has been quiet for a moment, then start.
  private async drain() {
    if (!this.stale) return
    const quiet = Math.min(300, this.timeout)
    await new Promise<void>(resolve => {
      const done = () => { this.waitReply = undefined; resolve() }
      let timer = setTimeout(done, quiet)
      this.waitReply = () => { clearTimeout(timer); timer = setTimeout(done, quiet) }
    })
    this.stale = false
  }

  /** A MIDISTOMP command (zoom-protocol.ts MST): its replies with this request's nonce, `count` of them, or null when
   * they don't all come in time (stock firmware never answers). A late reply has another nonce, so it's never taken. */
  private mst(command: number, count: number): Promise<number[][] | null> {
    if (!this.output) return Promise.resolve(null)
    const nonce = this.nonce = (this.nonce + 1) & 0x7f, got: number[][] = []
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.waitMst = undefined; resolve(null) }, this.timeout)
      this.waitMst = m => { if (m[6] !== nonce) return; got.push(m); if (got.length === count) { clearTimeout(timer); this.waitMst = undefined; resolve(got) } }
      this.send(mstSysex(command, nonce))
    })
  }
  /** After connecting: a pedal that runs MIDISTOMP with its SysEx says its version and features (identity.midistomp). */
  private async hello() {
    const asked = this.state.identity, replies = await this.mst(MST.hello, 2)
    const version = replies?.find(m => m[5] === MST.version), status = replies?.find(m => m[5] === MST.features)
    if (version && status && asked && this.state.identity === asked) this.set({ ...this.state, identity: { ...asked, midistomp: parseHello(version, status) } })
  }
  /** In turn with the file operations, without showing as one. */
  private quiet<T>(work: () => Promise<T>): Promise<T> {
    const run = this.op.then(() => locked(work))
    this.op = run.catch(() => undefined)
    return run
  }
  /** The base's load now (MIDISTOMP's load command), null when it doesn't answer, undefined when the link is busy. */
  readonly load = () => this.quiet(async () => {
    if (this.state.status !== 'ready' || !this.state.identity?.midistomp) return undefined
    const reply = await this.mst(MST.load, 1)
    return reply ? parseLoad(reply[0]) ?? null : null
  })

  /** One file operation at a time, shown as reading while it runs. */
  private exclusive<T>(label: string, work: () => Promise<T>, status: 'reading' | 'writing' = 'reading'): Promise<T> {
    const connection = this.state.connection
    const run = this.op.then(() => locked(async () => {
      if (!connection || connection !== this.state.connection || this.state.status !== 'ready') throw new Error('Connect the pedal first.')
      const identity = this.state.identity, stay = (event: Event) => event.preventDefault()
      // Closing the tab mid-write can leave the effect list deleted: the browser asks first.
      if (status === 'writing') globalThis.addEventListener?.('beforeunload', stay)
      this.operationConnection = connection
      this.set({ status, identity, connection, program: this.state.program, progress: { label, done: 0, total: 0 } })
      try { await this.drain(); return await work() } finally {
        globalThis.removeEventListener?.('beforeunload', stay)
        this.operationConnection = undefined
        if (this.state.connection === connection && this.getState().status === status) this.set({ status: 'ready', identity: this.state.identity, connection, program: this.state.program })
      }
    }))
    this.op = run.catch(() => undefined)
    return run
  }
  private progress(label: string, done: number, total: number) { this.set({ ...this.state, progress: { label, done, total } }) }

  private async list(): Promise<ZoomFile[]> {
    const files: ZoomFile[] = []
    let reply: number[] = await this.answer(FILE.listFirst())
    for (let guard = 0; guard < 600; guard++) {
      const entry = parseListEntry(reply)
      if (!entry) break
      files.push(entry)
      reply = await this.answer(FILE.listNext())
    }
    await this.close()
    if (!files.length) throw new Error('The pedal listed no files.')
    return files
  }
  private async read(name: string, maxBlocks = 256): Promise<number[]> {
    const out: number[] = []
    await this.answer(FILE.readOpen(name))
    try {
      for (let block = 0; block < maxBlocks; block++) {
        let reply: number[] | null = null
        for (const body of FILE.readBlock) reply = await this.answer(body)
        const chunk = parseBlock(reply)
        if (chunk.end) break
        if (!chunk.ok) throw new Error('Reading ' + name + ': a block failed its checksum.')
        out.push(...chunk.data)
      }
    } finally { await this.close() }
    return out
  }

  // Which effect files can hold an effect of group `gid`: those the effect list puts in that group, and any it doesn't
  // name (its group is the header's, seen on all 158 of an MS-70CDR). A header costs six round trips and a pedal holds
  // about 160 effects, most in other groups. Without a readable list, every effect file.
  private effectGroups(list: number[]) {
    return list.length === EFFECT_LIST_SIZE ? new Map(listRecords(list).map(r => [r.name.toUpperCase(), r.gid])) : undefined
  }
  private inGroup(files: ZoomFile[], gid: number, groups?: Map<string, number>) {
    return files.filter(f => /\.zdl$/i.test(f.name) && (groups?.get(f.name.toUpperCase()) ?? gid) === gid)
  }
  private async head(file: ZoomFile) {
    const key = file.name.toUpperCase(), known = this.heads.get(key)
    if (known && known.size === file.size) return known.effect
    const effect = effectInfo(await this.read(file.name, 1))
    this.heads.set(key, { size: file.size, effect })
    return effect
  }
  // Delete any old file of that name, write it in blocks, close, then read it back.
  private async write(name: string, data: number[]) {
    this.heads.delete(name.toUpperCase())
    this.controls.delete(name.toUpperCase())
    let deleting = false
    for (const body of FILE.writeOpen(name)) {
      deleting ||= body[1] === 0x24
      if (!await this.ask(body)) { await this.close(); throw new Error('No reply from the pedal before writing ' + name + (deleting ? '; the old ' + name + ' may already be deleted.' : '; nothing was written.')) }
    }
    const label = this.state.progress?.label ?? 'Writing ' + name, blocks = Math.ceil(data.length / WRITE_BLOCK)
    for (let at = 0; at < data.length; at += WRITE_BLOCK) {
      this.progress(label, at / WRITE_BLOCK + 1, blocks)
      if (!await this.ask(FILE.writeBlock(data.slice(at, at + WRITE_BLOCK))) || !await this.ask(FILE.readBlock[0])) { await this.close(); throw new Error('The pedal stopped answering while writing ' + name + '.') }
    }
    await this.close()
    this.progress('Reading back ' + name, 0, 0)
    const back = await this.read(name)
    if (back.length !== data.length || back.some((b, i) => b !== data[i])) throw new Error(name + ' read back different from what was written.')
  }
  // Delete a file, then list again: the pedal's reply alone doesn't show it went.
  private async remove(name: string) {
    this.heads.delete(name.toUpperCase())
    this.controls.delete(name.toUpperCase())
    let answered = true
    for (const body of FILE.remove(name)) if (!await this.ask(body)) answered = false
    await this.close()
    await this.drain()
    if ((await this.list()).some(f => f.name.toUpperCase() === name.toUpperCase())) throw new Error(name + ' is still on the pedal' + (answered ? '' : ', which stopped answering') + '. The effect list no longer names it: remove it again before power-cycling.')
  }
  private async effectList() {
    const list = await this.read(EFFECT_LIST)
    if (list.length !== EFFECT_LIST_SIZE) throw new Error('Could not read the effect list; nothing was changed.')
    return list
  }
  /** Write a changed effect list; when that fails, write the original back. Its errors carry the original
   * (`previousList`) for the caller to offer for saving, and when writing it back failed too, as `unrestored` for
   * restoreList. */
  private async writeList(updated: number[], list: number[]) {
    const failed = (text: string, cause: unknown, unrestored?: number[]) => Object.assign(new Error(text, { cause }), { previousList: list, unrestored })
    try { await this.write(EFFECT_LIST, updated) } catch (error) {
      await this.drain()   // a late reply to the failed write must not answer the rollback's requests
      try { await this.write(EFFECT_LIST, list) } catch (again) { throw failed((error as Error).message + ' Writing the original effect list back also failed (' + (again as Error).message + '). Don’t power-cycle the pedal: write the list back from this page while it stays open, or, failing that, run Zoom Effect Manager 2.3.3 with the pedal in update mode, which rewrites its whole effect file system.', again, list) }
      throw failed((error as Error).message + ' The original effect list was written back.', error)
    }
  }
  /** Write back an effect list a failed rollback left unwritten (an error's `unrestored`), kept only in this page. */
  readonly restoreList = (list: number[], connection: number) => this.exclusive('Writing the effect list back', async () => {
    this.refuseWrites()
    if (connection !== this.state.connection) throw new Error('The pedal connection changed.')
    if (list.length !== EFFECT_LIST_SIZE) throw new Error('That is not an effect list; nothing was written.')
    await this.writeList(list, list)
  }, 'writing')
  // A new file that didn't make it into the effect list goes again, so a retry installs it afresh. Best effort.
  private async dropNew(file: string) { try { await this.drain(); await this.remove(file) } catch { /* the next install of it names it in the list */ } }
  private refusePatchWrites() {
    const identity = this.state.identity
    if (!canEditPatches(identity)) throw new Error('Patch changes require the MS-70CDR with Zoom 2.10, MIDISTOMP 2.0.1 or 2.0.4 and later, or development build D004.' + (identity ? ' Connected firmware is ' + (identity.firmware || 'unknown') + ' on ' + identity.model + '.' : ''))
  }
  private refuseWrites() {
    const identity = this.state.identity
    if (!canWriteFiles(identity)) throw new Error(ZOOM_FILE_WRITE_REQUIREMENT + (identity ? ' Connected firmware is ' + (identity.firmware || 'unknown') + ' on ' + identity.model + '.' : ''))
  }

  /**
   * Install one added effect file (installRefusal: never Zoom's own, nor a known ID clash). A new one: there must be
   * room, and the file is written before it goes into the effect list (whose original is written back if that fails).
   * When another effect on the pedal has its ID, it is moved to a free local ID (958-1023) first, the same one for the
   * same file name where there's room; `avoid` are IDs given to or removed with other effects before, which it neither
   * takes nor hands out. A file of that name outside the effect list goes into it. An
   * installed one of the same name: only the same effect (group and ID, or the local ID it was moved to, which it
   * keeps so patches still find it), and only when the bytes differ. Every write is read back. Returns the effect
   * list from before, for the caller to offer for saving, and any move. Power-cycle the pedal to load it.
   */
  readonly installFile = (name: string, data: ArrayLike<number>, { avoid = new Set<number>() }: { avoid?: Set<number> } = {}) => this.exclusive('Installing ' + name, async () => {
    this.refuseWrites()
    const file = name.toUpperCase(), refused = installRefusal(name, data)
    if (refused) throw new Error(refused)
    let bytes = Array.from(data)
    const info = effectInfo(bytes)!
    const files = await this.list(), existing = files.find(f => f.name.toUpperCase() === file)
    if (existing) {
      const head = await this.head(existing), kept = head && isLocalId(head) && head.gid === info.gid && head.fxid !== info.fxid
      if (kept) bytes = withEffectId(bytes, head.fxid)
      else if (!head || head.gid !== info.gid || head.fxid !== info.fxid) throw new Error('The pedal’s ' + existing.name + ' is a different effect; not replacing it.')
      const moved = kept ? { from: info.fxid, to: head.fxid } : undefined
      const current = await this.read(existing.name), same = current.length === bytes.length && current.every((b, i) => b === bytes[i])
      // A file an earlier install left outside the effect list goes into it now.
      const list = await this.effectList()
      if (!listRecords(list).some(r => r.name.toUpperCase() === file)) {
        if (!same) { this.progress('Writing ' + existing.name, 0, 0); await this.write(existing.name, bytes) }
        this.progress('Adding ' + existing.name + ' to the effect list', 0, 0)
        await this.writeList(listWith(list, info.gid, existing.name), list)
        return { previousList: list, unchanged: false, moved }
      }
      if (same) return { previousList: undefined, unchanged: true, moved }
      this.progress('Writing ' + existing.name, 0, 0)
      // The effect list names this file throughout: a failed write is tried once more, then the file goes from the
      // list and the pedal, so the pedal never boots with a cut-short effect it would load.
      try { await this.write(existing.name, bytes) } catch {
        await this.drain()
        try { await this.write(existing.name, bytes) } catch (error) {
          let after = ', so ' + existing.name + ' was taken out of the effect list and off the pedal'
          try {
            await this.drain()
            const list = await this.effectList(), updated = listWithout(list, existing.name)
            if (updated) await this.writeList(updated, list)
            await this.remove(existing.name)
          } catch (again) { after = ', and taking it out of the effect list failed too (' + (again as Error).message + ')' }
          throw new Error((error as Error).message + ' It failed twice' + after + '. Don’t power-cycle the pedal until it is installed again.', { cause: error })
        }
      }
      return { previousList: undefined, unchanged: false, moved }
    }
    const list = await this.effectList(), effects = this.inGroup(files, info.gid, this.effectGroups(list)), taken = new Map<number, string>()
    for (const [i, f] of effects.entries()) {
      this.progress('Checking effect IDs on the pedal', i + 1, effects.length)
      const head = await this.head(f)
      if (head && head.gid === info.gid) taken.set(head.fxid, f.name)
    }
    // An ID in `avoid` was given to, or removed with, another effect that stored patches may still open: a clash too.
    let moved: { from: number; to: number; clash: string | undefined } | undefined
    const clash = taken.get(info.fxid)
    if (clash || avoid.has(info.fxid)) {
      const fxid = localIdFor(file, new Set(taken.keys()), avoid)
      if (fxid === undefined) throw new Error((clash ? clash + ' on the pedal already uses' : 'An effect removed from this pedal used') + ' effect ID ' + info.gid + '/' + info.fxid + ', and every local ID from 958 to 1023 is taken too; not installing.')
      bytes = withEffectId(bytes, fxid)
      moved = { from: info.fxid, to: fxid, clash }
    }
    const free = parseUsage(await this.ask(FILE.usage()))
    if (free !== undefined && free < bytes.length + 8192) throw new Error('Not enough space on the pedal (' + Math.round(free / 1024) + ' KB free).')
    if (listRecords(list).some(r => r.name.toUpperCase() === file)) throw new Error('The effect list already names ' + file + ' although the file is missing. Nothing was changed.')
    const updated = listWith(list, info.gid, file)
    this.progress('Writing ' + file, 0, 0)
    try { await this.write(file, bytes) } catch (error) { await this.dropNew(file); throw error }
    this.progress('Adding ' + file + ' to the effect list', 0, 0)
    // Only once the original list is back (or was never touched) may the file go: a list naming a missing file is worse.
    try { await this.writeList(updated, list) } catch (error) { if (!(error as { unrestored?: number[] }).unrestored) await this.dropNew(file); throw error }
    return { previousList: list, unchanged: false, moved }
  }, 'writing')

  /** Remove one added effect file: out of the effect list first (whose original is written back if that fails), then
   * the file, then list to check it went. Returns the effect list from before. */
  readonly removeFile = (name: string) => this.exclusive('Removing ' + name, async () => {
    this.refuseWrites()
    const files = await this.list(), file = files.find(f => f.name.toUpperCase() === name.toUpperCase())
    if (!file || !/\.zdl$/i.test(file.name)) throw new Error(name + ' is not an effect on the pedal.')
    const head = await this.head(file)
    if (!isAddedEffect(head)) throw new Error(file.name + (head ? ' has effect ID ' + head.gid + '/' + head.fxid : ' has no effect header') + ': only added effects (group 8, IDs 403 to 1023) are removed. Zoom’s own effects stay as they are.')
    const list = await this.effectList(), updated = listWithout(list, file.name)
    if (updated) await this.writeList(updated, list)
    await this.remove(file.name)
    return { previousList: list, removed: head! }
  }, 'writing')

  /** Read only the current edit buffer, without enabling editor mode or sending a patch change. */
  readonly currentPatch = () => this.exclusive('Reading the active patch', async () => (await this.readPatch()).patch)

  private refusePatchReads() {
    const identity = this.state.identity
    if (identity?.deviceId !== ZOOM_DEVICE_IDS['zoom-ms-70cdr'] || isUpdateMode(identity)) {
      throw new Error('Connect the original MS-70CDR in normal mode to read its patch.')
    }
  }
  private async readPatch() {
    this.refusePatchReads()
    const reply = await this.ask([CURRENT_PATCH.request])
    if (this.operationConnection !== this.state.connection) throw new Error('The pedal connection changed.')
    const patch = reply && parseCurrentPatch(reply)
    if (!reply || !patch) throw new Error('The pedal did not return its active patch. Try reading it again.')
    return { patch, reply }
  }

  /** Use only registered files in the active patch's groups, and read descriptors only for its effects. */
  readonly patchEffects = (patch: ZoomCurrentPatch, files: readonly ZoomFile[]) => this.exclusive('Reading patch effects', async () => {
    const wanted = new Set(patch.slots.map(patchEffectKey)), gids = new Set(patch.slots.map(slot => slot.gid))
    const effects = new Map<string, ZoomPatchEffect | undefined>()
    if (!wanted.size) return effects
    const groups = this.effectGroups(await this.effectList())
    const candidates = files.filter(file => /\.zdl$/i.test(file.name) && gids.has(groups?.get(file.name.toUpperCase()) ?? -1))
    for (const file of candidates) {
      const effect = await this.head(file)
      if (!effect) continue
      const key = patchEffectKey(effect)
      if (!wanted.has(key)) continue
      // A duplicated ID is ambiguous. Never show its parameters as the other effect's.
      effects.set(key, effects.has(key) ? undefined : { file: { ...file, inEffectList: true, effect } })
    }
    for (const entry of effects.values()) if (entry) entry.controls = await this.fileControls(entry.file)
    return effects
  })
  private async fileControls({ name, size }: ZoomFile) {
    const key = name.toUpperCase(), cached = this.controls.get(key)
    if (cached?.size === size) return cached.controls
    const bytes = await this.read(name)
    if (bytes.length !== size) throw new Error('The pedal returned an incomplete read of ' + name + '.')
    const controls = zoomEffectControls(bytes)
    this.controls.set(key, { size, controls })
    return controls
  }

  /** Update the active buffer only. A patch changed on the pedal must be read again before applying. */
  readonly applyPatchChanges = (expected: ZoomCurrentPatch, changes: readonly ZoomPatchChange[]) => this.exclusive('Applying patch controls', async () => {
    this.refusePatchWrites()
    const { patch, reply } = await this.readPatch()
    if (JSON.stringify(patch) !== JSON.stringify(expected)) throw new Error('The patch changed on the pedal. Refresh it before applying edits.')
    if (!changes.length) return patch
    const edited = editCurrentPatch(reply, changes)
    this.send(zoomSysex(reply[3], [CURRENT_PATCH.edit]))
    await new Promise(resolve => setTimeout(resolve, 20))
    if (this.operationConnection !== this.state.connection) throw new Error('The pedal connection changed.')
    this.send(edited)
    // Give the edit buffer time to settle before requiring a read-back.
    await new Promise(resolve => setTimeout(resolve, 160))
    const applied = (await this.readPatch()).patch
    if (JSON.stringify(applied) !== JSON.stringify(parseCurrentPatch(edited))) {
      throw new Error('The pedal returned different patch values after Apply. Refresh to see what it kept.')
    }
    return applied
  }, 'writing')

  // ---- Beyond the edit buffer: the fifty programs, Save, live knobs and changing a slot's effect.
  private patchSysex(body: number[]) { this.send(zoomSysex(this.state.identity!.deviceId, body)) }
  private editMode() { this.patchSysex([CURRENT_PATCH.edit]); this.editModeAt = now() }
  /** A program change: the pedal loads that patch into the edit buffer and plays it. */
  private goTo(program: number) {
    const t = Math.max(now(), this.nextSend)
    this.output?.send([0xc0, program & 0x7f], t)
    this.nextSend = t + 3
    this.set({ ...this.state, program })
  }
  /** The edit buffer as the pedal sends it, or null when no reply came; a late reply is drained so it can't answer the next request. */
  private async tryPatch() {
    const reply = await this.ask([CURRENT_PATCH.request])
    if (!reply) await this.drain()
    return reply && parseCurrentPatch(reply) ? reply : null
  }
  private checkProgram(program: number) {
    if (!Number.isInteger(program) || program < 0 || program >= PATCH_PROGRAMS) throw new Error('The MS-70CDR has patches 1 to ' + PATCH_PROGRAMS + '.')
  }
  /** How many slots take a live knob message on this pedal (liveSlots). */
  readonly liveSlots = () => liveSlots(this.state.identity?.firmware)
  /**
   * Every stored patch. The pedal has no command for that, so it goes to each program in turn and plays it (turn the
   * amp down). Then it goes back to the program it was on (the one a program change said, else the one whose patch
   * matches the edit buffer) and writes the edit buffer back, so changes not saved are kept. When neither says it (no
   * program change seen, and the buffer was changed), the buffer is written back on the last program read and
   * `program` is undefined: the page asks where to save. `onEach` sees each patch as it comes.
   */
  readonly readPatches = (onEach?: (program: number, patch: ZoomCurrentPatch | null) => void) => this.exclusive('Reading the patches', async () => {
    // Going through the fifty can end by writing the edit buffer back (below), so it is gated like every patch write.
    this.refusePatchWrites()
    const { reply: buffer } = await this.readPatch(), from = this.state.program, dumps: (number[] | null)[] = []
    const read = async (program: number, settle: number) => {
      this.goTo(program)
      await sleep(settle)
      dumps[program] = await this.tryPatch()
      onEach?.(program, dumps[program] && parseCurrentPatch(dumps[program]!)!)
    }
    for (let program = 0; program < PATCH_PROGRAMS; program++) {
      this.progress('Reading the patches', program + 1, PATCH_PROGRAMS)
      await read(program, 45)
    }
    if (!dumps.some(Boolean)) throw new Error('The pedal sent none of its patches.')
    for (let program = 0; program < PATCH_PROGRAMS; program++) if (!dumps[program]) await read(program, 90)
    const same = (dump: number[] | null) => !!dump && dump.every((b, i) => b === buffer[i])
    const back = from ?? dumps.findIndex(same)
    if (back >= 0) {
      this.goTo(back)
      await sleep(60)
    }
    if (!same(dumps[back >= 0 ? back : PATCH_PROGRAMS - 1])) {
      this.editMode()
      await sleep(20)
      this.send(buffer)
      await sleep(160)
    }
    // goTo noted each program read; the last isn't where the buffer came from, so the program is unknown again.
    if (back < 0) this.set({ ...this.state, program: undefined })
    return { patches: dumps.map(dump => dump && parseCurrentPatch(dump)!), program: back >= 0 ? back : undefined }
  })
  /** Go to a program and read its patch. */
  readonly openPatch = (program: number) => this.exclusive('Opening patch ' + (program + 1), async () => {
    this.refusePatchReads()
    this.checkProgram(program)
    this.goTo(program)
    await sleep(60)
    return (await this.readPatch()).patch
  })
  /** Store the edit buffer, as the pedal has it now, into `program` (a flash write: the pedal goes quiet for about two
   * seconds), then go to that program and check it reads back the same from flash. */
  readonly savePatch = (program: number) => this.exclusive('Saving patch ' + (program + 1), async () => {
    this.refusePatchWrites()
    this.checkProgram(program)
    const { patch, reply } = await this.readPatch()
    if (this.state.program !== program) {
      this.goTo(program)
      await sleep(60)
    }
    this.editMode()
    await sleep(20)
    this.send(reply)
    await sleep(160)
    this.patchSysex(PATCH_COMMANDS.store(program))
    await sleep(600)
    this.goTo(program)
    await sleep(120)
    let back = await this.tryPatch()
    for (let i = 0; !back && i < 3; i++) { await sleep(700); back = await this.tryPatch() }
    if (!back) throw new Error('Saved, but the pedal was too busy to send the patch back. Open patch ' + (program + 1) + ' to check it.')
    const saved = parseCurrentPatch(back)!
    if (JSON.stringify(saved) !== JSON.stringify(patch)) throw new Error('Patch ' + (program + 1) + ' reads back different from what was saved. Open it to see what the pedal kept.')
    return saved
  }, 'writing')
  /** Turn one knob live (31), as the pedal's own knobs do: only in the slots that take it (liveSlots), and only while
   * nothing else is talking to the pedal. False when it wasn't sent: then stage it for Apply. */
  readonly liveKnob = (slot: number, parameter: number, value: number) => {
    if (this.state.status !== 'ready' || !this.output || !canEditPatches(this.state.identity) || slot >= this.liveSlots()) return false
    if (now() - this.editModeAt > 1000) this.editMode()
    this.patchSysex(PATCH_COMMANDS.knob(slot, parameter, value))
    return true
  }
  /** What a slot can hold: the effect files the effect list names, with their groups. Reads only the list. */
  readonly effectChoices = () => this.exclusive('Reading the effect list', async () => {
    this.refusePatchReads()
    return listRecords(await this.effectList()).filter(r => /\.zdl$/i.test(r.name)).map(({ gid, name }) => ({ gid, name }))
  })
  /** One effect file's header and controls, to put it in a slot. */
  readonly slotEffect = (file: ZoomFile) => this.exclusive('Reading ' + file.name, async () => {
    this.refusePatchReads()
    const effect = await this.head(file)
    if (!effect) throw new Error(file.name + ' has no effect header, so it can’t go in a slot.')
    return { file: { ...file, inEffectList: true, effect }, controls: await this.fileControls(file) } satisfies ZoomPatchEffect
  })

  /** Every file on the pedal; with versions, the effect files that can be added effects (group 8) also get their group, effect id and version (slower). */
  readonly listFiles = ({ versions = false } = {}) => this.exclusive('Reading the file list', async () => {
    const files = await this.list()
    if (!versions) return files
    const groups = files.some(f => f.name.toUpperCase() === EFFECT_LIST) ? this.effectGroups(await this.read(EFFECT_LIST)) : undefined
    const effects = this.inGroup(files, LOCAL_IDS.gid, groups)
    for (const [i, file] of effects.entries()) {
      this.progress('Reading effect versions', i + 1, effects.length)
      file.effect = await this.head(file)
      file.inEffectList = groups?.has(file.name.toUpperCase()) ?? false
    }
    return files
  })

  /** Free space on the pedal in bytes, when it says. */
  readonly freeSpace = () => this.exclusive('Reading free space', async () => parseUsage(await this.ask(FILE.usage())))

  /**
   * Flash a base (zoom-base.ts) onto an MS-70CDR in update mode: flashSteps' messages, each answered before the next,
   * which goes 22 ms after that answer as in zoomms' updater (an erase answers when done: the OS one after about 3 s).
   * A block whose checksum failed is sent again. Never the bootloader or the effects. The pedal stays in update mode
   * after the last step until it's unplugged. `onStep`: erasing until the first block, then writing (the fraction of
   * blocks sent), then finishing.
   */
  readonly flashBase = (main: Uint8Array, preset?: Uint8Array, onStep?: (step: 'erase' | 'write' | 'finish', fraction: number) => void) => this.exclusive('Flashing', async () => {
    if (!isUpdateMode(this.state.identity)) throw new Error('Put the MS-70CDR in update mode first: unplug it, hold Up and Down while plugging in USB, then connect again.')
    if (!canFlashBase(this.state.identity)) throw new Error('This is an ' + this.state.identity!.model + ' in update mode. The base is built from the MS-70CDR’s firmware and goes only on an MS-70CDR.')
    const steps = flashSteps(main, preset), blocks = steps.filter(body => body[0] === 0x02).length
    let sent = 0, shown = ''
    for (const [i, body] of steps.entries()) {
      if (body[0] === 0x02) sent++
      // Progress once per step name and percent, not per block: every report redraws what follows the link.
      const step = body[0] === 0x04 ? 'finish' : sent ? 'write' : 'erase', at = step + Math.floor(100 * (i + 1) / steps.length)
      if (at !== shown) { shown = at; this.progress('Flashing', i + 1, steps.length); onStep?.(step, sent / blocks) }
      let reply: number[] | null = null
      for (let tries = 0; tries < 3; tries++) {
        reply = await this.ask(body, body[0] === 0x0a ? 15_000 : this.timeout)
        if (reply?.[5] !== FLASH_BAD_CRC) break
      }
      if (reply?.[5] !== FLASH_OK) throw new Error('The flash stopped at step ' + (i + 1) + ' of ' + steps.length + (reply ? ' (the pedal answered ' + reply[5] + ')' : ' (no answer)') + '. The bootloader is untouched: put the pedal in update mode and flash again, or put Zoom’s 2.10 back with its own updater.')
      this.nextSend = Math.max(this.nextSend, now() + 22)
    }
  }, 'writing')

  /** Every file, read and checksum-checked, in a zip with the list order: the backup to restore from. */
  readonly backup = () => this.exclusive('Backing up', async () => {
    const files = await this.list(), entries: { name: string; data: number[] }[] = []
    for (const [i, file] of files.entries()) {
      this.progress('Backing up ' + file.name, i + 1, files.length)
      const data = await this.read(file.name)
      if (data.length !== file.size) throw new Error(file.name + ': read ' + data.length + ' bytes, the pedal lists ' + file.size + '. Nothing was saved.')
      entries.push({ name: 'files/' + file.name, data })
    }
    entries.push({ name: 'order.txt', data: Array.from(new TextEncoder().encode(files.map(f => f.name).join('\n') + '\n')) })
    return { files: files.length, zip: storedZip(entries) }
  })
}

function* portsOf<T>(ports: Iterable<[string, T]> | Map<string, T>): Iterable<T> { for (const [, port] of ports as Iterable<[string, T]>) yield port }

function defaultAccess(): (() => Promise<MidiAccessLike>) | null {
  const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { requestMIDIAccess?: (options: { sysex: boolean }) => Promise<unknown> } : undefined
  return nav?.requestMIDIAccess ? () => nav.requestMIDIAccess!({ sysex: true }) as Promise<MidiAccessLike> : null
}

/** MIDI with SysEx already granted for this site, so connecting needs no prompt. */
async function midiAllowed() {
  try {
    const status = await navigator.permissions?.query({ name: 'midi', sysex: true } as unknown as PermissionDescriptor)
    return status?.state === 'granted'
  } catch { return false }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
