// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { DiagnosticClient } from './octatrack-diagnostics-contract'

interface Hints { brands?: { brand: string; version: string }[]; platform?: string }
const major = (version: string | undefined) => { const value = Number.parseInt(version ?? '', 10); return Number.isInteger(value) && value > 0 && value < 1000 ? value : undefined }

/** The browser and operating system as families (and the browser's main version) from a coarse parse: only these
 * leave the browser, never the user-agent string or the client hints themselves. */
export function diagnosticClient(agent = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? '',
  hints: Hints | undefined = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { userAgentData?: Hints }).userAgentData): DiagnosticClient {
  const brand = (name: RegExp) => hints?.brands?.find(item => name.test(item.brand))
  const hinted = brand(/^Brave$/) ? ['brave', brand(/^Brave$/)] as const : brand(/^Microsoft Edge$/) ? ['edge', brand(/^Microsoft Edge$/)] as const
    : brand(/^Opera$/) ? ['opera', brand(/^Opera$/)] as const : brand(/^Google Chrome$/) ? ['chrome', brand(/^Google Chrome$/)] as const : undefined
  const version = (pattern: RegExp) => major(agent.match(pattern)?.[1])
  const [browser, main]: [DiagnosticClient['browser'], number | undefined] = hinted ? [hinted[0], major(hinted[1]?.version)]
    : /Edg(?:e|A|iOS)?\//.test(agent) ? ['edge', version(/Edg(?:e|A|iOS)?\/(\d+)/)]
    : /OPR\//.test(agent) ? ['opera', version(/OPR\/(\d+)/)]
    : /SamsungBrowser\//.test(agent) ? ['samsung', version(/SamsungBrowser\/(\d+)/)]
    : /Firefox\/|FxiOS\//.test(agent) ? ['firefox', version(/(?:Firefox|FxiOS)\/(\d+)/)]
    : /Chrome\/|CriOS\//.test(agent) ? ['chrome', version(/(?:Chrome|CriOS)\/(\d+)/)]
    : /Safari\//.test(agent) && /Version\//.test(agent) ? ['safari', version(/Version\/(\d+)/)]
    : ['other', undefined]
  const platform = hints?.platform ?? ''
  const os: DiagnosticClient['os'] = /^Windows$/.test(platform) || !platform && /Windows/.test(agent) ? 'windows'
    : /^Android$/.test(platform) || !platform && /Android/.test(agent) ? 'android'
    : /^Chrome OS$|^ChromeOS$/.test(platform) || !platform && /CrOS/.test(agent) ? 'chromeos'
    : !platform && /iPhone|iPad|iPod/.test(agent) ? 'ios'
    : /^macOS$/.test(platform) || !platform && /Mac OS X|Macintosh/.test(agent) ? 'macos'
    : /^Linux$/.test(platform) || !platform && /Linux/i.test(agent) ? 'linux'
    : 'other'
  return { browser, ...(browser !== 'other' && main !== undefined ? { major: main } : {}), os }
}
