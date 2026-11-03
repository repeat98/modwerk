import { useEffect } from 'react'
import { modulesToPutBack, type Inventory, type LastSeen } from '../config/inventory'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackHealth } from '../hooks/useOctatrackHealth'
import { useOctatrackLink } from '../hooks/useOctatrackLink'

const OFFERED = 'modwerk.octatrack.put-back'
let offeredHere = ''
/** True the first time for each base in this browser (once per visit without storage). */
function firstOffer(base: string) {
  let seen = offeredHere
  try { seen = localStorage.getItem(OFFERED) ?? seen; localStorage.setItem(OFFERED, base) } catch { /* this visit only */ }
  offeredHere = base
  return seen !== base
}

/** A base change leaves the unit without its modules (modulesToPutBack): offers their sync once per base, once no
 * other dialog is open. Renders nothing; the link's state re-renders only this, not the app. */
export function PutBackModules({ link, inventory, waiting, onPutBack }: { link: OctatrackLink; inventory?: Inventory; waiting: boolean; onPutBack: (last: LastSeen) => void }) {
  const base = useOctatrackLink(link).identity?.base, saved = useOctatrackHealth(link)?.saved
  useEffect(() => {
    const last = base && !waiting ? modulesToPutBack(base, saved, inventory) : undefined
    if (base && last && firstOffer(base)) onPutBack(last)
  }, [base, saved, inventory, waiting, onPutBack])
  return null
}
