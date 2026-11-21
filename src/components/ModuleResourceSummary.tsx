import type { ReactNode } from 'react'
import { Icon } from './Icon'

export type ResourceIndicator = {
  id: 'cpu' | 'dsp' | 'memory'; label: string; value: string; status: string
  score: number | null; maximum?: number; fill: number; valueText?: string; ariaLabel?: string
}

export function ModuleResourceSummary({ heading = 'Estimated load', indicators, evidence }: { heading?: string; indicators: ResourceIndicator[]; evidence: ReactNode }) {
  return <aside className="module-resource-summary" aria-label="Module resource usage">
    <h2>{heading}</h2>
    <dl className="module-resource-gauges">
      {indicators.map(indicator => <div className={'resource-gauge resource-gauge-' + indicator.id} key={indicator.id}>
        <dt>{indicator.label}</dt>
        <dd>
          {indicator.score === null && indicator.valueText !== undefined ? <div className="resource-gauge-dial">
            <strong><span aria-hidden="true">{indicator.value}</span><span className="sr-only">{indicator.valueText}</span></strong>
          </div> : <div className="resource-gauge-dial" role={indicator.score === null ? 'img' : 'meter'}
            aria-label={indicator.ariaLabel ?? (indicator.label + ' relative load' + (indicator.score === null ? ': ' + indicator.status : ''))}
            aria-valuemin={indicator.score === null ? undefined : 0} aria-valuemax={indicator.score === null ? undefined : indicator.maximum ?? 4} aria-valuenow={indicator.score ?? undefined}
            aria-valuetext={indicator.score === null ? undefined : indicator.valueText ?? indicator.value + ' · ' + indicator.status.toLowerCase() + ' relative load'}>
            <svg viewBox="0 0 96 54" fill="none" aria-hidden="true">
              <path className="resource-gauge-track" d="M 8 48 A 40 40 0 0 1 88 48" pathLength="100" />
              <path className="resource-gauge-fill" d="M 8 48 A 40 40 0 0 1 88 48" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - indicator.fill} />
            </svg>
            <strong aria-hidden="true">{indicator.value}</strong>
          </div>}
          <span className="resource-gauge-status">{indicator.status}</span>
        </dd>
      </div>)}
    </dl>
    <details className="module-resource-evidence">
      <summary>How we rate load <Icon name="plus" size={12} /></summary>
      <div className="resource-evidence-panel" role="region" aria-label="Resource evidence" tabIndex={0}>{evidence}</div>
    </details>
  </aside>
}
