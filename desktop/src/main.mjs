// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's desktop app: modwerk.app in a window of its own, with WebUSB and Web
// MIDI for the site in every operating system's build (no Chrome needed), and the
// agent bridge for coding agents. docs/DESKTOP_APP.md describes it.
import { BrowserWindow, Menu, app, clipboard, dialog, ipcMain, nativeTheme, screen, session, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { UnitHolder, startBridge } from './bridge.mjs'
import {
  allowPermission, defaultBridgeAddress, elektronDevices, initialSize, linkArgument, navigation, offlinePage, sameOrigin, signInUrl, siteLink, siteUrl,
  userAgent, windowChrome, windowMaterial, PLACES, SITE,
} from './site.mjs'

const GUIDE = 'https://github.com/repeat98/modwerk/blob/main/docs/DESKTOP_APP.md'
const file = path => fileURLToPath(new URL(path, import.meta.url))
const { values: flags } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  options: { bridge: { type: 'boolean' }, 'bridge-socket': { type: 'string' }, url: { type: 'string' }, 'register-links': { type: 'boolean' } },
  strict: false, allowPositionals: true,
})
// Another site only in development: a packaged app gives USB to modwerk.app alone.
const site = siteUrl(app.isPackaged ? SITE : flags.url ?? process.env.MODWERK_DESKTOP_URL ?? SITE)
const bridgeAddress = flags['bridge-socket'] ?? process.env.MODWERK_BRIDGE_SOCKET ?? defaultBridgeAddress(process.platform)
const mac = process.platform === 'darwin'
const material = windowMaterial(process.platform, process.getSystemVersion())
nativeTheme.themeSource = 'dark' // the site is dark: menus, dialogs and the material follow it

let window = null
let bridge = null

const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

// modwerk:// links open the site's page in this window. A packaged app registers the scheme on its first start;
// a development run only with --register-links, which points the scheme at this checkout's Electron.
if (app.isPackaged) app.setAsDefaultProtocolClient('modwerk')
else if (flags['register-links']) app.setAsDefaultProtocolClient('modwerk', process.execPath, [resolve(process.argv[1])])
let pendingLink = linkArgument(process.argv)
function openLink(value) {
  const target = siteLink(value, site)
  if (!target) return
  if (!window) { pendingLink = value; return }
  if (window.isMinimized()) window.restore()
  window.focus()
  void window.loadURL(target.href)
}
app.on('open-url', (event, url) => { event.preventDefault(); openLink(url) }) // macOS
app.on('second-instance', (_, argv) => {
  if (window) { if (window.isMinimized()) window.restore(); window.focus() }
  const link = linkArgument(argv) // Windows and Linux start a second copy with the link
  if (link) openLink(link)
})

const statePath = () => join(app.getPath('userData'), 'window.json')
function readBounds() {
  try {
    const { x, y, width, height, maximized } = JSON.parse(readFileSync(statePath(), 'utf8'))
    if (![width, height].every(Number.isFinite)) return {}
    const visible = [x, y].every(Number.isFinite) && screen.getAllDisplays().some(({ workArea: area }) =>
      x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y)
    return { width, height, ...(visible ? { x, y } : {}), maximized: Boolean(maximized) }
  } catch { return initialSize(screen.getPrimaryDisplay().workAreaSize) }
}
function saveBounds() {
  try { writeFileSync(statePath(), JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() })) } catch { /* the next start uses the default size */ }
}

/** The window is called Modwerk, as an app is, not after the page; the taskbar says when the bridge is on. */
const title = () => bridge ? `Modwerk · agent bridge on ${bridge.address}` : 'Modwerk'

/** The site and the bridge never share the unit: switching reloads the page, so its link lets go or connects again. */
async function setBridge(on, { ask = true } = {}) {
  if (on === Boolean(bridge)) return
  if (on && ask) {
    const { response } = await dialog.showMessageBox(window, {
      type: 'question', buttons: ['Turn on', 'Cancel'], defaultId: 0, cancelId: 1,
      message: 'Let coding agents use your unit?',
      detail: `While the agent bridge is on, programs on this computer can talk to your unit at ${bridgeAddress} (npm run device, the developer MCP), and Modwerk lets go of it. Turn it off to use your unit here again.`,
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
  if (window) { window.setTitle(title()); window.webContents.reload() }
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

/** A right-click menu like a native app's: editing in fields, Copy for a selection, and links. */
function contextMenu(contents, params) {
  const items = []
  if (params.isEditable) {
    const can = params.editFlags
    items.push({ role: 'cut', enabled: can.canCut }, { role: 'copy', enabled: can.canCopy }, { role: 'paste', enabled: can.canPaste }, { type: 'separator' }, { role: 'selectAll' })
  } else if (params.selectionText.trim()) items.push({ role: 'copy' })
  if (params.linkURL && navigation(params.linkURL, site) !== 'block') {
    if (items.length) items.push({ type: 'separator' })
    items.push({ label: 'Open in browser', click: () => void shell.openExternal(params.linkURL) }, { label: 'Copy link', click: () => clipboard.writeText(params.linkURL) })
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined })
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
  contents.on('context-menu', (_, params) => contextMenu(contents, params))
  contents.setWindowOpenHandler(({ url }) => {
    if (navigation(url, site) !== 'block') void shell.openExternal(url)
    return { action: 'deny' }
  })
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Back', accelerator: mac ? 'Cmd+[' : 'Alt+Left', click: () => window?.webContents.navigationHistory.goBack() },
      { label: 'Forward', accelerator: mac ? 'Cmd+]' : 'Alt+Right', click: () => window?.webContents.navigationHistory.goForward() },
      { type: 'separator' },
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => zoom(1) },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => zoom(-1) },
      // The same on every keyboard: Electron reads Plus as US Shift+=, which a German + key never sends.
      ...[['CmdOrCtrl+=', 1], ['CmdOrCtrl+numadd', 1], ['CmdOrCtrl+numsub', -1], ['CmdOrCtrl+num0', 0]].map(([accelerator, step]) =>
        ({ label: 'Zoom', accelerator, visible: false, acceleratorWorksWhenHidden: true, click: () => zoom(step) })),
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { label: 'Go', submenu: [
      ...PLACES.map(({ label, route }, i) => ({ label, accelerator: 'CmdOrCtrl+' + (i + 1), click: () => command({ go: route }) })),
      { type: 'separator' },
      { label: 'Find modules', accelerator: 'CmdOrCtrl+F', click: () => command({ find: true }) },
      { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => command({ go: 'account' }) },
    ] },
    { label: 'Developer', submenu: [
      { label: 'Agent bridge', type: 'checkbox', checked: Boolean(bridge), click: () => void setBridge(!bridge) },
      { label: 'Copy bridge address', enabled: Boolean(bridge), click: () => clipboard.writeText(bridgeAddress) },
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Help & FAQ', click: () => void window?.loadURL(new URL('#faq', site).href) },
      { label: 'Privacy', click: () => void window?.loadURL(new URL('#privacy', site).href) },
      { label: 'Impressum', click: () => void window?.loadURL(new URL('#impressum', site).href) },
      { label: 'About the desktop app', click: () => void shell.openExternal(GUIDE) },
    ] },
  ]))
}

// What the site may ask of the app (preload.cjs), answered for modwerk.app in this window only.
const fromSite = event => Boolean(window) && event.sender === window.webContents && sameOrigin(event.senderFrame?.url ?? '', site)
ipcMain.on('modwerk:material', event => { event.returnValue = Boolean(material) && fromSite(event) })
// The site's toolbar opens the app menu (Windows and Linux have no menu bar; macOS keeps its own).
ipcMain.on('modwerk:menu', (event, at) => {
  if (fromSite(event)) Menu.getApplicationMenu()?.popup({ window, x: at?.x ?? 0, y: at?.y ?? 0 })
})
// A sync or base install fills the taskbar button or the Dock icon: 0 to 1, 2 running, -1 none.
ipcMain.on('modwerk:progress', (event, value) => {
  if (fromSite(event) && typeof value === 'number' && Number.isFinite(value)) window.setProgressBar(value, { mode: value < 0 ? 'none' : value > 1 ? 'indeterminate' : 'normal' })
})
// It finished or needs you while Modwerk is in the background: flash the taskbar button or bounce the Dock icon.
ipcMain.on('modwerk:attention', event => {
  if (!fromSite(event) || window.isFocused()) return
  if (mac) app.dock?.bounce('informational')
  else window.flashFrame(true)
})
// Social sign-in runs in the default browser (providers refuse embedded windows) and returns through a modwerk:// link.
ipcMain.on('modwerk:sign-in', (event, value) => {
  const url = fromSite(event) ? signInUrl(value, site) : null
  if (url) void shell.openExternal(url.href)
})
const command = value => window?.webContents.send('modwerk:command', value)
/** Half a level per step, as Chrome's 10 % steps, between 50 % and 250 %; 0 resets. Chromium keeps it per site. */
function zoom(step) {
  const contents = window?.webContents
  if (contents) contents.setZoomLevel(step === 0 ? 0 : Math.max(-3.8, Math.min(5, contents.getZoomLevel() + step * 0.5)))
}

function createWindow() {
  const { maximized, ...bounds } = readBounds()
  window = new BrowserWindow({
    width: 1280, height: 860, ...bounds, minWidth: 720, minHeight: 520,
    title: title(), show: false, ...windowChrome(process.platform, material),
    ...(mac ? {} : { icon: file('../build/icon.png') }),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, preload: file('./preload.cjs') },
  })
  if (maximized) window.maximize()
  window.once('ready-to-show', () => window.show())
  window.on('page-title-updated', event => event.preventDefault())
  window.on('focus', () => { if (!mac) window.flashFrame(false) })
  window.webContents.on('zoom-changed', (_, direction) => zoom(direction === 'in' ? 1 : -1)) // Ctrl or Cmd with the wheel
  window.on('close', saveBounds)
  window.on('closed', () => { window = null })
  window.webContents.on('did-fail-load', (_, code, reason, url, mainFrame) => {
    if (!mainFrame || code === -3) return // -3: a navigation the page replaced
    void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(offlinePage(site, reason || 'error ' + code)))
  })
  const link = pendingLink && siteLink(pendingLink, site)
  pendingLink = null
  void window.loadURL((link || site).href)
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
