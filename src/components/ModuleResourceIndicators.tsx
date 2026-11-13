import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { moduleResourceIndicators } from '../catalog/resource-indicators'
import { resourceSource } from '../catalog/resources'
import { ModuleResourceSummary } from './ModuleResourceSummary'
import { USB_AUDIO_MODULE, usbAudioLayout, type UsbAudioLayout } from '../config/usb-audio'
import { usbAudioCpuLoad } from '../config/usb-audio-load'

export function ModuleResourceIndicators({ id, usbLayout }: { id: string; usbLayout?: UsbAudioLayout }) {
  const document = MODULE_DOCUMENTS_BY_ID[id]
  const cpu = id === USB_AUDIO_MODULE && usbLayout ? usbAudioCpuLoad(usbLayout) : undefined
  const indicators = moduleResourceIndicators(document).map(indicator => cpu && indicator.id === 'cpu' ? { ...indicator, value: cpu.level, score: cpu.score, fill: cpu.score / 4 * 100, description: cpu.rationale, status: cpu.measured ? 'Measured' : 'Estimated', source: cpu.source } : indicator)
  return <ModuleResourceSummary indicators={indicators} evidence={<>
    <h3>Relative load estimates</h3>
    <p className="resource-evidence-date">{cpu ? 'DSP / memory: ' : ''}v{document.version} · {document.resources.recorded}</p>
    {cpu && usbLayout && <p>CPU preview: {usbAudioLayout(usbLayout).name}, USB 0.2 candidate. Relative levels compare USB output work. Port instruction counts are not CPU percentages, chip cycles or available headroom. This exact build has not been timed on hardware.</p>}
    <p>Minimal → Low → Moderate → High. The arcs show rough relative demand. Load depends on your configuration, settings and active tracks; the gauges do not measure available headroom.</p>
    {!cpu && <p>{document.resources.impact?.conditions}</p>}
    <dl>{indicators.map(indicator => <div key={indicator.id}>
      <dt>{indicator.label} <span>{indicator.status}</span></dt>
      <dd>{indicator.description} <a href={cpu && indicator.id === 'cpu' ? cpu.source : resourceSource(id, indicator.source)} target="_blank" rel="noreferrer">Read record ↗</a></dd>
    </div>)}</dl>
  </>} />
}
