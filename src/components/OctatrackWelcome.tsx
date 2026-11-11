import { useRef } from 'react'
import { BaseDialogFrame, BaseIntro, StagePlan, type BasePromise } from './BaseDialogFrame'
import { LinkHero } from './LinkHero'
import { Icon } from './Icon'
import { BASE_INSTALL_NEEDS, BASE_RECOVERY_NOTICE } from '../firmware-notices'
import { cardInsteadReason } from '../catalog/library-compatibility'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'

// Only what the base and the sync dialog do today (BaseInstallDialog's ALSO_NEW, LoadDialog).
const NEW: BasePromise[] = [
  ['wave', 'Modules over USB', ': add and remove them from this page, without the card and without a restart.', true],
  ['search', 'See what changes first', ': each sync lists what it adds, removes and updates before anything is sent.'],
  ['download', 'Base updates over USB', ': after the first install, new versions of the base arrive over USB too.'],
  ['check', 'Kept after a restart', ': the Octatrack loads your modules again when it starts.'],
]
const JOURNEY = [
  ['Install the base once', 'The first install goes through the card: the original OS has no USB link for Modwerk.'],
  ['Connect over USB', 'Plug in your Octatrack and choose it in Chrome or Edge.'],
  ['Pick modules and sync', 'Add modules from the library, then sync your module set to the Octatrack.'],
] as const

/**
 * The welcome to modules over USB (useOctatrackWelcome decides when): what is new, the way there in three steps, what
 * it needs, and the first step. Set up opens the base install guide on Your Octatrack; the card route stays one click
 * away, and is the main one in a browser without WebUSB (`usbBrowser` false, or the link says unsupported). `phone`: the
 * card build needs a computer, so there is no card button. `savedSets`: this browser has configurations from before.
 */
export function OctatrackWelcome({ link, usbBrowser, phone = false, savedSets = false, onSetUp, onCard, onLater }: {
  link: OctatrackLink | null; usbBrowser: boolean; phone?: boolean; savedSets?: boolean; onSetUp: () => void; onCard: () => void; onLater: () => void
}) {
  const finished = useRef(false), { status } = useOctatrackLink(link), usb = usbBrowser && (!link || status !== 'unsupported')
  const card = !phone && <button type="button" className={'button ' + (usb ? 'button-quiet' : 'button-primary')} onClick={() => { finished.current = true; onCard() }}>{usb ? 'Build card firmware instead' : 'Build card firmware'}</button>
  return <BaseDialogFrame canClose busy={false} focus="welcome" finishedRef={finished} onClose={onLater} footer={<>
    {usb && !phone && <p className="link-hint">{cardInsteadReason()}</p>}
    <div className="base-install-actions">
      <button type="button" className="button button-quiet" onClick={() => { finished.current = true; onLater() }}>Later</button>
      {card}
      {usb && <button type="button" className="button button-primary" onClick={() => { finished.current = true; onSetUp() }}>Set up my Octatrack<Icon name="arrow" size={16} /></button>}
    </div>
  </>}>
    <BaseIntro hero={<LinkHero label="USB" />} title="Modules now load over USB, for everyone" promises={NEW} beta={false} needs={BASE_INSTALL_NEEDS}
      intro="Send modules to your Octatrack straight from this page. It takes one install of the Modwerk base."
      missing={usb ? undefined : phone ? 'This browser can’t use USB. Open Modwerk in Chrome or Edge on a computer to install the base and sync modules over USB.'
        : 'This browser can’t use USB. Open Modwerk in Chrome or Edge on a computer to install the base and sync modules over USB, or build card firmware here instead.'} />
    <section className="base-install-stage" aria-labelledby="welcome-steps-title">
      <h3 id="welcome-steps-title">How it works</h3>
      <StagePlan stages={JOURNEY} progressLabel="How it works" />
      <p className="link-hint">Later base updates go over USB.</p>
      {savedSets && <p className="base-install-note">Your saved configurations are here as module sets, and card firmware is still there as the fallback.</p>}
      <details className="base-install-recovery"><summary>Before you install</summary><p>{BASE_RECOVERY_NOTICE}</p></details>
    </section>
  </BaseDialogFrame>
}
