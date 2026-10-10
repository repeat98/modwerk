import facts from './assets/requested-packages.json' with { type: 'json' }

export const ANALOG_BD_DONOR = 'SPRING REV'
// Reviewed inserts use instance-owned X state, allocator-owned Y buffers, or
// (Sidechain Compressor) separate Y ranges. None uses Analog BD's private X.
export const ANALOG_BD_DSP_COMPANIONS = ['miniverb', 'tapeecho', 'euclid', 'tapehead', 'sidechain-compressor', 'airwindows-chorus']

export function analogBdVariant(tag: string) {
  const variant = facts.analog.variants.find(variant => variant.tag === tag)
  if (!variant || variant.words.length + facts.analog.sharedWords > facts.analog.springWords) throw new Error('Invalid Analog BD DSP reservation.')
  return variant
}

/** Reserve the engine and relocated helper, leaving the 28-word gap usable. */
export function analogBdReservations(tag: string) {
  const variant = analogBdVariant(tag)
  return [
    { base: variant.spring, words: variant.words.length },
    { base: variant.spring + facts.analog.springWords - facts.analog.sharedWords, words: facts.analog.sharedWords },
  ]
}
