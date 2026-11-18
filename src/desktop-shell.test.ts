import { describe, expect, it, vi } from 'vitest'
import { desktopShell, markDesktopShell, openAppMenu } from './desktop-shell'

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
})
