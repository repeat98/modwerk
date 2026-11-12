import { useState } from 'react'
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
 * runs the base; restored from a site-written file on the owner's MKII on the released base that day. */
export function CardSetDownload({ set }: { set?: InventoryTarget }) {
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
  return <section className="hub-section card-set" aria-labelledby="card-set-title">
    <h3 id="card-set-title">Load from the card</h3>
    <p>The same modules a USB sync installs, as one file your Octatrack reads when it starts. For when USB isn’t at hand: Firefox, Safari, an iPad, or an Octatrack that isn’t at the computer. It needs the Modwerk base on the Octatrack.</p>
    <p><button type="button" className="button button-quiet" disabled={!modules || state.busy} onClick={() => void download()}><Icon name="download" size={16} />{state.busy ? 'Writing the file…' : 'Download ' + CARD_SET_FILE}</button></p>
    {!modules && <p className="hub-empty">Add modules to your set first.</p>}
    <ol className="card-set-steps">
      <li>Copy <b>{CARD_SET_FILE}</b> to the top folder of the card, replacing the one there. Use a card reader, or USB DISK MODE on the Octatrack.</li>
      <li>Switch the Octatrack off and on.</li>
      <li>It starts with the modules in the file{set ? <>, the set <b>{set.name}</b></> : null}. They replace the modules it kept before.</li>
    </ol>
    {state.written && <p className="link-hint" role="status">Written for the Modwerk base <code>{state.written.base.slice(0, 8)}</code> ({layoutName(state.written.layout)}). An Octatrack on another base ignores the file; Modwerk base, above, shows which one yours runs.</p>}
    {state.error && <p className="file-error" role="alert">{state.error}</p>}
  </section>
}
