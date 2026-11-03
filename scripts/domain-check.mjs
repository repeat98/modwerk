// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Reports whether the DNS, mail and hosting records for a Modwerk domain are ready, stage by stage.
// It only reads public DNS (through Cloudflare's DNS-over-HTTPS resolver) and public web pages;
// it needs no credentials and is not part of npm run check. See docs/DOMAIN_AND_MAIL.md.
//
//   node scripts/domain-check.mjs mail            # Resend + DMARC records, before launch
//   node scripts/domain-check.mjs pages           # GitHub Pages records, at launch
//   node scripts/domain-check.mjs worker          # the community API accepts the new origin
//   node scripts/domain-check.mjs redirect        # the old domain hands visitors over
//   node scripts/domain-check.mjs all
import { pathToFileURL } from 'node:url'

export const PAGES_V4 = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153']
export const PAGES_V6 = ['2606:50c0:8000::153', '2606:50c0:8001::153', '2606:50c0:8002::153', '2606:50c0:8003::153']
export const STAGES = ['mail', 'pages', 'worker', 'redirect']
const DEFAULTS = { domain: 'modwerk.app', legacy: 'octamod.app', owner: 'repeat98', api: 'https://octamod-community.octamod.workers.dev' }

const txtValue = record => record.replace(/^"|"$/g, '').replace(/"\s+"/g, '')
const unique = values => [...new Set(values)]
const sameSet = (values, expected) => expected.every(value => values.includes(value))

/**
 * Turns collected facts into check results. Pure, so it can be tested without a network.
 * level 'required' failures fail the stage; 'advice' failures are only reported.
 */
export function evaluate(stage, facts, options = {}) {
  const { domain, legacy, owner } = { ...DEFAULTS, ...options }
  const checks = []
  const add = (id, label, ok, hint, level = 'required') => checks.push({ id, label, ok, hint: ok ? '' : hint, level })
  if (stage === 'mail') {
    const dkim = (facts.dkim ?? []).map(txtValue)
    add('dkim', `DKIM key at resend._domainkey.${domain}`, dkim.some(value => /p=[A-Za-z0-9+/=]{100,}/.test(value)),
      'Add the DKIM TXT record exactly as the Resend dashboard shows it for this domain.')
    add('send', `Return-path host send.${domain}`, (facts.sendMx ?? []).length > 0 || (facts.sendTxt ?? []).some(value => /v=spf1/.test(txtValue(value))),
      'Add the send record from the Resend dashboard (a CNAME in the current setup; MX and SPF TXT in the older one).')
    add('dmarc', `DMARC policy at _dmarc.${domain}`, (facts.dmarc ?? []).some(value => /^v=DMARC1;/i.test(txtValue(value))),
      'Add a TXT record at _dmarc with the value v=DMARC1; p=none; and tighten it only after delivery is proven.')
    const root = (facts.rootTxt ?? []).map(txtValue).find(value => value.startsWith('v=spf1'))
    add('root-spf', `Root SPF at ${domain} sends nothing`, root === 'v=spf1 -all' || root === undefined,
      `Root SPF is "${root}". Resend sends from the send subdomain, so replace the registrar default with v=spf1 -all once the site records point at GitHub Pages ("+a" would authorise the Pages addresses).`, 'advice')
    const mx = (facts.rootMx ?? []).join(' ')
    add('inbound', `Mail to @${domain} is received somewhere`, !/your-server\.de/.test(mx) && mx.length > 0,
      'The registrar default MX has no mailbox behind it, so mail to support@ would bounce. Add a forwarder (docs/DOMAIN_AND_MAIL.md) before publishing a support address on this domain.', 'advice')
  } else if (stage === 'pages') {
    add('challenge', `GitHub Pages verification TXT at _github-pages-challenge-${owner}.${domain}`, (facts.challenge ?? []).length > 0,
      'Verify the domain in GitHub (Settings → Pages → Add a domain) and add the TXT record it shows, before pointing any address at Pages.')
    add('apex-a', `${domain} A records are GitHub Pages`, sameSet(facts.apexA ?? [], PAGES_V4) && (facts.apexA ?? []).every(value => PAGES_V4.includes(value)),
      `Found ${(facts.apexA ?? []).join(', ') || 'none'}; expected exactly ${PAGES_V4.join(', ')}.`)
    add('apex-aaaa', `${domain} AAAA records are GitHub Pages`, sameSet(facts.apexAaaa ?? [], PAGES_V6) && (facts.apexAaaa ?? []).every(value => PAGES_V6.includes(value)),
      `Found ${(facts.apexAaaa ?? []).join(', ') || 'none'}; expected exactly ${PAGES_V6.join(', ')}. Remove the registrar's default AAAA record.`)
    add('www', `www.${domain} is a CNAME to ${owner}.github.io`, (facts.www ?? []).some(value => value.replace(/\.$/, '').toLowerCase() === `${owner}.github.io`),
      `Found ${(facts.www ?? []).join(', ') || 'none'}; expected a CNAME to ${owner}.github.io.`)
    add('https', `https://${domain}/ answers with a valid certificate`, facts.https?.ok === true,
      facts.https?.error ? `The request failed: ${facts.https.error}. A new custom domain can take up to an hour for its certificate; enforce HTTPS in the Pages settings afterwards.` : `Status ${facts.https?.status ?? 'unknown'}.`)
    add('http', `http://${domain}/ redirects to HTTPS`, facts.http?.redirect?.startsWith(`https://${domain}`) === true,
      'Turn on "Enforce HTTPS" in the repository Pages settings once the certificate is approved.', 'advice')
    add('site', `The page is the Modwerk site`, /Modwerk/i.test(facts.https?.body ?? ''),
      'The page does not mention Modwerk yet: the launch branch has not been published to this domain.', 'advice')
  } else if (stage === 'worker') {
    const origin = `https://${domain}`
    add('preflight', `The community API accepts ${origin}`, facts.preflight?.status === 204 && facts.preflight?.allowOrigin === origin,
      `Preflight returned ${facts.preflight?.status ?? 'no answer'} with Access-Control-Allow-Origin "${facts.preflight?.allowOrigin ?? ''}". APP_URL must be ${origin}/ in the deployed Worker.`)
    add('legacy', `The community API no longer accepts https://${legacy}`, facts.legacyPreflight?.status === 403,
      `The old origin still receives status ${facts.legacyPreflight?.status ?? 'no answer'}. Only one origin may be trusted once the cutover is complete.`, 'advice')
  } else if (stage === 'redirect') {
    add('https', `https://${legacy}/ answers with a valid certificate`, facts.https?.ok === true,
      facts.https?.error ? `The request failed: ${facts.https.error}. The domain's certificate is re-issued when it moves between Pages sites; wait for it, then enforce HTTPS.` : `Status ${facts.https?.status ?? 'unknown'}.`)
    add('target', `The old domain hands visitors to https://${domain}`, (facts.https?.body ?? '').includes(`https://${domain}`),
      'The page does not point at the new domain.')
    add('deep', `A deep link keeps its path`, (facts.deep?.body ?? '').includes(`https://${domain}`) ,
      'An old module link does not lead to the new domain.', 'advice')
  } else throw new Error(`Unknown stage "${stage}". Use ${STAGES.join(', ')} or all.`)
  return checks
}

export const failed = checks => checks.filter(check => check.level === 'required' && !check.ok)

async function dns(name, type) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`
  const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`DNS lookup for ${name} failed (${response.status}).`)
  const body = await response.json()
  // Keep only the requested record type: CNAME answers for aliases are followed by the resolver.
  const code = { A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16 }[type]
  return (body.Answer ?? []).filter(answer => answer.type === code).map(answer => answer.data)
}

async function page(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const redirect = response.headers.get('location') ?? ''
    const body = response.status >= 300 && response.status < 400 ? '' : (await response.text()).slice(0, 200000)
    return { ok: response.status >= 200 && response.status < 400, status: response.status, redirect, body }
  } catch (error) { return { ok: false, error: error instanceof Error ? (error.cause?.code ?? error.message) : String(error) } }
}

async function preflight(api, origin) {
  try {
    const response = await fetch(api + '/api/modules', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' }, signal: AbortSignal.timeout(15000) })
    return { status: response.status, allowOrigin: response.headers.get('access-control-allow-origin') ?? '' }
  } catch { return undefined }
}

export async function collect(stage, options = {}) {
  const { domain, legacy, owner, api } = { ...DEFAULTS, ...options }
  if (stage === 'mail') {
    const [dkim, sendMx, sendTxt, dmarc, rootTxt, rootMx] = await Promise.all([
      dns(`resend._domainkey.${domain}`, 'TXT'), dns(`send.${domain}`, 'MX'), dns(`send.${domain}`, 'TXT'),
      dns(`_dmarc.${domain}`, 'TXT'), dns(domain, 'TXT'), dns(domain, 'MX'),
    ])
    return { dkim, sendMx, sendTxt, dmarc, rootTxt, rootMx }
  }
  if (stage === 'pages') {
    const [challenge, apexA, apexAaaa, www, https, http] = await Promise.all([
      dns(`_github-pages-challenge-${owner}.${domain}`, 'TXT'), dns(domain, 'A'), dns(domain, 'AAAA'), dns(`www.${domain}`, 'CNAME'),
      page(`https://${domain}/`), page(`http://${domain}/`),
    ])
    return { challenge, apexA: unique(apexA), apexAaaa: unique(apexAaaa), www, https, http }
  }
  if (stage === 'worker') return { preflight: await preflight(api, `https://${domain}`), legacyPreflight: await preflight(api, `https://${legacy}`) }
  if (stage === 'redirect') return { https: await page(`https://${legacy}/`), deep: await page(`https://${legacy}/module/euclid/`) }
  throw new Error(`Unknown stage "${stage}". Use ${STAGES.join(', ')} or all.`)
}

export function report(stage, checks) {
  const lines = [`\n${stage}`]
  for (const check of checks) {
    const mark = check.ok ? '✓' : check.level === 'required' ? '✗' : '!'
    lines.push(`  ${mark} ${check.label}${check.ok ? '' : `\n      ${check.hint}`}`)
  }
  return lines.join('\n')
}

async function main(argv) {
  const [stageArgument = 'all', ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]?.replace(/^--/, '')
    if (!['domain', 'legacy', 'owner', 'api'].includes(flag) || rest[index + 1] === undefined) throw new Error(`Unknown option ${rest[index]}. Use --domain, --legacy, --owner or --api.`)
    options[flag] = rest[index + 1]
  }
  const stages = stageArgument === 'all' ? STAGES : [stageArgument]
  let problems = 0
  for (const stage of stages) {
    const checks = evaluate(stage, await collect(stage, options), options)
    console.log(report(stage, checks))
    problems += failed(checks).length
  }
  console.log(problems ? `\n${problems} required check${problems === 1 ? '' : 's'} not passing.` : '\nAll required checks pass.')
  return problems ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code }, error => { console.error(error.message); process.exitCode = 2 })
}
