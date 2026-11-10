import { useEffect, useRef, useState } from 'react'
import { useSetWords } from '../community/beta-ui'
export function ConfigurationDialog({ mode, initialName, onSubmit, onClose }: { mode: 'create' | 'rename' | 'duplicate' | 'delete'; initialName: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const w = useSetWords()
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  const title = mode === 'create' ? 'New ' + w.set : mode === 'rename' ? 'Rename ' + w.set : mode === 'duplicate' ? 'Duplicate ' + w.set : 'Delete ' + w.set + '?'
  return <dialog ref={dialog} className="app-dialog" onCancel={onClose} aria-labelledby="dialog-title"><form onSubmit={event => { event.preventDefault(); try { onSubmit(name); onClose() } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save.') } }}>
    <h2 id="dialog-title">{title}</h2>
    {mode === 'delete' ? <p>“{initialName}” will be removed from this device. Your base firmware and other configurations will stay.</p> : <label>{w.Set + ' name'}<input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={80} required placeholder="e.g. Live set, Studio, Ambient" /></label>}
    {error && <p className="file-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className={'button ' + (mode === 'delete' ? 'button-danger' : 'button-primary')} type="submit">{mode === 'delete' ? 'Delete ' + w.set : mode === 'rename' ? 'Save name' : 'Create ' + w.set}</button></div>
  </form></dialog>
}
