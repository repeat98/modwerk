import registry from '../.github/module-authors.json'
import machines from '../src/devices/machines.generated.json'
import type { MachineProfile } from '../src/devices/machine-contract'
import type { ContributionRoles } from '../src/community/member-standing'
import type { Database, Env } from './platform'

const authors = new Set<number>(Object.values(registry.accounts))
const profiles: readonly Pick<MachineProfile, 'id' | 'deviceReviewers'>[] = machines
export function contributionRoles(ids: readonly number[], collaborators: ReadonlySet<number>, devices = profiles): ContributionRoles {
  const reviews = devices.filter(machine => machine.deviceReviewers?.some(id => ids.includes(id))).map(machine => machine.id)
  const roles: ContributionRoles['roles'] = []
  if (ids.some(id => authors.has(id))) roles.push('modder')
  if (reviews.length) roles.push('device-reviewer')
  if (ids.some(id => collaborators.has(id))) roles.push('maintainer')
  return { roles: roles.length ? roles : ['contributor'], reviewDevices: reviews }
}

// Public badges only. The merge job always checks the approving account's current permission on GitHub.
let cache: { repo: string; expires: number; ids: Promise<Set<number>> } | undefined
async function collaboratorIds(env?: Env) {
  const token = env?.MAINTENANCE_BOT_GITHUB_TOKEN, repo = env?.GITHUB_REPOSITORY ?? 'repeat98/modwerk'
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return new Set<number>()
  if (cache?.repo === repo && cache.expires > Date.now()) return cache.ids
  const ids = (async () => {
    const result = new Set<number>()
    for (let page = 1; ; page++) {
      const reply = await fetch('https://api.github.com/repos/' + repo + '/collaborators?per_page=100&page=' + page, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'modwerk-role-badges' },
        redirect: 'error', signal: AbortSignal.timeout(3000),
      })
      if (!reply.ok) throw new Error('Collaborator lookup failed')
      const rows = await reply.json() as { id: number; permissions?: { push?: boolean } }[]
      for (const row of rows) if (row.permissions?.push) result.add(row.id)
      if (rows.length < 100) return result
    }
  })().catch(() => new Set<number>())
  cache = { repo, expires: Date.now() + 300_000, ids }
  return ids
}

export async function contributionBadges(db: Database, members: string[], env?: Env) {
  const ids = [...new Set(members)], badges = new Map<string, ContributionRoles>()
  if (!ids.length) return badges
  const slots = ids.map(() => '?').join(',')
  const { results } = await db.prepare(`SELECT u.id, u.github_id AS github FROM users u WHERE u.suspended=0 AND u.id IN (${slots})
    UNION SELECT u.id, a.accountId FROM users u JOIN auth_accounts a ON a.userId=u.id
    WHERE u.suspended=0 AND a.providerId='github' AND u.id IN (${slots})`).bind(...ids,...ids).all<{ id: string; github: string | null }>()
  const collaborators = results.some(row => row.github) ? await collaboratorIds(env) : new Set<number>()
  for (const member of ids) {
    const identity = results.filter(row => row.id === member)
    if (identity.length) badges.set(member, contributionRoles(identity.flatMap(row => row.github ? [Number(row.github)] : []), collaborators))
  }
  return badges
}
