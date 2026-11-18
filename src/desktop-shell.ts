// The site inside Modwerk's desktop app (desktop/): its preload gives the page the operating system and the
// app menu, and nothing else. In a browser there is no shell and nothing here changes the page.

export interface DesktopShell {
  platform: string
  showMenu(x: number, y: number): void
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
  return true
}

/** Open the app menu under an element (Windows and Linux; macOS has its menu bar). */
export function openAppMenu(shell: DesktopShell, anchor: { getBoundingClientRect(): { left: number; bottom: number } }) {
  const { left, bottom } = anchor.getBoundingClientRect()
  shell.showMenu(left, bottom + 4)
}
