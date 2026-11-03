import { describe, expect, it } from 'vitest'
import { isUsagePage, usagePage } from './usage-pages'
import { DEVICES } from '../devices/registry'

describe('closed page catalog', () => {
  it.each([
    ['all', 'library:all'], ['all/effects', 'library:all'], ['library', 'library:octatrack'],
    ['effects', 'library:octatrack'], ['configuration', 'configuration:octatrack'],
    ['digitakt', 'library:digitakt'], ['digitone/configuration', 'configuration:digitone'],
    ['module/miniverb?report=1', 'module:miniverb'], ['digitakt/module/digihealth', 'module:digitakt-digihealth'],
    ['module/private', 'unclassified'], ['digitone/module/unknown', 'unclassified'],
    ['module-set/secret-id', 'module-set'], ['community-module/secret-id', 'community-module'],
    ['forum?search=secret', 'forum'], ['forum/new', 'forum-compose'], ['forum/shoutbox', 'forum-shoutbox'],
    ['privacy', 'privacy'], ['account/verify/private-token', 'account'], ['developer/private-id', 'developer'],
    ['__proto__', 'unclassified'], ['admin?tab=statistics', null], ['admin/private', null], ['review', null],
    ['device/digitakt', null], ['devices', null], ['your-octatrack', null], ['octatrack', 'octatrack-status'],
    ['overview', 'overview'], ['faq/installing', 'faq'], ['octatrack/backups', 'octatrack-backups'],
    ['octatrack/samples', 'octatrack-samples'], ['octatrack/setup', 'octatrack-setup'],
    ['beta/join/private-campaign', 'account'], ['page-not-found', 'missing-page'],
  ])('maps %s without exposing arbitrary route content', (route, page) => {
    expect(usagePage(route)).toBe(page)
    if (page) expect(isUsagePage(page)).toBe(true)
  })
  it('keeps renderer-confirmed missing pages separate from unknown analytics classifications', () => {
    expect(usagePage('new-page?private=secret')).toBe('unclassified')
    expect(usagePage('new-page?private=secret', true)).toBe('missing-page')
    expect(usagePage('module/unknown', true)).toBe('missing-page')
    expect(usagePage('admin/private', true)).toBeNull()
    expect(isUsagePage('page-not-found')).toBe(true)
  })
  it('provides fixed library and configurator labels for the machine registry', () => {
    for (const device of DEVICES.filter(device => device.id !== 'octatrack')) {
      expect(usagePage(device.id)).toBe('library:' + device.id)
      expect(usagePage(device.id + '/configuration')).toBe('configuration:' + device.id)
      expect(isUsagePage(usagePage(device.id + '/configuration'))).toBe(true)
    }
  })
  it.each(['__proto__', 'constructor', 'account/verify/secret', 'forum?search=secret', 'module:unknown', 'library:unknown', 'https://modwerk.app/#account', '', null, {}])('rejects non-catalog page keys: %s', value => expect(isUsagePage(value)).toBe(false))
})
