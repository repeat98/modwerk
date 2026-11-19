import { describe, expect, it } from 'vitest'
import { developerNames, placeholderNote } from './agent-session.mjs'

describe('the note a shared session needs', () => {
  it('refuses a missing note and the instructions\' placeholder, and takes any real sentence', () => {
    for (const note of [undefined, '', '…', '"…"', ' ... ']) expect(placeholderNote(note), JSON.stringify(note)).toBe(true)
    expect(placeholderNote('The board refused a semicolon.')).toBe(false)
  })
})

const config = values => key => { if (!(key in values)) throw new Error('unset'); return values[key] }

describe('the names a shared session scrubs', () => {
  it('takes git\'s user.name in full and in parts, and the parts of user.email before the @', () => {
    expect(developerNames(config({ 'user.name': 'Greta Šimek', 'user.email': 'greta.simek@example.test' }))).toEqual(['Greta Šimek', 'Greta', 'Šimek', 'greta', 'simek'])
  })

  it('leaves out roles, services, digits and short parts, and copes with git knowing nothing', () => {
    expect(developerNames(config({ 'user.name': 'Al', 'user.email': '1234567+beatmaker-99@users.noreply.github.com' }))).toEqual(['beatmaker'])
    expect(developerNames(config({ 'user.email': 'info.studio@example.test' }))).toEqual([])
    expect(developerNames(config({}))).toEqual([])
  })
})
