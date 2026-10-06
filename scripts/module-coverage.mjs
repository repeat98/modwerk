// The selections a module is compared on with native octabam (owner decision, 5 October 2026): a coverage set instead
// of every combination, so the comparison grows with the number of modules rather than doubling with each one.
// Shared by scripts/module-verify.mjs, which runs it, and the catalog test, which requires it for new modules.


// Compared with native octabam by the earlier every-combination suites (docs/VERIFICATION.md), at exactly this code. A change to a
// module's code needs a record from `npm run module:verify` instead.
export const COMPARED_BEFORE_RECORDS = {
  miniverb: 'fb8b72025be70d4e62021a6699992f9cdeb63684cef8db66949a41f6b1d887d0',
  tapeecho: '909110e5e066943bb304e3020775cc4fcf6e6ae36492eb7e328888938ac9a257',
  euclid: '44e44e1575e4bbf638894ffa51b06ca739e78e0f9bb1995bfd3a77190549d5ea',
  repitch: '21cb5bd5724890ed877c04ad2f6b5e7b554ee49904d2901960ece6d11f277437',
  tapehead: '9b005a4f1a186cc7731c5bf973d59ebef9538190ac63fddba26f0e60c96c8646',
  'analog-bassdrum': '24d5ebdc2c7ca54ca372c442e11fef0bd85b21d3a240dce0fc4b2ffa14e2d315',
  'usb-audio-out-tracks-main-cue': '430ff104d1488ca5117fb6f35550f4575547355bfcd17bd13a3740d20caa3b3a',
  quantizer: 'e7203592f0b312ac4833fec7aee714004f94a53c762a5e73f2279813520851de',
  previewvol: '86deed960c094df1d0d2a4a9d3a955a62e804175f2f22d8ac53f5eff141aeaca',
  'cc-map': '85ac180b75837d7681c74325b29a3a78416d3b2a8890fb6394f033c27993393d',
}
// Modules that do not compose with others (MIDI Scenes builds on its own) have no coverage comparison.
export const NOT_COMPOSED = ['midi-scenes']

/** The modules a new module is compared beside: every offered module except MIDI Scenes, which only builds alone. */
export function comparisonPool(availableIds) {
  return availableIds.filter(id => id !== 'midi-scenes')
}

// A small deterministic generator, so the same module and pool always give the same sample.
function random(seedText) {
  let seed = 2166136261
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The selections that contain `id`, each built with and without the stock FX2 effects:
 *   - the module alone;
 *   - beside each other module;
 *   - every module together, and every module together but one (the fullest selections, where space runs out);
 *   - a fixed sample of selections in between, around where selections start being refused.
 * Analog BD takes minutes per native build and refuses every DSP effect, so it only appears beside the module.
 */
export function coverageSelections(id, pool, { sample = 24 } = {}) {
  if (!pool.includes(id)) throw new Error(id + ' is not in the comparison pool')
  const order = new Map(pool.map((module, index) => [module, index]))
  const sorted = ids => [...new Set(ids)].sort((a, b) => order.get(a) - order.get(b))
  const others = pool.filter(module => module !== id), light = others.filter(module => module !== 'analog-bassdrum')
  const sets = new Map()
  const add = ids => { const selection = sorted([id, ...ids]); sets.set(selection.join('+'), selection) }
  add([])
  for (const other of others) add([other])
  add(light)
  for (const left of light) add(light.filter(module => module !== left))
  const next = random(id + ':' + pool.join(','))
  let added = 0
  for (let tries = 0; added < sample && tries < sample * 50; tries++) {
    // Two other modules up to all but one, drawn by a Fisher-Yates shuffle.
    const size = 2 + Math.floor(next() * Math.max(1, light.length - 2)), shuffled = [...light]
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
    const before = sets.size
    add(shuffled.slice(0, size))
    if (sets.size > before) added++
  }
  return [...sets.values()].flatMap(ids => [true, false].map(keepStockFx2 => ({ ids, keepStockFx2 })))
}

export const selectionKey = (ids, keepStockFx2) => [...ids].sort().join('+') + ':' + keepStockFx2
