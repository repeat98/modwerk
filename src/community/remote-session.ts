// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The member's side of a remote debug session: this browser holds the Octatrack and carries out the administrator's
// requests one at a time, each checked here against the session's scope before it reaches the unit.
import { apiUrl } from '../hosting'
import { api, post } from './api'
import { ELEKTRON_VENDOR_ID, OCTATRACK_FILTERS, octatrackRank, USB_LOCK, type LinkDevice, type UsbFilter, type UsbLocks } from '../engine/elekloader/octatrack-link'
import { findVendorInterface } from '../engine/elekloader/upload-usb'
import { fromBase64, parseOperatorMessage, REMOTE_READ_REQUESTS, remoteTransferRefusal, toBase64, type MemberMessage, type RelayMessage, type RemoteScope, type RemoteSessionView } from './remote-session-contract'

export interface RemoteSessions { current: RemoteSessionView | null; consentVersion: string; sessions: RemoteSessionView[] }
export const readRemoteSessions = (signal?: AbortSignal) => api<RemoteSessions>('/remote-sessions', { signal })
export const acceptRemoteSession = (id: string, version: string) => post<{ session: RemoteSessionView; ticket: string }>(`/remote-sessions/${id}/accept`, { version })
export const declineRemoteSession = (id: string) => post<{ ok: true }>(`/remote-sessions/${id}/decline`, {})
export const endRemoteSession = (id: string) => post<{ ok: true }>(`/remote-sessions/${id}/end`, {})
export const remoteSessionTicket = (id: string) => post<{ ticket: string; endsAt: string }>(`/remote-sessions/${id}/ticket`, {})

export function socketUrl(id: string, ticket: string, base = globalThis.location?.href ?? 'http://localhost/') {
  const url = new URL(apiUrl(`/remote-sessions/${id}/socket`), base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('ticket', ticket)
  return url.href
}

/** What the banner lists: each request as it ran. */
export interface RemoteLogEntry { at: number; label: string; outcome: 'ok' | 'stall' | 'refused' | 'failed' }
export interface RemoteRelayState {
  status: 'connecting' | 'live' | 'reconnecting' | 'ended'
  operator: boolean; endsAt: string | null; unit: boolean
  log: RemoteLogEntry[]; count: number; messages: { at: number; text: string }[]
  ended?: 'member' | 'operator' | 'time' | 'replaced' | 'lost'
}
interface SocketLike {
  send(data: string): void; close(code?: number, reason?: string): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void
}
export interface UsbEvents {
  getDevices(): Promise<LinkDevice[]>
  addEventListener(type: 'connect' | 'disconnect', listener: (event: { device: LinkDevice }) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: { device: LinkDevice }) => void): void
}

/** The unit the member picked, opened with the Modwerk interface claimed, and the site's USB lock held until `release`.
 * Every USB job of the site waits meanwhile, so nothing else talks to the unit during the session. */
export async function holdUnit(device: LinkDevice, locks: UsbLocks, waitMs = 5000) {
  let release!: () => void, acquired!: () => void
  const held = new Promise<void>(resolve => { acquired = resolve })
  const timeout = AbortSignal.timeout(waitMs)
  const lock = locks.request(USB_LOCK, { signal: timeout }, () => { acquired(); return new Promise<void>(resolve => { release = resolve }) })
  await Promise.race([held, lock.then(() => { throw new Error('The USB lock ended early.') })]).catch(() => {
    throw new Error('Your Octatrack is busy with a sync on this site. Finish or undo it, then accept again.')
  })
  let index: number | undefined
  try {
    if (!device.opened) await device.open()
    if (!device.configuration) await device.selectConfiguration(1)
    index = findVendorInterface(device.configuration)
    if (index === undefined) throw new Error('This Octatrack isn’t running the Modwerk base, so it can’t be read over USB.')
    await device.claimInterface(index)
  } catch (error) {
    release()
    throw error instanceof Error && error.message.includes('Modwerk base') ? error : new Error('Chrome couldn’t open the Octatrack. Close other tabs or apps that use it, then try again.')
  }
  const vendorInterface = index
  return { vendorInterface, async release() { await device.releaseInterface(vendorInterface).catch(() => {}); release() } }
}

/** Pick the Octatrack: one this site may already open, else Chrome's picker (call from the Accept click). */
export async function pickUnit(usb: UsbEvents & { requestDevice(options: { filters: UsbFilter[] }): Promise<LinkDevice> }) {
  // Other Elektron devices allowed on this site are not the Octatrack; of several Octatracks, the one on the base.
  const known = (await usb.getDevices()).filter(device => device.vendorId === ELEKTRON_VENDOR_ID && octatrackRank(device)), based = known.filter(device => octatrackRank(device) === 2)
  if (based.length === 1 || known.length === 1) return based.length === 1 ? based[0] : known[0]
  try { return await usb.requestDevice({ filters: OCTATRACK_FILTERS }) }
  catch { throw new Error('No Octatrack was chosen. Plug it in over USB, then accept again.') }
}

const LOG = 40
/** Runs one connection of the session; `ticket` gives a fresh one for each reconnect. Resolves when the session ends. */
export class MemberRelay {
  private state: RemoteRelayState = { status: 'connecting', operator: false, endsAt: null, unit: true, log: [], count: 0, messages: [] }
  private readonly listeners = new Set<() => void>()
  private socket?: SocketLike
  private queue: Promise<void> = Promise.resolve()
  private vendorInterface: number | null
  private stopped = false
  private attempts = 0
  private readonly options: {
    id: string; scope: RemoteScope; device: LinkDevice; vendorInterface: number; model?: string
    ticket: () => Promise<string>; open: (url: string) => SocketLike; usb?: UsbEvents; retryMs?: number
  }
  constructor(options: MemberRelay['options']) { this.options = options; this.vendorInterface = options.vendorInterface }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly getState = () => this.state
  private set(change: Partial<RemoteRelayState>) { this.state = { ...this.state, ...change }; for (const listener of this.listeners) listener() }

  start(firstTicket?: string) {
    this.options.usb?.addEventListener('disconnect', this.unplugged)
    void this.connect(firstTicket)
  }
  /** The member's End button, or leaving the page. */
  stop(reason: 'member' | 'lost' = 'member') {
    if (this.stopped) return
    this.stopped = true
    this.options.usb?.removeEventListener('disconnect', this.unplugged)
    if (reason === 'member' && !this.state.ended) this.send({ type: 'end' })
    this.socket?.close(1000, 'Ended')
    this.set({ status: 'ended', ended: this.state.ended ?? reason })
  }
  private readonly unplugged = ({ device }: { device: LinkDevice }) => {
    if (device !== this.options.device) return
    this.vendorInterface = null
    this.set({ unit: false })
    this.send({ type: 'device', vendorInterface: null })
  }
  private send(message: MemberMessage) { try { this.socket?.send(JSON.stringify(message)) } catch { /* the close event follows */ } }
  private async connect(given?: string) {
    let ticket = given
    try { ticket ??= await this.options.ticket() } catch { return this.lost() }
    if (this.stopped) return
    const socket = this.options.open(socketUrl(this.options.id, ticket))
    this.socket = socket
    socket.addEventListener('open', () => {
      this.attempts = 0
      this.set({ status: 'live' })
      this.send({ type: 'device', vendorInterface: this.vendorInterface, ...(this.options.model ? { model: this.options.model } : {}) })
    })
    socket.addEventListener('message', event => this.message(event.data))
    const closed = () => { if (this.socket === socket) { this.socket = undefined; if (!this.stopped) this.lost() } }
    socket.addEventListener('close', closed); socket.addEventListener('error', closed)
  }
  /** A dropped connection is retried a few times with a new ticket; the session itself runs on until it ends. */
  private lost() {
    if (this.stopped) return
    if (++this.attempts > 3) return this.stop('lost')
    this.set({ status: 'reconnecting', operator: false })
    setTimeout(() => { void this.connect() }, (this.options.retryMs ?? 1000) * this.attempts)
  }
  private message(raw: unknown) {
    let relay: RelayMessage | null
    try { relay = typeof raw === 'string' ? JSON.parse(raw) as RelayMessage : null } catch { relay = null }
    if (relay?.type === 'ended') { this.set({ ended: relay.reason }); return this.stop('lost') }
    if (relay?.type === 'presence') return this.set({ operator: relay.operator, endsAt: relay.endsAt })
    const message = parseOperatorMessage(raw)
    if (message?.type === 'say') return this.set({ messages: [...this.state.messages, { at: Date.now(), text: message.text }].slice(-5) })
    if (message?.type !== 'transfer') return
    // One control transfer at a time, in the order they came.
    this.queue = this.queue.then(() => this.transfer(message))
  }
  private async transfer(message: Extract<ReturnType<typeof parseOperatorMessage>, { type: 'transfer' }>) {
    const data = message.direction === 'out' ? fromBase64(message.data) : undefined
    const label = message.direction === 'out' ? 'HELLO' : REMOTE_READ_REQUESTS[message.request] ?? `request ${message.request}`
    const refusal = remoteTransferRefusal(this.options.scope, { direction: message.direction, request: message.request, value: message.value, index: message.index, length: message.direction === 'in' ? message.length : undefined, data }, this.vendorInterface)
    const reply = (status: RemoteLogEntry['outcome'], extra: Omit<Extract<MemberMessage, { type: 'reply' }>, 'type' | 'id' | 'status'> = {}) => {
      this.send({ type: 'reply', id: message.id, status, ...extra })
      this.set({ log: [...this.state.log, { at: Date.now(), label, outcome: status }].slice(-LOG), count: this.state.count + 1 })
    }
    if (refusal) return reply('refused', { reason: refusal })
    const setup = { requestType: 'vendor' as const, recipient: 'interface' as const, request: message.request, value: message.value, index: message.index }
    try {
      if (message.direction === 'in') {
        const result = await this.options.device.controlTransferIn(setup, message.length)
        if (result.status !== 'ok' || !result.data) return reply('stall')
        reply('ok', { data: toBase64(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength)) })
      } else {
        const result = await this.options.device.controlTransferOut(setup, data!)
        reply(result.status === 'ok' ? 'ok' : 'stall', { bytesWritten: result.bytesWritten })
      }
    } catch { reply('failed', { reason: 'The USB transfer failed.' }) }
  }
}
