import { scopedApi } from './api'
import { MODULES } from '../catalog/modules'
import type { Inventory } from '../config/inventory'
import type { OctatrackLink, LinkDiagnostic } from '../engine/elekloader/octatrack-link'
import type { LoadReading } from '../engine/elekloader/upload-wire'
import { browserRequestsPrivacy, countOctatrackAction } from './usage'
import { OCTATRACK_DIAGNOSTICS_VERSION, DIAGNOSTIC_USB_EVENTS, DEVICE_LOG_INCIDENTS, DEVICE_LOG_LOADS, type SiteDiagnosticEvent, type DiagnosticConsent, type DiagnosticLive, type OctatrackDiagnostic } from './octatrack-diagnostics-contract'
import { subscribeSiteDiagnosticEvents, collectBrowserDiagnosticEvents } from './site-diagnostic-events'

export interface DiagnosticPreference { accountId: string | null; available: boolean; enabled: boolean; ready: boolean; busy: boolean; error: string; notice: string; hasChoice: boolean; saved: boolean; lastSent: string | null }
const listeners = new Set<() => void>()
const locallyStopped = new Set<string>()
/** `hasChoice`: a choice under the current text that hasn't expired, so the invitation stays away. `saved`: any earlier choice, whose reports can still be deleted. */
const choice = (saved: DiagnosticConsent) => ({ hasChoice: saved.version === OCTATRACK_DIAGNOSTICS_VERSION && !!saved.changedAt && Date.parse(saved.expiresAt ?? '') > Date.now(), saved: !!saved.changedAt })
let snapshot: DiagnosticPreference = {accountId:null,available:false,enabled:false,ready:false,busy:false,error:'',notice:'',hasChoice:false,saved:false,lastSent:null}
let owner: string | null = null, blocked = false, expires = 0
let preferenceRevision = 0
let generation = 0, accountApi: ReturnType<typeof scopedApi> | undefined
let transfer: AbortController | undefined
let healthRead: AbortController | undefined
const publish = (value: Partial<DiagnosticPreference>) => { snapshot = {...snapshot,...value}; listeners.forEach(listener=>listener()) }
export const diagnosticPreference = () => snapshot
export const subscribeDiagnosticPreference = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export async function changeDiagnosticSharing(enabled: boolean) {
  if (!owner || !accountApi?.current() || !snapshot.ready || snapshot.busy || enabled && browserRequestsPrivacy()) return false
  const member = owner, client = accountApi, currentGeneration = generation, revision = ++preferenceRevision
  const current = () => owner === member && generation === currentGeneration && preferenceRevision === revision && client.current()
  if (!enabled) { locallyStopped.add(member); blocked = true; transfer?.abort(); healthRead?.abort(); publish({enabled:false}) }
  publish({busy:true,error:'',notice:''})
  try {
    const saved = await client.request<DiagnosticConsent>('/octatrack/diagnostics/consent',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,version:OCTATRACK_DIAGNOSTICS_VERSION})})
    if (!current()) return false
    if (saved.accountId !== member || !enabled && saved.enabled || enabled && (!saved.enabled || saved.version !== OCTATRACK_DIAGNOSTICS_VERSION || !(Date.parse(saved.expiresAt ?? '') > Date.now()))) throw new Error('Your sign-in or diagnostic choice changed in another tab. Refresh and try again.')
    if (enabled && saved.enabled) locallyStopped.delete(member)
    blocked = !saved.enabled; expires = Date.parse(saved.expiresAt ?? '')
    publish({enabled:saved.enabled,ready:true,available:true,...choice(saved),notice:saved.enabled?'Diagnostics sharing is on.':'Sharing stopped. Your shared diagnostics were deleted.',...(!saved.enabled ? {lastSent:null} : {})})
    return true
  } catch (error) {
    if (current()) publish({error:enabled ? error instanceof Error ? error.message : 'Couldn’t enable diagnostics.' : 'Sharing stopped on this page. I couldn’t confirm deletion on the server; please try Stop sharing and delete again.'})
  } finally { if (preferenceRevision === revision) publish({busy:false}) }
  return false
}

/** One collector per authenticated member page. No persistent trace queue, arbitrary errors, extra device identifiers,
 * project references or diagnostic reads before consent. Unsent events are dropped; USB work never awaits the network. */
export function collectOctatrackDiagnostics(memberId: string, link: OctatrackLink | null, inventory: () => Inventory | undefined) {
  let stopped = false, refreshing = false, reading = false, activeSync = false, lastHealth = '', sent = 0, budgetAt = Date.now(), sending = false
  const queue: OctatrackDiagnostic[] = [], onStored = new WeakMap<OctatrackDiagnostic, () => void>()
  const requests = new AbortController()
  const currentGeneration = ++generation, client = accountApi = scopedApi(), busy = snapshot.busy
  owner = memberId; blocked = locallyStopped.has(memberId); expires = 0
  publish({accountId:memberId,available:false,enabled:false,ready:false,busy,error:'',notice:'',hasChoice:false,saved:false,lastSent:null})
  const current = () => !stopped && generation === currentGeneration && owner === memberId && client.current()
  const allowed = () => current() && snapshot.enabled && !blocked && expires > Date.now() && !browserRequestsPrivacy()
  let siteCleanup: (() => void) | undefined
  const syncSiteCollection = () => {
    if (!allowed()) { siteCleanup?.(); siteCleanup=undefined; return }
    if (siteCleanup) return
    const unsubscribe=subscribeSiteDiagnosticEvents(event=>send(event),allowed)
    const stopBrowser=typeof window === 'undefined' ? () => {} : collectBrowserDiagnosticEvents(window)
    siteCleanup=()=>{stopBrowser();unsubscribe()}
  }
  const stopPreference=subscribeDiagnosticPreference(syncSiteCollection)
  async function refresh() {
    if (!current() || refreshing || snapshot.busy) return false
    refreshing = true
    const revision = preferenceRevision
    try {
      const saved = await client.request<DiagnosticConsent>('/octatrack/diagnostics/consent',{signal:requests.signal})
      if (!current() || snapshot.busy || preferenceRevision !== revision) return false
      if (saved.accountId !== memberId) { publish({enabled:false,ready:false,error:'Your sign-in changed. Refresh this page to manage diagnostics.'}); return false }
      expires = Date.parse(saved.expiresAt ?? '')
      publish({enabled:saved.enabled && saved.version === OCTATRACK_DIAGNOSTICS_VERSION && !blocked,ready:true,available:true,...choice(saved)})
      if (!saved.enabled) { transfer?.abort(); healthRead?.abort() }
      return true
    } catch { if (current() && preferenceRevision === revision && !snapshot.busy) publish({enabled:false,ready:true,available:false}) }
    finally { refreshing = false }
    return false
  }
  function send(event: LinkDiagnostic | SiteDiagnosticEvent | Omit<OctatrackDiagnostic, 'id'>, id: string = crypto.randomUUID(), stored?: () => void) {
    if (!allowed() || event.event === 'health' && sending) return
    const usbEvent=(DIAGNOSTIC_USB_EVENTS as readonly string[]).includes(event.event) && event.event !== 'device_log'
    const modules = usbEvent ? inventory()?.moduleIds.flatMap(id => { const module = MODULES.find(item => item.id === id); return module ? [{id:module.id,catalogVersion:module.version}] : [] }) : undefined
    const data = {id,...event,...(modules ? {modules} : {})} as OctatrackDiagnostic
    if (queue.length >= 16) queue.shift()
    if (stored) onStored.set(data, stored)
    queue.push(data); void drain()
  }
  async function drain() {
    if (sending) return
    sending = true
    try {
      while (queue.length && allowed()) {
        if (Date.now()-budgetAt>=3600000) {budgetAt=Date.now();sent=0}
        if (sent >= 100) break
        const data = queue.shift()!, controller = transfer = new AbortController()
        sent++
        try {
          const result = await client.fetch('/octatrack/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:OCTATRACK_DIAGNOSTICS_VERSION,data}),signal:controller.signal,keepalive:true})
          if (!current() || controller.signal.aborted) break
          if (result.status === 403) { publish({enabled:false}); break }
          if (result.ok) {
            const body=await result.json()
            if (allowed() && !controller.signal.aborted) onStored.get(data)?.()
            if (body.stored && allowed() && !controller.signal.aborted) publish({lastSent:new Date().toISOString()})
          }
        } catch { /* No retry or disk queue; a later event can succeed. */ }
        finally { if (transfer === controller) transfer = undefined }
      }
    } finally { queue.length=0; sending=false }
  }
  const unsubscribe = link?.subscribeDiagnostics(event => {
    if (!current()) return
    if (event.event === 'sync_started') { activeSync = true; countOctatrackAction('usb_sync_started') }
    else if (activeSync && ['kept','undone','sync_failed','disconnected'].includes(event.event)) {
      countOctatrackAction(event.event === 'kept' ? 'usb_sync_kept' : event.event === 'undone' ? 'usb_sync_undone' : 'usb_sync_failed'); activeSync = false
    }
    if (['sync_started','kept','undone','sync_failed','disconnected'].includes(event.event)) flushLoad()
    void send(event)
  })
  const unit = () => { const state = link!.getState(); return {phase:state.status,...(state.identity ? {base:state.identity.base} : {}),...(state.active ? {active:state.active} : {})} }
  async function health(signal: AbortSignal) {
    try {
      const record = await link!.health(signal, allowed)
      if (!record || !allowed()) return
      const fingerprint = JSON.stringify(record)
      if (fingerprint === lastHealth) return
      lastHealth = fingerprint
      send({event:'health',...unit(),reading:record})
    } catch { /* Another tab or an active load owns the unit; skip this round. */ }
  }
  /* The live meters, read with the status every 30 s: a summary every five minutes, at once (at most every ten minutes)
   * when the CPU reaches 90 %, and `unresponsive` when reads fail twice (usb) or the UI tick stands still (ui). */
  let samples: LoadReading[] = [], sampledUnit: ReturnType<typeof unit> | undefined, lastTicks: number | undefined, failures = 0, stuck = false, hotAt = 0, logAt = 0
  const live = (): DiagnosticLive => {
    const meter = (pick: (reading: LoadReading) => number | null, peak = pick) => {
      const values = samples.map(pick).filter((value): value is number => value !== null), peaks = samples.map(peak).filter((value): value is number => value !== null)
      return values.length ? [Math.round(values.reduce((a, b) => a + b, 0) / values.length), Math.max(...values, ...peaks)] as [number, number] : undefined
    }
    const cpu = meter(reading => reading.cpu), dsp1to4 = meter(reading => reading.tracks1to4, reading => reading.peak1to4), dsp5to8 = meter(reading => reading.tracks5to8, reading => reading.peak5to8)
    return {samples:samples.length,...(cpu ? {cpu} : {}),...(dsp1to4 ? {dsp1to4} : {}),...(dsp5to8 ? {dsp5to8} : {})}
  }
  /** The readings so far, with the unit as it was when they were read: every ten readings, and before a sync, after it and when the connection or page ends. */
  function flushLoad() {
    if (!samples.length || !sampledUnit) return
    send({event:'load',...sampledUnit,live:live()}); samples = []
  }
  async function sample(signal: AbortSignal) {
    try {
      const reading = await link!.liveLoad(signal, allowed)
      if (!reading || !allowed()) return
      failures = 0
      const still = lastTicks === reading.ticks
      lastTicks = reading.ticks
      if (still && !stuck) send({event:'unresponsive',...unit(),reason:'ui',live:live()})
      stuck = still
      samples.push(reading); sampledUnit = unit()
      const hot = reading.cpu !== null && reading.cpu >= 900 && Date.now() - hotAt >= 600_000
      if (hot) hotAt = Date.now()
      if (hot || samples.length >= 10) flushLoad()
    } catch (error) {
      // The link's LinkBusyError (retry: true), checked by shape so this chunk doesn't load the USB link's code.
      const transfer = error instanceof Error && (error as { retry?: boolean }).retry === true && error.cause instanceof Error && error.cause.name !== 'AbortError'
      if (!transfer || signal.aborted) return
      if (++failures === 2 && !stuck) { stuck = true; send({event:'unresponsive',...unit(),reason:'usb',live:live()}) }
    }
  }
  /* The unit's own log, at the first idle moment of a connection and every ten minutes: records newer than the last
   * stored for this log, ids derived from them so a resend is a duplicate. The log's nonce stays in this browser. */
  async function deviceLog(signal: AbortSignal) {
    try {
      const log = await link!.deviceLog(signal, allowed)
      if (!log || !allowed()) return
      const scope = await digest(memberId + ':' + log.nonce), key = 'modwerk.diagnostics.device-log:' + scope
      /* A mark per kind, moved only past groups stored in order: loads and incidents share the unit's seq, so one mark
       * moved by a stored load group skipped the incidents of a group that failed or never left a closing tab. The
       * mark before 27 October 2026 (one for both) is where each starts. */
      const mark = (kind: 'loads' | 'incidents') => { try { return Number(localStorage.getItem(key + ':' + kind) ?? localStorage.getItem(key)) || 0 } catch { return 0 /* storage off: send what the unit holds */ } }
      const keep = (kind: 'loads' | 'incidents', from: number, seq: number) => () => { try { const at = mark(kind); if (at >= from && seq > at) localStorage.setItem(key + ':' + kind, String(seq)) } catch { /* storage off */ } }
      const from = {loads: mark('loads'), incidents: mark('incidents')}
      const groups = [...chunks(log.loads.filter(record => record.seq > from.loads), DEVICE_LOG_LOADS).map(loads => ({kind: 'loads' as const, log: {loads, incidents: []}})),
        ...chunks(log.incidents.filter(record => record.seq > from.incidents), DEVICE_LOG_INCIDENTS).map(incidents => ({kind: 'incidents' as const, log: {loads: [], incidents}}))]
      for (const group of groups) {
        const seqs = [...group.log.loads, ...group.log.incidents].map(record => record.seq), last = Math.max(...seqs)
        send({event:'device_log',...unit(),log:group.log}, eventId(await digest(scope + ':' + seqs.join(','))), keep(group.kind, from[group.kind], last))
        from[group.kind] = last
      }
      /* The crash and stall records (log version 2), once per count: the id makes a resend a duplicate. */
      if (log.crash || log.stall) {
        const id = await digest(scope + ':records:' + (log.crash?.count ?? 0) + ':' + (log.stall?.count ?? 0))
        send({event:'device_log',...unit(),log:{loads:[],incidents:[],...(log.crash ? {crash:log.crash} : {}),...(log.stall ? {stall:log.stall} : {})}}, eventId(id), () => {})
      }
    } catch { /* Busy or an older base; the next round asks again. */ }
  }
  async function tick() {
    syncSiteCollection()
    if (!await refresh()) return // Never use a stale choice while another refresh is still pending.
    if (link?.getState().status !== 'ready') { logAt = 0; lastTicks = undefined } // the next connection reads the log first
    if (!allowed() || reading || !link || link.getState().status !== 'ready') return
    reading = true
    const controller = healthRead = new AbortController()
    try {
      await health(controller.signal)
      await sample(controller.signal)
      if (Date.now() - logAt >= 600_000) { logAt = Date.now(); await deviceLog(controller.signal) }
    } finally { reading = false; if (healthRead === controller) healthRead = undefined }
  }
  void refresh()
  const timer = setInterval(() => { void tick() }, 30_000)
  // shortcut: a report still sending when the tab closes holds the readings back, so they are lost; a queue on disk would keep them.
  globalThis.addEventListener?.('pagehide', flushLoad)
  return () => { stopped = true; requests.abort(); clearInterval(timer); globalThis.removeEventListener?.('pagehide', flushLoad); unsubscribe?.(); stopPreference(); siteCleanup?.(); if (generation === currentGeneration) { transfer?.abort(); healthRead?.abort(); owner = null; accountApi = undefined; publish({accountId:null,available:false,enabled:false,ready:false}) } }
}

const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
async function digest(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** A version 4 shaped id from a digest, as the server accepts; the same records give the same id. */
export function eventId(hex: string) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) & 3]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
