import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { localSamples, sampleSize, sampleTree, type LocalSample, type SampleFolder } from '../config/sample-preview'
import './octatrack-samples.css'

function Folder({ folder, selected, onSelect }: { folder: SampleFolder; selected?: string; onSelect: (sample: LocalSample) => void }) {
  return <ul className="samples-tree">
    {folder.folders.map(child => <li key={child.name}><details open><summary>{child.name}</summary><Folder folder={child} selected={selected} onSelect={onSelect} /></details></li>)}
    {folder.samples.map(sample => <li key={sample.id}><button type="button" aria-pressed={sample.id === selected} onClick={() => onSelect(sample)}><span>{sample.file.name}</span><small>{sampleSize(sample.file.size)}</small></button></li>)}
  </ul>
}

function Preview({ sample, active }: { sample: LocalSample; active: boolean }) {
  const [error, setError] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const attach = useCallback((element: HTMLAudioElement | null) => {
    if (!element) return
    audio.current = element
    const url = URL.createObjectURL(sample.file)
    element.src = url
    return () => { audio.current = null; element.pause(); element.removeAttribute('src'); URL.revokeObjectURL(url) }
  }, [sample.file])
  useEffect(() => { if (!active) audio.current?.pause() }, [active])
  return <section className="samples-preview" aria-label="Selected sample preview">
    <strong>{sample.file.name}</strong><p>{sample.path} · {sampleSize(sample.file.size)}</p>
    <audio ref={attach} controls preload="metadata" aria-label={`Preview ${sample.file.name}`} onError={() => setError(true)} />
    {error && <p role="status">This browser can’t preview this format. Your file is unchanged.</p>}
  </section>
}

/** Frontend-only workspace, a work in progress. Does not require or access an Octatrack connection. */
export function OctatrackSamples({ active = true }: { active?: boolean }) {
  const [samples, setSamples] = useState<LocalSample[]>([]), [selected, setSelected] = useState<LocalSample>(), [notice, setNotice] = useState('')
  const files = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null)
  function add(input: Iterable<File>) {
    const received = [...input], next = localSamples(received)
    setSamples(previous => [...new Map([...previous, ...next].map(sample => [sample.id, sample])).values()])
    setNotice(`${next.length} audio file${next.length === 1 ? '' : 's'} added locally.${received.length > next.length ? ' Other files or duplicate selections were skipped.' : ''}`)
  }
  function choose(event: ChangeEvent<HTMLInputElement>) { add(event.target.files ?? []); event.target.value = '' }
  function drop(event: DragEvent) { event.preventDefault(); add(event.dataTransfer.files) }
  return <section className="octatrack-samples" aria-labelledby="samples-title">
    <header><div><h2 id="samples-title">Samples <span className="samples-wip">Work in progress</span></h2><p>Organize and preview a local selection. Octatrack transfer is still in development.</p></div></header>
    <div className="samples-drop" onDragOver={event => event.preventDefault()} onDrop={drop}>
      <p>Drop audio files here, or choose files or a folder.</p>
      <div className="samples-actions"><button type="button" className="button button-quiet" onClick={() => files.current?.click()}>Choose files</button><button type="button" className="button button-quiet" onClick={() => folder.current?.click()}>Choose folder</button></div>
      <input ref={files} type="file" multiple accept="audio/*,.wav,.aif,.aiff,.flac" onChange={choose} hidden aria-label="Choose sample files" />
      <input ref={element => { folder.current = element; element?.setAttribute('webkitdirectory', '') }} type="file" multiple onChange={choose} hidden aria-label="Choose sample folder" />
    </div>
    <p className="samples-local-note">Files stay in this browser tab. Nothing is uploaded, written to disk or sent to your Octatrack. No USB connection is needed.</p>
    <p role="status" className="samples-notice">{notice}</p>
    {samples.length > 0 && <div className="samples-workspace"><div><div className="samples-list-head"><strong>{samples.length} sample{samples.length === 1 ? '' : 's'}</strong><button type="button" className="button button-quiet" onClick={() => { setSamples([]); setSelected(undefined); setNotice('Local selection cleared. Your files are unchanged.') }}>Clear selection</button></div><Folder folder={sampleTree(samples)} selected={selected?.id} onSelect={setSelected} /></div>{selected ? <Preview key={selected.id} sample={selected} active={active} /> : <p className="samples-preview">Select a sample to preview it.</p>}</div>}
  </section>
}
