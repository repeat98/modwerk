import { useEffect, useRef, useState } from 'react'
import { loadStep, type Inventory, type InventoryTarget } from '../config/inventory'
import { recordSync, rememberSuccessfulSync } from '../config/octatrack-progress'
import { LinkBusyError, type OctatrackLink } from '../engine/elekloader/octatrack-link'
import { BaseLayoutRequired, BaseUpdateRequired, baseOutdated, ModuleSetError, moduleSetReview, setLayout, USB_MODULE_IDS } from '../engine/elekloader/module-set'
import { baseLayout, layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { MODULES } from '../catalog/modules'
import { isModuleAvailable } from '../catalog/availability'
import { StateChip } from './ModuleGrid'
import { ModulePreview } from './ModulePreview'
import { Icon } from './Icon'
import type { PrepareUpdate } from './OctatrackUpdate'
import './link-hero.css'
import './octatrack-link.css'

const list = (ids: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(ids.map(id => MODULES.find(item => item.id === id)?.name ?? id))

/**
 * The one way to sync a module set to the Octatrack: review what changes, then sync (the base stops playback itself)
 * and keep it at once. No self-test and no Undo here (owner, 27 October 2026); the self-test runs on its own from Status.
 * Runtime package changes are reviewed even when the visible member IDs stay the same. A base upgrade or
 * unavailable package stops preparation here; the installer preserves this set. A failed sync offers `onReport`.
 */
export function LoadDialog({ link, set, putBack = false, inventory, prepareUpdate, onClose, onInstallBase, onEdit, onCard, onReport }: {
  link: OctatrackLink; set: InventoryTarget; inventory?: Inventory; prepareUpdate?: PrepareUpdate; onClose: () => void
  /** Opened because the base changed and the unit started without these modules (PutBackModules). */
  putBack?: boolean
  /** Opens the base installer: with a layout when the set needs the base in another USB Audio layout. */
  onInstallBase: (layout?: BaseLayout) => void; onEdit: () => void; onCard: () => void; onReport: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), title = useRef<HTMLHeadingElement>(null)
  const state = useOctatrackLink(link), { status, progress = 0, notice } = state
  const [started, setStarted] = useState(false), [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [preparationError, setPreparationError] = useState<{ review: string; error: ModuleSetError }>()
  // Whether the sync got as far as keeping, for this browser's sync history; written once when the dialog reaches its result.
  const keeping = useRef(false), logged = useRef(false)
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
  // USB Audio comes with the base: on when the connected base runs the set's layout, otherwise a base install first.
  const audio = setLayout(set), audioOn = audio !== undefined && baseLayout(state.identity?.base) === audio
  const stays = inventory ? set.moduleIds.filter(id => (id === USB_AUDIO_MODULE ? audioOn : inventory.moduleIds.includes(id)) && !updates.includes(id)) : []
  const cardOnly = changes ? changes.add.filter(id => !USB_MODULE_IDS.includes(id)) : []
  // Only beta testers reach this dialog. A paused module can still be removed, never added.
  const paused = changes ? changes.add.filter(id => !isModuleAvailable(id, true)) : []
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
    recordSync({ name: set.name, modules: set.moduleIds.length, outcome: failure ? 'failed' : 'kept', ...(failure ? { message: failure.slice(0, 300) } : {}) })
  }, [step, started, error, notice, set])

  async function load() {
    if (!prepareUpdate || !review?.needsSync || problem) return
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
    try { await link.update(prepared.name, prepared.changes); await keep() }
    catch (failure) { console.error(failure); setError(failure instanceof ModuleSetError || failure instanceof LinkBusyError ? failure.message : 'This module set couldn’t be synced.') }
  }
  async function keep() {
    if (link.getState().status !== 'trial') return
    keeping.current = true
    await link.keep()
    const kept = link.getState()
    if (kept.status === 'ready' && kept.notice?.tone === 'success' && kept.identity && kept.active)
      rememberSuccessfulSync({ ...set, moduleIds: [...set.moduleIds], base: kept.identity.base, active: kept.active, at: new Date().toISOString() })
  }
  const closable = step === 'review' || step === 'done'

  return <dialog ref={dialog} className="base-install-dialog load-dialog" aria-labelledby="load-title" onCancel={event => { event.preventDefault(); if (closable) onClose() }}>
    {closable && <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>}
    <header className="base-install-header"><div><span className="guide-eyebrow">Sync to Octatrack</span><h2 id="load-title" ref={title} tabIndex={-1}>{set.name}</h2></div></header>
    {step === 'review' ? <>
      {!connected ? <p className="base-install-intro">Connect your Octatrack with the Modwerk base first.</p>
        : !changes ? <p className="base-install-intro">Reading what’s on it…</p>
        : !review?.needsSync && !problem ? <p className="base-install-intro">Your Octatrack already has exactly these modules.</p>
        : <>
          {putBack && <p className="base-install-intro">The base on your Octatrack changed, so it started without your modules. Sync them to put them back.</p>}
          <p className="load-summary">Adds {changes.add.length} · Removes {changes.remove.length}{updates.length > 0 && <> · Updates {updates.length}</>}</p>
          <p className="base-install-intro">The modules stay on your Octatrack, also after a restart. Your project isn’t changed.</p>
          <ul className="load-changes">{([['card', 'Card only', cardOnly], ['load', 'Base', audio !== undefined && !audioOn ? [USB_AUDIO_MODULE] : []], ['load', 'Adds', changes.add.filter(id => !cardOnly.includes(id))], ['load', 'Updates', updates], ['leaving', 'Removes', changes.remove]] as const).flatMap(([state, label, ids]) => ids.map(id => {
            const module = MODULES.find(item => item.id === id)
            return <li key={id} className={'load-change is-' + state}>
              {module ? <ModulePreview id={id} compact /> : <span className="compact-preview" />}
              <span className="load-change-name"><strong>{module?.name ?? id}</strong>{state === 'card' && <small>Can’t be loaded over USB yet.</small>}{label === 'Base' && audio && <small>{layoutName(audio)}: installed with the base, over USB.</small>}</span>
              <StateChip state={state}>{label}</StateChip>
            </li>
          }))}</ul>
          {!!stays.length && <details className="load-unchanged"><summary>Already on your Octatrack · {stays.length}</summary><ul>{stays.map(id => <li key={id}>{MODULES.find(module => module.id === id)?.name ?? id}</li>)}</ul></details>}
          {cardOnly.length > 0 && <div className="load-blocked" role="note">
            <p>{list(cardOnly)} still {cardOnly.length === 1 ? 'needs' : 'need'} the card. Take {cardOnly.length === 1 ? 'it' : 'them'} out of {set.name} to sync the rest now, or install {set.name} from the card.</p>
            <p><button type="button" className="text-button" onClick={onEdit}>Edit {set.name}</button><button type="button" className="text-button" onClick={onCard}>Install from the card</button></p>
          </div>}
          {paused.length > 0 && <div className="load-blocked" role="note">
            <p>{list(paused)} {paused.length === 1 ? 'is' : 'are'} paused for now. Take {paused.length === 1 ? 'it' : 'them'} out of {set.name} to sync the rest.</p>
            <p><button type="button" className="text-button" onClick={onEdit}>Edit {set.name}</button></p>
          </div>}
        </>}
      {problem && <p className="file-error" role="alert">{problem.message}</p>}
      {error && <p className="file-error" role="alert">{error}</p>}
    </> : step === 'done' ? <p className={'base-install-intro ' + (error || notice?.tone === 'error' ? 'file-error' : 'success-note')} role={error || notice?.tone === 'error' ? 'alert' : 'status'}>{error || notice?.text || (status === 'busy' ? 'Another browser window or app is using your Octatrack, so nothing was sent.' : 'Done.')}</p>
    : <>
      {step === 'loading' && !preparing && <progress className="load-progress" max={1} value={progress} aria-label="Syncing" />}
      <p className="base-install-intro" role="status">{step === 'loading' ? (preparing ? 'Preparing your modules…' : progress < 1 ? `Syncing… ${Math.round(progress * 100)}%` : 'Starting…')
        : 'Saving on your Octatrack…'}</p>
      {/* Keeping waits for playback to stop; started meanwhile, the link says so and the set runs until it is kept. */}
      {step === 'trial' && notice?.tone === 'error' && <p className="file-error" role="alert">{notice.text}</p>}
    </>}
    <footer className="base-install-footer">
      {step === 'review' && connected && review?.needsSync && !problem && !cardOnly.length && !paused.length
        ? <p className="link-hint">Syncing stops playback on the Octatrack.</p> : <span />}
      <div className="base-install-actions">
        {step === 'review' && <><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          {needsBase ? <button type="button" className="button button-primary" onClick={() => onInstallBase(problem instanceof BaseLayoutRequired ? problem.layout : undefined)}><Icon name="download" size={16} />{problem instanceof BaseLayoutRequired ? 'Install base with this layout' : 'Install latest base'}</button>
            : <button type="button" className="button button-primary" disabled={!connected || !review?.needsSync || !!problem || cardOnly.length > 0 || paused.length > 0 || !prepareUpdate} onClick={() => void load()}><Icon name="download" size={16} />Sync to Octatrack</button>}</>}
        {step === 'loading' && !preparing && progress < 1 && <button type="button" className="button button-quiet" onClick={() => link.cancel()}>Cancel</button>}
        {status === 'trial' && notice?.tone === 'error' && <button type="button" className="button button-primary" onClick={() => void keep()}>Try again</button>}
        {step === 'done' && (error || notice?.tone === 'error') && <button type="button" className="button button-quiet" aria-haspopup="dialog" onClick={onReport}><Icon name="message" size={16} />Report a problem</button>}
        {step === 'done' && <button type="button" className="button button-primary" onClick={onClose}>Done</button>}
      </div>
    </footer>
  </dialog>
}
