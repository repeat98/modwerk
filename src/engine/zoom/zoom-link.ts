// The site's link to a Zoom MultiStomp over Web MIDI: identify the pedal, list its files, read them (the backup),
// and install or remove one effect file the way the project's editor proved safe on the MS-70CDR 2.10.
// The commands are in zoom-protocol.ts.
import { EFFECT_LIST, EFFECT_LIST_SIZE, FILE, IDENTITY_REQUEST, WRITE_BLOCK, effectInfo, installRefusal, isAddedEffect, isFileReply, listRecords, listWith, listWithout, parseBlock, parseIdentity, parseListEntry, parseUsage, zoomSysex, type ZoomIdentity } from './zoom-protocol'
import { storedZip } from './zip'

export type ZoomLinkStatus = 'unsupported' | 'idle' | 'connecting' | 'ready' | 'reading' | 'writing'
export type ZoomFile = { name: string; size: number; effect?: { gid: number; fxid: number; version: string } }
export type ZoomLinkState = {
  readonly status: ZoomLinkStatus
  readonly identity?: ZoomIdentity
  readonly notice?: { tone: 'error' | 'info'; text: string }
  /** While reading: what, and how far. */
  readonly progress?: { label: string; done: number; total: number }
}

/** The parts of Web MIDI the link uses (MIDIAccess in a browser, a fake in tests). */
export type MidiPort = { readonly id: string; readonly name?: string | null; readonly state?: string }
export type MidiIn = MidiPort & { onmidimessage: ((event: { data: Uint8Array }) => void) | null }
export type MidiOut = MidiPort & { send(data: number[], timestamp?: number): void }
export type MidiAccessLike = { readonly inputs: Iterable<[string, MidiIn]> | Map<string, MidiIn>; readonly outputs: Iterable<[string, MidiOut]> | Map<string, MidiOut>; onstatechange: ((event: unknown) => void) | null }

const PEDAL = /zoom|ms-?(50g|60b|70cdr)/i
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class ZoomLink {
  private state: ZoomLinkState
  private readonly listeners = new Set<() => void>()
  private access?: MidiAccessLike
  private input?: MidiIn
  private output?: MidiOut
  private sysex: number[] | null = null
  private nextSend = 0
  private waitFile?: (m: number[]) => void
  private waitIdentity?: (m: number[]) => void
  private op: Promise<unknown> = Promise.resolve()
  /** Effect headers already read (upper-case name -> size and header); a write or delete forgets that file. */
  private readonly heads = new Map<string, { size: number; effect?: ZoomFile['effect'] }>()
  /** A reply timed out: one may still arrive, so the next operation first waits for the line to go quiet. */
  private stale = false
  private readonly requestAccess: (() => Promise<MidiAccessLike>) | null
  private readonly timeout: number

  constructor(requestAccess: (() => Promise<MidiAccessLike>) | null = defaultAccess(), timeout = 1500) {
    this.requestAccess = requestAccess; this.timeout = timeout
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
      this.access.onstatechange = () => { if (this.output && this.output.state === 'disconnected') this.lost() }
      const inputs = [...portsOf(this.access.inputs)], outputs = [...portsOf(this.access.outputs)]
      const input = inputs.find(p => PEDAL.test(p.name ?? '')), output = outputs.find(p => PEDAL.test(p.name ?? ''))
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
      this.set({ status: 'ready', identity })
    } catch {
      this.set({ status: 'idle', notice: { tone: 'error', text: 'This browser didn’t allow MIDI. Allow MIDI with SysEx for this site, then try again.' } })
    }
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
      if (b === 0xf0) { this.sysex = [b]; continue }
      if (!this.sysex) continue
      if (b === 0xf7) { const m = [...this.sysex, b]; this.sysex = null; this.dispatch(m); continue }
      if (b <= 0x7f) this.sysex.push(b)
    }
  }
  private dispatch(m: number[]) {
    if (m[1] === 0x7e && m[3] === 0x06 && m[4] === 0x02) { this.waitIdentity?.(m); return }
    const id = this.state.identity?.deviceId
    if (id !== undefined && isFileReply(m, id)) this.waitFile?.(m)
  }

  // Paced like the project's editor: a long message gets 22 ms, a short one 3 ms.
  private send(bytes: number[]) {
    const t = Math.max(now(), this.nextSend)
    this.output?.send(bytes, t)
    this.nextSend = t + (bytes.length >= 64 ? 22 : 3)
  }
  private ask(body: number[]): Promise<number[] | null> {
    const id = this.state.identity?.deviceId
    if (id === undefined || !this.output) return Promise.resolve(null)
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.waitFile = undefined; this.stale = true; resolve(null) }, this.timeout)
      this.waitFile = m => { clearTimeout(timer); this.waitFile = undefined; resolve(m) }
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
      const done = () => { this.waitFile = undefined; resolve() }
      let timer = setTimeout(done, quiet)
      this.waitFile = () => { clearTimeout(timer); timer = setTimeout(done, quiet) }
    })
    this.stale = false
  }

  /** One file operation at a time, shown as reading while it runs. */
  private exclusive<T>(label: string, work: () => Promise<T>, status: 'reading' | 'writing' = 'reading'): Promise<T> {
    const run = this.op.then(async () => {
      if (this.state.status !== 'ready') throw new Error('Connect the pedal first.')
      const identity = this.state.identity
      this.set({ status, identity, progress: { label, done: 0, total: 0 } })
      try { await this.drain(); return await work() } finally { if (this.getState().status === status) this.set({ status: 'ready', identity }) }
    })
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
    for (const body of FILE.writeOpen(name)) if (!await this.ask(body)) { await this.close(); throw new Error('No reply from the pedal before writing ' + name + '; nothing was written.') }
    for (let at = 0; at < data.length; at += WRITE_BLOCK) {
      if (!await this.ask(FILE.writeBlock(data.slice(at, at + WRITE_BLOCK))) || !await this.ask(FILE.readBlock[0])) { await this.close(); throw new Error('The pedal stopped answering while writing ' + name + '.') }
    }
    await this.close()
    const back = await this.read(name)
    if (back.length !== data.length || back.some((b, i) => b !== data[i])) throw new Error(name + ' read back different from what was written.')
  }
  // Delete a file, then list again: the pedal's reply alone doesn't show it went.
  private async remove(name: string) {
    this.heads.delete(name.toUpperCase())
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

  /**
   * Install one added effect file (installRefusal: never Zoom's own, nor a known ID clash). A new one: its ID must be free, there must be room, and the file is written before
   * it goes into the effect list (whose original is written back if that fails). An installed one of the same
   * name: only the same effect (group and ID), and only when the bytes differ. Every write is read back.
   * Returns the effect list from before, for the caller to offer for saving. Power-cycle the pedal to load it.
   */
  readonly installFile = (name: string, data: ArrayLike<number>) => this.exclusive('Installing ' + name, async () => {
    const file = name.toUpperCase(), bytes = Array.from(data), refused = installRefusal(name, bytes)
    if (refused) throw new Error(refused)
    const info = effectInfo(bytes)!
    const files = await this.list(), existing = files.find(f => f.name.toUpperCase() === file)
    if (existing) {
      const head = await this.head(existing)
      if (!head || head.gid !== info.gid || head.fxid !== info.fxid) throw new Error('The pedal’s ' + existing.name + ' is a different effect; not replacing it.')
      const current = await this.read(existing.name)
      if (current.length === bytes.length && current.every((b, i) => b === bytes[i])) return { previousList: undefined, unchanged: true }
      this.progress('Writing ' + existing.name, 0, 0)
      await this.write(existing.name, bytes)
      return { previousList: undefined, unchanged: false }
    }
    const effects = files.filter(f => /\.zdl$/i.test(f.name))
    for (const [i, f] of effects.entries()) {
      this.progress('Checking effect IDs on the pedal', i + 1, effects.length)
      const head = await this.head(f)
      if (head && head.gid === info.gid && head.fxid === info.fxid) throw new Error(f.name + ' on the pedal already uses this effect ID (' + info.gid + '/' + info.fxid + '); not installing.')
    }
    const free = parseUsage(await this.ask(FILE.usage()))
    if (free !== undefined && free < bytes.length + 8192) throw new Error('Not enough space on the pedal (' + Math.round(free / 1024) + ' KB free).')
    const list = await this.effectList()
    if (listRecords(list).some(r => r.name.toUpperCase() === file)) throw new Error('The effect list already names ' + file + ' although the file is missing. Nothing was changed.')
    const updated = listWith(list, info.gid, file)
    this.progress('Writing ' + file, 0, 0)
    await this.write(file, bytes)
    this.progress('Adding ' + file + ' to the effect list', 0, 0)
    try { await this.write(EFFECT_LIST, updated) } catch (error) {
      await this.drain()   // a late reply to the failed write must not answer the rollback's requests
      try { await this.write(EFFECT_LIST, list) } catch (again) { throw new Error((error as Error).message + ' Writing the original effect list back also failed (' + (again as Error).message + '): restore it from your backup before power-cycling.', { cause: again }) }
      throw new Error((error as Error).message + ' The original effect list was written back.', { cause: error })
    }
    return { previousList: list, unchanged: false }
  }, 'writing')

  /** Remove one added effect file: out of the effect list first, then the file, then list to check it went. Returns the effect list from before. */
  readonly removeFile = (name: string) => this.exclusive('Removing ' + name, async () => {
    const files = await this.list(), file = files.find(f => f.name.toUpperCase() === name.toUpperCase())
    if (!file || !/\.zdl$/i.test(file.name)) throw new Error(name + ' is not an effect on the pedal.')
    const head = await this.head(file)
    if (!isAddedEffect(head)) throw new Error(file.name + (head ? ' has effect ID ' + head.gid + '/' + head.fxid : ' has no effect header') + ': only added effects (group 8, IDs 403 to 957) are removed. Zoom’s own effects stay as they are.')
    const list = await this.effectList(), updated = listWithout(list, file.name)
    if (updated) await this.write(EFFECT_LIST, updated)
    await this.remove(file.name)
    return { previousList: list }
  }, 'writing')

  /** Every file on the pedal; with versions, effect files also get their group, effect id and version (slower). */
  readonly listFiles = ({ versions = false } = {}) => this.exclusive('Reading the file list', async () => {
    const files = await this.list()
    const effects = versions ? files.filter(f => /\.zdl$/i.test(f.name)) : []
    for (const [i, file] of effects.entries()) {
      this.progress('Reading effect versions', i + 1, effects.length)
      file.effect = await this.head(file)
    }
    return files
  })

  /** Free space on the pedal in bytes, when it says. */
  readonly freeSpace = () => this.exclusive('Reading free space', async () => parseUsage(await this.ask(FILE.usage())))

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
