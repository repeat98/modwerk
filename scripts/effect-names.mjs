// The FX chooser's name for an effect, as scripts/octatrack-qualify.py's chooser_name finds it: a package's name can differ
// from the effect descriptor's, which the chooser shows (SC Ringmod is "RINGMOD SC"; Spectrum is "SPECTRUM79").

const key = name => name.toUpperCase().replace(/[\s_]+/g, '_').replace(/^_|_$/g, '')

/** The index in `names` (chooser names; null where an id is empty) of `wanted`: the same name, else a name that starts
 * with it, else the same words in another order. Case, spaces and underscores do not count. -1 when none. */
export function chooserIndex(names, wanted) {
  const want = key(wanted), words = want.split('_').sort().join('_'), at = test => names.findIndex(name => name != null && test(key(name)))
  for (const test of [name => name === want, name => name.startsWith(want), name => name.split('_').sort().join('_') === words]) {
    const found = at(test)
    if (found >= 0) return found
  }
  return -1
}
