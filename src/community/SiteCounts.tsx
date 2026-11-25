// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { UsageStatistics } from './usage-contract'

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 100) + ' %' : '—'
const SOURCE_LABELS: Record<string, string> = { direct: 'Direct or unknown', 'other-search': 'Other search engines', chatgpt: 'ChatGPT', claude: 'Claude', github: 'GitHub', youtube: 'YouTube', duckduckgo: 'DuckDuckGo', cdm: 'CDM', x: 'X / Twitter', 'discord-bot': 'Discord (TARS replies)', push: 'Push notifications', 'github-readme': 'GitHub README', 'forum-feed': 'Forum feed', 'forum-share': 'Shared forum links', mail: 'Email (webmail)', 'mail-news': 'Modwerk news mail', 'mail-activity': 'Modwerk activity mail', 'mail-welcome': 'Modwerk welcome mail', 'mail-beta': 'Modwerk beta mail', other: 'Other sites' }
const label = (source: string) => SOURCE_LABELS[source] ?? source[0].toUpperCase() + source.slice(1)
/** Where page loads came from, how the sign-in prompt was answered and how the support thank-you did. */
export function SiteCounts({ data }: { data: UsageStatistics }) {
  if (data.siteCounts === undefined) return <section className="page-traffic"><h3>Where visits come from</h3><p className="service-note">Not available from this backend yet.</p></section>
  if (!data.siteCountsStarted) return <section className="page-traffic"><h3>Where visits come from</h3><p className="service-note">Waiting for the first count.</p></section>
  const of = (event: string) => data.siteCounts!.filter(row => row.event === event)
  const sources = of('visit_source'), total = sources.reduce((sum, row) => sum + row.count, 0)
  const prompt = new Map(of('sign_in_prompt').map(row => [row.detail, row.count]))
  const support = new Map(of('support_prompt').map(row => [row.detail, row.count])), thanks = (outcome: string) => support.get(outcome) ?? 0
  const started = `Counting began ${data.siteCountsStarted.slice(0, 10)}; the first day and today are partial.`
  return <section className="page-traffic" aria-labelledby="site-counts-title">
    <h3 id="site-counts-title">Where visits come from</h3>
    <p className="service-note">{format(total)} page loads from outside the site · {data.from} – {data.to} UTC. {started} Reloads and pages reached within the site are not counted; one person can arrive several times.</p>
    {sources.length ? <div className="statistics-table" role="region" aria-label="Visit sources" tabIndex={0}><table>
      <thead><tr><th scope="col">Source</th><th scope="col">Page loads</th><th scope="col">Share</th></tr></thead>
      <tbody>{sources.map(row => <tr key={row.detail}><th scope="row">{label(row.detail)}</th><td>{format(row.count)}</td><td>{percent(row.count, total)}</td></tr>)}</tbody>
    </table></div> : <p className="service-note">No visits counted in this period.</p>}
    <h3>Sign-in prompt</h3>
    <div className="statistics-table" role="region" aria-label="Sign-in prompt answers" tabIndex={0}><table>
      <caption>Before a firmware build the prompt can be skipped; elsewhere it guards a like, follow or reply. Sign-up rate = Create account ÷ Shown.</caption>
      <thead><tr><th scope="col">Prompt</th><th scope="col">Shown</th><th scope="col">Sign in</th><th scope="col">Create account</th><th scope="col">Skipped</th><th scope="col">Closed</th><th scope="col">Sign-up rate</th></tr></thead>
      <tbody>{(['gate', 'other'] as const).map(kind => { const n = (outcome: string) => prompt.get(`${kind}-${outcome}`) ?? 0
        return <tr key={kind}><th scope="row">{kind === 'gate' ? 'Before a build' : 'Member actions'}</th><td>{format(n('shown'))}</td><td>{format(n('sign-in'))}</td><td>{format(n('create-account'))}</td><td>{kind === 'gate' ? format(n('skipped')) : '—'}</td><td>{format(n('closed'))}</td><td>{percent(n('create-account'), n('shown'))}</td></tr> })}</tbody>
    </table></div>
    <h3>Support thank-you</h3>
    <div className="statistics-table" role="region" aria-label="Support thank-you answers" tabIndex={0}><table>
      <caption>Shown on a later visit, at most once in 60 days per browser: after the 5th, 25th, 100th… install, on the 10th and 30th day of use, after a base install or update. Closed = Escape. Click rate = Ko-fi ÷ Shown.</caption>
      <thead><tr><th scope="col">Earned by</th><th scope="col">Shown</th><th scope="col">Ko-fi</th><th scope="col">Not now</th><th scope="col">Closed</th><th scope="col">Don’t show again</th><th scope="col">Click rate</th></tr></thead>
      <tbody>{([['installs', 'Install milestones'], ['days', 'Days of use'], ['base', 'Base installed']] as const).map(([kind, name]) => <tr key={kind}><th scope="row">{name}</th><td>{format(thanks(kind + '-shown'))}</td><td>{format(thanks(kind + '-kofi'))}</td><td>{format(thanks(kind + '-later'))}</td><td>{format(thanks(kind + '-closed'))}</td><td>{format(thanks(kind + '-never'))}</td><td>{percent(thanks(kind + '-kofi'), thanks(kind + '-shown'))}</td></tr>)}</tbody>
    </table></div>
    <h3>Ko-fi clicks by place</h3>
    <div className="statistics-table" role="region" aria-label="Ko-fi clicks by place" tabIndex={0}><table>
      <caption>Clicks on the Modwerk Ko-fi link, which opens in a new tab; whether a tip followed is only known to Ko-fi. Module authors’ own cups are not included.</caption>
      <thead><tr><th scope="col">Place</th><th scope="col">Clicks</th></tr></thead>
      <tbody>{([['Thank-you dialog', ['installs-kofi', 'days-kofi', 'base-kofi']], ['Line on install screens', ['line-kofi']], ['Contribute to Modwerk dialog', ['dialog-kofi']], ['Bell notification', ['bell-kofi']], ['Announcement card', ['announcement-kofi']], ['Signup welcome', ['welcome-kofi']]] as const).map(([name, keys]) => <tr key={name}><th scope="row">{name}</th><td>{format(keys.reduce((sum, key) => sum + thanks(key), 0))}</td></tr>)}</tbody>
    </table></div>
  </section>
}
