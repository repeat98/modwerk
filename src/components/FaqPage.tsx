import { BackLink } from './BackLink'
import { isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { Icon } from './Icon'
import { OfficialLink } from './OfficialLink'
import { FAQ_ALIASES, FAQ_MACHINES, RELEASE_NOTES, TRANSFER_GUIDE, faqMachine, faqQuickStart, faqSections, type FaqMachine, type FaqSection } from './faq-content'

function answerText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(answerText).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return answerText(node.props.children)
  return ''
}

const searchText = (section: FaqSection, question: FaqSection['questions'][number]) =>
  (section.title + ' ' + question.title + ' ' + question.keywords + ' ' + answerText(question.answer)).toLowerCase()
const SEARCH_TEXT = new Map(FAQ_MACHINES.map(({ id }) => [id, new Map(faqSections(id).flatMap(section => section.questions.map(question => [question.id, searchText(section, question)])))]))
const has = (machine: FaqMachine, id: string) => SEARCH_TEXT.get(machine)!.has(id)
const matches = (machine: FaqMachine, id: string, terms: string[]) => terms.every(term => SEARCH_TEXT.get(machine)!.get(id)!.includes(term))

/** The machine to show: the visitor's own, unless the answer a link names belongs to another one. */
function startMachine(device: string | undefined, open: string | undefined): FaqMachine {
  const own = faqMachine(device)
  return !open || has(own, open) ? own : FAQ_MACHINES.find(machine => has(machine.id, open))?.id ?? own
}

function Questions({ sections, open, all }: { sections: FaqSection[]; open?: string; all: boolean }) {
  return <>{sections.map(section => <section className="faq-section" key={section.id} id={'faq-section-' + section.id} aria-labelledby={'faq-heading-' + section.id}>
    <h2 id={'faq-heading-' + section.id}>{section.title}</h2>
    <div className="faq-questions">{section.questions.map(question => <details className="faq-question" key={question.id + (all ? '-all' : '')} open={all || question.id === open} id={'faq-' + question.id}>
      <summary>{question.title}<Icon name="plus" size={17} /></summary>
      <div className="faq-answer">{question.answer}</div>
    </details>)}</div>
  </section>)}</>
}

/** `machine` is the device the visitor has selected on the site; `open` the answer a #faq/<id> link names. */
export function FaqPage({ previewGuide = false, open, machine: device }: { previewGuide?: boolean; open?: string; machine?: string }) {
  const entry = open && (FAQ_ALIASES[open] ?? open)
  const [machine, setMachine] = useState(() => startMachine(device, entry))
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState<string>()
  const page = useRef<HTMLDivElement>(null)
  const terms = useMemo(() => query.toLowerCase().trim().split(/\s+/).filter(Boolean), [query])
  const searching = terms.length > 0
  const sections = useMemo(() => faqSections(machine).map(section => ({
    ...section,
    questions: section.questions.filter(question => (!previewGuide || question.id === 'audio-previews') && matches(machine, question.id, terms)),
  })).filter(section => section.questions.length > 0), [machine, previewGuide, terms])
  const count = sections.reduce((total, section) => total + section.questions.length, 0)
  // Answers only another machine has, so a search for ".syx" on the Octatrack's page still leads somewhere.
  const elsewhere = searching ? FAQ_MACHINES.filter(item => item.id !== machine).map(item => ({ ...item, count: faqSections(item.id).flatMap(section => section.questions).filter(question => !has(machine, question.id) && matches(item.id, question.id, terms)).length })).filter(item => item.count > 0) : []
  const quick = faqQuickStart(machine)

  // A link to an answer that was renamed: the app scrolls to the id in the address, so this one scrolls here.
  useEffect(() => { if (entry && entry !== open) document.getElementById('faq-' + entry)?.scrollIntoView?.({ block: 'start' }) }, [entry, open])
  // The index marks the section being read.
  useEffect(() => {
    if (previewGuide || typeof IntersectionObserver === 'undefined' || !page.current) return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(item => item.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) setCurrent(visible.target.id.slice('faq-section-'.length))
    }, { rootMargin: '-15% 0px -60% 0px' })
    page.current.querySelectorAll('.faq-section').forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [previewGuide, machine, searching, count])

  if (previewGuide) return <div className="faq-page faq-page-guide"><BackLink href="#all">Module library</BackLink>
    <div className="page-heading"><div><p className="page-kicker">MODWERK / HELP</p><h1>Add an audio preview</h1><p>Share a short recording so others can hear what a module does.</p></div></div>
    <div className="faq-tools"><a className="button button-primary" href="#all">Browse modules <Icon name="arrow" size={15}/></a><a className="button button-quiet" href="#faq">All FAQs</a></div>
    <Questions sections={sections} all />
  </div>

  const jump = (id: string) => { setCurrent(id); document.getElementById('faq-section-' + id)?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
  return <div className="faq-page" ref={page}><BackLink href="#library">Module library</BackLink>
    <div className="page-heading faq-heading">
      <div><p className="page-kicker">MODWERK / HELP</p><h1>Help & FAQ</h1><p>Installing mods, recovery and troubleshooting for your machine.</p></div>
      <div className="faq-machines" role="group" aria-label="Machine">{FAQ_MACHINES.map(item =>
        <button type="button" key={item.id} aria-pressed={item.id === machine} onClick={() => { setMachine(item.id); setCurrent(undefined) }}>{item.label}</button>)}
      </div>
    </div>
    {!searching && <section className="faq-quick" aria-labelledby="faq-quick-title">
      <header><h2 id="faq-quick-title">{quick.title}</h2>
        <div className="faq-quick-actions">{quick.actions.map((action, index) => <a key={action.href} className={'button ' + (index ? 'button-quiet' : 'button-primary')} href={action.href}>{action.label} <Icon name="arrow" size={15} /></a>)}</div>
      </header>
      <ol>{quick.steps.map(step => <li key={step.title}><strong>{step.title}</strong><span>{step.text}</span></li>)}</ol>
      <p className="faq-quick-caution"><Icon name="warn" size={16} /><span>{quick.caution} <a href={'#faq/' + quick.more}>All steps</a></span></p>
    </section>}
    <label className="faq-search"><Icon name="search" size={17} /><input type="search" aria-label="Search the FAQ" placeholder={machine === 'octatrack' ? 'Search: sync, card, recovery, Windows…' : 'Search: .syx, Transfer, recovery…'} value={query} onChange={event => setQuery(event.target.value)} /></label>
    {searching && <p className="faq-results" role="status">{count} {count === 1 ? 'answer' : 'answers'} for the {FAQ_MACHINES.find(item => item.id === machine)!.name}
      {elsewhere.map(item => <button type="button" className="text-button" key={item.id} onClick={() => setMachine(item.id)}>{item.count} more for {item.label}</button>)}</p>}
    {count > 0 && <div className="faq-body">
      {!searching && <nav className="faq-index" aria-label="Sections"><ul>{sections.map(section =>
        <li key={section.id}><button type="button" aria-current={current === section.id ? 'true' : undefined} onClick={() => jump(section.id)}><span>{section.title}</span><small>{section.questions.length}</small></button></li>)}
      </ul></nav>}
      <div className="faq-sections"><Questions sections={sections} open={entry} all={searching && count <= 3} /></div>
    </div>}
    {!count && <div className="no-results"><Icon name="search" size={28} /><h2>No answers found</h2><p>Try “card”, “MIDI” or “backup”.</p><button className="button button-quiet" onClick={() => setQuery('')}>Clear search</button></div>}
    <section className="faq-stuck" aria-labelledby="faq-stuck-title">
      <div><h2 id="faq-stuck-title">Still stuck?</h2><p>Ask in the forum or on Discord. Other owners and the module developers read both.</p></div>
      <div className="faq-stuck-actions">
        <a className="button button-quiet" href="#forum"><Icon name="message" size={16} />Ask in the forum</a>
        <a className="button button-quiet" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Join Discord</a>
        {machine === 'octatrack' && <a className="button button-quiet" href="#octatrack"><Icon name="warn" size={16} />Report a problem</a>}
      </div>
    </section>
    <p className="faq-footer">Follow Elektron’s official instructions for your exact machine: {machine === 'octatrack'
      ? <OfficialLink href={RELEASE_NOTES}>Octatrack OS 1.40C instructions</OfficialLink>
      : <><OfficialLink href={TRANSFER_GUIDE}>the Transfer update guide</OfficialLink> and your model’s manual</>}.</p>
  </div>
}
