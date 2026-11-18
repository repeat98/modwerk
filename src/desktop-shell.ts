// The site inside Modwerk's desktop app (desktop/): its preload (desktop/src/preload.cjs) gives the page the operating
// system, the app menu, taskbar progress, a sign-in in the default browser and the app's commands, and nothing else.
// In a browser there is no shell and nothing here changes the page.
import { useEffect, useRef } from 'react'

/** A command from the app's menu: open one of the site's places, or search the library. */
export type DesktopCommand = { go?: string; find?: boolean }

export interface DesktopShell {
  platform: string
  /** The desktop shows through the sidebar (Mica, macOS vibrancy). */
  material?: boolean
  showMenu(x: number, y: number): void
  // Later additions are optional, so the live site stays safe in an older app.
  setProgress?(value: number | null | undefined): void
  requestAttention?(): void
  openSignIn?(url: string): void
  onCommand?(callback: (command: DesktopCommand) => void): () => void
}

/** The desktop app's bridge into the page, or null in a browser. */
export function desktopShell(scope: unknown = globalThis): DesktopShell | null {
  const shell = (scope as { modwerkDesktop?: Partial<DesktopShell> } | undefined)?.modwerkDesktop
  return shell && typeof shell.platform === 'string' && typeof shell.showMenu === 'function' ? shell as DesktopShell : null
}

/** Mark the document so desktop-shell.css can make room for the window's controls and drop web-only behaviour. */
export function markDesktopShell(root: { dataset: DOMStringMap }, shell = desktopShell()) {
  if (!shell) return false
  root.dataset.shell = 'desktop'
  root.dataset.platform = shell.platform
  if (shell.material) root.dataset.material = 'true'
  return true
}

/** Open the app menu under an element (Windows and Linux; macOS has its menu bar). */
export function openAppMenu(shell: DesktopShell, anchor: { getBoundingClientRect(): { left: number; bottom: number } }) {
  const { left, bottom } = anchor.getBoundingClientRect()
  shell.showMenu(left, bottom + 4)
}

const bars = new Map<symbol, number | null>()

/** One progress bar on the page: 0 to 1, null while its length isn't known, undefined once it is gone. The taskbar or
 * Dock shows the bar that moved last; when the last one goes the app asks for attention, which it gives only while
 * Modwerk is in the background (a sync finished, failed or wants a decision). */
export function reportProgress(key: symbol, value: number | null | undefined, shell = desktopShell()) {
  if (!shell?.setProgress) return
  const running = bars.size > 0
  bars.delete(key)
  if (value !== undefined) bars.set(key, value)
  shell.setProgress(bars.size ? [...bars.values()].at(-1) : undefined)
  if (running && !bars.size) shell.requestAttention?.()
}

/** Mirror a progress bar on the taskbar or Dock for as long as it is shown (`value` undefined: running, length unknown). */
export function useDesktopProgress(value: number | undefined) {
  const key = useRef(Symbol('progress'))
  useEffect(() => { reportProgress(key.current, value ?? null) }, [value])
  useEffect(() => { const bar = key.current; return () => reportProgress(bar, undefined) }, [])
}

/** Run the app menu's commands with the latest handler. */
export function useDesktopCommands(handle: (command: DesktopCommand) => void, shell = desktopShell()) {
  const latest = useRef(handle)
  useEffect(() => { latest.current = handle })
  useEffect(() => shell?.onCommand?.(command => latest.current(command)), [shell])
}
