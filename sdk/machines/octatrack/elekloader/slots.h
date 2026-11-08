/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_SLOTS_H
#define MODWERK_SLOTS_H
#include <stdint.h>
/* The two-slot flash layout (docs/OCTATRACK_TWO_SLOT_BASE.md), shared by the boot stub (stub.c), the base's writer
 * (flash.c) and the host tests. NOR is mapped at 0; Elektron's bootloader below SLOT_STUB is never written. */
#define SLOT_STUB 0x4000u        /* the stub's container: the base container's header, the trampoline, the stub */
#define SLOT_STUB_BYTES 0x2000u  /* one 8 KB sector */
#define SLOT_STUB_CODE 0x4100u   /* the stub's code, run from NOR where it lies */
#define SLOT_A 0x10000u
#define SLOT_B 0x100000u
#define SLOT_BYTES 0xf0000u      /* fifteen 64 KB sectors each */
#define SLOT_SECTOR 0x10000u
#define SLOT_RECORD 0x100u       /* one program page; the container follows it */
#define SLOT_CONTAINER_MAX (SLOT_BYTES - SLOT_RECORD)
#define SLOT_MAGIC 0x4d57534cu   /* "MWSL" */
#define SLOT_TRIES 2u            /* starts of an unconfirmed slot before the stub returns to the other */
/* The record page: programmed last, so a slot whose write was cut never counts. */
#define REC_MAGIC 0x00u
#define REC_GENERATION 0x04u     /* one more than the other slot's at write time */
#define REC_LENGTH 0x08u         /* the container's bytes */
#define REC_IDENTITY 0x0cu       /* the written base's identity (IDENTIFY), 32 bytes; zeros for a copied old base */
#define REC_CHECK 0x2cu          /* over 0x00-0x2b: a record cut half way fails it */
#define REC_TRIES 0x80u          /* 16 bits, erased when written: the stub clears one per unconfirmed start */
#define REC_CONFIRMED 0xc0u      /* 16 bits, erased when written: 0 once a base ran healthy from the slot */
#define SECT 0x12u               /* the container's section header [length][byte sum], then the packed stream */
/* The stub's sector: the header (0x00), the trampoline's section (SECT: Elektron's bootloader unpacks it to
 * 0x40000400, a jump to SLOT_STUB_CODE), the mark, the code. Bases recognise any whole stub of this version by its
 * mark, whatever compiler built the one in NOR. */
#define STUB_MARK 0x40u          /* "MWSTUB", version (u16), code length (u32), code check (u32, FNV-1a) */
#define STUB_VERSION 1u
#define STUB_CODE (SLOT_STUB_CODE - SLOT_STUB)

struct slot_state {
    uint32_t generation, length;
    int whole;                   /* the record checks and the section's sum matches its stream */
    int confirmed;
    unsigned tries;              /* cleared bits of REC_TRIES */
    uint8_t identity[32];
};
uint32_t slot_record_check(const uint8_t *record);
/* Fills a record page (256 bytes) for a container. */
void slot_record(uint8_t *page, uint32_t generation, uint32_t length, const uint8_t *identity, int confirmed);
void slot_read(uint32_t base, struct slot_state *s);
/* The stub's choice from both states: the slot to start (0 A, 1 B, -1 none). *mark is set when the stub clears one
 * more REC_TRIES bit of the newest slot first (an unconfirmed start, or a start of the other one after its tries). */
int slot_pick(const struct slot_state *s, int *mark);
/* The slot a write must leave alone: the newest confirmed one, else the newest whole one (0 or 1). */
int slot_keep(const struct slot_state *s);
/* The newest whole slot (0 or 1), -1 none. */
int slot_newest(const struct slot_state *s);
uint32_t slot_fnv(uint32_t at, uint32_t n);
/* NOR's stub sector holds a whole stub of STUB_VERSION: a container header, a trampoline section that sums, the
 * mark, and code that checks. */
int slot_stub_whole(void);
#endif
