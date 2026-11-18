// SPDX-License-Identifier: GPL-3.0-or-later
// All the site sees of the desktop app: its operating system, so it can make room
// for the window's controls, and the app menu, which it opens from its toolbar.
// The main process answers only modwerk.app (main.mjs).
const { contextBridge, ipcRenderer } = require('electron')

const point = value => Math.max(0, Math.min(100000, Math.round(Number(value)) || 0))

contextBridge.exposeInMainWorld('modwerkDesktop', Object.freeze({
  platform: process.platform,
  showMenu: (x, y) => ipcRenderer.send('modwerk:menu', { x: point(x), y: point(y) }),
}))
