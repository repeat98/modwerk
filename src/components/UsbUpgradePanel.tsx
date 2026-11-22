// SPDX-License-Identifier: GPL-3.0-or-later
// Install a verified build on the unit over USB from this page (useUsbUpgrade): the same risk and recovery ticks as a
// download, then the upload with its progress, then what to press on the unit.
import { useState } from 'react'
import { FLASHING_RISKS } from '../firmware-notices'
import { useUsbUpgrade, type MidiAccessRequest } from '../hooks/useUsbUpgrade'
import { RecoveryNotice } from './RecoveryNotice'
import type { RecoveryMachine } from './recovery-faq'
import { Icon } from './Icon'

export function UsbUpgradePanel({ machine, name, syx, sha256, version, recovery, riskAccepted, midi }: {
  machine: RecoveryMachine; name: string; syx: Uint8Array; sha256: string; version: string; recovery?: string; riskAccepted: boolean; midi?: MidiAccessRequest
}) {
  const { state, send } = useUsbUpgrade(name, sha256, midi)
  const [recoveryKnown, setRecoveryKnown] = useState('')
  const knowsRecovery = recoveryKnown === sha256
  const busy = state.phase === 'connecting' || state.phase === 'sending'
  const percent = state.phase === 'sending' ? Math.round(state.sent / state.total * 100) : 0
  return <section className="configuration-section install-guide" aria-labelledby="usb-upgrade-title" aria-busy={busy}>
    <div className="section-title"><h2 id="usb-upgrade-title">Install on your {name} over USB</h2><span className="pill">beta</span></div>
    <ol><li>Connect the {name} over USB and close Elektron Transfer and any other MIDI program.</li><li>Send the build. The browser asks once to allow MIDI with SysEx.</li><li>When the upload is complete the unit asks UPGRADE OS NOW?: press YES to install, or NO to keep the OS it runs.</li></ol>
    <RecoveryNotice machine={machine} steps={recovery} checked={knowsRecovery} onChange={checked => setRecoveryKnown(checked ? sha256 : '')} />
    <p className="service-note">{FLASHING_RISKS} Flash at your own risk. Local checks cannot guarantee hardware safety.</p>
    <div className="build-actions">
      <button className="button button-primary" disabled={!riskAccepted || !knowsRecovery || busy} onClick={() => void send(syx, sha256)}>
        <Icon name="download" size={16} />{busy ? 'Sending…' : state.phase === 'confirm' || state.phase === 'failed' ? 'Send again' : 'Send ' + version + ' to the ' + name}
      </button>
    </div>
    {state.phase === 'connecting' && <p role="status">Looking for the {name}…</p>}
    {state.phase === 'sending' && <p role="status"><progress max={state.total} value={state.sent} aria-label="Upload" /> {percent} % · block {state.sent} of {state.total}. Keep the cable connected.</p>}
    {state.phase === 'confirm' && <p className="success-note" role="status">Upload complete in {state.seconds.toFixed(1)} s. The {name} now asks UPGRADE OS NOW?: press YES to install and keep it powered until it restarts, or NO to keep its OS.</p>}
    {state.phase === 'failed' && <p className="risk-note" role="alert">{state.error}</p>}
  </section>
}
