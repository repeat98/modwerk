import { describe, expect, it, vi } from 'vitest'
import { desktopShell, markDesktopShell, openAppMenu, reportProgress } from './desktop-shell'

describe('the site inside the desktop app', () => {
  it('finds the app only through its whole bridge', () => {
    expect(desktopShell({})).toBeNull()
    expect(desktopShell(undefined)).toBeNull()
    expect(desktopShell({ modwerkDesktop: { platform: 'win32' } })).toBeNull()
    expect(desktopShell({ modwerkDesktop: { platform: 'win32', showMenu: () => {} } })?.platform).toBe('win32')
  })

  it('marks the document in the app and leaves it alone in a browser', () => {
    const page = { dataset: {} as DOMStringMap }
    expect(markDesktopShell(page, null)).toBe(false)
    expect(page.dataset).toEqual({})
    expect(markDesktopShell(page, { platform: 'darwin', showMenu: () => {} })).toBe(true)
    expect(page.dataset).toEqual({ shell: 'desktop', platform: 'darwin' })
  })

  it('opens the app menu under its button', () => {
    const showMenu = vi.fn()
    openAppMenu({ platform: 'win32', showMenu }, { getBoundingClientRect: () => ({ left: 1200, bottom: 48 }) })
    expect(showMenu).toHaveBeenCalledWith(1200, 52)
  })

  it('marks the material so the sidebar lets the desktop through', () => {
    const page = { dataset: {} as DOMStringMap }
    markDesktopShell(page, { platform: 'win32', material: true, showMenu: () => {} })
    expect(page.dataset.material).toBe('true')
  })

  it('shows the latest progress bar on the taskbar and asks for attention when the last one goes', () => {
    const setProgress = vi.fn(), requestAttention = vi.fn(), shell = { platform: 'win32', showMenu: () => {}, setProgress, requestAttention }
    const sync = Symbol('sync'), stage = Symbol('stage')
    reportProgress(sync, null, shell)
    expect(setProgress).toHaveBeenLastCalledWith(null)
    reportProgress(sync, 0.25, shell)
    reportProgress(stage, 0.5, shell)
    expect(setProgress).toHaveBeenLastCalledWith(0.5)
    reportProgress(sync, 0.75, shell) // the bar that moved last
    expect(setProgress).toHaveBeenLastCalledWith(0.75)
    reportProgress(sync, undefined, shell)
    expect(setProgress).toHaveBeenLastCalledWith(0.5)
    expect(requestAttention).not.toHaveBeenCalled()
    reportProgress(stage, undefined, shell)
    expect(setProgress).toHaveBeenLastCalledWith(undefined)
    expect(requestAttention).toHaveBeenCalledTimes(1)
    reportProgress(stage, undefined, shell) // already gone: nothing more
    expect(requestAttention).toHaveBeenCalledTimes(1)
  })

  it('does nothing in an app without taskbar progress or in a browser', () => {
    expect(() => reportProgress(Symbol('x'), 0.5, { platform: 'win32', showMenu: () => {} })).not.toThrow()
    expect(() => reportProgress(Symbol('x'), 0.5, null)).not.toThrow()
  })
})
