import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { BackLink } from '../components/BackLink'
import source from '../../MODDING_GUIDELINES.md?raw'
import './modding-guidelines.css'

// Keep the site's index and the complete rules in step with the GitHub document.
const [guidelines, references] = source.trim().split(/^---\s*$/m)
const [introduction, ...topics] = guidelines.split(/^## /m)
const sections = topics.map(topic => {
  const [title, ...body] = topic.trim().split(/\r?\n/)
  const slug = title.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
  return { title, body: body.join('\n'), id: 'modding-guidelines/' + slug }
})

function goToTopic(id: string) {
  const heading = document.getElementById(id)
  heading?.scrollIntoView({ block: 'start' })
  heading?.focus({ preventScroll: true })
}

export function ModdingGuidelines({ activeTopic }: { activeTopic?: string }) {
  const [indexOpen, setIndexOpen] = useState(false)
  useEffect(() => {
    if (activeTopic) goToTopic(activeTopic)
  }, [activeTopic])
  return <article className="guidelines-page">
    <BackLink href="#library">Module library</BackLink>
    <header className="guidelines-intro"><Markdown>{introduction}</Markdown></header>
    <div className="guidelines-reading">
      <nav className="guidelines-index" aria-label="Guideline topics">
        <p>On this page</p>
        <button type="button" aria-expanded={indexOpen} aria-controls="guideline-topics" onClick={() => setIndexOpen(!indexOpen)}>
          Jump to a guideline
        </button>
        <ul id="guideline-topics" data-open={indexOpen}>
          {sections.map(({ id, title }) => <li key={id}>
            <a href={'#' + id} aria-current={id === activeTopic ? 'location' : undefined} onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              setIndexOpen(false)
              if (id === activeTopic) requestAnimationFrame(() => goToTopic(id))
            }}>{title}</a>
          </li>)}
        </ul>
      </nav>
      <div className="guidelines-rules">
        {sections.map(({ id, title, body }) => <section key={id} aria-labelledby={id}>
          <h2 id={id} tabIndex={-1}>{title}</h2>
          <Markdown>{body}</Markdown>
        </section>)}
        {references && <footer><Markdown>{references}</Markdown></footer>}
      </div>
    </div>
  </article>
}
