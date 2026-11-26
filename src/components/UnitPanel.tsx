import { useEffect, useRef, useState } from 'react'
import { CARD_SET_FILE, CARD_RECOVERY_FILE, forCardImport } from '../engine/elekloader/card-set'
import { firmwareFilename } from '../config/firmware-filename'
import { prepareCardSet } from '../engine/elekloader/module-set'
import { baseName, describeBase, layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import { knownBase } from '../config/base-download'
import type { InventoryTarget } from '../config/inventory'
import { comesWithBase } from '../config/usb-audio'
import { Icon } from './Icon'
import { trackModuleDownloads } from '../community/usage'
import { noteSupportInstall } from '../community/support-prompt'
import { SupportLine } from './SupportDialog'
import { useDownloadFollows } from '../community/useDownloadFollows'
import { installedOnOctatrack } from '../community/installed-follow-up'
import { save } from './OctatrackBackups'
import './octatrack-link.css'

/** The card as a second way to load what a USB sync loads (owner, 11 November 2026): the module set as the file the
 * Modwerk base restores when the Octatrack starts (card-set.ts), from the same packages. For an Octatrack that already
 * runs the base; restored from a site-written file on the owner's MKII on the released base that day.
 * The button writes and downloads the file, then a dialog says where it goes (owner, 12 November 2026), and when the
 * base this browser last saw or downloaded is another one: the Octatrack then ignores the file and starts without
 * modules, with no message (18 November 2026, a tester who replaced both files and got no modules). */
export function CardSetButton({ set, onInstall }: { set?: InventoryTarget; onInstall?: (layout: BaseLayout) => void }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; written?: Written }>({})
  const modules = set?.moduleIds.filter(id => !comesWithBase(id)).length ?? 0
  const { followDownloads, followNotice } = useDownloadFollows()
  async function download() {
    if (!set) return
    setState({ busy: true })
    try {
      const made = await prepareCardSet(set)
      // What a downloaded build got: the count, update notifications and the hardware feedback reminder.
      const ids = set.moduleIds.filter(id => !comesWithBase(id))
      const known = knownBase()
      setState({ written: { file: made.file, ids, base: made.base, layout: made.layout, ...known && known.base !== made.base ? { other: known } : {} } })
    } catch (error) { setState({ error: error instanceof Error ? error.message : 'Couldn’t write the module file.' }) }
  }
  return <>
    <button type="button" className="button button-primary" disabled={!modules || state.busy} title={modules ? undefined : 'Add modules to your set first.'} onClick={() => void download()}><Icon name="download" size={16} />{state.busy ? 'Writing the file…' : 'Load from the card'}</button>
    {(state.written || state.error) && <CardSetDialog name={set?.name} written={state.written} error={state.error} notice={followNotice} onDownload={ids => { trackModuleDownloads(ids); followDownloads(ids, installedOnOctatrack(ids)) }} onInstall={onInstall} onClose={() => setState({})} />}
  </>
}

interface Written { file: Uint8Array; ids: string[]; base: string; layout: BaseLayout; other?: { base: string; from: 'unit' | 'download' } }

/** After the download: where the file goes, which base it is for, and a way to that base. */
function CardSetDialog({ name, written, error, notice, onDownload, onInstall, onClose }: { name?: string; written?: Written; error?: string; notice?: string; onDownload: (ids: string[]) => void; onInstall?: (layout: BaseLayout) => void; onClose: () => void }) {
  const [saved, setSaved] = useState(false), [problem, setProblem] = useState(''), [reading, setReading] = useState(false)
  async function download(retained?: File) {
    if (!written) return
    setReading(true); setProblem('')
    try {
      if (retained && retained.name.toUpperCase() !== CARD_RECOVERY_FILE) throw new Error('Choose ' + CARD_RECOVERY_FILE + ' from the top folder of this card.')
      const file = retained ? forCardImport(written.file, new Uint8Array(await retained.arrayBuffer())) : written.file
      save(file, CARD_SET_FILE); setSaved(true); onDownload(written.ids); noteSupportInstall()
    } catch (failure) { setProblem(failure instanceof Error ? failure.message : 'Couldn’t prepare the card file.') }
    finally { setReading(false) }
  }
  const dialog = useRef<HTMLDialogElement>(null), done = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element?.showModal(); done.current?.focus()
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  return <dialog ref={dialog} className="app-dialog card-set-dialog" aria-labelledby="card-set-dialog-title" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => event.stopPropagation()}>
    <header className="login-prompt-header">
      <h2 id="card-set-dialog-title">{written ? saved ? 'Put ' + CARD_SET_FILE + ' on the card' : 'Prepare the file for your card' : 'The module file couldn’t be written'}</h2>
      <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
    </header>
    {written ? <>
      {written.other && <div className="file-error card-set-mismatch" role="alert">
        <strong>This file is for another base</strong>
        <p>{written.other.from === 'unit' ? 'Your Octatrack last ran' : 'The base you last downloaded here is'} <b>{describeBase(written.other.base, written.base)}</b>. This file only loads on <b>{describeBase(written.base, written.other.base)}</b>; on any other base the Octatrack ignores it and starts without modules. Install that base first, then copy this file.</p>
      </div>}
      {saved ? <ol className="card-set-plan">
        <li><span aria-hidden="true">1</span><div><strong>Copy the file to the card</strong><p>Top folder, replacing the one there, named exactly {CARD_SET_FILE}: if your browser added a number to the name, take it out. Card reader or USB DISK MODE.</p></div></li>
        <li><span aria-hidden="true">2</span><div><strong>Switch the Octatrack off and on</strong><p>It reads the file when it starts.</p></div></li>
        <li><span aria-hidden="true">3</span><div><strong>Play</strong><p>{name ? <>It starts with the modules of <b>{name}</b>.</> : 'It starts with your modules.'}</p></div></li>
      </ol> : null}
      {saved ? <SupportLine /> : <fieldset disabled={reading}>
        <legend>Check the top folder of your card</legend>
        <p>If it contains <b>{CARD_RECOVERY_FILE}</b>, choose that file here. The download will load ahead of it, and the original stays on the card for recovery.</p>
        <label>Choose {CARD_RECOVERY_FILE} <input type="file" accept=".set" onChange={event => { const file = event.target.files?.[0]; if (file) void download(file) }} /></label>
        <p><button type="button" className="button button-quiet" onClick={() => void download()}>Download for a card without {CARD_RECOVERY_FILE}</button></p>
        {problem && <p className="file-error" role="alert">{problem}</p>}
      </fieldset>}
      <p className="card-set-base">Needs the Modwerk base <b title={written.base}>{baseName(written.base)}</b> ({layoutName(written.layout)}) on the Octatrack, the file <b>{firmwareFilename('base', written.base)}</b> installed with OS UPGRADE. On any other OS or base the Octatrack ignores this file.{notice && <> {notice}</>}</p>
    </> : <p className="file-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      {written && onInstall && <button type="button" className={'button ' + (written.other ? 'button-primary' : 'button-quiet')} onClick={() => { onClose(); onInstall(written.layout) }}><Icon name="download" size={16} />Install base {baseName(written.base)}</button>}
      <button ref={done} type="button" className={'button ' + (written?.other && onInstall ? 'button-quiet' : 'button-primary')} onClick={onClose}>{written ? 'Done' : 'Close'}</button>
    </div>
  </dialog>
}

/** Setup's section for it. */
export function CardSetDownload({ set, onInstall }: { set?: InventoryTarget; onInstall?: (layout: BaseLayout) => void }) {
  const modules = set?.moduleIds.filter(id => !comesWithBase(id)).length ?? 0
  return <section className="hub-section card-set" aria-labelledby="card-set-title">
    <h3 id="card-set-title">Load from the card</h3>
    <p>The same modules a USB sync installs, as one file ({CARD_SET_FILE}) your Octatrack reads when it starts. For when USB isn’t at hand: Firefox, Safari, an iPad, or an Octatrack that isn’t at the computer. It needs the Modwerk base on the Octatrack.</p>
    <p><CardSetButton set={set} onInstall={onInstall} /></p>
    {!modules && <p className="hub-empty">Add modules to your set first.</p>}
    <p className="link-hint">You copy the file to the top folder of the card and switch the Octatrack off and on{set ? <>; it then starts with the set <b>{set.name}</b></> : null}. The steps follow the download.</p>
  </section>
}
