/* SPDX-License-Identifier: GPL-3.0-or-later
 * events_test.c's machine: the generated header's shape (three call events, the last
 * two at one site; a take event with room 2; a table with room 2 that owns one site;
 * a raised event with no site), its sites inside the host test's fake stock code. */
#ifndef MODWERK_RUNTIME_EVENTS_H
#define MODWERK_RUNTIME_EVENTS_H
#define RUNTIME_SITE_EVENTS 6u
#define RUNTIME_SITE_EVENT_SPANS { {0x1080u, 8u}, {0x10a0u, 8u}, {0x10a0u, 8u}, {0x10c0u, 6u}, {0x00000000u, 0u}, {0x00000000u, 0u} }
#define RUNTIME_SITE_EVENT_ROOM { RUNTIME_MODULES, RUNTIME_MODULES, RUNTIME_MODULES, 2u, 2u, RUNTIME_MODULES }
#define RUNTIME_SITE_EVENT_TABLES { 0, 0, 0, 0, 1, 0 }
#define RUNTIME_SITE_EVENT_WORDS (4u * (RUNTIME_MODULES + 1u) + 6u)
#define RUNTIME_SITE_EVENT_ROWS(r) { (r) + 0u * (RUNTIME_MODULES + 1u) + 0u, (r) + 1u * (RUNTIME_MODULES + 1u) + 0u, (r) + 2u * (RUNTIME_MODULES + 1u) + 0u, (r) + 3u * (RUNTIME_MODULES + 1u) + 0u, (r) + 3u * (RUNTIME_MODULES + 1u) + 3u, (r) + 3u * (RUNTIME_MODULES + 1u) + 6u }
#define RUNTIME_OWNED_SITES 1u
#define RUNTIME_OWNED_SPANS { {0x10d0u, 4u, 4u} }
extern const unsigned char modwerk_raise_test[];
#define RUNTIME_SITE_EVENT_RAISES { 0, 0, 0, 0, 0, (uintptr_t)modwerk_raise_test }
#endif
