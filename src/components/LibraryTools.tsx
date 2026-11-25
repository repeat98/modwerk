import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import type { ReactNode } from 'react'
import { useActionsMenu } from '../hooks/useActionsMenu'
import { Icon } from './Icon'
import { DOWNLOAD_PERIODS, downloadPeriod, MODULE_SORTS, sortOption } from '../community/module-statistics'
import { useOctatrackBase } from '../hooks/useOctatrackLink'
import { MODULE_COMPARE_ENABLED } from './module-compare'

export type LibraryToolsProps = {
  family: string
  families: string[]
  onFamilyChange: (value: string) => void
  sort: string
  onSortChange: (value: string) => void
  comparisonCount: number
  onCompare: () => void
  buildHref?: string | null
  buildLabel?: string
  machine?: ReactNode
  categoryNav?: ReactNode
  categoryLabel?: string
  disabled?: boolean
  // false on machines with nowhere to take a set yet (Zoom pedals without the zdl platform).
  build?: boolean
  // The button's text where it opens the machine's own page (a Zoom pedal's: Your MS-70CDR).
  buildText?: string
}

export function LibraryTools({ family, families, onFamilyChange, sort, onSortChange, comparisonCount, onCompare, buildHref = '#configuration', buildLabel, machine, categoryNav, categoryLabel, disabled = false, build = true, buildText }: LibraryToolsProps) {
  // On the Octatrack base path, loading happens from the Octatrack hub's guided load, not a .bin;
  // #configuration opens it on the set you edit.
  const usb = useOctatrackBase() && buildHref === '#configuration', mobile = useMobileWorkspace()
  const days = downloadPeriod(sort)
  const { open, setOpen, buttonRef, panelRef, panelId, moveFocus } = useActionsMenu()
  return <div className="discovery-tools">
    {machine}
    <div className="catalog-commands">
      {categoryNav && <div className="catalog-filter" onBlur={event => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}>
        <button type="button" ref={buttonRef} className="catalog-command" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(!open)}>
          <Icon name="filter" size={16} /><span>{categoryLabel || 'Category'}</span>
        </button>
        <div className="catalog-filter-panel" hidden={!open} ref={panelRef} id={open ? panelId : undefined} onKeyDown={moveFocus}
          onClick={event => { if (event.target instanceof Element && event.target.closest('a')) { setOpen(false); buttonRef.current?.focus() } }}>
          {categoryNav}
        </div>
      </div>}
      <div className="catalog-sort-group">
        <label><span className="sr-only">Type</span><select value={family} disabled={disabled} onChange={event => onFamilyChange(event.target.value)}>
          <option value="all">All types</option>
          {[...families].sort((a, b) => a.localeCompare(b)).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label className="catalog-sort"><Icon name="sort" size={16} /><span className="sr-only">Sort</span><select value={sortOption(sort).value} disabled={disabled} onChange={event => onSortChange(event.target.value)}>{MODULE_SORTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {days !== undefined && <label className="discovery-period"><span className="sr-only">Period</span><select value={sort} disabled={disabled} onChange={event => onSortChange(event.target.value)}>{DOWNLOAD_PERIODS.map(period => <option key={period.value} value={period.value}>{period.label}</option>)}</select></label>}
      </div>
      <div className="discovery-actions">
        {MODULE_COMPARE_ENABLED && <button className="button button-quiet" disabled={comparisonCount<2} onClick={onCompare}>Compare{comparisonCount?' ('+comparisonCount+')':''}</button>}
        {build && <a className="button button-primary" href={buildHref ?? undefined} aria-disabled={!buildHref || undefined} tabIndex={buildHref ? undefined : -1} aria-label={mobile || usb ? undefined : buildLabel} title={mobile || usb ? undefined : buildLabel}><Icon name="sliders" size={16}/>{buildText ?? (mobile ? 'Open configuration' : usb ? 'Your Octatrack' : 'Build firmware')}</a>}
      </div>
    </div>
  </div>
}
