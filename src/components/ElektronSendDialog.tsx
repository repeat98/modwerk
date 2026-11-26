// SPDX-License-Identifier: GPL-3.0-or-later
// Sending a build from the page to an Elektron unit over USB, in the shared base dialog frame (BaseDialogFrame): the
// stock OS upgrade, then the unit's own UPGRADE OS NOW?, which only a person at the unit answers. The engine is
// usb-upgrade.ts; `request` is a seam for tests.
import { useRef, useState } from 'react'
import { browserMidi, sendOverUsb } from '../engine/elektron/usb-upgrade'
import type { MidiAccessLike } from '../engine/elektron/os-upgrade-midi'
import { BaseDialogFrame, StagePlan } from './BaseDialogFrame'
import { Icon } from './Icon'

const STEPS = [
  ['Connect', 'Allow MIDI when the browser asks. The page looks for your unit on USB.'],
  ['Send', 'The build goes over USB, block by block. Nothing is written yet.'],
  ['Confirm on the unit', 'The unit asks UPGRADE OS NOW?. YES installs the build; NO keeps the OS it runs.'],
] as const

export function ElektronSendDialog({ name, model, file, recovery, onClose, request = browserMidi() }: {
  name: string
  model: string
  file: { name: string; data: ArrayBuffer }
  recovery?: string
  onClose: () => void
  request?: (() => Promise<MidiAccessLike>) | null
}) {
  const finished = useRef(false)
  const [run, setRun] = useState<{ at: number; fraction?: number; done?: boolean; error?: string } | null>(null)
  const sending = !!run && !run.done && !run.error
  async function send() {
    setRun({ at: 0 })
    let at = 0
    try {
      await sendOverUsb(request!, model, new Uint8Array(file.data), ({ sent, total }) => { at = 1; setRun({ at: 1, fraction: sent / total }) })
      setRun({ at: 2, done: true })
    } catch (error) { setRun({ at, error: (error as Error).message }) }
  }
  const close = () => { finished.current = true; onClose() }
  const footer = <>
    <button type="button" className="button button-quiet" disabled={sending} onClick={close}>{run?.done ? 'Done' : 'Close'}</button>
    {!run?.done && <button type="button" className="button button-primary" disabled={sending || !request} onClick={() => void send()}><Icon name="arrow" size={16} />{run?.error ? 'Try again' : sending ? 'Sending…' : 'Send to your ' + name}</button>}
  </>
  return <BaseDialogFrame canClose={!sending} busy={sending} focus={String(run?.at ?? 'start') + (run?.done ? 'done' : '')} finishedRef={finished} onClose={onClose} footer={footer}>
    <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>Send to your {name} <span className="module-beta-badge">Beta</span></h2></header>
    <p id="base-install-intro" className="base-install-intro">{file.name}, over USB as an OS update. Close Elektron Transfer first, and connect one {name}.</p>
    <section className="base-install-stage" aria-labelledby="base-stage-title">
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>{run?.done ? 'Press YES on the unit' : 'Over USB'}</h3>
      <StagePlan stages={STEPS} progressLabel="Send progress" run={run ? { at: run.at, done: run.done, failed: !!run.error, fraction: run.fraction } : undefined} />
      {!request && <p className="file-error" role="alert">This browser can’t use MIDI. Open this page in Chrome or Edge on a computer.</p>}
      {sending && <p className="base-install-warning" role="status"><span className="status-dot is-updating" />Don’t unplug the {name} or close this page until it’s sent.</p>}
      {run?.done && <p className="success-note" role="status"><Icon name="check" size={16} /> Your {name} has the build. It asks UPGRADE OS NOW?: press YES to install it, and keep it powered until it restarts.</p>}
      {run?.error && <div className="file-error base-update-error" role="alert"><strong>Sending stopped.</strong><p>{run.error}</p></div>}
      {recovery && <details className="base-install-recovery"><summary>If it won’t start</summary><p>{recovery}</p></details>}
    </section>
  </BaseDialogFrame>
}
