import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { moduleResourceIndicators } from '../catalog/resource-indicators'
import { resourceSource } from '../catalog/resources'
import { ModuleResourceSummary } from './ModuleResourceSummary'
import { USB_AUDIO_MODULE, usbAudioLayout, type UsbAudioLayout } from '../config/usb-audio'
import { usbAudioCpuLoad } from '../config/usb-audio-load'
import { issueRepository } from '../community/report-context'

export function ModuleResourceIndicators({ id, usbLayout }: { id: string; usbLayout?: UsbAudioLayout }) {
  const document = MODULE_DOCUMENTS_BY_ID[id]
  const price = document.resources.cpuPrice
  const previewCpu = !price && id === USB_AUDIO_MODULE && usbLayout ? usbAudioCpuLoad(usbLayout) : undefined
  const repository = issueRepository() + '/blob/main/'
  const indicators = moduleResourceIndicators(document).map(indicator => previewCpu && indicator.id === 'cpu'
    ? { ...indicator, value: previewCpu.level, score: previewCpu.score, fill: previewCpu.score / 4 * 100, description: previewCpu.rationale }
    : indicator)
  return <ModuleResourceSummary heading="Resource usage" indicators={indicators} evidence={<>
    <h3>How to read the gauges</h3>
    <p className="resource-evidence-date">{previewCpu ? 'DSP / memory · ' : ''}v{document.version} · {document.resources.recorded}</p>
    {previewCpu && usbLayout && <p>The USB 0.2 candidate preview for {usbAudioLayout(usbLayout).name} estimates relative CPU demand from the upstream USB hook. Timing on hardware for this exact build remains unmeasured.</p>}
    <p>Minimal → Low → Moderate → High shows relative demand where a numeric record is unavailable. Load varies with configuration, settings and active tracks.</p>
    {!previewCpu && <p>{document.resources.impact?.conditions}</p>}
    <dl>{indicators.map(indicator => {
      const href = indicator.sourceInModwerk ? repository + indicator.source : resourceSource(id, indicator.source)
      return <div key={indicator.id}>
        <dt>{indicator.label} <span>{indicator.status}</span></dt>
        <dd>{indicator.description} <a href={indicator.id === 'cpu' && previewCpu ? previewCpu.source : href} target="_blank" rel="noreferrer">Read record ↗</a></dd>
      </div>
    })}</dl>
  </>} />
}
