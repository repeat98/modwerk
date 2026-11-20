import { useCallback, useEffect, useId, useRef, useState, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { DEFAULT_MODULE_SORT, DOWNLOAD_PERIODS, downloadPeriod, MODULE_SORTS, sortOption as sortOptionFor } from '../community/module-statistics'
import { useSheetScrollLock } from '../hooks/useSheetScrollLock'
import { useSheetFocus } from '../hooks/useSheetFocus'

type SheetOption = { value: string; label: string; count?: number }

export type LibraryResultsBarProps = {
  summary: string
  sort: string
  onSortChange: (value: string) => void
  family: string
  onFamilyChange: (value: string) => void
  // The types present in the current view, each counted as if it were chosen.
  families: readonly { value: string; count: number }[]
  allCount: number
  disabled?: boolean
}

// Phones: the line under the category chips. It sticks with them, so sort and type stay in reach while scrolling;
// each opens a bottom sheet that applies the choice and closes.
export function LibraryResultsBar({ summary, sort, onSortChange, family, onFamilyChange, families, allCount, disabled = false }: LibraryResultsBarProps) {
  const [open, setOpen] = useState<'sort' | 'type' | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const sheetId = useId()
  const sortOption = sortOptionFor(sort), period = DOWNLOAD_PERIODS.find(option => option.value === sort)
  const sortShort = period && period.days ? sortOption.short + ' · ' + period.short : sortOption.short
  const close = useCallback(() => { setOpen(null); trigger.current?.focus() }, [])
  function show(sheet: 'sort' | 'type', button: HTMLButtonElement) { trigger.current = button; setOpen(sheet) }
  const typeOptions: SheetOption[] = [
    { value: 'all', label: 'All types', count: allCount },
    ...[...families].sort((a, b) => a.value.localeCompare(b.value)).map(option => ({ ...option, label: option.value })),
  ]
  return <div className="library-results-bar">
    <span className="library-results-summary" aria-live="polite">{summary}</span>
    {!disabled && <>
      <button type="button" className={'library-results-button' + (sort !== DEFAULT_MODULE_SORT ? ' is-set' : '')} aria-label={'Sort: ' + sortOption.label + (period ? ', ' + period.label.toLowerCase() : '')} aria-haspopup="dialog" aria-expanded={open === 'sort'} aria-controls={open === 'sort' ? sheetId : undefined} onClick={event => show('sort', event.currentTarget)}><Icon name="sort" size={15} /><span>{sortShort}</span></button>
      <button type="button" className={'library-results-button' + (family !== 'all' ? ' is-set' : '')} aria-label={'Type: ' + (family === 'all' ? 'all types' : family)} aria-haspopup="dialog" aria-expanded={open === 'type'} aria-controls={open === 'type' ? sheetId : undefined} onClick={event => show('type', event.currentTarget)}><Icon name="filter" size={15} /><span>{family === 'all' ? 'Type' : family}</span></button>
    </>}
    {open && <OptionSheet trigger={trigger} id={sheetId} title={open === 'sort' ? 'Sort by' : 'Type'} options={open === 'sort' ? MODULE_SORTS : typeOptions} value={open === 'sort' ? sortOption.value : family} onClose={close}
      periods={open === 'sort' ? sort : undefined}
      onChoose={value => { if (open === 'sort') onSortChange(value); else onFamilyChange(value); close() }} />}
  </div>
}

// periods: the sort sheet's current sort. Its download periods sit under the sorts, and a tap on one sorts by
// downloads over that period.
function OptionSheet({ trigger, id, title, options, value, periods, onChoose, onClose }: { trigger: RefObject<HTMLButtonElement | null>; id: string; title: string; options: readonly SheetOption[]; value: string; periods?: string; onChoose: (value: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useSheetScrollLock(true)
  useSheetFocus(true, panel, trigger, '[aria-pressed="true"]')
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onClose)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onClose) }
  }, [onClose])
  function moveFocus(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLElement>('.library-sheet-options button, .library-sheet-periods button') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    const next = index < 0 ? event.key === 'ArrowDown' ? 0 : buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
    buttons[next]?.focus()
    event.preventDefault()
  }
  return createPortal(<>
    {/* A tap on the scrim closes the sheet without reaching the page behind it. */}
    <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
    <div ref={panel} id={id} className="library-filter-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={moveFocus}>
      <div className="sheet-head"><span className="sheet-handle" aria-hidden="true" /><strong id={titleId}>{title}</strong><button type="button" className="sheet-close" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button></div>
      <div className="library-sheet-options">
        {options.map(option => <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChoose(option.value)}>
          <span>{option.label}</span>
          {option.count !== undefined && <small>{option.count}</small>}
          {option.value === value && <Icon name="check" size={16} />}
        </button>)}
      </div>
      {periods !== undefined && <div className="library-sheet-periods" role="group" aria-labelledby={titleId + '-periods'}>
        <span id={titleId + '-periods'}>Most downloaded over</span>
        <div>{DOWNLOAD_PERIODS.map(period => <button key={period.value} type="button" aria-pressed={downloadPeriod(periods) !== undefined && period.value === periods} onClick={() => onChoose(period.value)}>{period.short}</button>)}</div>
      </div>}
    </div>
  </>, document.body)
}
