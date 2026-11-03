import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { moduleHref } from '../routing'
import { pageTitle } from '../site-metadata'
import { communityModule, modulePageHref } from './modules'

/** The public address of a module page: Octatrack modules have a static page with previews, the others their app route. */
export function moduleShareUrl(id: string) {
  const module = communityModule(id)
  return new URL(module && module.machine !== 'octatrack' ? module.href : module ? moduleHref(id) : modulePageHref(id), window.location.href).href
}

/** Shares the module's address through the device's share sheet, or copies it where there is none. */
export function ShareModuleButton({ id, title }: { id: string; title: string }) {
  const [notice, setNotice] = useState(''), timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  async function share() {
    const url = moduleShareUrl(id)
    try {
      if (navigator.share) { await navigator.share({ title: pageTitle(title), url }); return }
      await navigator.clipboard.writeText(url)
      setNotice('Link copied.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice('Copy this link: ' + url)
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(''), 4000)
  }
  return <span className="share-control"><button type="button" className="button button-quiet" aria-label={'Share ' + title} onClick={() => void share()}><Icon name="share" size={15} /><span className="share-button-label">Share</span></button>{notice && <span className="share-notice" role="status">{notice}</span>}</span>
}
