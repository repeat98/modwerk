import { Icon } from '../components/Icon'
import './overview.css'

// The sidebar's Start developing entry while the highlight runs (DEVELOP_HIGHLIGHT_UNTIL in overview.ts).
export function DevelopCard({ current }: { current: boolean }) {
  return <a className={'develop-card' + (current ? ' active' : '')} href="#submit" aria-current={current ? 'page' : undefined}>
    <span className="develop-card-icon"><Icon name="plus" size={14} /></span>
    <strong>Start developing</strong>
    <small>Describe it, paste one prompt, build it together.</small>
  </a>
}
