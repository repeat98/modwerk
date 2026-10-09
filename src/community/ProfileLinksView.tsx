import { useId, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { publicProfileLinks, type ProfileLinkField, type ProfileLinks } from './profile-links'

/** Local profile cards; SoundCloud is contacted only after the visitor requests its player. */
export function ProfileLinksView({ profile }: { profile: ProfileLinks }) {
  const links = publicProfileLinks(profile)
  const [previewUrl, setPreviewUrl] = useState('')
  const previewButton = useRef<HTMLButtonElement>(null)
  const previewId = useId()
  const soundcloud = links.find(link => link.key === 'soundcloudUrl')
  const previewOpen = !!soundcloud && previewUrl === soundcloud.href
  if (!links.length) return null
  return <div className="forum-profile-social">
    <nav className="forum-profile-links" aria-label="Social and music profiles">{links.map(link => <article className="forum-profile-link-card" data-service={link.key} key={link.key}>
      <a className="forum-profile-link-main" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + link.label + ' profile for ' + link.account + ' (opens in a new tab)'}>
        <span className="forum-profile-link-cover"><ProfilePlatformIcon service={link.key} /><span>{link.label}</span><Icon name="external" size={13} /><span className="forum-profile-link-art" aria-hidden="true" /></span>
        <span className="forum-profile-link-copy"><strong>{link.account}</strong></span>
      </a>
      {link.key === 'soundcloudUrl'
        ? <button type="button" className="forum-profile-link-action" ref={previewButton} aria-expanded={previewOpen} aria-controls={previewId} onClick={() => setPreviewUrl(previewOpen ? '' : link.href)}><Icon name={previewOpen ? 'close' : 'play'} size={14} />{previewOpen ? 'Hide preview' : 'Preview music'}</button>
        : <a className="forum-profile-link-action" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={'View ' + link.label + ' profile for ' + link.account + ' (opens in a new tab)'}>{link.key === 'instagramUrl' ? 'View profile' : 'Explore on Bandcamp'}<Icon name="arrow" size={14} /></a>}
    </article>)}</nav>
    {soundcloud && <p className="forum-profile-preview-note">Music preview loads SoundCloud’s player when opened. It may use cookies.</p>}
    {previewOpen && <section id={previewId} className="forum-profile-music-preview" aria-label={'SoundCloud music preview for ' + soundcloud.account}>
      <div className="forum-profile-preview-heading"><strong>Listen to {soundcloud.account}</strong><button type="button" className="icon-button" aria-label="Close music preview" onClick={() => { setPreviewUrl(''); previewButton.current?.focus() }}><Icon name="close" size={16} /></button></div>
      <iframe src={'https://w.soundcloud.com/player/?' + new URLSearchParams({ url: soundcloud.href, auto_play: 'false', show_artwork: 'true', show_user: 'true', color: '#a5adff' })} title={'SoundCloud tracks by ' + soundcloud.account} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
      <a className="forum-profile-preview-fallback" href={soundcloud.href} target="_blank" rel="noopener noreferrer">Open on SoundCloud<Icon name="external" size={13} /></a>
    </section>}
  </div>
}

function ProfilePlatformIcon({ service }: { service: ProfileLinkField }) {
  return <svg className="forum-profile-platform-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {service === 'instagramUrl' ? <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>
      : service === 'soundcloudUrl' ? <><path d="M2 12v5m3-7v9m3-11v11m3-13v13" /><path d="M14 19h5a3 3 0 0 0 .2-6 5 5 0 0 0-5.2-5z" /></>
      : <path d="m8 5 13 0-5 14H3z" />}
  </svg>
}
