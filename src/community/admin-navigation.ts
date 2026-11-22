export const reviewQueues = [
  { id: 'issues', label: 'Issue inbox', description: 'Open issue reports', icon: 'warn' },
  { id: 'forum', label: 'Forum moderation', description: 'Unreviewed forum reports', icon: 'message' },
  { id: 'requests', label: 'Account requests', description: 'Active removal requests', icon: 'shield' },
] as const

export const toolGroups = [
  { label: 'Activity', sections: [
    { id: 'statistics', label: 'Statistics', description: 'Site usage and community activity' },
    { id: 'octatrack', label: 'Octatrack', description: 'USB syncs, diagnostics and tester mail' },
  ] },
  { label: 'Community', sections: [
    { id: 'accounts', label: 'Accounts and access', description: 'Member roles, beta access and account email' },
    { id: 'comments', label: 'Module comments', description: 'Review discussions on module pages' },
    { id: 'announcements', label: 'Announcements', description: 'Publish notices on the site' },
    { id: 'news', label: 'News email', description: 'Compose and send member updates' },
  ] },
  { label: 'Contributions', sections: [
    { id: 'modules', label: 'Published modules', description: 'Manage approved contributions' },
    { id: 'review', label: 'Module pull requests', description: 'Review changes on GitHub' },
    { id: 'history', label: 'Review history', description: 'Read past decisions and review notes' },
  ] },
] as const

export const adminGroups = [{ label: 'Review queues', sections: reviewQueues }, ...toolGroups]
export type AdminSection = typeof adminGroups[number]['sections'][number]['id']
const sections = adminGroups.flatMap(group => [...group.sections])

export function adminSectionFor(path: string) {
  return sections.find(section => path === 'admin/' + section.id)
}

export function isAdminRoute(route: string) {
  const path = route.split('?')[0]
  return path === 'review' || path === 'admin' || !!adminSectionFor(path)
}

export function adminHref(section: AdminSection, moduleId = '', status = 'open') {
  const params = new URLSearchParams()
  if (section === 'issues') {
    if (moduleId) params.set('module', moduleId)
    if (status !== 'open') params.set('status', status)
  }
  return '#admin/' + section + (params.size ? '?' + params : '')
}
