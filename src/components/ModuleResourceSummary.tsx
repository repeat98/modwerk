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
      {indicators.map(indicator => {
        const hasScale = indicator.score !== null
        const unscaledValue = !hasScale && indicator.valueText !== undefined
        return <div className={'resource-gauge resource-gauge-' + indicator.id} key={indicator.id}>
          <dt>{indicator.label}</dt>
          <dd>
            <div className="resource-gauge-dial" data-unscaled={unscaledValue || undefined}
              role={hasScale ? 'meter' : unscaledValue ? undefined : 'img'}
              aria-label={unscaledValue ? undefined : indicator.ariaLabel ?? (indicator.label + ' relative load' + (hasScale ? '' : ': ' + indicator.status))}
              aria-valuemin={hasScale ? 0 : undefined} aria-valuemax={hasScale ? indicator.maximum ?? 4 : undefined} aria-valuenow={indicator.score ?? undefined}
              aria-valuetext={hasScale ? indicator.valueText ?? indicator.value + ' · ' + indicator.status.toLowerCase() + ' relative load' : undefined}>
              <svg viewBox="0 0 96 54" fill="none" aria-hidden="true">
                <path className="resource-gauge-track" d="M 8 48 A 40 40 0 0 1 88 48" pathLength="100" />
                {hasScale && indicator.fill > 0 && <path className="resource-gauge-fill" d="M 8 48 A 40 40 0 0 1 88 48" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - indicator.fill} />}
              </svg>
              {unscaledValue
                ? <strong><span aria-hidden="true">{indicator.value}</span><span className="sr-only">{indicator.valueText}</span></strong>
                : <strong aria-hidden="true">{indicator.value}</strong>}
            </div>
            <span className="resource-gauge-status">{indicator.status}</span>
          </dd>
        </div>
      })}
    </dl>
    <details className="module-resource-evidence">
      <summary>How we rate load <Icon name="plus" size={12} /></summary>
      <div className="resource-evidence-panel" role="region" aria-label="Resource evidence" tabIndex={0}>{evidence}</div>
    </details>
  </aside>
}
