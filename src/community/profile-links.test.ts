import { describe, expect, it } from 'vitest'
import { normalizeProfileLink, publicProfileLinks, type ProfileLinkField } from './profile-links'

describe('public profile URLs', () => {
  it('normalizes service profile URLs and removes tracking parameters', () => {
    expect(normalizeProfileLink('instagramUrl', ' https://instagram.com/jannik.assfalg?igsh=tracking#bio ')).toBe('https://www.instagram.com/jannik.assfalg/')
    expect(normalizeProfileLink('soundcloudUrl', 'https://www.soundcloud.com/jannik-asfalg/?utm_source=share')).toBe('https://soundcloud.com/jannik-asfalg')
    expect(normalizeProfileLink('bandcampUrl', 'https://artist-name.bandcamp.com/music?from=search')).toBe('https://artist-name.bandcamp.com/')
    expect(normalizeProfileLink('bandcampUrl', 'https://www.bandcamp.com/musicfan/?from=search')).toBe('https://bandcamp.com/musicfan')
    expect(normalizeProfileLink('bandcampUrl', '  ')).toBe('')
  })
  it.each<[ProfileLinkField, unknown]>([
    ['instagramUrl', 'javascript:alert(1)'], ['instagramUrl', 'http://instagram.com/artist/'],
    ['instagramUrl', 'https://instagram.com.evil.test/artist/'], ['instagramUrl', 'https://evil.test@instagram.com/artist/'],
    ['instagramUrl', 'https://instagram.com:444/artist/'], ['instagramUrl', 'https://instagram.com/'],
    ['instagramUrl', 'https://instagram.com/p/post/'], ['instagramUrl', 'https://instagram.com/explore/'],
    ['soundcloudUrl', 'https://instagram.com/artist/'], ['soundcloudUrl', 'https://soundcloud.com/artist/track'],
    ['soundcloudUrl', 'https://soundcloud.com/arti\nst'], ['soundcloudUrl', 'https://soundcloud.com\\@evil.test/artist'],
    ['bandcampUrl', 'https://bandcamp.com/'], ['bandcampUrl', 'https://www.bandcamp.com/'],
    ['bandcampUrl', 'https://artist.bandcamp.com.evil.test/'], ['bandcampUrl', 'https://artist.bandcamp.com/album/song'],
    ['bandcampUrl', null], ['bandcampUrl', 42], ['bandcampUrl', 'x'.repeat(501)],
  ])('rejects an invalid %s value (%s)', (key, value) => {
    expect(() => normalizeProfileLink(key, value)).toThrow(/HTTPS .* profile URL/)
  })
  it('shows account names from validated Instagram, SoundCloud, artist and fan profile URLs', () => {
    expect(publicProfileLinks({ instagramUrl: 'https://instagram.com/artist.name', soundcloudUrl: 'https://soundcloud.com/artist-name', bandcampUrl: 'https://artist-name.bandcamp.com/music' }).map(link => link.account)).toEqual(['@artist.name', '@artist-name', '@artist-name'])
    expect(publicProfileLinks({ bandcampUrl: 'https://bandcamp.com/musicfan' })[0].account).toBe('@musicfan')
  })
  it('hides missing and malformed links instead of rendering unsafe API values', () => {
    expect(publicProfileLinks({})).toEqual([])
    expect(publicProfileLinks({ instagramUrl: 'javascript:alert(1)', soundcloudUrl: 'https://soundcloud.com/artist', bandcampUrl: '' })).toMatchObject([{ key: 'soundcloudUrl', label: 'SoundCloud', href: 'https://soundcloud.com/artist' }])
  })
})
