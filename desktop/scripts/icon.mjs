// SPDX-License-Identifier: GPL-3.0-or-later
// Draw the app icon (build/icon.png, 1024 px) from the site's mark on a dark tile, with Electron itself:
//   npx electron scripts/icon.mjs
// electron-builder makes each platform's icon from it; the window uses it on Windows and Linux.
import { BrowserWindow, app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const mark = readFileSync(fileURLToPath(new URL('../../public/modwerk-mark.svg', import.meta.url)), 'utf8')
const page = `<!doctype html><html><head><style>
html,body{margin:0;width:${SIZE}px;height:${SIZE}px;background:transparent;overflow:hidden}
.tile{position:absolute;inset:72px;border-radius:200px;background:linear-gradient(#2a2a2f,#1b1b1f);box-shadow:inset 0 0 0 4px #ffffff14}
.tile svg{position:absolute;inset:200px;width:480px;height:480px}
</style></head><body><div class="tile">${mark}</div></body></html>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } })
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page))
  await new Promise(resolve => setTimeout(resolve, 300))
  const image = (await window.webContents.capturePage()).resize({ width: SIZE, height: SIZE, quality: 'best' })
  writeFileSync(fileURLToPath(new URL('../build/icon.png', import.meta.url)), image.toPNG())
  console.log('build/icon.png', image.getSize())
  app.quit()
})
