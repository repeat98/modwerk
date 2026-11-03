import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { MODULE_SORTS } from '../community/module-statistics'
import { useOctatrackBase } from '../hooks/useOctatrackLink'

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
  disabled?: boolean
  // false on machines that never get a firmware build (the Zoom pedals load effect files).
  build?: boolean
}

export function LibraryTools({ family, families, onFamilyChange, sort, onSortChange, comparisonCount, onCompare, buildHref = '#configuration', buildLabel, machine, disabled = false, build = true }: LibraryToolsProps) {
  // With the Modwerk base connected (beta), loading happens from the Octatrack hub's guided load, not a .bin;
  // #configuration opens it on the set you edit.
  const usb = useOctatrackBase() && buildHref === '#configuration', mobile = useMobileWorkspace()
  return <div className="discovery-tools">
    {machine}
    <label>Type<select value={family} disabled={disabled} onChange={event=>onFamilyChange(event.target.value)}><option value="all">All types</option>{families.map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Sort<select value={sort} disabled={disabled} onChange={event=>onSortChange(event.target.value)}>{MODULE_SORTS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <div className="discovery-actions">
      <button className="button button-quiet" disabled={comparisonCount<2} onClick={onCompare}>Compare{comparisonCount?' ('+comparisonCount+')':''}</button>
      {build && <a className="button button-primary" href={buildHref ?? undefined} aria-disabled={!buildHref || undefined} tabIndex={buildHref ? undefined : -1} aria-label={mobile || usb ? undefined : buildLabel} title={mobile || usb ? undefined : buildLabel}><Icon name="sliders" size={16}/>{mobile ? 'Open configuration' : usb ? 'Your Octatrack' : 'Build firmware'}</a>}
    </div>
  </div>
}
