import { useEffect, useRef, useState } from 'react'
import { CARD_SET_FILE } from '../engine/elekloader/card-set'
import { prepareCardSet } from '../engine/elekloader/module-set'
import { layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import type { InventoryTarget } from '../config/inventory'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { Icon } from './Icon'
import { save } from './OctatrackBackups'
import './octatrack-link.css'

/** The card as a second way to load what a USB sync loads (owner, 11 November 2026): the module set as the file the
 * Modwerk base restores when the Octatrack starts (card-set.ts), from the same packages. For an Octatrack that already
 * runs the base; restored from a site-written file on the owner's MKII on the released base that day.
 * The button writes and downloads the file, then a dialog says where it goes (owner, 12 November 2026). */
export function CardSetButton({ set }: { set?: InventoryTarget }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; written?: { base: string; layout: BaseLayout } }>({})
  const modules = set?.moduleIds.filter(id => id !== USB_AUDIO_MODULE).length ?? 0
  async function download() {
    if (!set) return
    setState({ busy: true })
    try {
      const made = await prepareCardSet(set)
      save(made.file, CARD_SET_FILE)
      setState({ written: { base: made.base, layout: made.layout } })
    } catch (error) { setState({ error: error instanceof Error ? error.message : 'Couldn’t write the module file.' }) }
  }
  return <>
    <button type="button" className="button button-primary" disabled={!modules || state.busy} title={modules ? undefined : 'Add modules to your set first.'} onClick={() => void download()}><Icon name="download" size={16} />{state.busy ? 'Writing the file…' : 'Load from the card'}</button>
    {(state.written || state.error) && <CardSetDialog name={set?.name} written={state.written} error={state.error} onClose={() => setState({})} />}
  </>
}

/** After the download: where the file goes, and which base it is for. */
function CardSetDialog({ name, written, error, onClose }: { name?: string; written?: { base: string; layout: BaseLayout }; error?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), done = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element?.showModal(); done.current?.focus()
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  return <dialog ref={dialog} className="app-dialog card-set-dialog" aria-labelledby="card-set-dialog-title" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => event.stopPropagation()}>
    <header className="login-prompt-header">
      <h2 id="card-set-dialog-title">{written ? 'Put ' + CARD_SET_FILE + ' on the card' : 'The module file couldn’t be written'}</h2>
      <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
    </header>
    {written ? <>
      <ol className="card-set-plan">
        <li><span aria-hidden="true">1</span><div><strong>Copy the file to the card</strong><p>Top folder, replacing the one there. Card reader or USB DISK MODE.</p></div></li>
        <li><span aria-hidden="true">2</span><div><strong>Switch the Octatrack off and on</strong><p>It reads the file when it starts.</p></div></li>
        <li><span aria-hidden="true">3</span><div><strong>Play</strong><p>{name ? <>It starts with the modules of <b>{name}</b>.</> : 'It starts with your modules.'}</p></div></li>
      </ol>
      <p className="card-set-base">Needs the Modwerk base <b>{written.base.slice(0, 8)}</b> ({layoutName(written.layout)}) on the Octatrack.</p>
    </> : <p className="file-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button ref={done} type="button" className="button button-primary" onClick={onClose}>{written ? 'Done' : 'Close'}</button></div>
  </dialog>
}

/** Setup's section for it. */
export function CardSetDownload({ set }: { set?: InventoryTarget }) {
  const modules = set?.moduleIds.filter(id => id !== USB_AUDIO_MODULE).length ?? 0
  return <section className="hub-section card-set" aria-labelledby="card-set-title">
    <h3 id="card-set-title">Load from the card</h3>
    <p>The same modules a USB sync installs, as one file ({CARD_SET_FILE}) your Octatrack reads when it starts. For when USB isn’t at hand: Firefox, Safari, an iPad, or an Octatrack that isn’t at the computer. It needs the Modwerk base on the Octatrack.</p>
    <p><CardSetButton set={set} /></p>
    {!modules && <p className="hub-empty">Add modules to your set first.</p>}
    <p className="link-hint">You copy the file to the top folder of the card and switch the Octatrack off and on{set ? <>; it then starts with the set <b>{set.name}</b></> : null}. The steps follow the download.</p>
  </section>
}
