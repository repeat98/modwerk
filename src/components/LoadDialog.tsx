import { useEffect, useRef, useState } from 'react'
import { loadStep, staysOff, type Inventory, type InventoryTarget } from '../config/inventory'
import { recordSync, rememberSuccessfulSync } from '../config/octatrack-progress'
import { LINK_BUSY, LinkBusyError, type OctatrackLink } from '../engine/elekloader/octatrack-link'
import { BaseLayoutRequired, BaseUpdateRequired, baseOutdated, ModuleSetError, moduleSetReview, setLayout, SetLimitError, USB_MODULE_IDS } from '../engine/elekloader/module-set'
import { baseLayout, layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import { comesWithBase, USB_AUDIO_MODULE, USB_AUDIO_PACKAGED } from '../config/usb-audio'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { MODULES } from '../catalog/modules'
import { moduleCaution } from '../catalog/module-cautions'
import { isModuleAvailable } from '../catalog/availability'
import { usbLagNote } from '../catalog/usb-only'
import { limitedCount, overLimitMessage, SET_MODULE_LIMIT } from '../catalog/set-limit'
import { hasBetaAccess } from '../community/beta-access'
import { useCommunity } from '../community/context'
import { trackModuleDownloads } from '../community/usage'
import { noteSupportInstall } from '../community/support-prompt'
import { SupportLine } from './SupportDialog'
import { useDownloadFollows } from '../community/useDownloadFollows'
import { installedOnOctatrack } from '../community/installed-follow-up'
import { StateChip } from './ModuleGrid'
import { CautionBadge } from './ModuleCard'
import { ModulePreview } from './ModulePreview'
import { Icon } from './Icon'
import { ProgressBar } from './BaseDialogFrame'
import { SupportActions } from './SupportActions'
import type { PrepareUpdate } from './OctatrackUpdate'
import './link-hero.css'
import './octatrack-link.css'

const list = (ids: string[], type: 'conjunction' | 'disjunction' = 'conjunction') => new Intl.ListFormat('en', { type }).format(ids.map(id => MODULES.find(item => item.id === id)?.name ?? id))

/**
 * The one way to sync a module set to the Octatrack: review what changes, then sync (the base stops playback itself)
 * and keep it at once. No self-test and no Undo here (owner, 27 October 2026); the self-test runs on its own from Status.
 * Runtime package changes are reviewed even when the visible member IDs stay the same. A base upgrade or
 * unavailable package stops preparation here; the installer preserves this set. A failed sync offers `onReport`.
 */
export function LoadDialog({ link, set, putBack = false, comesBackOn = [], inventory, prepareUpdate, onClose, onInstallBase, onEdit, onReport }: {
  link: OctatrackLink; set: InventoryTarget; inventory?: Inventory; prepareUpdate?: PrepareUpdate; onClose: () => void
  /** Opened because the base changed and the unit started without these modules (PutBackModules). */
  putBack?: boolean
  /** With `putBack`: the modules that were switched off on the unit before the base changed. They come back on. */
  comesBackOn?: readonly string[]
  /** Opens the base installer: with a layout when the set needs the base in another USB Audio layout. */
  onInstallBase: (layout?: BaseLayout) => void; onEdit: () => void; onReport: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), title = useRef<HTMLHeadingElement>(null)
  const betaAccess = hasBetaAccess(useCommunity().session)
  const state = useOctatrackLink(link), { status, progress = 0, notice } = state
  const [started, setStarted] = useState(false), [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [preparationError, setPreparationError] = useState<{ review: string; error: ModuleSetError }>()
  // Whether the sync got as far as keeping, for this browser's sync history; written once when the dialog reaches its result.
  const keeping = useRef(false), logged = useRef(false)
  // The reviewed additions and updates receive download credit once Keep succeeds.
  const installing = useRef<string[]>([])
  const { followDownloads, followNotice } = useDownloadFollows()
  const step = loadStep(status, started, preparing)
  const connected = !!state.identity?.canSubmit && status === 'ready'
  const review = inventory && moduleSetReview(set, inventory, state.identity?.capabilities, state.identity?.base)
  const reviewKey = JSON.stringify([set, inventory, state.identity?.base, state.identity?.capabilities])
  const latestReview = useRef(reviewKey), mounted = useRef(false)
  useEffect(() => { latestReview.current = reviewKey }, [reviewKey])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const changes = review?.changes, updates = review?.updates ?? []
  const problem = preparationError?.review === reviewKey ? preparationError.error : baseOutdated(state.identity?.base) ? new BaseUpdateRequired() : review?.problem
  const needsBase = problem instanceof BaseUpdateRequired
  // USB Audio while it comes with the base: on when the connected base runs the set's layout, otherwise a base install
  // first. As a module package it is added, updated and removed like any module (module-set.ts).
  const audio = USB_AUDIO_PACKAGED ? undefined : setLayout(set), audioOn = audio !== undefined && baseLayout(state.identity?.base) === audio
  const stays = inventory ? set.moduleIds.filter(id => (comesWithBase(id) ? audioOn : inventory.moduleIds.includes(id)) && !updates.includes(id)) : []
  // A USB Audio package that comes, goes or changes layout makes the unit reconnect on USB once (the base's own
  // reconnect, usb_function.c): the computer then sees the new audio device.
  const reconnects = USB_AUDIO_PACKAGED && !!changes && [changes.add, changes.remove, updates].some(ids => ids.includes(USB_AUDIO_MODULE))
  const off = staysOff(set.moduleIds, inventory) // switched off on the unit (PROJ > MODWERK > MODULES): a sync leaves them off
  // A paused module, or one with no USB package, can still be removed, never added; a beta module (Air Chorus) is added
  // only for a beta tester.
  const paused = changes ? changes.add.filter(id => !isModuleAvailable(id, betaAccess) || !USB_MODULE_IDS.includes(id)) : []
  // A set over the module limit (set-limit.ts) still opens here; it only cannot be synced until trimmed.
  const tooMany = review && !review.needsSync ? '' : overLimitMessage(set.moduleIds, 'sync')
  // After a base change the unit starts empty: a set it held past the limit is put back only once trimmed.
  const tooManyToPutBack = putBack && tooMany ? `Your Octatrack had ${limitedCount(set.moduleIds)} modules before the update; ${SET_MODULE_LIMIT} is the limit for now. Choose which to put back.` : ''
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  // The heading takes focus on open and at each step, since the button that moved the step on is gone.
  useEffect(() => { title.current?.focus() }, [step])
  useEffect(() => {
    if (step !== 'done' || !started || logged.current) return
    const failure = error || (notice?.tone === 'error' ? notice.text : '')
    if (!failure && !keeping.current) return
    logged.current = true
    if (!failure) followDownloads(installing.current, installedOnOctatrack(installing.current))
    recordSync({ name: set.name, modules: set.moduleIds.length, outcome: failure ? 'failed' : 'kept', ...(failure ? { message: failure.slice(0, 300) } : {}) })
  }, [step, started, error, notice, set]) // eslint-disable-line react-hooks/exhaustive-deps -- followDownloads is a new function each render

  async function load() {
    if (!prepareUpdate || !review?.needsSync || problem || tooMany) return
    const preparedFor = link.getState()
    // Fetching packages may outlive this dialog or the exact set and connection the user reviewed.
    const stale = () => {
      if (!mounted.current) return true
      if (latestReview.current === reviewKey && link.getState() === preparedFor) return false
      setPreparing(false)
      setError('Review the sync again; nothing was sent because the module set or Octatrack connection changed.')
      return true
    }
    setPreparing(true); setError(''); setPreparationError(undefined)
    installing.current = [...changes?.add ?? [], ...updates]
    let prepared
    try { prepared = await prepareUpdate(set) }
    catch (failure) {
      if (stale()) return
      console.error(failure); setPreparing(false)
      setPreparationError({ review: reviewKey, error: failure instanceof ModuleSetError ? failure : new ModuleSetError(failure instanceof LinkBusyError ? failure.message : 'This module set couldn’t be prepared, so nothing was sent.') })
      return
    }
    if (stale()) return
    setPreparing(false); setStarted(true)
    try {
      await link.update(prepared.name, prepared.changes)
      // A USB Audio change: the unit reconnects on USB once with the trial open; keep only when it is back.
      if (prepared.changes.some(change => change.reconnects) && !await link.reconnected()) return
      await keep()
    }
    catch (failure) { console.error(failure); setError(failure instanceof ModuleSetError || failure instanceof LinkBusyError ? failure.message : 'This module set couldn’t be synced.') }
  }
  async function keep() {
    if (link.getState().status !== 'trial') return
    keeping.current = true
    await link.keep()
    const kept = link.getState()
    if (kept.status === 'ready' && kept.notice?.tone === 'success') {
      trackModuleDownloads(installing.current)
      noteSupportInstall()
      if (kept.identity && kept.active) rememberSuccessfulSync({ ...set, moduleIds: [...set.moduleIds], base: kept.identity.base, active: kept.active, at: new Date().toISOString() })
    }
  }
  const closable = step === 'review' || step === 'done'
  // The modules this sync takes off a track's reach (removed or replaced by their update): the base refuses the whole sync
  // while a track uses one (refusal 7), the most common failed sync in November 2026, so it is said before, not after.
  const leaving = [...changes?.remove ?? [], ...updates]
  const failed = step === 'done' && !!(error || notice?.tone === 'error')
  // Modules flagged High or Heavy CPU (module-cautions.ts) and USB Audio (owner, 26 November 2026) are for the studio, not
  // for live: said after every sync that leaves one on the unit.
  const studioOnly = set.moduleIds.filter(id => id === USB_AUDIO_MODULE || moduleCaution(id))
  /** After a failed sync, back to the review with the same set: the link has undone what it could and said what is left
   * (octatrack-link.ts failed), and the review reads the unit again. */
  function reviewAgain() { setStarted(false); setError(''); keeping.current = false; logged.current = false }

  return <dialog ref={dialog} className="base-install-dialog load-dialog" aria-labelledby="load-title" onCancel={event => { event.preventDefault(); if (closable) onClose() }}>
    {closable && <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>}
    <header className="base-install-header"><div><span className="guide-eyebrow">Sync to Octatrack</span><h2 id="load-title" ref={title} tabIndex={-1}>{set.name}</h2></div></header>
    {step === 'review' ? <>
      {!connected ? <p className="base-install-intro">Connect your Octatrack with the Modwerk base first.</p>
        : !changes ? <p className="base-install-intro">Reading what’s on it…</p>
        : !review?.needsSync && !problem ? <p className="base-install-intro">Your Octatrack already has exactly these modules.</p>
        : <>
          {putBack && <p className="base-install-intro">The base on your Octatrack changed, so it started without your modules. Sync them to put them back.</p>}
          {putBack && comesBackOn.length > 0 && <p className="base-install-intro">{list([...comesBackOn])} {comesBackOn.length === 1 ? 'was' : 'were'} switched off on your Octatrack and {comesBackOn.length === 1 ? 'comes' : 'come'} back on. To switch {comesBackOn.length === 1 ? 'it' : 'them'} off again, use <strong>PROJECT › MODWERK › MODULES</strong> after the sync.</p>}
          <p className="load-summary">Adds {changes.add.length} · Removes {changes.remove.length}{updates.length > 0 && <> · Updates {updates.length}</>}</p>
          <p className="base-install-intro">The modules stay on your Octatrack, also after a restart. Your project isn’t changed.</p>
          {reconnects && <p className="link-hint" role="note">Your Octatrack reconnects on USB once during this sync, so your computer sees its new audio setup. A recording that is running stops; start it again afterwards.</p>}
          <ul className="load-changes">{([['load', 'Base', audio !== undefined && !audioOn ? [USB_AUDIO_MODULE] : []], ['load', 'Adds', changes.add], ['load', 'Updates', updates], ['leaving', 'Removes', changes.remove]] as const).flatMap(([state, label, ids]) => ids.map(id => {
            const module = MODULES.find(item => item.id === id)
            return <li key={id} className={'load-change is-' + state}>
              {module ? <ModulePreview id={id} compact /> : <span className="compact-preview" />}
              <span className="load-change-name"><strong>{module?.name ?? id}</strong>{label === 'Base' && audio && <small>{layoutName(audio)}: installed with the base, over USB.</small>}{(label === 'Adds' || label === 'Updates') && usbLagNote(id) && <small>{usbLagNote(id)}</small>}</span>
              <StateChip state={state}>{label}</StateChip>
            </li>
          }))}</ul>
          {leaving.length > 0 && !paused.length && <p className="link-hint load-in-use" role="note">Before you sync: a track can’t keep a module that leaves or is updated. If a track uses {list(leaving, 'disjunction')} as its effect or machine, pick another one on that track first (check the bank’s other Parts too).</p>}
          {!!stays.length && <details className="load-unchanged"><summary>Already on your Octatrack · {stays.length}</summary><ul>{stays.map(id => <li key={id}>{MODULES.find(module => module.id === id)?.name ?? id}</li>)}</ul></details>}
          {!!off.length && <details className="load-unchanged"><summary>Switched off on your Octatrack · {off.length}</summary><p>These stay off. Switch one on in PROJECT &gt; MODWERK &gt; MODULES on the Octatrack.</p><ul>{off.map(id => <li key={id}>{MODULES.find(module => module.id === id)?.name ?? id}</li>)}</ul></details>}
          {paused.length > 0 && <div className="load-blocked" role="note">
            <p>{list(paused)} {paused.length === 1 ? 'is' : 'are'} paused for now. Take {paused.length === 1 ? 'it' : 'them'} out of {set.name} to sync the rest.</p>
            <p><button type="button" className="text-button" onClick={onEdit}>Edit {set.name}</button></p>
          </div>}
        </>}
      {tooMany && <div className="load-blocked" role="alert">
        <p>{tooManyToPutBack || tooMany}</p>
        <p><button type="button" className="text-button" onClick={onEdit}>Edit {set.name}</button></p>
      </div>}
      {problem && !(problem instanceof SetLimitError) && <p className="file-error" role="alert">{problem.message}</p>}
      {error && <p className="file-error" role="alert">{error}</p>}
    </> : step === 'done' ? <><p className={'base-install-intro ' + (failed ? 'file-error' : studioOnly.length ? '' : 'success-note')} role={error || notice?.tone === 'error' ? 'alert' : 'status'}>{error || notice?.text || (status === 'busy' ? LINK_BUSY + ' Nothing was sent.' : 'Done.')}</p>{failed && <SupportActions link={link} what="Sync to Octatrack" error={error || notice?.text} />}{!failed && studioOnly.length > 0 && <div className="module-caution load-studio-only" role="note"><Icon name="warn" size={18} /><div><strong>Studio only, not for live</strong><ul>{studioOnly.map(id => <li key={id}>{MODULES.find(module => module.id === id)?.name ?? id}<CautionBadge id={id} /></li>)}</ul><p>{studioOnly.length === 1 ? 'It puts' : 'They put'} a heavy load on the Octatrack and can drop out or crackle when a pattern gets busy. Before you play live, switch {studioOnly.length === 1 ? 'it' : 'them'} off on the Octatrack in <strong>PROJECT › MODWERK › MODULES</strong>, or sync a set without {studioOnly.length === 1 ? 'it' : 'them'}.</p></div></div>}{followNotice && <p className="link-hint" role="status">{followNotice}</p>}{!failed && notice?.tone === 'success' && <SupportLine />}</>
    : <>
      {(step === 'loading' || step === 'trial') && <ProgressBar value={step === 'loading' && !preparing && progress < 1 ? progress : undefined} label="Syncing" percent />}
      <p className="base-install-intro" role="status">{state.reconnecting ? 'Your Octatrack is reconnecting on USB with its new audio setup…' : step === 'loading' ? (preparing ? 'Preparing your modules…' : progress < 1 ? 'Sending your modules to the Octatrack…' : 'Starting them on the Octatrack…')
        : 'Saving on your Octatrack…'}</p>
      {/* Keeping waits for playback to stop; started meanwhile, the link says so and the set runs until it is kept. */}
      {step === 'trial' && notice?.tone === 'error' && <p className="file-error" role="alert">{notice.text}</p>}
    </>}
    <footer className="base-install-footer">
      {step === 'review' && connected && review?.needsSync && !problem && !paused.length && !tooMany
        ? <p className="link-hint">Syncing stops playback on the Octatrack.</p> : <span />}
      <div className="base-install-actions">
        {step === 'review' && <><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          {needsBase ? <button type="button" className="button button-primary" onClick={() => onInstallBase(problem instanceof BaseLayoutRequired ? problem.layout : undefined)}><Icon name="download" size={16} />{problem instanceof BaseLayoutRequired ? 'Install base with this layout' : 'Install latest base'}</button>
            : <button type="button" className="button button-primary" disabled={!connected || !review?.needsSync || !!problem || paused.length > 0 || !!tooMany || !prepareUpdate} onClick={() => void load()}><Icon name="download" size={16} />Sync to Octatrack</button>}</>}
        {step === 'loading' && !preparing && progress < 1 && <button type="button" className="button button-quiet" onClick={() => link.cancel()}>Cancel</button>}
        {status === 'trial' && notice?.tone === 'error' && <button type="button" className="button button-primary" onClick={() => void keep()}>Try again</button>}
        {failed && <button type="button" className="button button-quiet" aria-haspopup="dialog" onClick={onReport}><Icon name="message" size={16} />Report a problem</button>}
        {failed && connected && <button type="button" className="button button-quiet" onClick={reviewAgain}>Try again</button>}
        {step === 'done' && <button type="button" className="button button-primary" onClick={onClose}>Done</button>}
      </div>
    </footer>
  </dialog>
}
