import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { adminHref, type AdminSection } from './admin-navigation'

type AdminView = { id: string; label: string }

export function AdminViews({ section, views, active }: { section: AdminSection; views: readonly AdminView[]; active: string }) {
  return <nav className="admin-views" aria-label="Views">
    {views.map(({ id, label }, index) => <a key={id}
      href={adminHref(section) + (index ? '?view=' + id : '')} aria-current={id === active ? 'page' : undefined}>
      {label}
    </a>)}
  </nav>
}

export function AdminRecord({ title, meta, status, children }: {
  title: string; meta: string; status: ReactNode; children: ReactNode
}) {
  return <details className="admin-record">
    <summary>
      <span className="admin-record-name"><strong>{title}</strong><small>{meta}</small></span>
      {status}<Icon name="back" size={16}/>
    </summary>
    <div className="admin-record-body">{children}</div>
  </details>
}
