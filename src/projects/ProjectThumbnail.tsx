import { assetUrl } from '../hosting'
import type { ExternalProject } from './projects'
import thumbnails from './thumbnails.json'

export function ProjectThumbnail({ project }: { project: ExternalProject }) {
  const image = (thumbnails as Record<string, { src: string; width: number; height: number }>)[project.repository]
  if (!image) return null
  return <a className="project-thumbnail" href={project.repository} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
    <img src={assetUrl(image.src)} width={image.width} height={image.height} alt="" loading="lazy" decoding="async" />
  </a>
}
