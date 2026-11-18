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

/** The window colour, the site's `--sidebar`: the toolbar the window's controls sit on. */
export const WINDOW_COLOR = '#212124'

/** No title bar of its own: the site's toolbar and sidebar header carry the window's controls and drag it
 * (src/desktop-shell.css). macOS keeps its traffic lights inset over the sidebar. */
export function windowChrome(platform) {
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 20 } }
  return { titleBarStyle: 'hidden', titleBarOverlay: { color: WINDOW_COLOR, symbolColor: '#b9bac8', height: 40 } }
}

/** The first window: most of the screen, so the site's fitted pages (dialogs drop their art below 760 px) open whole. */
export function initialSize(area) {
  return { width: Math.max(720, Math.min(1440, Math.round(area.width * 0.85))), height: Math.max(520, Math.min(1000, Math.round(area.height * 0.9))) }
}

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** The page shown when modwerk.app can't be reached, instead of Chromium's. It tries again by itself once the computer is online. */
export function offlinePage(site, reason) {
  const href = escape(site.href)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Modwerk</title><meta name="color-scheme" content="dark">
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:${WINDOW_COLOR};color:#ececf1;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;-webkit-app-region:drag;app-region:drag}
main{max-width:380px;text-align:center}h1{font-size:18px;font-weight:600;margin:0 0 6px}p{margin:0 0 18px;color:#9a9caf}small{display:block;margin-top:14px;color:#6f7185}
a{-webkit-app-region:no-drag;app-region:no-drag;display:inline-block;padding:8px 16px;border-radius:8px;background:#b4b7ff;color:#17171b;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>Modwerk can't reach ${escape(site.host)}</h1><p>Check your internet connection. Your unit and your saved sets are not affected.</p>
<a href="${href}">Try again</a><small>${escape(reason)}</small></main>
<script>addEventListener('online',()=>{location.href=${JSON.stringify(site.href)}})</script></body></html>`
}

/** The agent bridge's default address, as the Python bridge and scripts/device.mjs use it. */
export const defaultBridgeAddress = platform => platform === 'win32' ? '50123' : '/tmp/modwerk-ot.sock'
