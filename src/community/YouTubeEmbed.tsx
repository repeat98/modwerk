import { useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { firstYouTubeVideo, type YouTubeVideo } from './forum-links'

/** A YouTube video. With `autoload` the player is the normal embed, with YouTube's own thumbnail and title; without it a card is drawn locally and
 * the player loads only when played, so reading the page sends nothing to YouTube. A `poster` replaces the plain card's contents. */
export function YouTubeEmbed({ video, label, autoload = false, poster, className }: { video: YouTubeVideo; label?: string; autoload?: boolean; poster?: ReactNode; className?: string }) {
  const [clicked, setClicked] = useState(false)
  const title = label || 'YouTube video'
  const watch = 'https://www.youtube.com/watch?v=' + video.id + (video.start ? '&t=' + video.start + 's' : '')
  // The nocookie host sets no cookie until played. The site sends no referrer, which YouTube's player rejects, so the frame asks for the origin only.
  const player = 'https://www.youtube-nocookie.com/embed/' + video.id + '?rel=0&playsinline=1' + (clicked ? '&autoplay=1' : '') + (video.start ? '&start=' + video.start : '')
  return <figure className={'forum-video' + (className ? ' ' + className : '')}>
    {autoload || clicked
      ? <iframe src={player} title={title} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" />
      : <button type="button" className={'forum-video-play' + (poster ? ' has-poster' : '')} aria-label={'Play ' + title + ' from YouTube'} onClick={() => setClicked(true)}>{poster ?? <><span className="forum-video-icon"><Icon name="play" size={22} /></span><strong>{label || 'Play video'}</strong><small>Loads from YouTube when played</small></>}</button>}
    <figcaption>{poster && !autoload && <span>Loads from YouTube when played</span>}<a href={watch} target="_blank" rel="noopener noreferrer nofollow">Watch on YouTube</a></figcaption>
  </figure>
}

/** The click-to-play card for the first YouTube link in a plain-text message. Chat is read on every forum page, so it never loads a player on its own. */
export function TextVideo({ text }: { text: string }) {
  const video = firstYouTubeVideo(text)
  return video ? <YouTubeEmbed video={video} /> : null
}
