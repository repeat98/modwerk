import { useRef } from 'react'
import { BaseDialogFrame, BaseIntro, StagePlan, type BasePromise } from './BaseDialogFrame'
import { LinkHero } from './LinkHero'
import { Icon } from './Icon'
import { BASE_INSTALL_NEEDS, BASE_RECOVERY_NOTICE } from '../firmware-notices'
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
 * it needs, and the first step. Set up opens the base install guide on Your Octatrack. A browser without WebUSB
 * (`usbBrowser` false, or the link says unsupported) is told where USB works. `savedSets`: this browser has
 * configurations from before.
 */
export function OctatrackWelcome({ link, usbBrowser, savedSets = false, onSetUp, onLater }: {
  link: OctatrackLink | null; usbBrowser: boolean; savedSets?: boolean; onSetUp: () => void; onLater: () => void
}) {
  const finished = useRef(false), { status } = useOctatrackLink(link), usb = usbBrowser && (!link || status !== 'unsupported')
  return <BaseDialogFrame intro canClose busy={false} focus="welcome" finishedRef={finished} onClose={onLater} footer={<>
    <div className="base-install-actions">
      <button type="button" className="button button-quiet" onClick={() => { finished.current = true; onLater() }}>Later</button>
      {usb && <button type="button" className="button button-primary" onClick={() => { finished.current = true; onSetUp() }}>Set up my Octatrack<Icon name="arrow" size={16} /></button>}
    </div>
  </>}>
    <BaseIntro hero={<LinkHero label="USB" />} title="Modules now load over USB, for everyone" promises={NEW} beta={false} needs={BASE_INSTALL_NEEDS}
      intro="Send modules to your Octatrack straight from this page. It takes one install of the Modwerk base."
      missing={usb ? undefined : 'This browser can’t use USB. Open Modwerk in Chrome or Edge on a computer to install the base and sync modules over USB.'} />
    <section className="base-install-stage" aria-labelledby="welcome-steps-title">
      <h3 id="welcome-steps-title">How it works</h3>
      <StagePlan stages={JOURNEY} progressLabel="How it works" />
      <p className="link-hint">Later base updates go over USB.</p>
      {savedSets && <p className="base-install-note">Your saved configurations are here as module sets.</p>}
      <details className="base-install-recovery"><summary>Before you install</summary><p>{BASE_RECOVERY_NOTICE}</p></details>
      <p className="link-hint">No Octatrack? Close this and it won’t come back.</p>
    </section>
  </BaseDialogFrame>
}
