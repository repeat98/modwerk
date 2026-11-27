import type { ReactNode } from 'react'
import { useActionsMenu } from '../hooks/useActionsMenu'
import type { Configuration } from '../config/workspace'
import { FIRMWARE_SHARING_NOTICE, FLASHING_RISKS } from '../firmware-notices'
import { Icon } from './Icon'
import { useBetaUi, useSetWords } from '../community/beta-ui'

type DialogMode = 'create' | 'rename' | 'duplicate' | 'delete'

// The configuration page header: the name is the switcher, New stays in view and the other actions sit in one menu.
export function ConfigurationHeader({ kicker, meta, emptyTitle, configuration, configurations, onSelect, onDialog, onImport, shareHref, canReport, onReport }: { kicker: string; meta: string; emptyTitle?: string; configuration?: Configuration; configurations: Configuration[]; onSelect: (id: string) => void; onDialog: (mode: DialogMode) => void; onImport: () => void; shareHref: string; canReport: boolean; onReport: () => void }) {
  const w = useSetWords(), beta = useBetaUi()
  const { open, setOpen, buttonRef, panelRef, panelId, moveFocus, choose } = useActionsMenu()
  return <header className="page-heading configuration-heading">
    <div>
      <p className="page-kicker">{kicker}</p>
      <h1>{configuration ? <select className="configuration-switcher" aria-label={'Choose ' + w.set} value={configuration.id} onChange={event => onSelect(event.target.value)}>{configurations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : emptyTitle}</h1>
      <p>{meta}</p>
    </div>
    <div className="configuration-heading-actions">
      <button className="button button-primary" onClick={() => onDialog('create')}><Icon name="plus" size={16} />New</button>
      {configuration && <button className="button button-quiet module-issue-action" disabled={!canReport} aria-haspopup="dialog" onClick={onReport}><Icon name="message" size={16} />Report a problem</button>}
      {configuration && <div className="configuration-menu">
        <button ref={buttonRef} className="button button-quiet" aria-label={w.Set + ' actions'} title={w.Set + ' actions'} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}><Icon name="more" size={18} /></button>
        {open && <div ref={panelRef} id={panelId} className="configuration-menu-panel" role="group" aria-label={w.Set + ' actions'} onKeyDown={moveFocus}>
          {beta && <a href="#module-sets">All module sets</a>}
          <button onClick={() => choose(() => onDialog('rename'))}>Rename</button>
          <button onClick={() => choose(() => onDialog('duplicate'))}>Duplicate</button>
          <button onClick={() => choose(onImport)}>Import JSON</button>
          <a href={shareHref}>Share in forum</a>
          <hr />
          <button className="is-danger" onClick={() => choose(() => onDialog('delete'))}>Delete</button>
        </div>}
      </div>}
    </div>
  </header>
}

// The flashing risks stay beside the build button; the backup advice and sharing notice are one click away.
/** The flashing risks and the backups disclosure, with more of the same warning (`children`) between them: the base
 * install guide shows it as one warning box with its checkbox (RiskCheckbox) under it. `id` names the lead. */
export function RiskNotice({ id, children }: { id?: string; children?: ReactNode }) {
  return <>
    <p><strong id={id}>Before you flash.</strong> {FLASHING_RISKS}</p>
    {children}
    <details><summary>Backups and sharing</summary><p>Back up your projects and samples, review the module test records, and keep the original OS. Flash at your own risk.</p><p>{FIRMWARE_SHARING_NOTICE}</p></details>
  </>
}

export function RiskCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="risk-accept"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span>I understand the risks of flashing custom firmware.</span></label>
}

export function RiskAcceptance({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="risk-acceptance"><RiskNotice /><RiskCheckbox checked={checked} onChange={onChange} /></div>
}
