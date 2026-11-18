// SPDX-License-Identifier: GPL-3.0-or-later
// What the desktop window lets the site do: where it may navigate, which
// permissions it gets and which USB device it is handed. No Electron imports,
// so the rules are tested in plain Node (site.test.mjs).

export const SITE = 'https://modwerk.app/'
export const ELEKTRON_VENDOR_ID = 0x1935

/** Sign-in providers the site redirects to and back from (server/social-config.ts). */
export const SIGN_IN_HOSTS = new Set(['github.com', 'accounts.google.com', 'discord.com'])

/** What the site may ask for. USB is handled on its own: only the site, and only while the agent bridge is off. */
export const SITE_PERMISSIONS = new Set(['midi', 'midiSysex', 'clipboard-sanitized-write', 'fullscreen', 'notifications'])

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The site to load: modwerk.app, or in development a local Vite server or another HTTPS deployment. */
export function siteUrl(value = SITE) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error('The desktop app loads an https:// site, or http:// on this computer: ' + value)
  }
  return url
}

const parse = value => { try { return new URL(value) } catch { return null } }

export function sameOrigin(value, site) {
  const url = parse(value)
  return Boolean(url) && url.origin === site.origin
}

/** 'stay' in the window, 'external' to the default browser, or 'block'. */
export function navigation(value, site) {
  const url = parse(value)
  if (!url) return 'block'
  if (url.origin === site.origin) return 'stay'
  if (url.protocol === 'https:' && SIGN_IN_HOSTS.has(url.hostname)) return 'stay'
  return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? 'external' : 'block'
}

export function allowPermission(permission, origin, site, { usb = false } = {}) {
  if (!sameOrigin(origin, site)) return false
  return permission === 'usb' ? usb : SITE_PERMISSIONS.has(permission)
}

/** The Elektron devices among those Chromium offers for a WebUSB request (the site's own filters already apply). */
export const elektronDevices = devices => devices.filter(device => device.vendorId === ELEKTRON_VENDOR_ID)

/** Chrome's user agent with the desktop app named instead of Electron, so sign-in providers treat the window as Chrome. */
export function userAgent(fallback, version) {
  return fallback.replace(/ Electron\/\S+/, '').replace(/ (modwerk-desktop|Modwerk)\/\S+/i, '') + ' ModwerkDesktop/' + version
}

/** The agent bridge's default address, as the Python bridge and scripts/device.mjs use it. */
export const defaultBridgeAddress = platform => platform === 'win32' ? '50123' : '/tmp/modwerk-ot.sock'
