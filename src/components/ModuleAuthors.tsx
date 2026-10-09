import type { ReactNode } from 'react'
import type { ModuleContributor } from '../catalog/module-authors'

/** Each credited person gets their own line; the support control stays with the module owner. */
export function ModuleAuthors({ name, url, contributors, by = false, arrows = false, children }: {
  name: string; url: string; contributors?: readonly ModuleContributor[]; by?: boolean; arrows?: boolean; children?: ReactNode
}) {
  const link = (label: string, href: string) => <a className={by ? 'author-link' : undefined} href={href} target="_blank" rel="noreferrer">{by && 'by '}{label}{arrows && ' ↗'}</a>
  return <div className="module-author-lines">
    <div className="module-author-line">{link(name, url)}{children}</div>
    {contributors?.map(contributor => <div className="module-author-line" key={contributor.github.toLowerCase()}>{link(contributor.name ?? contributor.github, 'https://github.com/' + contributor.github)}</div>)}
  </div>
}
