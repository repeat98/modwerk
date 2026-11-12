/* SPDX-License-Identifier: GPL-3.0-or-later
 * DECK: fuente propia de 3 x 5 px (avance de 4 px), solo mayúsculas.
 *
 * Por qué una fuente propia y no la del Octatrack: la fuente pequeña del OS
 * (0x400ba876, "5 px capitals" según Octabam PANEL.md) tiene anchos por glifo
 * que todavía no se han medido en la unidad. La columna de datos necesita
 * exactamente 4 px por carácter (5 caracteres en 20 px), así que la vista DECK
 * dibuja con esta fuente. Misma altura que la del OS: visualmente encaja.
 *
 * Cada glifo son 15 bits: 5 filas de 3, de arriba abajo; en cada fila el bit
 * más alto es la columna izquierda. Índice = ASCII - 32 (de ' ' a '_').
 */
#ifndef DECK_FONT_H
#define DECK_FONT_H
#include <stdint.h>

#define G(a, b, c, d, e) ((uint16_t)((a) << 12 | (b) << 9 | (c) << 6 | (d) << 3 | (e)))

static const uint16_t deck_font[64] = {
    /* ' ' */ 0,
    /* '!' */ G(2, 2, 2, 0, 2),
    /* '"' */ G(5, 5, 0, 0, 0),
    /* '#' */ G(5, 7, 5, 7, 5),
    /* '$' */ G(3, 6, 2, 3, 6),
    /* '%' */ G(5, 1, 2, 4, 5),
    /* '&' */ G(2, 5, 2, 5, 3),
    /* ''' */ G(2, 2, 0, 0, 0),
    /* '(' */ G(2, 4, 4, 4, 2),
    /* ')' */ G(2, 1, 1, 1, 2),
    /* '*' */ G(0, 5, 2, 5, 0),
    /* '+' */ G(0, 2, 7, 2, 0),
    /* ',' */ G(0, 0, 0, 2, 4),
    /* '-' */ G(0, 0, 7, 0, 0),
    /* '.' */ G(0, 0, 0, 0, 2),
    /* '/' */ G(1, 1, 2, 4, 4),
    /* '0' */ G(7, 5, 5, 5, 7),
    /* '1' */ G(2, 6, 2, 2, 7),
    /* '2' */ G(7, 1, 7, 4, 7),
    /* '3' */ G(7, 1, 7, 1, 7),
    /* '4' */ G(5, 5, 7, 1, 1),
    /* '5' */ G(7, 4, 7, 1, 7),
    /* '6' */ G(7, 4, 7, 5, 7),
    /* '7' */ G(7, 1, 2, 2, 2),
    /* '8' */ G(7, 5, 7, 5, 7),
    /* '9' */ G(7, 5, 7, 1, 7),
    /* ':' */ G(0, 2, 0, 2, 0),
    /* ';' */ G(0, 2, 0, 2, 4),
    /* '<' */ G(1, 2, 4, 2, 1),
    /* '=' */ G(0, 7, 0, 7, 0),
    /* '>' */ G(4, 2, 1, 2, 4),
    /* '?' */ G(7, 1, 2, 0, 2),
    /* '@' */ G(7, 5, 7, 4, 3),
    /* 'A' */ G(2, 5, 7, 5, 5),
    /* 'B' */ G(6, 5, 6, 5, 6),
    /* 'C' */ G(3, 4, 4, 4, 3),
    /* 'D' */ G(6, 5, 5, 5, 6),
    /* 'E' */ G(7, 4, 6, 4, 7),
    /* 'F' */ G(7, 4, 6, 4, 4),
    /* 'G' */ G(3, 4, 5, 5, 3),
    /* 'H' */ G(5, 5, 7, 5, 5),
    /* 'I' */ G(7, 2, 2, 2, 7),
    /* 'J' */ G(1, 1, 1, 5, 2),
    /* 'K' */ G(5, 5, 6, 5, 5),
    /* 'L' */ G(4, 4, 4, 4, 7),
    /* 'M' */ G(5, 7, 7, 5, 5),
    /* 'N' */ G(6, 5, 5, 5, 5),
    /* 'O' */ G(2, 5, 5, 5, 2),
    /* 'P' */ G(6, 5, 6, 4, 4),
    /* 'Q' */ G(2, 5, 5, 6, 3),
    /* 'R' */ G(6, 5, 6, 5, 5),
    /* 'S' */ G(3, 4, 2, 1, 6),
    /* 'T' */ G(7, 2, 2, 2, 2),
    /* 'U' */ G(5, 5, 5, 5, 7),
    /* 'V' */ G(5, 5, 5, 5, 2),
    /* 'W' */ G(5, 5, 7, 7, 5),
    /* 'X' */ G(5, 5, 2, 5, 5),
    /* 'Y' */ G(5, 5, 2, 2, 2),
    /* 'Z' */ G(7, 1, 2, 4, 7),
    /* '[' */ G(6, 4, 4, 4, 6),
    /* '\' */ G(4, 4, 2, 1, 1),
    /* ']' */ G(3, 1, 1, 1, 3),
    /* '^' */ G(2, 5, 0, 0, 0),
    /* '_' */ G(0, 0, 0, 0, 7),
};
#undef G

#endif
