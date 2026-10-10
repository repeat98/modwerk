import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import type { BuiltModule } from '../community/build-follow-up'
import type { DownloadedModuleGuide } from '../community/downloaded-module-guide'
import { assetUrl } from '../hosting'
import { Icon } from './Icon'
import { ownerCredit } from '../catalog/module-authors'

const SINGLE_SCREEN = '(max-width: 1050px)'
function subscribeLayout(callback: () => void) {
  const media = window.matchMedia(SINGLE_SCREEN)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
function singleScreen() { return window.matchMedia(SINGLE_SCREEN).matches }

type Props = {
  module: BuiltModule
  guide: DownloadedModuleGuide
  enlarged: boolean
  onEnlarged: (value: boolean) => void
  children?: ReactNode
}

/** Manual navigation only: two readable captures on desktop, one on smaller screens. */
export function FirmwareScreenshotCarousel({ module, guide, enlarged, onEnlarged, children }: Props) {
  const [index, setIndex] = useState(Math.max(0, guide.initialScreenshot - 1))
  const [failed, setFailed] = useState<string[]>([])
  const compact = useSyncExternalStore(subscribeLayout, singleScreen, () => false)
  const help = useId(), screens = useId()
  const imageButtons = useRef(new Map<number, HTMLButtonElement>())
  const backButton = useRef<HTMLButtonElement>(null), restoreFocus = useRef(false)
  const focusScreenshot = useRef(index)
  const keyboardFocus = useRef(false)
  const count = enlarged || compact ? 1 : 2
  const last = Math.max(0, guide.screenshots.length - count), start = Math.min(index, last)
  const visible = guide.screenshots.slice(start, start + count)
  const range = visible.length > 1 ? `${start + 1}–${start + visible.length}` : String(start + 1)
  useEffect(() => {
    if (enlarged) { restoreFocus.current = true; backButton.current?.focus() }
    else if (restoreFocus.current) { imageButtons.current.get(focusScreenshot.current)?.focus(); restoreFocus.current = false }
  }, [enlarged])
  useEffect(() => {
    if (keyboardFocus.current) { imageButtons.current.get(start)?.focus(); keyboardFocus.current = false }
  }, [start])
  function navigate(next: number) { const position = Math.max(0, Math.min(next, last)); focusScreenshot.current = position; setIndex(position) }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    const next = event.key === 'ArrowLeft' ? start - 1 : event.key === 'ArrowRight' ? start + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? last : undefined
    if (next === undefined || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    if (Math.max(0, Math.min(next, last)) !== start && event.target instanceof HTMLButtonElement && event.target.classList.contains('firmware-feedback-screen')) keyboardFocus.current = true
    navigate(next)
  }
  if (!visible.length) return <><div className="firmware-feedback-no-screen"><Icon name="help" size={24}/><p>{guide.noUiReason ?? 'This module has no screenshots yet. Follow its usage steps below.'}</p></div>{children}</>
  return <><section className="firmware-feedback-carousel" aria-roledescription="carousel" aria-label={module.name + ' screenshots'} aria-describedby={help} onKeyDown={keyboard}>
    {enlarged && <button ref={backButton} type="button" className="text-button firmware-feedback-collapse" onClick={() => onEnlarged(false)}><Icon name="back" size={15}/>Back to quick test</button>}
    <div id={screens} className={'firmware-feedback-media' + (count === 1 ? ' is-single' : '')}>
      {visible.map((screenshot, offset) => {
        const position = start + offset
        const url = assetUrl('module-media/' + module.id + '/' + module.version + '/' + screenshot.path)
        const caption = 'otUi' in screenshot && screenshot.otUi ? screenshot.otUi.page : screenshot.alt
        return <figure key={screenshot.path} role="group" aria-roledescription="slide" aria-label={`${position + 1} of ${guide.screenshots.length}`}>
          {failed.includes(url) ? <p className="firmware-feedback-image-error" role="status">Screenshot {position + 1} could not be loaded. Follow the usage steps below.</p> : <button ref={element => { if (element) imageButtons.current.set(position, element); else imageButtons.current.delete(position) }} type="button" className="firmware-feedback-screen" aria-label={enlarged ? 'Return to quick test' : `Enlarge ${module.name} screenshot ${position + 1}: ${caption}`} onClick={() => { focusScreenshot.current = position; setIndex(position); onEnlarged(!enlarged) }}>
            <img className={screenshot.lcd ? 'ot-ui-capture' : undefined} src={url} alt={screenshot.alt} onError={() => setFailed(current => [...current, url])}/><span className="firmware-feedback-zoom" aria-hidden="true"><Icon name={enlarged ? 'close' : 'search'} size={16}/></span>
          </button>}
          <figcaption><span className="firmware-feedback-screen-number">{position + 1}</span>{caption}</figcaption>
          {enlarged && <p className="firmware-feedback-screen-caption">{screenshot.caption}</p>}
        </figure>
      })}
    </div>
    <div className="firmware-feedback-carousel-toolbar">
      <p role="status" aria-atomic="true">{visible.length > 1 ? 'Screenshots' : 'Screenshot'} {range} of {guide.screenshots.length}</p>
      {guide.screenshots.length > count && <div className="firmware-feedback-screen-paging">
        <button type="button" aria-label="Previous screenshot" aria-controls={screens} aria-disabled={start === 0} onClick={() => navigate(start - 1)}><Icon name="back" size={16}/>Previous</button>
        <button type="button" aria-label="Next screenshot" aria-controls={screens} aria-disabled={start === last} onClick={() => navigate(start + 1)}>Next<Icon name="arrow" size={16}/></button>
      </div>}
    </div>
    <p id={help} className="firmware-feedback-carousel-help">{enlarged ? 'Select the screenshot to return to your test.' : 'Select a screenshot to enlarge it.'}{guide.screenshots.length > count && <> Use ← / → to browse.<span className="sr-only"> Home / End jumps to the first / last screen.</span></>}</p>
  </section>
    {children}
    {!enlarged && <details className="firmware-feedback-details"><summary>Tips for these screens</summary>{visible.map(screenshot => <p key={screenshot.path}>{screenshot.caption}</p>)}</details>}
    <details className="firmware-feedback-details firmware-feedback-capture-details"><summary>Screenshot credits</summary>{visible.map(screenshot => <p key={screenshot.path}>{screenshot.captureType === 'hardware' ? 'Hardware capture' : screenshot.captureType === 'emulator' ? 'Emulator capture' : 'Image'} · {ownerCredit(screenshot.credit)} · {screenshot.license}</p>)}</details>
  </>
}
