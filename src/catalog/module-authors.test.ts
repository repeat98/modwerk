import { describe, expect, it } from 'vitest'
import { MODULES } from './modules'
import { DISPLAY_AUTHORS, displayName, ownerCredit } from './module-authors'
import { COMMUNITY_MODULES } from '../community/modules'

describe('module credits', () => {
  it('shows a port under its original author alone, while its porter keeps it', () => {
    const chorus = MODULES.find(module => module.id === 'airwindows-chorus')!
    expect(chorus).toMatchObject({ author: 'repeat98', authorName: 'Chris Johnson', authorUrl: 'https://github.com/airwindows' })
    expect(chorus.contributors ?? []).toEqual([])
    const mackity = MODULES.find(module => module.id === 'mackity')!
    expect(mackity).toMatchObject({ author: 'repeat98', authorName: 'Chris Johnson', authorUrl: 'https://github.com/airwindows' })
    expect(mackity.contributors ?? []).toEqual([])
  })
  it('never pings a display author on reports: maintainers come from the manifest author', () => {
    for (const [id, shown] of Object.entries(DISPLAY_AUTHORS)) {
      const module = COMMUNITY_MODULES.find(entry => entry.moduleId === id && entry.machine === 'octatrack')!
      expect(module.maintainers).not.toContain(shown.github)
    }
  })
  it('names the owner on every module they author', () => {
    const owned = MODULES.filter(module => module.author === 'repeat98' && !DISPLAY_AUTHORS[module.id])
    expect(owned.length).toBeGreaterThan(0)
    expect(owned.map(module => module.authorName)).toEqual(owned.map(() => 'Jannik Aßfalg'))
    expect(displayName('someone-else')).toBe('someone-else')
    expect(displayName('sambanks', 'Sam Banks')).toBe('Sam Banks')
  })
  it('replaces the handle in free-text credits only', () => {
    expect(ownerCredit('repeat98: original engines')).toBe('Jannik Aßfalg: original engines')
    expect(ownerCredit('@repeat98: original capture')).toBe('Jannik Aßfalg: original capture')
    expect(ownerCredit('Jannik Assfalg (repeat98): port')).toBe('Jannik Aßfalg: port')
    expect(ownerCredit('see repeat98/octamad')).toBe('see repeat98/octamad')
  })
})
