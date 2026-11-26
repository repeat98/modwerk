import { expect, it } from 'vitest'
import { chooserIndex } from './chooser-name.mjs'

const names = ['NONE', 'FILTER', 'DELAY', 'PLATE REV', 'SPRING REV', 'DARK REV', null, 'Midivrb I/II', 'RINGMOD SC']

it('finds the exact name first, in any case', () => {
  expect(chooserIndex(names, 'delay')).toBe(2)
  expect(chooserIndex(names, 'Plate Rev')).toBe(3)
})

it('finds a name shortened to fit the chooser, word by word', () => {
  expect(chooserIndex(names, 'Midiverb I/II')).toBe(7)
  expect(chooserIndex(names, 'MIDIVERB I/II')).toBe(7)
})

it('refuses what is not a shortening, or fits more than one row', () => {
  expect(chooserIndex(names, 'Midiverb')).toBe(-1)          // another number of words
  expect(chooserIndex(names, 'SC Ringmod')).toBe(-1)        // reordered words are the qualify tool's, not a shortening
  expect(chooserIndex(['DARK REV', 'DAR REV'], 'DARKER REV')).toBe(-1)
  expect(chooserIndex(names, 'Reverb')).toBe(-1)
})
