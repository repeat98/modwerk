import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { DeviceImage } from './DeviceImage'
import { useSheetScrollLock } from '../hooks/useSheetScrollLock'
import { useSheetFocus } from '../hooks/useSheetFocus'
import { ALL_MACHINES, DEVICES, STATUS_LABELS, deviceHref, type DeviceProfile } from './registry'

const hasMods = (device: DeviceProfile) => device.status === 'available' || device.status === 'preview'
// The Zoom MultiStomp pedals and the Erica Synths machines each stay together as one family, whatever their status.
const GROUPS = [
  { title: 'Mods available', match: (device: DeviceProfile) => device.family === 'elektron' && hasMods(device) },
  { title: 'No mods yet', match: (device: DeviceProfile) => device.family === 'elektron' && !hasMods(device) },
  { title: 'Zoom MultiStomp', match: (device: DeviceProfile) => device.family === 'zoom' },
  { title: 'Erica Synths', match: (device: DeviceProfile) => device.family === 'erica' },
]

type MachineSwitcherProps = { current: DeviceProfile; all: boolean; counts: Record<string, number>; compact?: boolean; active?: boolean }

// The library's machine menu, at the start of its filter row (on phones, pinned before the category chips, picture only):
// switching swaps the library, its counts and the build panel.
export function MachineSwitcher({ current, all, counts, compact = false, active = false }: MachineSwitcherProps) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useSheetScrollLock(open && compact)
  useSheetFocus(open && compact, panelRef, buttonRef, '[aria-current="true"]')
  useEffect(() => {
    if (!open) return
    const selected = panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? panelRef.current?.querySelector<HTMLElement>('a')
    selected?.focus()
    const close = () => setOpen(false)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    const onPointer = (event: PointerEvent) => { if (!panelRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('hashchange', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    if (compact) window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('hashchange', close); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer)
      if (compact) window.removeEventListener('resize', close)
    }
  }, [open, compact])
  function toggleMenu() { setOpen(value => !value) }
  function selectMachine() { setOpen(false); buttonRef.current?.focus() }
  function moveFocus(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a') ?? [])
    const index = links.indexOf(document.activeElement as HTMLElement)
    const next = index < 0 ? event.key === 'ArrowDown' ? 0 : links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length
    links[next]?.focus()
    event.preventDefault()
  }
  // The phone chip row scrolls horizontally and clips; its menu renders in the body as a bottom sheet.
  const menu = <div ref={panelRef} id={panelId} className={'machine-menu' + (compact ? ' library-machine-menu' : '')} role={compact ? 'dialog' : 'navigation'} aria-modal={compact ? true : undefined} aria-label="Machines" tabIndex={-1} onKeyDown={moveFocus}>
    {compact && <div className="sheet-head"><span className="sheet-handle" aria-hidden="true" /><strong>Machine</strong><button type="button" className="sheet-close" aria-label="Close" onClick={() => { setOpen(false); buttonRef.current?.focus() }}><Icon name="close" size={18} /></button></div>}
    <div className="machine-menu-group">
      <a href={deviceHref(ALL_MACHINES)} aria-current={all ? 'true' : undefined} onClick={selectMachine}><AllMachinesArt /><span><strong>{compact ? 'All mods' : 'All machines'}</strong><small>All mods in one library</small></span><small className="machine-menu-count">{total}</small>{all && <Icon name="check" size={14} />}</a>
    </div>
    {GROUPS.map(group => <div key={group.title} className="machine-menu-group">
      <div className="machine-menu-label">{group.title}</div>
      {DEVICES.filter(group.match).map(device => <a key={device.id} href={deviceHref(device.id)} aria-current={!all && device.id === current.id ? 'true' : undefined} onClick={selectMachine}>
        <DeviceImage device={device} />
        <span><strong>{device.name}</strong><small>{device.variants?.join(' · ') ?? STATUS_LABELS[device.status]}</small></span>
        {counts[device.id] ? <small className="machine-menu-count">{counts[device.id]}</small> : null}
        {!all && device.id === current.id && <Icon name="check" size={14} />}
      </a>)}
    </div>)}
  </div>
  return (
    <div className={compact ? 'library-machine-switcher' : 'machine-switcher'}>
      <button ref={buttonRef} type="button" className={compact ? 'library-machine-button' + (active ? ' active' : '') : 'sidebar-device'} aria-label={compact ? (all ? 'All mods' : current.name) + ', choose machine' : undefined} aria-current={compact && active ? 'page' : undefined} aria-haspopup={compact ? 'dialog' : undefined} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={toggleMenu} onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); toggleMenu() } }}>
        {all ? <AllMachinesArt /> : <DeviceImage device={current} eager />}
        {!compact && <span><small>Machine</small><strong>{all ? 'All machines' : current.name}</strong></span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open && (compact ? createPortal(<><div className="sheet-scrim" aria-hidden="true" />{menu}</>, document.body) : menu)}
    </div>
  )
}

// Three small boxes: the All machines entry's own mark.
function AllMachinesArt() {
  return <svg className="device-art all-machines-art" viewBox="0 0 240 160" fill="none" aria-hidden="true">
    <rect className="device-body" x="18" y="58" width="96" height="62" rx="6" /><rect className="device-body" x="126" y="58" width="96" height="62" rx="6" /><rect className="device-body" x="72" y="22" width="96" height="62" rx="6" />
    <rect className="device-screen" x="82" y="32" width="30" height="16" rx="2" /><rect className="device-screen" x="28" y="68" width="30" height="16" rx="2" /><rect className="device-screen" x="136" y="68" width="30" height="16" rx="2" />
  </svg>
}
