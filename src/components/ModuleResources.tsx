import { FLASHING_RISKS, FIRMWARE_SHARING_NOTICE } from '../firmware-notices'
import { RESOURCES, resourceSource } from '../catalog/resources'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { Icon } from './Icon'
import { ModuleAccess } from './ModuleAccess'
import { ModuleUsageInstructions } from './ModuleUsageInstructions'
import { downloadedModuleGuide } from '../community/downloaded-module-guide'
export function ModuleResources({ id }: { id: string }) {
  const data = RESOURCES[id], retained = MODULE_DOCUMENTS_BY_ID[id].tests.retainedEvidence
  const document = MODULE_DOCUMENTS_BY_ID[id], module = { id, name: document.name, version: document.version }
  const hasQuickTest = downloadedModuleGuide(module)?.hasQuickTest
  return <>
    <details className="module-disclosure"><summary><span>How to use it</span><Icon name="plus" size={16} /></summary><div className="disclosure-content">
      {id === 'seq' && <p className="service-note">Full usage: <a href="https://ilia-murzinov.github.io/octabam/reference/modules/seq.html" target="_blank" rel="noreferrer">octabam SEQ manual ↗</a> (FX page-2 and CX OSC destinations are octabam-only).</p>}
      {hasQuickTest && <ModuleUsageInstructions module={module} steps={data.usage}/>}
      <ModuleAccess id={id} showScreenshots={false} />
      {!hasQuickTest && data.usage.join('\n') !== document.access?.steps.join('\n') && <ol className="usage-list">{data.usage.map(step => <li key={step}>{step}</li>)}</ol>}
    </div></details>
    <details className="module-disclosure"><summary><span>Technical details & safety<small>Resources, tests, flashing</small></span><Icon name="plus" size={16} /></summary><div className="disclosure-content">
    <section className="detail-section resource-section"><div className="section-title"><h2>Storage & processing</h2><span className="subtle">Recorded: {data.measured}</span></div><div className="resource-grid">{[data.memory, data.compute].map(metric => <div className="resource-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.note}</p></div>)}</div><p className="resource-note">Final firmware size and combined load depend on the selected modules and active tracks. The builder must measure the complete configuration. <a href={resourceSource(id)} target="_blank" rel="noreferrer">Read the measurement record ↗</a></p></section>
    <section className="quality-note"><h2>Test evidence & hardware status</h2><p>{data.quality}</p>{retained && <p>Test evidence comes from version {retained.moduleVersion}. This update changes documentation or media; module behavior and resource limits are unchanged.</p>}<a href={resourceSource(id)} target="_blank" rel="noreferrer">Source and test details ↗</a></section>
    <aside className="risk-note"><strong>Custom firmware · flash at your own risk</strong><p>{FLASHING_RISKS} Back up your projects and samples, read the module’s compatibility notes, and keep the original firmware. Passing tests does not guarantee safe operation on every device or configuration.</p><p>{FIRMWARE_SHARING_NOTICE}</p></aside>
    </div></details>
  </>
}
