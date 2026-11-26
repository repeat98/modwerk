// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

import { YouTubeEmbed } from '../community/YouTubeEmbed'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { MODULE_VIDEO_SECTION, MODULE_VIDEOS } from '../catalog/module-videos'
import { assetUrl } from '../hosting'
import { Icon } from './Icon'
import { ModulePreview } from './ModulePreview'
import './module-video.css'

/** The module's video at the top of its Overview. The card is drawn from the module's own cover art and screen; YouTube loads only on play. */
export function ModuleVideo({ id, authorName }: { id: string; authorName: string }) {
  const video = MODULE_VIDEOS[id]
  if (!video) return null
  const document = MODULE_DOCUMENTS_BY_ID[id]
  const screen = video.screen && document.media.find(item => item.path === video.screen)
  const poster = <>
    <span className="module-video-art"><ModulePreview id={id} /></span>
    {screen && <img className="module-video-screen" src={assetUrl('module-media/' + id + '/' + document.version + '/' + screen.path)} alt="" />}
    <span className="module-video-shade" />
    <span className="module-video-text">
      <span className="module-video-play"><Icon name="play" size={24} /></span>
      <strong>{video.title}</strong>
      <small>{video.channel} · YouTube</small>
    </span>
  </>
  return <section className="detail-section module-video" id={MODULE_VIDEO_SECTION} aria-labelledby={MODULE_VIDEO_SECTION + '-title'}>
    <h2 id={MODULE_VIDEO_SECTION + '-title'}>Video <small>{video.channel === authorName ? 'by the author' : 'by ' + video.channel}</small></h2>
    <YouTubeEmbed className="module-video-player" video={{ id: video.youtube, start: 0 }} label={video.title} poster={poster} />
  </section>
}
