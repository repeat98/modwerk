import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

// A permanent reminder on every page: mods are young, so take care before playing them on stage. It folds into a pill
// and opens on demand; it is never dismissed for good.
export function LiveUseNotice() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panelId = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <aside className="live-use-notice" ref={root} aria-label="Live use">
    <button ref={button} type="button" className="live-use-toggle" aria-expanded={open} aria-controls={panelId} aria-label="Playing live? Take care" onClick={() => setOpen(value => !value)}><Icon name="warn" size={16} /><span aria-hidden="true">Playing live? Take care</span></button>
    <section className="live-use-panel" id={panelId} hidden={!open}>
      <header><h2>Playing live with Modwerk</h2><button type="button" className="icon-button" aria-label="Close" onClick={() => { setOpen(false); button.current?.focus() }}><Icon name="close" size={18} /></button></header>
      <p>Mods are made by the community and are still young. One can crash, glitch or cut the sound in the middle of a set, and a power cycle is the quickest way back.</p>
      <ul>
        <li>Play your exact set at home before you take it on stage.</li>
        <li>Keep the official OS ready, so you can go back to it.</li>
        <li>When a show can’t go wrong, play it on the official OS.</li>
      </ul>
    </section>
  </aside>
}
