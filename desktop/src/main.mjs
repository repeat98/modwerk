// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's desktop app: modwerk.app in a window, with WebUSB and Web MIDI for
// the site in every operating system's build (no Chrome needed), and the agent
// bridge for coding agents. docs/DESKTOP_APP.md describes it.
import { BrowserWindow, Menu, app, clipboard, dialog, screen, session, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { UnitHolder, startBridge } from './bridge.mjs'
import { allowPermission, defaultBridgeAddress, elektronDevices, navigation, sameOrigin, siteUrl, userAgent, SITE } from './site.mjs'

const GUIDE = 'https://github.com/repeat98/modwerk/blob/main/docs/DESKTOP_APP.md'
const { values: flags } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  options: { bridge: { type: 'boolean' }, 'bridge-socket': { type: 'string' }, url: { type: 'string' } },
  strict: false, allowPositionals: true,
})
// Another site only in development: a packaged app gives USB to modwerk.app alone.
const site = siteUrl(app.isPackaged ? SITE : flags.url ?? process.env.MODWERK_DESKTOP_URL ?? SITE)
const bridgeAddress = flags['bridge-socket'] ?? process.env.MODWERK_BRIDGE_SOCKET ?? defaultBridgeAddress(process.platform)

let window = null
let bridge = null

const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus() } })

const statePath = () => join(app.getPath('userData'), 'window.json')
function readBounds() {
  try {
    const { x, y, width, height, maximized } = JSON.parse(readFileSync(statePath(), 'utf8'))
    if (![width, height].every(Number.isFinite)) return {}
    const visible = [x, y].every(Number.isFinite) && screen.getAllDisplays().some(({ workArea: area }) =>
      x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y)
    return { width, height, ...(visible ? { x, y } : {}), maximized: Boolean(maximized) }
  } catch { return {} }
}
function saveBounds() {
  try { writeFileSync(statePath(), JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() })) } catch { /* the next start uses the default size */ }
}

function title(page) {
  return bridge ? `${page} · agent bridge on ${bridge.address}` : page
}

/** The site and the bridge never share the unit: switching reloads the page, so its link lets go or connects again. */
async function setBridge(on, { ask = true } = {}) {
  if (on === Boolean(bridge)) return
  if (on && ask) {
    const { response } = await dialog.showMessageBox(window, {
      type: 'question', buttons: ['Turn on', 'Cancel'], defaultId: 0, cancelId: 1,
      message: 'Let coding agents use your unit?',
      detail: `While the agent bridge is on, programs on this computer can talk to your unit at ${bridgeAddress} (npm run device, the developer MCP), and the site lets go of it. Turn it off to use the site again.`,
    })
    if (response !== 0) return
  }
  try {
    if (on) bridge = await startBridge({ address: bridgeAddress, units: new UnitHolder(async () => (await import('./usb-unit.mjs')).openUnit()), log: console.log })
    else { await bridge.close(); bridge = null }
  } catch (error) {
    dialog.showErrorBox('Agent bridge', String(error.message ?? error))
  }
  buildMenu()
  if (window) { window.setTitle(title(window.webContents.getTitle())); window.webContents.reload() }
}

function protect(ses) {
  ses.setUserAgent(userAgent(ses.getUserAgent(), app.getVersion()))
  ses.setPermissionRequestHandler((_, permission, callback, details) => callback(allowPermission(permission, details.requestingUrl, site)))
  ses.setPermissionCheckHandler((_, permission, origin) => allowPermission(permission, origin, site, { usb: !bridge }))
  ses.setDevicePermissionHandler(details => details.deviceType === 'usb' && !bridge && sameOrigin(details.origin, site)
    && elektronDevices([details.device]).length === 1)
  // The site's own filters pick the Octatrack; with one unit there is nothing to choose.
  ses.on('select-usb-device', (event, details, callback) => {
    event.preventDefault()
    const devices = bridge || !sameOrigin(details.frame?.url ?? '', site) ? [] : elektronDevices(details.deviceList)
    if (devices.length <= 1) { callback(devices[0]?.deviceId); return }
    void dialog.showMessageBox(window, {
      type: 'question', message: 'Which instrument should Modwerk use?', cancelId: devices.length,
      buttons: [...devices.map(device => device.productName || 'Elektron device'), 'Cancel'],
    }).then(({ response }) => callback(devices[response]?.deviceId))
  })
}

function contain(contents) {
  const leave = (event, url) => {
    const where = navigation(url, site)
    if (where === 'stay') return
    event.preventDefault()
    if (where === 'external') void shell.openExternal(url)
  }
  contents.on('will-navigate', leave)
  contents.on('will-redirect', leave)
  contents.on('will-attach-webview', event => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (navigation(url, site) !== 'block') void shell.openExternal(url)
    return { action: 'deny' }
  })
}

function buildMenu() {
  const mac = process.platform === 'darwin'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { label: 'Developer', submenu: [
      { label: 'Agent bridge', type: 'checkbox', checked: Boolean(bridge), click: () => void setBridge(!bridge) },
      { label: 'Copy bridge address', enabled: Boolean(bridge), click: () => clipboard.writeText(bridgeAddress) },
      { type: 'separator' },
      { label: 'About the desktop app', click: () => void shell.openExternal(GUIDE) },
    ] },
    { role: 'windowMenu' },
  ]))
}

function createWindow() {
  const { maximized, ...bounds } = readBounds()
  window = new BrowserWindow({
    width: 1280, height: 820, ...bounds, minWidth: 720, minHeight: 520,
    title: 'Modwerk', backgroundColor: '#212124', show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  if (maximized) window.maximize()
  window.once('ready-to-show', () => window.show())
  window.on('page-title-updated', (event, page) => { event.preventDefault(); window.setTitle(title(page)) })
  window.on('close', saveBounds)
  window.on('closed', () => { window = null })
  void window.loadURL(site.href)
}

app.on('web-contents-created', (_, contents) => contain(contents))
app.whenReady().then(async () => {
  if (!primary) return
  protect(session.defaultSession)
  buildMenu()
  createWindow()
  if (flags.bridge) await setBridge(true, { ask: false })
  app.on('activate', () => { if (!window) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { void bridge?.close() })
