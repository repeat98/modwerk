import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ModuleStability, StabilityLevel } from '../catalog/module-stability'
import type { ModuleStatistics } from '../community/module-statistics'
import { CardProof } from './ModuleCard'
import { MODULE_COMPARE_ENABLED } from './module-compare'

const noop = () => {}
const grade = (level: StabilityLevel, label = 'Limited real-world testing'): ModuleStability => ({ level, label, detail: 'Detail for ' + level + '.' })
const render = (stability: ModuleStability, statistics?: Partial<ModuleStatistics>) =>
  renderToStaticMarkup(createElement(CardProof, { stability, statistics: statistics as ModuleStatistics | undefined, name: 'Miniverb', compared: false, canCompare: true, onCompare: noop }))

describe('library card footer', () => {
  it('names the level on the footer and draws the three-step meter for every grade except a confirmed bug', () => {
    for (const [level, label] of [['limited', 'Limited testing'], ['in-use', 'In regular use'], ['proven', 'Widely used'], ['pending', 'Build pending']] as const) {
      const html = render(grade(level))
      expect(html).toContain('data-level="' + level + '"')
      expect(html).toContain('>' + label + '</span>')
      expect(html.match(/<span class="grade-meter" aria-hidden="true">(<span><\/span>){3}<\/span>/g)).toHaveLength(1)
      expect(html).toContain('Detail for ' + level + '.')
    }
  })

  it('swaps the meter for a warning mark and keeps the bug count as the label', () => {
    const html = render(grade('reported', '2 confirmed bugs'))
    expect(html).toContain('data-level="reported"')
    expect(html).toContain('>2 confirmed bugs</span>')
    expect(html).not.toContain('grade-meter')
    expect(html).toContain('<svg')
  })

  it('shows each report count in its own colour class and says what it counts', () => {
    const html = render(grade('limited'), { unconfirmedIssues: 3, needsInfoIssues: 1 })
    expect(html).toContain('card-proof-count is-review')
    expect(html).toContain('card-proof-count is-waiting')
    expect(html).toContain('2<span class="sr-only"> unconfirmed reports</span>')
    expect(html).toContain('1<span class="sr-only"> waiting for reporter details</span>')
  })

  it('shows no counts when nothing is open, and offers Compare only while comparing is switched on', () => {
    const html = render(grade('limited'), { unconfirmedIssues: 0, needsInfoIssues: 0 })
    expect(html).not.toContain('card-proof-reports')
    if (MODULE_COMPARE_ENABLED) expect(html).toContain('Compare<span class="sr-only"> Miniverb</span>')
    else expect(html).not.toContain('Compare')
  })
})
