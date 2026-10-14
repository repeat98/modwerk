import { assetUrl } from '../hosting'
import { categorySlug, digiModuleDocument, type DigiMod } from './digi-mods'

// Cover art is the module's own saved thumbnail (every module must carry one), so the card and its media entry cannot drift apart.
export function DigiModPreview({ mod, compact = false }: { mod: DigiMod; compact?: boolean }) {
  const document = digiModuleDocument(mod), thumbnail = document.media.find(item => item.kind === 'thumbnail')!
  return (
    <div className={'module-preview ' + (compact ? 'compact-preview' : '')} data-module={'digi-' + categorySlug(mod.category)} aria-hidden="true">
      <div className="preview-label"><span>{mod.title}</span><span className="preview-led" /></div>
      <svg viewBox="0 0 320 192" className="signal-art" fill="none">
        <image className="saved-thumbnail" href={assetUrl('module-media/' + mod.device + '-' + mod.id + '/' + document.version + '/' + thumbnail.path)} width="320" height="192" />
      </svg>
    </div>
  )
}
