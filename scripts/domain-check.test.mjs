// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { describe, expect, it } from 'vitest'
import { evaluate, failed, PAGES_V4, PAGES_V6, report } from './domain-check.mjs'

const key = 'p=' + 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDKPPUH09P5yep5EoT78MhU2rXS8e9k'.repeat(3)
const byId = (checks, id) => checks.find(check => check.id === id)

describe('mail records', () => {
  // The zone Hetzner creates for a new domain, before anything is added.
  const registrarDefault = { dkim: [], sendMx: [], sendTxt: [], dmarc: [], rootTxt: ['"v=spf1 +a +mx ?all"'], rootMx: ['10 www4.your-server.de.'] }
  // The shape of the working octamod.app setup: DKIM TXT, send/rsend CNAMEs (seen as MX/TXT after resolution), DMARC.
  const configured = {
    dkim: [`"${key.slice(0, 120)}" "${key.slice(120)}"`], sendMx: ['10 feedback.forge.rmta.net.'], sendTxt: ['"v=spf1 ip4:52.3.252.119 ~all"'],
    dmarc: ['"v=DMARC1; p=none;"'], rootTxt: ['"v=spf1 -all"'], rootMx: ['10 mx1.forwarder.example.'],
  }

  it('fails every required record on the registrar default and explains the advice items', () => {
    const checks = evaluate('mail', registrarDefault)
    expect(failed(checks).map(check => check.id)).toEqual(['dkim', 'send', 'dmarc'])
    expect(byId(checks, 'root-spf').ok).toBe(false)
    expect(byId(checks, 'root-spf').hint).toContain('+a')
    expect(byId(checks, 'inbound').ok).toBe(false)
    expect(byId(checks, 'inbound').level).toBe('advice')
  })

  it('passes once Resend, DMARC and a forwarder are in place, including a DKIM key split over TXT strings', () => {
    const checks = evaluate('mail', configured)
    expect(failed(checks)).toEqual([])
    expect(checks.every(check => check.ok)).toBe(true)
  })

  it('accepts either shape of the return-path record and rejects a truncated DKIM key', () => {
    expect(byId(evaluate('mail', { ...configured, sendMx: [], sendTxt: ['"v=spf1 include:amazonses.com ~all"'] }), 'send').ok).toBe(true)
    expect(byId(evaluate('mail', { ...configured, dkim: ['"p=MIGfMA0"'] }), 'dkim').ok).toBe(false)
    expect(byId(evaluate('mail', { ...configured, dmarc: ['"v=spf1 -all"'] }), 'dmarc').ok).toBe(false)
  })

  it('names the domain it was asked about', () => {
    expect(byId(evaluate('mail', registrarDefault, { domain: 'example.test' }), 'dkim').label).toContain('resend._domainkey.example.test')
  })
})

describe('GitHub Pages records', () => {
  const ready = {
    challenge: ['"abc123"'], apexA: [...PAGES_V4], apexAaaa: [...PAGES_V6], www: ['repeat98.github.io.'],
    https: { ok: true, status: 200, body: '<title>Modwerk</title>' }, http: { ok: true, status: 301, redirect: 'https://modwerk.app/' },
  }

  it('passes when the apex, www, certificate and redirect are right', () => {
    expect(evaluate('pages', ready).every(check => check.ok)).toBe(true)
  })

  it('rejects the registrar parking address, a partial address set and a missing www alias', () => {
    const checks = evaluate('pages', { ...ready, apexA: ['88.198.219.246'], apexAaaa: ['2a01:4f8:d0a:27bd::2'], www: [] })
    expect(failed(checks).map(check => check.id)).toEqual(['apex-a', 'apex-aaaa', 'www'])
    expect(byId(checks, 'apex-a').hint).toContain('88.198.219.246')
    expect(byId(evaluate('pages', { ...ready, apexA: PAGES_V4.slice(0, 2) }), 'apex-a').ok).toBe(false)
    // An extra address would send some visitors elsewhere.
    expect(byId(evaluate('pages', { ...ready, apexA: [...PAGES_V4, '88.198.219.246'] }), 'apex-a').ok).toBe(false)
  })

  it('reports an unusable certificate as a required failure and a missing HTTPS redirect as advice', () => {
    const checks = evaluate('pages', { ...ready, https: { ok: false, error: 'ERR_TLS_CERT_ALTNAME_INVALID' }, http: { ok: true, status: 200, redirect: '' } })
    expect(failed(checks).map(check => check.id)).toEqual(['https'])
    expect(byId(checks, 'https').hint).toContain('ERR_TLS_CERT_ALTNAME_INVALID')
    expect(byId(checks, 'http').level).toBe('advice')
    expect(byId(checks, 'http').ok).toBe(false)
  })

  it('requires the ownership challenge before any address points at Pages', () => {
    expect(failed(evaluate('pages', { ...ready, challenge: [] })).map(check => check.id)).toEqual(['challenge'])
  })
})

describe('community API origin', () => {
  it('requires the new origin to be accepted and treats an accepted old origin as advice', () => {
    const accepted = { status: 204, allowOrigin: 'https://modwerk.app' }
    expect(failed(evaluate('worker', { preflight: accepted, legacyPreflight: { status: 403, allowOrigin: '' } }))).toEqual([])
    // Today's deployment: it trusts only octamod.app.
    const today = evaluate('worker', { preflight: { status: 403, allowOrigin: '' }, legacyPreflight: { status: 204, allowOrigin: 'https://octamod.app' } })
    expect(failed(today).map(check => check.id)).toEqual(['preflight'])
    expect(byId(today, 'legacy').ok).toBe(false)
    expect(byId(today, 'legacy').level).toBe('advice')
  })

  it('treats an unreachable API as failing', () => {
    expect(failed(evaluate('worker', {})).map(check => check.id)).toEqual(['preflight'])
  })
})

describe('old domain hand-over', () => {
  it('requires a valid certificate that leads to the new domain', () => {
    const body = '<a href="https://modwerk.app/">Continue</a>'
    expect(failed(evaluate('redirect', { https: { ok: true, status: 200, body }, deep: { ok: false, status: 404, body } }))).toEqual([])
    expect(failed(evaluate('redirect', { https: { ok: false, error: 'CERT_HAS_EXPIRED' } })).map(check => check.id)).toEqual(['https', 'target'])
  })
})

describe('reporting', () => {
  it('rejects an unknown stage and prints hints only for checks that are not passing', () => {
    expect(() => evaluate('launch', {})).toThrow('Unknown stage')
    const text = report('mail', evaluate('mail', { dkim: [], sendMx: [], sendTxt: [], dmarc: [], rootTxt: [], rootMx: [] }))
    expect(text).toContain('✗ DKIM key')
    expect(text).toContain('Add the DKIM TXT record')
    expect(text).not.toContain('undefined')
  })
})
