/* SPDX-License-Identifier: GPL-3.0-or-later
 * DECK: códigos de tecla del Octatrack (OS 1.40C).
 *
 * Fuentes, que coinciden:
 *   - Modwerk status.c (probado en hardware, MKII): CUE 0x2a, PROJ 0x1c, NO 0x32.
 *   - Octabam docs/firmware/PANEL.md (sondeo bajo el port, corregido el 25 sep 2026:
 *     STOP es 0x27, no 0x2a): pistas 0x10..0x17, DOWN 0x20, RIGHT 0x21, páginas
 *     0x22..0x26, STOP 0x27, PLAY 0x28, REC 0x29, CUE 0x2a, FUNCTION 0x2d,
 *     PATTERN 0x2e, BANK 0x2f, YES 0x31, NO 0x32, UP 0x33, LEFT 0x34, MIDI 0x35.
 *   - El código es fila·8 + bit en la MK1 y en la MKII; la tabla de la MK1
 *     (0x400bfc10, 57 registros) no tiene 0x1c: la MK1 no tiene PROJ.
 *
 * Sin confirmar en una MK1 real: se comprueban con el sondeo de teclas del
 * TESTING.md antes de calificar el módulo. Todo el módulo usa solo estas constantes.
 */
#ifndef DECK_KEYS_H
#define DECK_KEYS_H

#define K_TRACK1 0x10 /* pistas 1..8 = 0x10..0x17 */
#define K_TRACK8 0x17
#define K_DOWN 0x20
#define K_RIGHT 0x21
#define K_SRC 0x22 /* páginas 0x22..0x26: SRC AMP LFO FX1 FX2 */
#define K_FX2 0x26
#define K_STOP 0x27
#define K_PLAY 0x28
#define K_REC 0x29
#define K_CUE 0x2a
#define K_FUNC 0x2d
#define K_PATTERN 0x2e
#define K_BANK 0x2f
#define K_YES 0x31
#define K_NO 0x32
#define K_UP 0x33
#define K_LEFT 0x34
#define K_MIDI 0x35

/* Combinación para abrir y cerrar DECK: mantener CUE y pulsar MIDI.
 * Motivo: en la MK1 no hay PROJ (Modwerk usa CUE + PROJ para su página de estado)
 * y MIDI, que cambia entre pistas de audio y MIDI, no se usa al pinchar. DECK se
 * queda la pulsación de MIDI, así que la máquina no cambia de modo.
 * Cámbialo aquí si en tu flujo usas MIDI. */
#define K_OPEN_MOD K_CUE
#define K_OPEN K_MIDI

#endif
