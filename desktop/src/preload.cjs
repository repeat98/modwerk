// SPDX-License-Identifier: GPL-3.0-or-later
// All the site sees of the desktop app (src/desktop-shell.ts): the operating system and whether the desktop shows
// through the sidebar, the app menu, progress and attention on the taskbar or Dock, opening a sign-in in the
// default browser, and the app's commands (Go, Find). The main process answers only modwerk.app (main.mjs).
const { contextBridge, ipcRenderer } = require('electron')

const point = value => Math.max(0, Math.min(100000, Math.round(Number(value)) || 0))
const material = ipcRenderer.sendSync('modwerk:material') === true // once, at load

contextBridge.exposeInMainWorld('modwerkDesktop', Object.freeze({
  platform: process.platform,
  material,
  showMenu: (x, y) => ipcRenderer.send('modwerk:menu', { x: point(x), y: point(y) }),
  /** 0 to 1, or null for running without a known length, or undefined to clear. */
  setProgress: value => ipcRenderer.send('modwerk:progress', value === undefined ? -1 : value === null ? 2 : Math.max(0, Math.min(1, Number(value) || 0))),
  requestAttention: () => ipcRenderer.send('modwerk:attention'),
  openSignIn: url => ipcRenderer.send('modwerk:sign-in', String(url)),
  onCommand: callback => {
    const listener = (_, command) => callback(command)
    ipcRenderer.on('modwerk:command', listener)
    return () => ipcRenderer.removeListener('modwerk:command', listener)
  },
}))
