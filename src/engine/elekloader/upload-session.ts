// SPDX-License-Identifier: GPL-3.0-or-later
// Unconnected browser client. A real USB adapter and runtime executor are still required.
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import {
  decodeUploadResponse, digestBytes, encodeUploadRequest, UPLOAD_HEADER, UPLOAD_MAX_BYTES, UPLOAD_MAX_CHUNK,
  type UploadRequest, type UploadStatus,
} from './upload-wire.ts'

/** One complete request/reply exchange; no implicit retries or command queue.
 * After cancellation, the adapter must not deliver a late reply to a new request. */
export interface UploadTransport {
  exchange(frame: Uint8Array, signal: AbortSignal): Promise<Uint8Array>
}
export interface UploadPackage {
  readonly base: string
  readonly sha256: string
  readonly data: Uint8Array
}
interface Offer {
  transaction: number
  generation: number
  previous: string
  digest: string
  length: number
}
export class UploadDeviceError extends Error {
  readonly status: UploadStatus
  constructor(status: UploadStatus) {
    super(`Device refused ${status.command}: ${status.result}.`)
    this.name = 'UploadDeviceError'; this.status = status
  }
}
export class UploadUnconfirmedError extends Error {
  readonly lastConfirmed: UploadStatus | undefined
  constructor(message: string, lastConfirmed?: UploadStatus, cause?: unknown) {
    super(message, { cause }); this.name = 'UploadUnconfirmedError'; this.lastConfirmed = lastConfirmed
  }
}

/** Serial, session-bound transactions. Publication and retirement are separate
 * explicit actions; staging never starts playback or accepts a trial. */
export class UploadSession {
  private transport: UploadTransport
  private base: string
  private timeout: number
  private current?: UploadStatus
  private offer?: Offer
  private busy = false
  private broken = false

  private constructor(transport: UploadTransport, base: string, timeout: number) {
    digestBytes(base)
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw new Error('Upload timeout must be between 1 and 60000 ms.')
    this.transport = transport; this.base = base; this.timeout = timeout
  }
  static async connect(transport: UploadTransport, expectedBase: string, options: { timeoutMs?: number } = {}) {
    const session = new UploadSession(transport, expectedBase, options.timeoutMs ?? 10000)
    const status = await session.exchange({ command: 'hello' })
    session.ok(status)
    return session
  }
  get status(): UploadStatus {
    if (!this.current) throw new Error('Device identity has not been confirmed.')
    return this.current
  }
  get connectionTrusted() { return !this.broken }

  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.broken) throw new UploadUnconfirmedError('The connection has an unconfirmed operation; use a fresh transport for read-only identification.', this.current)
    if (this.busy) throw new Error('Another upload operation is in progress.')
    this.busy = true
    try { return await run() } finally { this.busy = false }
  }
  private uncertain(message: string, cause?: unknown): never {
    this.broken = true
    throw new UploadUnconfirmedError(message, this.current, cause)
  }
  private expect(condition: boolean, message: string) {
    if (!condition) this.uncertain(message)
  }
  private ok(status: UploadStatus) {
    if (status.result !== 'ok') throw new UploadDeviceError(status)
  }
  private async exchange(request: UploadRequest, validate?: (status: UploadStatus) => void): Promise<UploadStatus> {
    const frame = encodeUploadRequest(request), abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('Upload acknowledgement timed out.')) }, this.timeout)
      })
      const bytes = await Promise.race([this.transport.exchange(frame, abort.signal), deadline])
      const status = decodeUploadResponse(bytes, request, { base: this.base, session: this.current?.session })
      this.expect(!this.current || status.capacity === this.current.capacity, 'Device staging capacity changed within a session.')
      validate?.(status)
      this.current = status
      return status
    } catch (error) {
      abort.abort()
      return this.uncertain(`${request.command} was not confirmed; no further commands will be sent on this connection.`, error)
    } finally { if (timer !== undefined) clearTimeout(timer) }
  }
  private control(command: 'verify' | 'commit' | 'accept' | 'rollback' | 'abort' | 'leave', transaction: number, validate?: (status: UploadStatus) => void) {
    return this.exchange({ command, transaction, session: this.status.session }, validate)
  }
  private owned(): Offer {
    if (!this.offer) throw new Error('This client does not own a staged transaction.')
    return this.offer
  }
  private sameTransaction(status: UploadStatus, offer: Offer) {
    this.expect(status.currentTransaction === offer.transaction && status.lastTransaction === offer.transaction,
      'Device transaction ownership changed.')
  }
  private oldSet(status: UploadStatus, offer: Offer) {
    this.expect(status.active === offer.previous && status.generation === offer.generation,
      'Staging changed the active module identity or generation.')
  }
  private publishedSet(status: UploadStatus, offer: Offer) {
    this.sameTransaction(status, offer)
    this.expect(status.active === offer.digest && status.generation === offer.generation + 1 && status.received === offer.length,
      'Device did not confirm the published module-set identity.')
  }

  /** Copy and pin-check before entering upload mode. Cancellation is checked
   * between acknowledged commands, so it cannot overlap a pending transfer. */
  async stage(pkg: UploadPackage, options: { signal?: AbortSignal; progress?: (received: number, length: number) => void } = {}) {
    return this.exclusive(async () => {
      const digest = pkg.sha256, length = pkg.data.length
      digestBytes(digest)
      if (pkg.base !== this.base || !length || length > Math.min(UPLOAD_MAX_BYTES, this.status.capacity))
        throw new Error('Runtime module package does not match its base, size or private build pin.')
      const data = pkg.data.slice(0, length)
      if (data.length !== length || sha(data) !== digest)
        throw new Error('Runtime module package does not match its base, size or private build pin.')
      if (this.offer || !['normal', 'ready'].includes(this.status.phase) || !this.status.activeKnown)
        throw new Error('Finish or recover the existing device transaction before staging another set.')
      if (this.status.lastTransaction === 0xffffffff || this.status.generation > 0xfffffffd)
        throw new Error('The device transaction or generation counter is exhausted.')
      const entered = this.status.phase === 'normal'
      const cancelled = () => { if (options.signal?.aborted) throw new DOMException('Module staging cancelled.', 'AbortError') }
      cancelled()
      const offer: Offer = { transaction: this.status.lastTransaction + 1, generation: this.status.generation,
        previous: this.status.active!, digest, length: data.length }
      try {
        if (entered) {
          const before = this.status
          const status = await this.exchange({ command: 'enter', session: before.session }, status => {
            this.oldSet(status, offer)
            this.expect(status.currentTransaction === before.currentTransaction && status.lastTransaction === before.lastTransaction &&
              (status.phase === 'ready' || status.result !== 'ok' && status.phase === 'normal'), 'Upload mode was not confirmed.')
          })
          this.ok(status)
        }
        cancelled()
        this.offer = offer
        const beforeBegin = this.status
        const begun = await this.exchange({ command: 'begin', session: this.status.session, transaction: offer.transaction,
          base: this.base, digest, generation: offer.generation, length: data.length }, status => {
          this.oldSet(status, offer)
          if (status.result === 'ok') {
            this.sameTransaction(status, offer)
            this.expect(status.phase === 'receiving' && status.received === 0, 'The device did not confirm an empty staging transaction.')
          } else this.expect(status.phase === 'ready' && status.currentTransaction === beforeBegin.currentTransaction && status.lastTransaction === beforeBegin.lastTransaction,
            'A refused offer changed transaction ownership.')
        })
        if (begun.result !== 'ok') { this.offer = undefined; this.ok(begun) }
        for (let offset = 0, size = 0; offset < data.length; offset += size) {
          cancelled()
          // A frame of whole 64-byte packets never completes on bases before usbtest9 (the controller
          // waits for a zero-length packet the host does not send): shorten that chunk by a byte.
          size = Math.min(UPLOAD_MAX_CHUNK, data.length - offset)
          if ((UPLOAD_HEADER + 4 + size) % 64 === 0) size -= 1
          const chunk = data.subarray(offset, offset + size)
          const status = await this.exchange({ command: 'chunk', session: this.status.session,
            transaction: offer.transaction, offset, data: chunk }, status => {
            this.oldSet(status, offer); this.sameTransaction(status, offer)
            this.expect(status.phase === 'receiving' && status.received === offset + (status.result === 'ok' ? chunk.length : 0),
              'The device did not confirm the complete chunk.')
          })
          this.ok(status)
          options.progress?.(status.received, data.length)
        }
        cancelled()
        const verified = await this.control('verify', offer.transaction, status => {
          this.oldSet(status, offer); this.sameTransaction(status, offer)
          this.expect(status.result === 'ok' ? status.phase === 'verified' && status.received === data.length :
            status.phase === 'ready' && status.received === 0 || ['receiving', 'recovery'].includes(status.phase) && status.received === data.length,
          'The staged package was not verified or safely refused.')
        })
        this.ok(verified)
        return verified
      } catch (error) {
        // A malformed/missing acknowledgement permanently poisons this channel.
        // With positive replies, discard candidate resources and restore normal
        // operation only after the device confirms the old set is intact.
        if (!this.broken) {
          if (this.offer) await this.cancelInternal(entered)
          else if (entered && ['ready'].includes(this.status.phase)) await this.leaveInternal()
        }
        throw error
      }
    })
  }
  async activate() {
    return this.exclusive(async () => {
      const offer = this.owned()
      if (this.status.phase !== 'verified') throw new Error('Verify the staged package before activation.')
      const status = await this.control('commit', offer.transaction, status => {
        this.sameTransaction(status, offer)
        if (status.result !== 'ok') this.expect(['verified', 'ready', 'recovery'].includes(status.phase) && status.generation === offer.generation &&
          (status.active === offer.previous || status.phase === 'recovery' && !status.activeKnown),
        'Failed publication did not confirm the previous set or recovery state.')
        else {
          this.publishedSet(status, offer)
          this.expect(status.phase === 'pending', 'Publication did not retain a stopped trial configuration.')
        }
      })
      this.ok(status)
      return status
    })
  }
  async startTrial() {
    return this.exclusive(async () => {
      const offer = this.owned()
      if (this.status.phase !== 'pending') throw new Error('A published, stopped candidate is required for trial playback.')
      const status = await this.control('leave', offer.transaction, status => {
        this.publishedSet(status, offer)
        this.expect(status.phase === (status.result === 'ok' ? 'trial' : 'pending'), 'Trial operation was not confirmed.')
      })
      this.ok(status)
      return status
    })
  }
  private async holdTrialInternal() {
    const offer = this.owned()
    if (this.status.phase !== 'trial') throw new Error('The device is not running a trial.')
    const status = await this.exchange({ command: 'enter', session: this.status.session }, status => {
      this.publishedSet(status, offer)
      this.expect(status.phase === 'pending' || status.result !== 'ok' && status.phase === 'trial', 'The stopped trial hold was not confirmed.')
    })
    this.ok(status)
    return status
  }
  async holdTrial() { return this.exclusive(() => this.holdTrialInternal()) }
  async accept() {
    return this.exclusive(async () => {
      const offer = this.owned()
      if (this.status.phase !== 'pending') throw new Error('Stop the trial before accepting its module set.')
      const status = await this.control('accept', offer.transaction, status => {
        this.publishedSet(status, offer)
        this.expect(status.phase === (status.result === 'ok' ? 'ready' : 'pending'), 'Retirement of the previous module set was not confirmed.')
      })
      this.ok(status)
      this.offer = undefined
      return status
    })
  }
  private async rollbackInternal() {
    const offer = this.owned()
    if (this.status.phase === 'trial') await this.holdTrialInternal()
    if (!['pending', 'recovery'].includes(this.status.phase)) throw new Error('There is no retained publication to roll back.')
    const before = this.status, published = before.phase === 'pending' || !before.activeKnown
    const generation = before.generation + (published ? 1 : 0)
    const status = await this.control('rollback', offer.transaction, status => {
      this.sameTransaction(status, offer)
      this.expect(status.result === 'ok' ? status.phase === 'ready' && status.active === offer.previous && status.generation === generation :
        status.generation === before.generation && status.received === before.received &&
        (status.phase === before.phase || status.phase === 'recovery') &&
        (status.active === before.active || published && status.phase === 'recovery' && !status.activeKnown),
      'Rollback did not confirm the previous module set or its retained recovery state.')
    })
    this.ok(status)
    this.offer = undefined
    return status
  }
  async rollback() { return this.exclusive(() => this.rollbackInternal()) }
  private async cancelInternal(leave: boolean) {
    const offer = this.owned()
    if (this.status.phase === 'recovery' && this.status.active === offer.previous) {
      await this.rollbackInternal() // Retry failed pre-publication cleanup.
    } else {
      if (!['receiving', 'verified', 'ready'].includes(this.status.phase)) throw new Error('A published candidate requires rollback, not cancellation.')
      const status = await this.control('abort', offer.transaction, status => {
        this.sameTransaction(status, offer); this.oldSet(status, offer)
        this.expect(status.phase === 'ready' || status.result !== 'ok' && ['receiving', 'verified', 'recovery'].includes(status.phase),
          'Candidate cleanup was not confirmed.')
      })
      this.ok(status)
      this.offer = undefined
    }
    return leave ? this.leaveInternal() : this.status
  }
  async cancel() { return this.exclusive(() => this.cancelInternal(true)) }
  private async leaveInternal() {
    if (!['ready', 'normal'].includes(this.status.phase) || !this.status.activeKnown)
      throw new Error('Resolve staging, trial or recovery before leaving upload mode.')
    const previous = this.status
    const status = await this.control('leave', previous.currentTransaction, status => {
      this.expect(status.active === previous.active && status.generation === previous.generation &&
        status.currentTransaction === previous.currentTransaction && status.lastTransaction === previous.lastTransaction,
      'Leaving upload mode changed the confirmed module set or transaction.')
      this.expect(status.phase === (status.result === 'ok' ? 'normal' : previous.phase), 'Normal operation was not confirmed.')
    })
    this.ok(status)
    this.offer = undefined
    return status
  }
  async leaveUploadMode() { return this.exclusive(() => this.leaveInternal()) }
}
