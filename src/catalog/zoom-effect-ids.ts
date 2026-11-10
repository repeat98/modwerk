// Zoom effect IDs the module contract (zdl) and the pedal page's link both hold to (docs/ZDL_MODULE_CONTRACT.md#effect-ids).

/** Group 8 IDs no collection ships on: an effect whose ID is already taken on the pedal is moved here when it is
 * installed. The ID is only in the header (group at 0x3C and 0x43, ID at 0x40), with no checksum over it, so moving it
 * rebuilds nothing. */
export const LOCAL_IDS = { gid: 8, first: 958, last: 1023 }

/** Effect IDs two collections shipped for different effects. Swapping one for the other froze an MS-70CDR at boot
 * until its ROM was reprogrammed (repeat98/ZoomMultistompZDL issue 8), and a pedal can't say what it had before,
 * so neither is installed, even after both effects moved to new IDs. */
export const CLASHING_EFFECT_IDS = [{ gid: 8, fxid: 409, files: 'Spool.ZDL and TEcho4.ZDL', moved: 'Spool is now 914 and TEcho4 946' }]
