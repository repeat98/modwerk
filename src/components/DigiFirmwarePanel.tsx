import { useRef, useState } from 'react'
import { Icon } from './Icon'
import type { useDigiFirmware } from '../hooks/useDigiFirmware'

export function DigiFirmwarePanel({ name, releases, firmware }: { name: string; releases: string[]; firmware: ReturnType<typeof useDigiFirmware> }) {
  const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false), [selectionError, setSelectionError] = useState<string>()
  const busy = firmware.state === 'reading' || firmware.state === 'restoring', inspection = firmware.firmware
  function choose(files: FileList | null) {
    if (busy || !files?.length) return
    if (files.length !== 1) { setSelectionError('Choose one original OS file at a time.'); return }
    setSelectionError(undefined)
    void firmware.inspect(files[0])
  }
  return <>
    <input ref={input} type="file" accept=".syx" aria-label={'Choose original ' + name + ' firmware'} hidden disabled={busy} onChange={event => { choose(event.target.files); event.target.value = '' }} />
    <div className={'firmware-drop ' + (dragging ? 'is-dragging ' : '') + (inspection ? 'is-verified' : '')} aria-busy={busy}
      onDragOver={event => event.preventDefault()} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files) }}>
      <span className="file-symbol"><Icon name={inspection ? 'check' : 'file'} size={26} /></span>
      <div className="file-copy" aria-live="polite"><strong>{busy ? firmware.state === 'restoring' ? 'Checking saved firmware…' : 'Checking your firmware…' : inspection?.name ?? 'Original ' + name + ' OS ' + releases.join(' or ')}</strong>
        <span>{inspection ? 'OS ' + inspection.release + ' · SHA-256 verified · ' + (inspection.bytes / 1024).toFixed(0) + ' KB' : 'Drop your extracted .syx here, or choose it from your device.'}</span></div>
      <button className="button button-quiet" disabled={busy} onClick={() => input.current?.click()}>{inspection ? 'Change file' : 'Choose file'}</button>
    </div>
    {(selectionError || firmware.error) && <p className="file-error" role="alert">{selectionError || firmware.error}</p>}
    {firmware.storageError && <p className="file-error" role="status">{firmware.storageError}</p>}
    <div className="file-footnote"><span>{inspection ? firmware.saved ? 'Saved on this device and verified again each time you return.' : 'Verified for this session.' : 'Saved in this browser after verification. Never uploaded.'}</span>
      {(inspection || busy || firmware.storageError) && <button className="text-button" onClick={() => void firmware.remove()}>Remove from device</button>}</div>
    <p className="firmware-help"><a href="#faq/base-firmware">Where do I get the .syx? Read the FAQ <Icon name="arrow" size={14}/></a></p>
  </>
}
