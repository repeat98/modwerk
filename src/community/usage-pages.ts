import { LIBRARY_CATEGORIES } from '../catalog/modules'
import { DEVICES, parseDeviceRoute } from '../devices/registry'
import { COMMUNITY_MODULES, nativeModule } from './modules'

const sections = {
  forum: 'Forum', 'forum-thread': 'Forum · discussions', 'forum-profile': 'Forum · profiles',
  'forum-messages': 'Private messages', 'forum-compose': 'New discussion', 'forum-shoutbox': 'Shoutbox archive',
  account: 'Account', developer: 'Creator settings', 'module-sets': 'Module sets', 'module-set': 'Module set details',
  'community-module': 'Community module details', submit: 'Submit a module', faq: 'FAQ', credits: 'Credits', projects: 'Other projects',
  privacy: 'Privacy notice', impressum: 'Impressum', 'community-rules': 'Community rules',
  'report-content': 'Report content', 'page-not-found': 'Page not found',
}
/** The same finite catalog validates incoming page keys and supplies readable administrator labels. */
export const USAGE_PAGES: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries([
  ...Object.entries(sections), ['library:all', 'Library · all machines'],
  ...DEVICES.map(device => ['library:' + device.id, 'Library · ' + device.name]),
  ...DEVICES.filter(device => ['octatrack', 'digitakt', 'digitone'].includes(device.id)).map(device => ['configuration:' + device.id, 'Configurator · ' + device.name]),
  ...COMMUNITY_MODULES.map(module => ['module:' + module.id, module.name + ' · ' + (DEVICES.find(device => device.id === module.machine)?.name ?? module.machine)]),
]))
export function isUsagePage(value: unknown): value is string { return typeof value === 'string' && Object.hasOwn(USAGE_PAGES, value) }
export function usagePageLabel(page: string) { return USAGE_PAGES[page] ?? 'Previously listed page' }

/** Only these fixed labels leave the browser. Never return a route, query, username, token or arbitrary ID. */
export function usagePage(route: string): string | null {
  const path = route.split('?')[0], [section] = path.split('/')
  if (section === 'admin' || section === 'review' || section === 'device' || path === 'devices' || path === 'octatrack') return null
  if (path === 'all' || path.startsWith('all/') && LIBRARY_CATEGORIES.some(category => path === 'all/' + category)) return 'library:all'
  if (path === 'library' || LIBRARY_CATEGORIES.some(category => path === category)) return 'library:octatrack'
  if (path === 'configuration') return 'configuration:octatrack'
  if (path.startsWith('module/')) { const page = 'module:' + path.slice(7); return isUsagePage(page) ? page : 'page-not-found' }
  const device = DEVICES.some(device => device.id === section) ? parseDeviceRoute(path) : undefined
  if (device) {
    if (device.view === 'module') { const module = nativeModule(device.device.id, device.moduleId!); return module ? 'module:' + module.id : 'page-not-found' }
    if (device.view === 'configuration') { const page = 'configuration:' + device.device.id; return isUsagePage(page) ? page : 'page-not-found' }
    return !device.category || LIBRARY_CATEGORIES.some(category => category === device.category) ? 'library:' + device.device.id : 'page-not-found'
  }
  if (section === 'forum') {
    const view = path.split('/')[1]
    return view === 'thread' ? 'forum-thread' : view === 'profile' ? 'forum-profile' : view === 'messages' ? 'forum-messages'
      : view === 'new' ? 'forum-compose' : view === 'shoutbox' ? 'forum-shoutbox' : 'forum'
  }
  if (['account', 'developer', 'submit', 'module-set', 'community-module'].includes(section)) return section
  return Object.hasOwn(sections, path) ? path : 'page-not-found'
}
