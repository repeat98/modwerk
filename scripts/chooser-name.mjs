// SPDX-License-Identifier: GPL-3.0-or-later
// Which FX chooser row an effect's name means (device.mjs pick). A module's chooser name has at most 12 letters, so a
// longer name is shortened there (Midiverb I/II shows as Midivrb I/II): after no exact match, the one name with the
// same words, each keeping the wanted word's letters in order, is the row. -1 for none, or for several that fit.
export function chooserIndex(names, wanted) {
  const want = wanted.toLowerCase()
  const exact = names.findIndex(name => name?.toLowerCase() === want)
  if (exact >= 0) return exact
  const words = want.split(' ')
  const keeps = (short, long) => { let i = 0; for (const c of long) if (c === short[i]) ++i; return short.length > 0 && i === short.length }
  const fits = names.flatMap((name, i) => {
    const own = name?.toLowerCase().split(' ')
    return own && own.length === words.length && own.every((word, k) => keeps(word, words[k])) ? [i] : []
  })
  return fits.length === 1 ? fits[0] : -1
}
