import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { cardFallbackReason } from '../catalog/library-compatibility'
import { OctatrackLinkContext, useOctatrackLink } from '../hooks/useOctatrackLink'
import './octatrack-link.css'

/** The card route of the Octatrack page's Setup (base OS file, checks, the .bin): the classic whole-image build, labelled
 * as the fallback. Folded away where this browser can use USB, unless the guided sync sends people here (`open`, which
 * also scrolls to it); open where it can't. */
export function CardInstall({ open = false, onOpened, setName, children }: { open?: boolean; onOpened?: () => void; setName?: string; children: ReactNode }) {
  const section = useRef<HTMLDetailsElement>(null)
  const link = useContext(OctatrackLinkContext), { status } = useOctatrackLink(link), usb = !!link && status !== 'unsupported'
  const [expanded, setExpanded] = useState(open || !usb)
  if ((open || !usb) && !expanded) setExpanded(true)
  useEffect(() => {
    if (!open) return
    section.current?.scrollIntoView({ block: 'start' })
    onOpened?.()
  }, [open, onOpened])
  return <details ref={section} className="card-install is-open" aria-labelledby="card-install-title" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><h3 id="card-install-title">Card firmware without the base <span className="card-fallback-label">Fallback</span></h3></summary>
    <p className="card-fallback-reason">{cardFallbackReason()}</p>
    {setName && <p className="card-install-set">This builds <b>{setName}</b>, the module set you’re editing, into a firmware file for the card.</p>}
    {children}
  </details>
}
