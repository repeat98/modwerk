import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { issueMarkdown, issueTitle, type MirroredIssue } from '../../server/github'
import { DEVICES_BY_ID } from '../devices/registry'
import { catalogModules, CONFIGURATION_MODULES_REQUIRED, configurationSummary, validateConfigurationReportContext } from './configuration-report'
import { IssueInputError, type IssueContext } from './issue-context'
import { ModuleIssueCard } from './ModuleIssues'
import { communityModule } from './modules'
import type { PublicModuleIssue } from './issue-tracker'
import { parseOtLog } from './ot-log'
import { readFileSync } from 'node:fs'

const log = parseOtLog(readFileSync(new URL('../../sdk/runtime/logging/tests/expected.log', import.meta.url), 'utf8'))
const octatrack = (modules: { id: string; version: string }[]) => ({ model: 'mk2', flash: 'flashed', os: '1.40C', modules, keepStockFx2: true, build: '' })

describe('which modules a configuration report is about', () => {
  it('lists the catalog modules by community id and leaves out any the catalog does not have', () => {
    expect(catalogModules('octatrack', [{ id: 'miniverb', version: '0.1.0' }, { id: 'removed-long-ago', version: '1.0.0' }])).toEqual([{ id: 'miniverb', moduleId: 'miniverb', name: communityModule('miniverb')!.name, version: '0.1.0' }])
    // Digitakt modules are known by their native id in a configuration, and by machine-prefixed id everywhere else.
    expect(catalogModules('digitakt', [{ id: 'digihealth', version: '1.0.0' }]).map(item => item.id)).toEqual(['digitakt-digihealth'])
    expect(catalogModules('digitone', [{ id: 'digihealth', version: '1.0.0' }]).map(item => item.id)).toEqual(['digitone-digihealth'])
    expect(catalogModules('octatrack', [{ id: 'digihealth', version: '1.0.0' }])).toEqual([])
  })

  it('takes the modules from a log when there is one, and from the reporter otherwise', () => {
    const named = validateConfigurationReportContext(octatrack([{ id: 'synth', version: '0.1.0' }]))
    expect(named.modules.map(item => item.id)).toEqual(['synth'])
    const logged = validateConfigurationReportContext(octatrack([{ id: 'synth', version: '0.1.0' }]), log.summary)
    expect(logged.modules.map(item => item.id)).toEqual(['repitch', 'miniverb'])
    expect(logged.context.modules.map(item => item.version)).toEqual(['0.1.0', '0.1.2'])
  })

  it('needs at least one module the catalog still has', () => {
    for (const value of [octatrack([]), octatrack([{ id: 'removed-long-ago', version: '1.0.0' }])]) expect(() => validateConfigurationReportContext(value)).toThrow(IssueInputError)
    expect(() => validateConfigurationReportContext(octatrack([{ id: 'removed-long-ago', version: '1.0.0' }]))).toThrow(CONFIGURATION_MODULES_REQUIRED)
  })

  it('validates a Digitakt configuration with the machine’s own rules and refuses a log for it', () => {
    const device = DEVICES_BY_ID.digitakt, base = { machine: 'digitakt', model: device.variants?.[0] ?? device.name, flash: 'flashed', os: device.firmware!.releases[0], moduleVersion: '1.0.0', modules: [{ id: 'digihealth', version: '1.0.0' }], keepStockFx2: null, build: '' }
    expect(validateConfigurationReportContext(base).modules.map(item => item.id)).toEqual(['digitakt-digihealth'])
    expect(() => validateConfigurationReportContext({ ...base, os: 'not-an-os' })).toThrow(IssueInputError)
    expect(() => validateConfigurationReportContext({ ...base, machine: 'syntakt' })).toThrow(IssueInputError)
    expect(() => validateConfigurationReportContext(base, log.summary)).toThrow('structured reports only')
  })

  it('counts the modules', () => {
    expect(configurationSummary(1)).toBe('1 module')
    expect(configurationSummary(3)).toBe('3 modules')
  })
})

describe('the public GitHub issue for a configuration', () => {
  const issue = (owners: string[]): MirroredIssue => ({ id: 'r', module_id: 'miniverb', scope: 'configuration', moduleIds: ['miniverb', 'synth'], title: 'Freeze', reporter: 'someone', owners, details: { device: 'Octatrack MKII · OS 1.40C', version: '2 modules', steps: '', expected: '', actual: 'It freezes', modules: [{ id: 'miniverb', name: 'Mini Verb', version: '0.2.0' }, { id: 'synth', name: 'FM Synth', version: '0.1.2' }] } })
  it('is titled for the whole configuration', () => {
    expect(issueTitle(issue([]))).toBe('[configuration] Freeze')
  })
  it('puts a module report’s issue unchanged: module id title, one version row and the plain resolve command', () => {
    const markdown = issueMarkdown({ ...issue(['repeat98']), scope: 'module', moduleIds: undefined, details: { ...issue([]).details, modules: undefined, version: '0.2.0' } }, 'https://modwerk.app/')
    expect(markdown).toContain('for **`miniverb`** by')
    expect(markdown).toContain('| Module version | 0.2.0 |')
    expect(markdown).toContain('`/modwerk resolve <published-version> verified-download`')
    expect(markdown).not.toMatch(/whole configuration|Configuration \|/)
    expect(issueTitle({ module_id: 'miniverb', title: 'Freeze' })).toBe('[miniverb] Freeze')
  })
  it('publishes a full report’s configuration and log, leaving out the oldest records to fit GitHub', () => {
    const records = Array.from({ length: 3000 }, (_, index) => String(index).padStart(5, '0') + ' 00000000 I TEST 0001 00000000 00000000')
    const log = ['# OCTAMOD-LOG v2', '# configuration=```x', '# boot=1', ...records, '# complete=00000000'].join('\n')
    const context: IssueContext = { machine: 'octatrack', model: 'mk2', flash: 'flashed', os: '1.40C', modules: [{ id: 'miniverb', version: '0.2.0' }], keepStockFx2: null, build: 'c'.repeat(64) }
    const markdown = issueMarkdown({ ...issue([]), scope: 'module', moduleIds: undefined, details: { ...issue([]).details, modules: undefined, version: '0.2.0', full: true }, context, log }, 'https://modwerk.app/')
    expect(markdown.length).toBeLessThan(60000)
    expect(markdown).toContain('| Build fingerprint | `' + 'c'.repeat(64) + '` |')
    // A report from before the card/USB split stays readable; a new one says which.
    expect(markdown).toContain('| Firmware | Running a Modwerk build |')
    expect(issueMarkdown({ ...issue([]), scope: 'module', moduleIds: undefined, context: { ...context, flash: 'usb' } })).toContain('| Firmware | Running modules loaded over USB |')
    expect(markdown).toContain('### Configuration\n\n- `miniverb` 0.2.0')
    expect(markdown).toContain('Everything the reporter submitted is in this issue.')
    expect(markdown).toMatch(/OCTAMOD\.LOG \(oldest \d+ records left out to fit GitHub\)/)
    // The backticks in the header lengthen the fence; boot and completion lines stay in place.
    expect(markdown).toContain('````text\n# OCTAMOD-LOG v2\n# configuration=```x\n# boot=1\n')
    expect(markdown).toContain(records.at(-1) + '\n# complete=00000000\n````')
    expect(markdown).not.toContain(records[0])
    expect(markdown).toContain('### Module maintainer actions')
  })
})

describe('a configuration report in a module’s issue list', () => {
  const base: PublicModuleIssue = { id: 'r', title: 'Freeze with both loaded', url: 'https://github.com/repeat98/modwerk/issues/41', number: 41, reporter: 'listener', created_at: '2026-10-08 10:00:00', status: 'open', scope: 'configuration', details: { device: 'Octatrack MKII · OS 1.40C', version: '2 modules', steps: '', expected: '', actual: 'Freeze', modules: [{ id: 'sidechain-compressor', name: 'Sidechain Compressor', version: '0.1.1' }, { id: 'miniverb', name: 'Mini Verb', version: '0.2.0' }] } }
  it('says it covers the whole configuration and links each module', () => {
    const html = renderToStaticMarkup(createElement(ModuleIssueCard, { issue: base }))
    expect(html).toContain('Whole configuration')
    expect(html).toContain('<dt>Configuration</dt>')
    expect(html).toContain('href="#module/sidechain-compressor">Sidechain Compressor</a> 0.1.1')
    expect(html).toContain('href="#module/miniverb">Mini Verb</a> 0.2.0')
    expect(html).not.toContain('Module version')
  })
  it('keeps a module report as it was', () => {
    const html = renderToStaticMarkup(createElement(ModuleIssueCard, { issue: { ...base, scope: 'module', details: { ...base.details!, version: '0.2.0', modules: undefined } } }))
    expect(html).toContain('Module version')
    expect(html).not.toContain('Whole configuration')
  })
})
