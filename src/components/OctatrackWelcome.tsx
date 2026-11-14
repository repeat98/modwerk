import { useRef } from 'react'
import { BaseDialogFrame, BaseIntro, StagePlan, type BasePromise } from './BaseDialogFrame'
import { LinkHero } from './LinkHero'
import { Icon } from './Icon'
import { BASE_RECOVERY_NOTICE } from '../firmware-notices'
import { CARD_SET_FILE } from '../engine/elekloader/card-set'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'

// Only what the base and the sync dialog do today (BaseInstallDialog's ALSO_NEW, LoadDialog).
const NEW: BasePromise[] = [
  ['wave', 'Modules over USB', ', no card and no restart', true],
  ['search', 'See what changes', ' before anything is sent'],
  ['download', 'Base updates over USB', ' after the first install'],
  ['check', 'Kept after a restart', ''],
]
// Two ways to load a module set once the base is on: a USB sync (LoadDialog) or the set as one file on the card
// (UnitPanel.tsx CardSetButton). Both stay in the steps; a browser without WebUSB is told so by `missing`.
const JOURNEY = [
  ['Install the base once', 'From the card, with your original OS file.'],
  ['Pick modules', 'From the library, into your module set.'],
  ['Sync over USB or the card', `Send them over USB from Chrome or Edge, or copy ${CARD_SET_FILE} to the card and restart.`],
] as const

/**
 * The welcome to modules over USB (useOctatrackWelcome decides when): what is new, the way there in three steps (both
 * ways to load modules: USB or a file on the card), what it needs, and the first step. Set up opens the base install
 * guide on Your Octatrack. A browser without WebUSB (`usbBrowser` false, or the link says unsupported) is told the
 * card is its way. `savedSets`: this browser has configurations from before.
 */
export function OctatrackWelcome({ link, usbBrowser, savedSets = false, onSetUp, onLater }: {
  link: OctatrackLink | null; usbBrowser: boolean; savedSets?: boolean; onSetUp: () => void; onLater: () => void
}) {
  const finished = useRef(false), { status } = useOctatrackLink(link), usb = usbBrowser && (!link || status !== 'unsupported')
  return <BaseDialogFrame intro canClose busy={false} focus="welcome" finishedRef={finished} onClose={onLater} footer={<>
    <div className="base-install-actions">
      <button type="button" className="button button-quiet" onClick={() => { finished.current = true; onLater() }}>Later</button>
      <button type="button" className="button button-primary" onClick={() => { finished.current = true; onSetUp() }}>Set up my Octatrack<Icon name="arrow" size={16} /></button>
    </div>
  </>}>
    <BaseIntro hero={<LinkHero label="USB" />} title="Modules now load over USB, for everyone" promises={NEW} beta={false}
      intro="Send modules to your Octatrack straight from this page. It takes one install of the Modwerk base."
      needs="You need your original OS 1.40C file and a CompactFlash card for the first install."
      missing={usb ? undefined : 'This browser can’t use USB, so modules go onto the card as a file. For USB sync, use Chrome or Edge on a computer.'} />
    <section className="base-install-stage" aria-labelledby="welcome-steps-title">
      <h3 id="welcome-steps-title">How it works</h3>
      <StagePlan stages={JOURNEY} progressLabel="How it works" />
      {savedSets && <p className="link-hint">Your saved configurations are here as module sets.</p>}
      <details className="base-install-recovery"><summary>Before you install</summary><p>{BASE_RECOVERY_NOTICE}</p></details>
      <p className="link-hint">No Octatrack? Close this and it won’t come back.</p>
    </section>
  </BaseDialogFrame>
}
