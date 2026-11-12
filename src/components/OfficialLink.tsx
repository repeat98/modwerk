import type { ReactNode } from 'react'

/** A link to the maker's own page or manual, opened in a new tab. */
export function OfficialLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children} <span aria-hidden="true">↗</span></a>
}
