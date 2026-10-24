// SPDX-License-Identifier: GPL-3.0-or-later
import type { DigiMachine } from '../devices/digi-mods'

export type RecoveryMachine = 'octatrack' | DigiMachine

/** The FAQ answer that says how to bring each machine back to stock, linked as #faq/<id>. */
export const RECOVERY_FAQ: Record<RecoveryMachine, string> = {
  octatrack: 'recover',
  digitakt: 'digi-recovery',
  'digitakt-ii': 'digi-recovery',
  digitone: 'digi-recovery',
  'analog-rytm-mkii': 'digi-recovery',
}
