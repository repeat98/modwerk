import { useEffect, useState } from 'react'
import { api } from './api'
import type { ForumMachineSummary } from './forum-contract'
import { DeviceImage, MachinePhotoCredits } from '../devices/DeviceImage'
import { DEVICES, STATUS_LABELS } from '../devices/registry'

// The forum's front page groups discussions by machine, every Elektron machine included.
export function ForumMachines({ href }: { href: (machine: string) => string }) {
  const [summary, setSummary] = useState<Record<string, ForumMachineSummary> | null>(null), [unavailable, setUnavailable] = useState(false)
  useEffect(() => { let cancelled = false; void api<ForumMachineSummary[]>('/forum/machines').then(rows => { if (!cancelled) setSummary(Object.fromEntries(rows.map(row => [row.machine, row]))) }).catch(() => { if (!cancelled) setUnavailable(true) }); return () => { cancelled = true } }, [])
  return (
    <section className="forum-machines" aria-labelledby="forum-machines-title">
      <div className="forum-list-heading"><h2 id="forum-machines-title">Machines</h2><span>Every Elektron box, with or without mods</span></div>
      <div className="forum-machine-grid">{DEVICES.map(device => {
        const threads = summary?.[device.id]?.threads ?? 0
        const activity = summary ? threads ? threads + (threads === 1 ? ' discussion' : ' discussions') : 'No discussions yet' : unavailable ? 'Browse discussions' : 'Loading discussions…'
        return <a key={device.id} href={href(device.id)} className={'forum-machine-card is-' + device.status} title={device.name + ' · ' + STATUS_LABELS[device.status]}>
          <span className="forum-machine-art"><DeviceImage device={device} /></span>
          <span className="forum-machine-copy"><strong>{device.name}</strong>{device.variants && <small>{device.variants.join(' · ')}</small>}<small className="forum-machine-count">{activity}</small></span>
        </a>
      })}</div>
      <MachinePhotoCredits />
    </section>
  )
}
