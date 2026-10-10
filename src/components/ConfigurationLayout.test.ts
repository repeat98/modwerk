import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { newConfiguration } from '../config/workspace'
import { FIRMWARE_SHARING_NOTICE, FLASHING_RISKS } from '../firmware-notices'
import { ConfigurationHeader, RiskAcceptance } from './ConfigurationLayout'

const header = { kicker: 'YOUR WORKSPACE', meta: 'Octatrack', configurations: [], onSelect: vi.fn(), onDialog: vi.fn(), onImport: vi.fn(), shareHref: '#forum', canReport: true, onReport: vi.fn() }

describe('configuration page layout', () => {
  it('makes the name the switcher and keeps the other actions behind one menu button', () => {
    const first = newConfiguration('Live set'), second = newConfiguration('Studio')
    const html = renderToStaticMarkup(createElement(ConfigurationHeader, { ...header, configuration: second, configurations: [first, second] }))
    expect(html).toMatch(/<h1><select class="configuration-switcher" aria-label="Choose configuration">/)
    expect(html).toContain('<option value="' + second.id + '" selected="">Studio</option>')
    expect(html).toContain('aria-label="Configuration actions"')
    expect(html).not.toContain('Delete')
  })

  it('keeps Report a problem in view beside New, off while the configuration has no modules', () => {
    const configuration = newConfiguration('Live set')
    const open = renderToStaticMarkup(createElement(ConfigurationHeader, { ...header, configuration, configurations: [configuration] }))
    expect(open).toMatch(/<button class="button button-quiet module-issue-action" aria-haspopup="dialog">.*Report a problem<\/button>/)
    const empty = renderToStaticMarkup(createElement(ConfigurationHeader, { ...header, canReport: false, configuration, configurations: [configuration] }))
    expect(empty).toMatch(/<button class="button button-quiet module-issue-action" disabled="" aria-haspopup="dialog">/)
    expect(renderToStaticMarkup(createElement(ConfigurationHeader, header))).not.toContain('Report a problem')
  })

  it('shows only New and the empty title without a configuration', () => {
    const html = renderToStaticMarkup(createElement(ConfigurationHeader, { ...header, emptyTitle: 'No Digitakt configuration yet' }))
    expect(html).toContain('<h1>No Digitakt configuration yet</h1>')
    expect(html).toContain('New')
    expect(html).not.toContain('Configuration actions')
  })

  it('keeps the full flashing and sharing notices beside the acknowledgement', () => {
    const html = renderToStaticMarkup(createElement(RiskAcceptance, { checked: false, onChange: vi.fn() }))
    expect(html).toContain(FLASHING_RISKS)
    expect(html).toContain(FIRMWARE_SHARING_NOTICE)
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('I understand the risks of flashing custom firmware.')
  })
})
