import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Session } from './api'
import { BuildFollowUp } from './BuildFollowUp'
import { builtModules, hardwareReportBody } from './build-follow-up'
import { CommunityContext } from './context'
import { communityModule } from './modules'
import { downloadedReportContext } from './build-follow-up'
import { resolveReportConfiguration, defaultConfigurationChoice } from './report-configuration'
import { IssueReport } from './IssueReport'
import { DigiIssueReport } from './DigiIssueReport'

const member: Session = { available: true, admin: false, user: { id: 'member', displayName: 'Member', username: 'member', verified: true } }
function render(session: Session, ids: string[]) {
  return renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
    createElement(BuildFollowUp, { machine: 'Octatrack', os: '1.40C', modules: builtModules(ids) })))
}

describe('after a firmware download', () => {
  it('names the catalog modules of a build with the versions the build used', () => {
    const miniverb = communityModule('miniverb')!, digi = communityModule('digitakt-digihealth')!
    expect(builtModules(['miniverb', 'not-a-module'], { miniverb: '9.9.9' })).toEqual([{ id: 'miniverb', name: miniverb.name, version: '9.9.9' }])
    expect(builtModules(['digitakt-digihealth'])).toEqual([{ id: 'digitakt-digihealth', name: digi.name, version: digi.version }])
  })
  it('writes a hardware report that names the unit, the OS and the rest of the build', () => {
    const [verb, echo] = [{ id: 'a', name: 'Verb', version: '1.0.0' }, { id: 'b', name: 'Echo', version: '0.2.0' }]
    expect(hardwareReportBody('Octatrack', '1.40C', verb, [verb, echo])).toBe('**Works on my Octatrack** (OS 1.40C) · Verb 1.0.0, built together with Echo 0.2.0.')
    expect(hardwareReportBody('Digitakt', '', verb, [verb])).toBe('**Works on my Digitakt** · Verb 1.0.0.')
  })
  it('offers members a one-click confirmation on each module after automatic update follows', () => {
    const html = render(member, ['miniverb'])
    expect(html).toContain('After you flash')
    expect(html).not.toContain('Follow this module')
    expect(html).toContain('works on my Octatrack')
    expect(html).toContain('>Works for me</button>')
    expect(html).toContain('saves your confirmation with the build details')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('aria-expanded')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-label="Report an issue with Mini Verb"')
    expect(html).not.toContain('?report=1')
  })
  it('offers explicit selection for several modules without preselecting companions', () => {
    const html = render(member, ['miniverb', 'tapeecho'])
    expect(html).toContain('Select all — I tested every module shown')
    expect(html).toContain('Select Mini Verb as tested')
    expect(html).toContain('Select Tape Echo as tested')
    expect(html).toContain('Report selected working')
    expect(html).not.toContain('checked=')
    expect(html).toContain('No forum post.')
  })
  it('embeds only pending choices in a reminder without another heading', () => {
    const html = renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session: member, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } },
      createElement(BuildFollowUp, { machine: 'Octatrack', os: '1.40C', modules: builtModules(['miniverb', 'tapeecho']), pendingIds: ['tapeecho'], embedded: true })))
    expect(html).toContain('Tape Echo')
    expect(html).not.toContain('Mini Verb')
    expect(html).not.toContain('After you flash')
    expect(html).not.toContain('<h2')
    expect(html).toContain('Module hardware feedback')
  })
  it('shows nothing without a verified member or without catalog modules', () => {
    expect(render({ ...member, user: { ...member.user!, verified: false } }, ['miniverb'])).toBe('')
    expect(render(member, [])).toBe('')
  })
  it('attaches the downloaded versions instead of a later active configuration or current catalog', () => {
    const modules = [{ id: 'miniverb', name: 'Mini Verb', version: '0.1.1-experimental' }, { id: 'euclid', name: 'Euclid', version: '0.1.2-experimental' }]
    const workspace = downloadedReportContext({ machine: 'Octatrack', os: '1.40C', modules })
    expect(resolveReportConfiguration(defaultConfigurationChoice(['miniverb']), workspace, 'octatrack', null)).toMatchObject({ source: 'saved', name: 'Downloaded build', modules: [{ id: 'miniverb', version: modules[0].version }, { id: 'euclid', version: modules[1].version }], build: '', keepStockFx2: null })
    const html = renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session: member, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(IssueReport, { id: 'miniverb', author: 'repeat98', embedded: true, workspaceContext: workspace, baseOs: '1.40C' })))
    expect(html).toContain('class="issue-report" open=""')
    expect(html).toContain('Downloaded build (active)')
    expect(html).toMatch(/<input[^>]*required=""[^>]*name="title"/)
    expect(html).toContain('name="actual" required=""')
    expect(html).toContain('Post report')
  })
  it('prefills machine-specific reports with native IDs and the downloaded OS and version', () => {
    const module = communityModule('digitakt-digihealth')!
    const workspace = downloadedReportContext({ machine: 'Digitakt', os: '1.54', modules: [{ id: module.id, name: module.name, version: '0.1.0' }] })
    expect(workspace.modules).toEqual([{ id: 'digihealth', version: '0.1.0' }])
    const html = renderToStaticMarkup(createElement(CommunityContext.Provider, { value: { session: member, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {} } }, createElement(DigiIssueReport, { id: module.id, embedded: true, workspaceContext: workspace, baseOs: '1.54', moduleVersion: '0.1.0' })))
    expect(html).toContain('<option selected="">1.54</option>')
    expect(html).toContain('name="moduleVersion"')
    expect(html).toContain('value="0.1.0"')
  })
})
