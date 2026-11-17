import type { UnreadableSet } from '../hooks/useWorkspace'

/** Saved sets this version cannot open. They stay on the device, so the note names each one and why, on the pages that list sets. */
export function UnreadableSetsNote({ sets, set, plural }: { sets: readonly UnreadableSet[]; set: string; plural: string }) {
  if (!sets.length) return null
  const one = sets.length === 1
  return <div className="service-note unreadable-sets" role="status">
    <p>{one ? 'One saved ' + set + ' uses' : sets.length + ' saved ' + plural + ' use'} a module or setting this version of Modwerk cannot open. {one ? 'It stays' : 'They stay'} on this device and will reappear once Modwerk can open {one ? 'it' : 'them'}.</p>
    <ul>{sets.map((item, index) => <li key={index}>{item.name ? '“' + item.name + '”' : 'Unnamed ' + set}: {item.reason}</li>)}</ul>
  </div>
}
