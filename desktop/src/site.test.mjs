// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { allowPermission, defaultBridgeAddress, elektronDevices, initialSize, navigation, offlinePage, siteUrl, userAgent, windowChrome } from './site.mjs'

const site = siteUrl()

describe('what the desktop window lets the site do', () => {
  it('loads modwerk.app, or an http site only on this computer', () => {
    expect(site.href).toBe('https://modwerk.app/')
    expect(siteUrl('http://127.0.0.1:5173/').origin).toBe('http://127.0.0.1:5173')
    expect(() => siteUrl('http://example.com/')).toThrow()
    expect(() => siteUrl('file:///etc/passwd')).toThrow()
  })

  it('keeps the site and sign-in in the window and sends other links to the browser', () => {
    expect(navigation('https://modwerk.app/#octatrack', site)).toBe('stay')
    expect(navigation('https://github.com/login/oauth/authorize?client_id=x', site)).toBe('stay')
    expect(navigation('https://accounts.google.com/o/oauth2/v2/auth', site)).toBe('stay')
    expect(navigation('https://github.com.evil.example/', site)).toBe('external')
    expect(navigation('http://github.com/login', site)).toBe('external')
    expect(navigation('https://discord.gg/vzfAdMBtn5', site)).toBe('external')
    expect(navigation('mailto:someone@example.com', site)).toBe('external')
    expect(navigation('file:///C:/Windows', site)).toBe('block')
    expect(navigation('javascript:alert(1)', site)).toBe('block')
    expect(navigation('not a url', site)).toBe('block')
  })

  it('grants MIDI and USB to the site alone, and USB only while the bridge is off', () => {
    expect(allowPermission('midiSysex', 'https://modwerk.app', site)).toBe(true)
    expect(allowPermission('midiSysex', 'https://github.com', site)).toBe(false)
    expect(allowPermission('geolocation', 'https://modwerk.app', site)).toBe(false)
    expect(allowPermission('usb', 'https://modwerk.app', site, { usb: true })).toBe(true)
    expect(allowPermission('usb', 'https://modwerk.app', site, { usb: false })).toBe(false)
    expect(allowPermission('usb', 'https://accounts.google.com', site, { usb: true })).toBe(false)
  })

  it('offers only Elektron devices', () => {
    expect(elektronDevices([{ vendorId: 0x1935, deviceId: 'a' }, { vendorId: 0x046d, deviceId: 'b' }])).toEqual([{ vendorId: 0x1935, deviceId: 'a' }])
  })

  it('names the app instead of Electron in the user agent', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) modwerk-desktop/0.1.0 Chrome/142.0.0.0 Electron/45.2.2 Safari/537.36'
    expect(userAgent(chrome, '0.1.0')).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 ModwerkDesktop/0.1.0')
  })

  it('puts the window controls on the site toolbar, and opens the first window large enough for fitted pages', () => {
    expect(windowChrome('win32')).toMatchObject({ titleBarStyle: 'hidden', titleBarOverlay: { color: '#212124', height: 40 } })
    expect(windowChrome('linux').titleBarStyle).toBe('hidden')
    expect(windowChrome('darwin')).toEqual({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 20 } })
    expect(initialSize({ width: 1920, height: 1032 })).toEqual({ width: 1440, height: 929 })
    expect(initialSize({ width: 1366, height: 728 })).toEqual({ width: 1161, height: 655 })
    expect(initialSize({ width: 640, height: 480 })).toEqual({ width: 720, height: 520 })
  })

  it('shows its own offline page, escaped, that returns to the site', () => {
    const page = offlinePage(site, 'net::ERR_<script>')
    expect(page).toContain("Modwerk can't reach modwerk.app")
    expect(page).toContain('href="https://modwerk.app/"')
    expect(page).toContain('net::ERR_&lt;script&gt;')
    expect(page).not.toContain('ERR_<script>')
  })

  it('serves the bridge where scripts/device.mjs looks by default', () => {
    expect(defaultBridgeAddress('linux')).toBe('/tmp/modwerk-ot.sock')
    expect(defaultBridgeAddress('win32')).toBe('50123')
  })
})
