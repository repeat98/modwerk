import { assetUrl, sourceRepository } from '../hosting'
import { CREDIT_SECTIONS, DSP56300_CREDIT, type Credit } from './credits'
import './credits.css'

function CreditLinks({ links }: Pick<Credit, 'links'>) {
  return <div className="credit-links">{links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label} <span aria-hidden="true">↗</span></a>)}</div>
}

export function CreditsPage() {
  const repository = sourceRepository() || 'https://github.com/repeat98/modwerk'
  return <div className="credits-page">
    <div className="page-heading credits-heading"><div>
      <h1>Credits &amp; acknowledgements</h1>
      <p>Modwerk exists because people shared their research, tools and ideas. These are the projects and contributors that made it possible.</p>
    </div></div>

    <section className="credits-origin" aria-labelledby="credits-origin-title">
      <h2 id="credits-origin-title">{DSP56300_CREDIT.name}</h2>
      <p className="credit-author">{DSP56300_CREDIT.author}</p>
      <p className="credits-origin-copy">{DSP56300_CREDIT.description}</p>
      <CreditLinks links={DSP56300_CREDIT.links} />
    </section>

    <nav className="credits-nav" aria-label="Credits sections">{CREDIT_SECTIONS.map(section => <button key={section.id} type="button" onClick={() => {
      const heading = document.getElementById('credits-' + section.id)
      heading?.scrollIntoView({ block: 'start' })
      heading?.focus({ preventScroll: true })
    }}>{section.title}</button>)}</nav>

    {CREDIT_SECTIONS.map(section => <section key={section.id} className="credits-section" aria-labelledby={'credits-' + section.id}>
      <header className="credits-section-heading">
        <div><h2 id={'credits-' + section.id} tabIndex={-1}>{section.title}</h2><p>{section.description}</p></div>
      </header>
      <div>{section.projects.map(project => <article key={project.name} className="credit-project">
        <h3>{project.name}</h3>
        <p className="credit-author">{project.author}</p>
        <p className="credit-description">{project.description}</p>
        <CreditLinks links={project.links} />
      </article>)}</div>
    </section>)}

    <section className="credits-research" aria-labelledby="credits-research-title">
      <h2 id="credits-research-title">Research, measurements &amp; the community</h2>
      <p>The SDK also credits Andy Harman’s Juno-60 chorus measurements, Roland’s Dimension D service notes, Jon Dattorro’s <cite>Effect Design Part 2</cite> and Vadim Zavalishin’s filter research. Thank you to the musicians, testers and contributors who share findings, report issues and improve the tools.</p>
      <p>Elektron created the instruments this work explores. Modwerk is an independent, unofficial project; the original firmware and instrument names remain the property of their respective owners.</p>
    </section>

    <footer className="credits-footer">
      <h2>Source history &amp; licence notices</h2>
      <p>These acknowledgements describe the work we build on. Full copyright notices and licence terms accompany the retained components; exact source revisions and import records live in the SDK.</p>
      <div className="credit-links">
        <a href={assetUrl('licenses/THIRD_PARTY_NOTICES.html')} target="_blank" rel="noreferrer">Full third-party notices <span aria-hidden="true">↗</span></a>
        <a href={repository + '/blob/main/sdk/octabam/THIRD_PARTY.md'} target="_blank" rel="noreferrer">SDK component credits <span aria-hidden="true">↗</span></a>
        <a href={repository + '/blob/main/sdk/UPSTREAM.json'} target="_blank" rel="noreferrer">Pinned source history <span aria-hidden="true">↗</span></a>
      </div>
    </footer>
  </div>
}
