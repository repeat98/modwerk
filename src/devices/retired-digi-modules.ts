// Retired from a machine's library for good. A saved configuration or version pin that still names one loses it quietly
// when it is read, instead of becoming unreadable, as REMOVED_MODULE_IDS does for the Octatrack. A module that leaves the
// library adds its id here in the same change. Other modules' conflict lists may still name them (scripts/machine-modules.mjs).
// No imports: the module checks read it in plain Node.
export const RETIRED_DIGI_MODULE_IDS: Readonly<Partial<Record<'digitakt' | 'digitakt-ii' | 'digitone' | 'analog-rytm-mkii' | 'model-cycles', readonly string[]>>> = {
  'analog-rytm-mkii': ['pipo-loop', 'improved-performance'], // #1650 (16 November 2026), #1944 (21 November 2026)
  digitakt: ['digihealth', 'digineighbor', 'digislicer'], // withdrawn 27 November 2026
  digitone: ['digihealth', 'digitables', 'digihoard', 'digiprism', 'digireel', 'digiswarm', 'digitide', 'digitriad'], // withdrawn 27 November 2026
}
