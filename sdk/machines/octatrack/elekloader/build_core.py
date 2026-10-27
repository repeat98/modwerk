#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Private Modwerk core source recipe; all linking/packing belongs to Elekloader.

No stock bytes or generated packages are committed. No USB or hardware access.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import os
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
_spec = importlib.util.spec_from_file_location('modwerk_usb_post', HERE / 'usb_post.py')
usb_post = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(usb_post)
VERSION = '0.3.1-modwerk-dev.1'
# Resident controller trust: association, the scoped write lease, its resolver and the board-compiled policy table.
CONTROLLER_POLICY_SOURCES = ('controller_policy.c', 'controller_policy.h', 'controller_association.c', 'controller_association.h',
                             'controller_write_lease.c', 'controller_write_lease.h', 'controller_write_policy.c',
                             'controller_transport.c', 'controller_transport.h', 'controller_board.c', 'controller_board.h')
# Built for size (RAM boot keeps MAIN under 1.25 MiB): engine-task and boot-only units, never reached from the USB
# or frame interrupts or with interrupts masked. boot_anim.c is paced by DTIM3, not by instruction counts, so it
# can only draw fewer frames in its 3.5 s. Units an interrupt reaches (ep0, vendor, transfer, manager, selection,
# the saved-set session/export and modset export-idle seam) and units holding or called under a mask
# (loader, dsp, stock hooks, metadata admission/lifetime/Part helpers and controller association/write leases)
# stay at the kit's -O2.
SIZE_OPTIMIZED = ('wire.c', 'upload.c', 'boot_anim.c', 'saved_set_reader.c')
VOLATILE_SERVICE_SOURCES = ('volatile_service.c', 'volatile_service.h')
# Fixed, default-empty private trust storage; no public admission flags.
MACHINE_TRUST_SOURCES = ('machine_admission.c', 'machine_admission.h',
    'machine_admission_runtime.c', 'machine_declarations.c',
    'machine_lifetime.c', 'machine_lifetime.h', 'machine_parts.c', 'machine_parts.h',
    'table_admission.c', 'table_admission.h', 'table_declarations.c', 'table_declarations.h',
    'machine_contributors.c', 'machine_contributors.h',
    'sample_editor_actions.c', 'sample_editor_actions.h')
SAMPLE_EDITOR_SOURCES = ('sample_editor_service.c', 'sample_editor_service.h',
    'sample_editor_board.c', 'sample_editor_board.h', 'sample_editor_menu.c', 'sample_editor_hooks.s')
RETIREMENT_SOURCES = tuple('analog-bd-parts/' + n for n in ('analog_bd_part_restore.c', 'analog_bd_part_restore.h',
                                                          'analog_bd_part_board.c', 'analog_bd_part_board.h'))


def check_trust_storage(main_image, mapping, layout, main_load, table=None):
    """Verify the real linked trust reservations before handoff.

    The machine storage is always the empty baseline. The table storage is the
    empty baseline too, or with `table` exactly the reviewed table-owner records
    fill_table_owners() put there; both stay inside the appended initialized .run.
    """
    ddr, run = layout.get('ddr'), layout.get('run_load')
    if (not isinstance(ddr, list) or len(ddr) != 2 or
            any(type(v) is not int for v in (*ddr, run, main_load)) or
            ddr[0] >= ddr[1] or run < main_load):
        raise ValueError('Private trust storage needs the actual linked run layout.')
    spans, proof = [], {}
    for name, magic, revision, capacity, length in (('modwerk_machine_declarations', b'MWMD', 2, 24, 1072),
                                ('modwerk_table_declarations', b'MWTD', 1, 24, 1456)):
        address = mapping.get(name)
        if (type(address) is not int or address & 3 or address < ddr[0] or
                address + length > ddr[1]):
            raise ValueError('Missing or out-of-bounds private trust reservation: ' + name)
        at = run - main_load + address - ddr[0]
        expected = magic + bytes((revision, 0, capacity)) + bytes(length - 7)
        if table is not None and name == 'modwerk_table_declarations':
            if len(table) != length or table[:4] != magic or table[4] != revision or table[6] != capacity:
                raise ValueError('The reviewed table-owner records do not fit their reservation.')
            expected = table
        if at < 0 or at + length > len(main_image) or main_image[at:at + length] != expected:
            raise ValueError('Private trust reservation is not the exact expected storage: ' + name)
        if any(address < end and start < address + length for start, end in spans):
            raise ValueError('Private trust reservations overlap.')
        spans.append((address, address + length))
        proof[name] = dict(address=hex(address), bytes=length, count=expected[5],
                          sha256=hashlib.sha256(expected).hexdigest())
    return proof


def check_saved_set_storage(mapping, layout):
    """Bound the exact cold-boot-cleared snapshot plus its engine lease latch."""
    address, bss = mapping.get('modwerk_saved_set_export'), layout.get('bss')
    length = RUNTIME_POOL_BYTES + 0x1000 + 48 + 12
    if (type(address) is not int or address & 3 or not isinstance(bss, list) or len(bss) != 2 or
            any(type(v) is not int for v in bss) or not 0x40000400 <= bss[0] < bss[1] <= 0x47f00000 or
            address < bss[0] or address + length > bss[1]):
        raise ValueError('Saved-set snapshot is not the exact bounded linked BSS reservation.')
    return dict(address=address, uncachedAddress=address + 0x08000000, bytes=length,
                snapshotCapacity=RUNTIME_POOL_BYTES + 0x1000, initializedAtBoot=True, hardware=False)


# core-ot.s's .bss clear, through the uncached alias, steps over the logger's 8192 retained bytes (retained.s).
BOOT_CLEAR_SKIP = '''3:      cmpa.l  #modwerk_retained_start + UNCACHED, %a1
        bne.s   5f
        lea     8192(%a1), %a1
        sub.l   #2048, %d0
        beq.s   4f
5:      clr.l   (%a1)+'''
# core-ot.s's word copy of .run: MAIN stores .run packed (run_pack.py), and run_unpack.s decodes it in its place.
BOOT_RUN_COPY = '''        lea     __run_load, %a0         | where the RAM image was unpacked
        movea.l #__run_start + UNCACHED, %a1
        move.l  #__run_words, %d0
        beq.s   2f                      | nothing to copy (core alone)
1:      move.l  (%a0)+, (%a1)+
        subq.l  #1, %d0
        bne.s   1b'''
# core-ot.s once .run is unpacked and .bss cleared: flash.c's digest of the packed .run, which stock's start then
# overwrites. d1 is the only register the C call may change that .boot does not save.
BOOT_FLASH_SEAM = '        move.b  %d0, core_up'
BOOT_FLASH_SNAPSHOT = BOOT_FLASH_SEAM + '''
        move.l  %d1, -(%sp)
        jsr     modwerk_flash_snapshot  | flash.c: the packed .run's digest, for the USB base update
        move.l  (%sp)+, %d1'''


def check_zero_state(elf, moved, layout, mapping, bootstrap):
    """Prove every object zero_state moved out of .data lies, in the final link, inside the uncached boot
    clear and outside its retained skip. Locals are found by their unit's FILE symbol, globals by name."""
    bss, base = layout.get('bss'), layout.get('sections', {}).get('core .bss')
    keep = mapping.get('modwerk_retained_start'), mapping.get('modwerk_retained_end')
    if (bootstrap.count('movea.l #__bss_start + UNCACHED, %a1') != 1 or bootstrap.count(BOOT_CLEAR_SKIP) != 1 or
            not isinstance(bss, list) or len(bss) != 2 or
            any(type(v) is not int for v in (*bss, base, *keep, mapping.get('__bss_words'))) or
            mapping.get('__bss_start') != bss[0] or bss[0] + 4 * mapping['__bss_words'] != bss[1] or
            not bss[0] <= base < bss[1] or keep[1] - keep[0] != 8192 or (keep[0] - bss[0]) % 4 or
            not bss[0] <= keep[0] < keep[1] <= bss[1]):
        raise ValueError('The boot clear or its retained skip is not the reviewed linked layout.')
    sections = {s.idx: s.name for s in elf.sections}
    found, unit = {}, None
    for y in elf.symbols:
        if y.type == 4:  # STT_FILE: the locals after it are that unit's
            unit = y.name
        elif y.type == 1:  # STT_OBJECT
            found.setdefault((unit if y.bind == 0 else None, y.name), []).append(y)
    proof = {}
    for name, objects in sorted(moved.items()):
        for o in objects:
            hits = found.get((name, o), []) + found.get((None, o), [])
            if len(hits) != 1:
                raise ValueError('Zero-state object %s:%s is missing or ambiguous in the link.' % (name, o))
            y = hits[0]
            at = base + y.value
            if (sections.get(y.shndx) != '.bss' or y.size <= 0 or at < bss[0] or at + y.size > bss[1] or
                    (at < keep[1] and keep[0] < at + y.size) or (y.bind and mapping.get(o) != at)):
                raise ValueError('Zero-state object %s:%s is not in the cleared BSS outside the retained skip.' % (name, o))
            proof[name + ':' + o] = dict(address=hex(at), uncachedAddress=hex(at + 0x08000000), bytes=y.size)
    return dict(clear=[hex(v) for v in bss], retainedSkip=[hex(v) for v in keep], objects=proof,
                bytes=sum(p['bytes'] for p in proof.values()), hardware=False)


FIELDS ={'build': 17, 'os': 17, 'modules': 4096, 'configuration': 65,
          'source': 65, 'fx1': 1024, 'fx2': 1024, 'hidden': 1024}
# RAM boot (boot.s): the gate replaces the OS entry's `movea.l #0x48000000,%sp`.
BOOT_GATE = (0x40000412, '2e7c48000000')
# The startup (boot_anim.s) replaces the logo loop's first instructions, `pea -1; clr.l -(%sp)`.
BOOT_LOGO = (0x400559c6, '4878ffff42a7')
# The frame guard (machine_registry.c): the frame interrupt's register save at its entry and its restore with rte
# at its exit, which machine_registry.s replays around the guard's clock. Address, bytes, their SHA-256, shim.
FRAME_SITES = ((0x4000aad0, 8, '5f02b18d204af6e4a0177ad6e41c779a698018b6f25b5d83850926c8a9d44fa2', 'mw_frame_entry'),
               (0x4000d9a6, 10, '60acbd38c2859ac73a63948d6c58796591fdbddd654799e50e88b0940be9a37a', 'mw_frame_leave'))
OS_FIRST, OS_VEROFF, BOOT_IMAGE_BYTES = 0x4fefffe4, 0xde648, 0x140000  # boot.s, boot.h
BOOT_RESERVE = (0x40a955e0, 0x41495de0)  # boot.s RESERVE_LO/HI: the gate scans only there
# REMIX SWITCH's DSP park (dsp_park.asm, assembled by Octabam's dsp_asm), by
# P address, written into both payloads over dead `jmp *` vectors.
DSP_PARK = {
    0x1e: (0x0bf080, 0x000020),  # jsr >$20, host command $0F's vector
    0x20: (0x330000, 0x08d32c, 0x08d328, 0x08d324, 0x08d320, 0x04d3d5, 0x04d3d7, 0x07b495, 0x000000,
           0x07b497, 0x000000, 0x0a8406, 0x0a8407, 0x0a8426, 0x0444bc, 0x44f400, 0x000034, 0x04c4bc,
           0x000000, 0x000004, 0x05f439, 0x000300, 0x0cc300, 0x000000, 0x084e06, 0x0cc300, 0x000000,
           0x085006, 0x221100, 0x218400, 0x0c0006),
    0x06: (0x06c400, 0x00000a, 0x0cc300, 0x000000, 0x085886, 0x0abd4e, 0x0abe4e, 0x0ae180),
}
# --dsp-loader: Octabam's DSP dynamic loading (dsp_loader.py, dsp.c), unchanged
# but for the seams named in DSP_EDITS, and its ColdFire hooks (address, stock
# SHA-256 as Octabam guards them, label in its hooks.s).
DYNLOAD = APP / 'sdk/octabam/platform/dsp-dynload-transport'
DYNLOAD_SOURCES = ('transfer.c', 'transfer.h', 'allocator.c', 'allocator.h', 'manager.c', 'selection.c', 'selection.h',
                   'buffers.c', 'buffers.h', 'publication.h')
DYNLOAD_HOOKS = (
    (0x40004bc0, 8, '560d267844d7aa23140680beb751fac814290c76527d653fc41fbbb43c830cbf', 'dl_state7'),  # frame DMA: packets to both cores
    (0x400526e4, 8, '3e7c95b32f444fd280cb96b2a6ea90525fe223d6e6b9352086d2cf41941ae854', 'dl_fx1_guard'),
    (0x40052474, 8, '3e7c95b32f444fd280cb96b2a6ea90525fe223d6e6b9352086d2cf41941ae854', 'dl_fx2_guard'),
    (0x4004a8a4, 6, '20577862965e35b56da3cc4660ac5df6a325e455467496552d181b68fff15e2d', 'dl_part_guard'),
    # Modwerk's: core 1's packet right after stock's own push to core 1 (dsp_core1.s), at frame-transfer state 3.
    (0x400049ca, 8, '2945c558a5df272b3fb2ef6df3e3ab594b0c2c162f29c38ba624c3ec610c71f5', 'dl_state3'),
    # Modwerk's: the project's map of module effect handles in project.work (fxmap.s, fxmap.c), beside the
    # seams PLAY MODES and SCALE QUANTIZER patch, so both still install on this base (catalogue_overlaps).
    (0x400866e2, 8, '6b5f250f244620fe2acc97ddca8e7e1fa03b3b7a174ef7dc7bada335f1777378', 'mw_project_begin'),
    (0x40088224, 6, '5cf9e6109ce8cb58a9bf4dc66339e546dd063412195eeb9d8290218748e8fdd2', 'mw_project_line'),
    (0x400888c8, 6, '456d2abcb4566bd836c3fca9361d944909299ab5f3722ff6ec74affc41e77689', 'mw_project_write'),
    (0x4008540e, 6, 'c607734f7f97b4a13e2047f38d5e2feace1aa3018ec9f19742f612139e7ac0bd', 'mw_project_end'),
    # Modwerk's: the shared wide dial for module pages' controls with more than five labels (fxpage.s).
    (0x40047a3c, 6, '9b2c003ba4d776237ad71bef15451bfea4447f2acca77ef6922dcea6ac52ca78', 'mw_wide_dial'),
    # Modwerk's: main's idle spin counts the ColdFire's idle time (status.s, status.c). Its last init call only:
    # stock's spin stays, where ot_emu parks main again after a bench call.
    (0x4001fc96, 6, '2edb8c17ea73bf5ecd097ec929f3bfd6f8a74c81b11080d0d74efd55bec6b416', 'mw_idle'),
    # Modwerk's: the time-stretch helper task skips a track whose TSTR is OFF (status.s).
    (0x40098b2c, 8, 'e3b2889593533c76e33bdee43526078d47b0b1c53b99a6d93d9ff1118e752203', 'mw_ts_gate'))
# --dsp-loader: the knob routine of an audio track's main pages (0x40055008) names the default stepper 0x4003240c by
# `lea 0x4003240c,%aN` for a live turn; the base repoints that operand at fxpage.s's mw_knob_step, which restages a
# module page's turned knob before it (a select then steps as stock's do from the first visit). Address, the lea's
# six stock bytes' SHA-256 and the stepper it names.
KNOB_STEP = (0x40055140, 'c5e0994d9ad233a5e894f277b48d402278cd74bd878fab0e700f03946b8f2b9d', 0x4003240c)
# The runtime builder's runtime.json reader and the Octatrack's events at base-owned sites (events.json).
_spec = importlib.util.spec_from_file_location('modwerk_runtime_builder', APP / 'sdk/runtime/loader/build.py')
RUNTIME_BUILDER = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(RUNTIME_BUILDER)
_spec = importlib.util.spec_from_file_location('modwerk_site_events', APP / 'sdk/machines/octatrack/events.py')
EVENTS = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(EVENTS)
# GCC 16.2's late-combine miscompile: the base's C compiles turn the pass off, and every C object is checked
# before packaging (sdk/runtime/m68k_codegen.py).
_spec = importlib.util.spec_from_file_location('modwerk_m68k_codegen', APP / 'sdk/runtime/m68k_codegen.py')
CODEGEN = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(CODEGEN)
# Catalogue modules allowed to patch what this base owns, and why (docs/OCTATRACK_ELEKLOADER_MIGRATION.md).
BASE_OWNS = {'usb-audio-out-tracks-main-cue': 'the base owns the USB configuration',
             'midi-scenes': 'its writes meet Elekloader\'s own sites; it needs a port',
             'output-matrix': 'resident bases own its CUE CFG project-load clamp and CS1 power-up widening (cue_cfg.s); '
                              'its controller package leaves those sites out'}
# resident-runtime/cue_cfg.s: (address, guard bytes, guard SHA-256 = Output Matrix's manifest guard, the base's site).
CUE_CFG_WIDENING = ((0x4008732a, 14, '968adf63466a054aefd6609f18536e3719bbcc144b6dc0a43de49794c3bb3718',
                     dict(op='jmp', target='modwerk_cue_cfg_clamp', length=6)),
                    (0x400100be, 2, '0b14b394f74bdc2f13a4efc3e6bcec310ba2288bcf64811943a1fe443229d05b',
                     dict(op='bytes', new='7402', length=2)),   # CS1 check: 2 is valid
                    (0x400100c4, 2, '1f2e6d00279b4659b6d6f1ad57e12568e4a50f80908af50d1e861001b2be2a3b',
                     dict(op='bytes', new='7002', length=2)))   # ... and above 2 clamps to 2


def catalogue_overlaps(sites):
    """Catalogue modules a site of this base would lock out: each must still install over the stock bytes
    it patches or keeps, beside the base (PLAY MODES once met the project map's seams). What a module's runtime.json
    or machine port subscribes or contributes in place of a patch (module-adapters/machine_ports.py) is not a lockout."""
    from elekloader.sdk import octabam as port
    spec = importlib.util.spec_from_file_location('modwerk_machine_ports_base', APP / 'sdk/machines/octatrack/module-adapters/machine_ports.py')
    machine_ports = importlib.util.module_from_spec(spec); spec.loader.exec_module(machine_ports)
    ob = port.Octabam(str(APP / 'sdk/octabam'))
    base = [(int(s['addr'], 16), len(bytes.fromhex(s['stock']))) for s in sites]
    found = []
    for name, m in sorted(ob.modules.items()):
        try:
            m = machine_ports.ported(m)
        except (ValueError, KeyError):
            found.append(name)
            continue
        spans = ([(d.site, max(len(d.expect), d.pad_to or 6)) for d in m.detours] + [(p.addr, len(p.expect)) for p in m.pokes] +
                 [(k.addr, len(k.expect)) for k in m.keeps] + [(site, 6) for t in m.tables for site, _ in t.refs] +
                 [(r.addr, 4) for r in m.symbol_refs])
        if name not in BASE_OWNS and any(a < b + bn and b < a + n for a, n in spans for b, bn in base):
            found.append(name)
    return found


# PROJ's root list: its descriptor (row count at +0), its rows pointer and the four stock rows (Octabam's MAINMENU.md
# sections 1-5). The window is five rows tall and stock fills four: MODWERK is the fifth, as Octabam's BRAIN does.
ROOT_MENU, ROOT_ROWS_POINTER, ROOT_ROWS = 0x400cbd8c, 0x400cbda4, 0x400cc698
ICON_MASK = 0x400cbfc4  # the stock categories' shared second plane
# MODWERK's icon, a module: 19 columns x 8 rows, one long per column, its pixels in the high byte, bit 0 the top row.
ICON = ('.....#...#...#.....',
        '...#############...',
        '...#...........#...',
        '...#.##........#...',
        '...#...........#...',
        '...#...........#...',
        '...#############...',
        '.....#...#...#.....')
# Chip cycles per sample each core's eight FX slots may use (core 0, core 1): 90% of the 4,532-cycle frame less stock's
# own work without effects, measured on the owner's MKII on 11 October 2026 (scripts/octatrack-measure.py: core 0 ~959,
# it mixes; core 1 ~514; one pattern playing). The 90% ceiling is the owner's choice.
DSP_ALLOWANCE = (3120, 3565)
# Each stock effect's chip cycles a sample by effect id, the dearer core at its dearest of three settings, measured on the
# same unit (docs/OCTATRACK_ELEKLOADER_MIGRATION.md's table; DELAY runs on the ColdFire; NONE and empty ids 0). A slot is
# charged at least the dearest of these its bank's Parts name there (dsp.c; owner, 24 October 2026, beta finding 34).
STOCK_CYCLES = {4: 285, 5: 80, 8: 0, 12: 193, 13: 342, 16: 242, 17: 147, 18: 295, 19: 128, 20: 249, 21: 299, 22: 257,
                24: 102, 28: 311}  # FILTER SPATIALIZER DELAY EQUALIZER DJ-EQ PHASER FLANGER CHORUS COMB PLATE SPRING DARK COMP LO-FI
# The dearest of them, DJ EQUALIZER (its 331 executed instructions in the emulator, stock_dsp_worst.py, run at about one a
# cycle): what a machine's voice or engine still books each slot at, since a bank change may bring any stock effect.
DSP_RESERVE = max(STOCK_CYCLES.values())
# Effect ids the base handles (fxids.h MODWERK_FX_IDS; docs/OCTATRACK_MORE_EFFECT_IDS.md). 32 only to bisect.
FX_IDS = 128
VALIDATOR_CLAMPS = (0x400023b6, 0x400023bc, 0x400023de, 0x400023e4)  # the Part validator's moveq #31, FX1 then FX2
FX_WORDS = (FX_IDS + 31) // 32
# Modules installed at once and their memory (loader.h; owner, 12 October 2026: up to 128 modules). About 5 KB a
# module today; the pool is taken from sample memory at boot (core-ot's arena pages), and modset.c keeps a copy of
# the set as staged beside it.
RUNTIME_MODULES = 128
RUNTIME_POOL_BYTES = 768 * 1024
DSP_EDITS = {
    # The FX selectors read their chooser list through these LEA operands, which the chooser composer repoints.
    'selection.c': (('static uint8_t paste[6322]={0};', 'static uint8_t paste[6322]; /* in .bss, which the core clears at boot: '
                     'the image stays under the 1.25 MiB a RAM boot takes */'),
                    ('descriptor=((volatile uint32_t *)(slot ? 0x400d6090u : 0x400d6060u))[s->row];',
                     'descriptor=((volatile uint32_t *)*(volatile uint32_t *)(slot ? 0x40052496u : 0x40052706u))[s->row];'),
                    # An FX pick that meets another slot's transaction waits, the latest per slot, and is replayed
                    # through the stock setter once the manager is idle. A waiting pick names its own track and
                    # chooser row (row bit 15): the panel may have moved on, which used to cancel it.
                    ('static unsigned pending=0, replay=0;',
                     'static unsigned pending=0, replay=0;\n'
                     'static uint8_t later_row[16]; /* per slot: FX1 T1-T8, then FX2 */\n'
                     'static uint32_t later=0, later_bank=0, later_part=0;\n'
                     'volatile uint32_t dl_selection_queued=0;\n'
                     'int dl_publication_idle(void);'),
                    ('    s->track=*(volatile uint8_t *)0x80000000u;\n'
                     '    s->slot=slot; s->source=source;\n'
                     '    s->row=slot>=2 ? row : *(volatile uint32_t *)(slot ? 0x460d5ca8u : 0x460d5c94u);',
                     '    s->track=slot<2 && row ? (row>>8)&7u : *(volatile uint8_t *)0x80000000u;\n'
                     '    s->slot=slot; s->source=source;\n'
                     '    s->row=slot>=2 ? row : row ? row&0xffu : *(volatile uint32_t *)(slot ? 0x460d5ca8u : 0x460d5c94u);'),
                    ('    ((void (*)(void))(slot ? 0x40052474u : 0x400526e4u))();\n}\n#endif',
                     '    /* The setter reads the current track and the chooser\'s cursor: a waiting pick\'s, for the call. */\n'
                     '    volatile uint8_t *track=(volatile uint8_t *)0x80000000u;\n'
                     '    volatile uint32_t *cursor=(volatile uint32_t *)(slot ? 0x460d5ca8u : 0x460d5c94u);\n'
                     '    uint8_t was_track=*track; uint32_t was_row=*cursor;\n'
                     '    if(row) { *track=(uint8_t)((row>>8)&7u); *cursor=row&0xffu; }\n'
                     '    ((void (*)(void))(slot ? 0x40052474u : 0x400526e4u))();\n'
                     '    if(row) { *track=was_track; *cursor=was_row; }\n}\n#endif'),
                    ('    if(pending) {\n        /* A paste',
                     '    if(slot<2) {\n'
                     '        unsigned i=slot*8+request.track;\n'
                     '        later&=~(1u<<i);\n'
                     '        if(pending && (queued.slot!=slot || queued.track!=request.track)) {\n'
                     '            if(request.before[i]==request.target[i]) return 1;\n'
                     '            if(later && (later_bank!=request.bank || later_part!=request.part)) { later=0; ++dl_selection_cancelled; }\n'
                     '            later_bank=request.bank; later_part=request.part;\n'
                     '            later_row[i]=(uint8_t)request.row; later|=1u<<i; ++dl_selection_queued;\n'
                     '            return 2;\n'
                     '        }\n'
                     '    }\n'
                     '    if(pending) {\n        /* A paste'),
                    ('void dl_selection_tick(void) {\n    struct dl_selection current;\n    if(!pending) return;\n'
                     '    if(!dl_selection_capture(queued.slot,queued.row,queued.source,&current)',
                     '/* The next waiting FX pick, through its stock setter and guard as the panel made it; a bank or\n'
                     ' * Part change drops them (they edited the Part that was active). */\n'
                     'static void next(void) {\n'
                     '    if(!later) return;\n'
                     '    if(*(volatile uint32_t *)0x46c82456u!=later_bank || *(volatile uint8_t *)0x80000003u!=later_part) {\n'
                     '        later=0; ++dl_selection_cancelled; return;\n'
                     '    }\n'
                     '    if(!dl_publication_idle()) return;\n'
                     '    unsigned i=0;\n'
                     '    while(!(later>>i&1u)) ++i;\n'
                     '    later&=~(1u<<i);\n'
                     '    dl_selection_apply(i/8,0x8000u|(i&7u)<<8|later_row[i],0);\n'
                     '}\n'
                     'void dl_selection_tick(void) {\n    struct dl_selection current;\n    if(!pending) { next(); return; }\n'
                     '    unsigned given=queued.slot<2 ? 0x8000u|queued.track<<8|queued.row : queued.row;\n'
                     '    if(!dl_selection_capture(queued.slot,given,queued.source,&current)'),
                    ('    replay=1; dl_selection_apply(queued.slot,queued.row,queued.source); replay=0;',
                     '    replay=1; dl_selection_apply(queued.slot,given,queued.source); replay=0;')),
    # Modules register effects at run time (dsp.c), and admission charges their cycles.
    'manager.c': (('extern const struct dl_package dl_catalog[32];', 'extern struct dl_package dl_catalog[32];'),
                  # A moved package (dl_move) uploads its new copy and binds it like a new one; its old copy stays live
                  # and bound until the bind, and is freed at the retirement.
                  ('    return allocator.target[c][p].present && !allocator.live[c][p].present;\n}',
                   '    return allocator.target[c][p].present && (!allocator.live[c][p].present ||\n'
                   '           allocator.target[c][p].offset!=allocator.live[c][p].offset);\n}'),
                  ('void dl_selection_commit(uint32_t token) {',
                   '/* Modwerk (dsp.c\'s compaction): p\'s code on core c to `offset` while it runs; only when idle. */\n'
                   'int dl_move(unsigned c,unsigned p,unsigned offset) {\n'
                   '    if(phase || !initialized || !dl_residency_enabled) return 0;\n'
                   '    uint32_t token=auto_serial+1; if(!token) token=0x80000000u;\n'
                   '    if(dl_allocator_move(&allocator,c,p,offset,token)!=DL_ALLOC_OK) return 0;\n'
                   '    auto_serial=token; begin(allocator.active,token,1); phase=2; /* placed: upload, bind, commit, free */\n'
                   '    return 1;\n'
                   '}\n'
                   'void dl_selection_commit(uint32_t token) {'),
                  # A move's rollback (phase 7) sends the moved id back to its old copy with one BIND: that copy still
                  # runs (dl_allocator_move placed the new one clear of every live copy) and stays held until the
                  # cancel. Sending it to the dry stub, as for code that never ran, would silence a running effect.
                  # Only an old copy a new copy of this transaction may have overwritten goes to the stub.
                  ('static void rollback(void) { cancelling=1; }\n',
                   'static void rollback(void) { cancelling=1; }\n'
                   '/* Modwerk: 1 when a rollback rebinds p on core c to its live copy (moved, and that copy provably\n'
                   ' * intact: no span this transaction uploads meets it); sent_back: the job in flight is such a BIND. */\n'
                   'static unsigned sent_back;\n'
                   'static unsigned moved_back(unsigned c,unsigned p) {\n'
                   '    const struct dl_placement *old=&allocator.live[c][p];\n'
                   '    if(!old->present || !allocator.target[c][p].present || allocator.target[c][p].offset==old->offset) return 0;\n'
                   '    for(unsigned q=0;q<sizeof allocator.target[c]/sizeof allocator.target[c][0];++q) {\n'
                   '        const struct dl_placement *t=&allocator.target[c][q];\n'
                   '        if(!t->present || (allocator.live[c][q].present && allocator.live[c][q].offset==t->offset)) continue;\n'
                   '        if(t->offset<(unsigned)old->offset+old->words && (unsigned)t->offset+t->words>old->offset) return 0;\n'
                   '    }\n'
                   '    return 1;\n'
                   '}\n'),
                  ('        unsigned offset=DL_CODE_START+allocator.target[c][p].offset;\n',
                   '        unsigned back=mode==7 && moved_back(c,p);\n'
                   '        sent_back=back;\n'
                   '        unsigned offset=DL_CODE_START+(back ? allocator.live[c][p].offset : allocator.target[c][p].offset);\n'),
                  ('        } else waiting=dl_command_start(c,mode==3 ? DL_BIND :',
                   '        } else waiting=dl_command_start(c,mode==3 || back ? DL_BIND :'),
                  ('                if(phase==4 || dl_bypass_unbound) stubbed[c]|=bit; else stubbed[c]&=~bit;',
                   '                if(phase==4 || (dl_bypass_unbound && !sent_back)) stubbed[c]|=bit; else stubbed[c]&=~bit;'),
                  # A core's channel held by another job (status.c's meter reads, dsp.c's probes) is a wait, not a
                  # refusal: the next tick tries again. Only a start the transfer layer refused outright refuses.
                  ('        if(!waiting) { report(DL_SELECT_UNAVAILABLE); if(phase==8) { cancelling=1; phase=7; cursor=0; } }',
                   '        if(!waiting && dl_job_status((unsigned)i/8)==-2) { report(DL_SELECT_UNAVAILABLE); if(phase==8) { cancelling=1; phase=7; cursor=0; } }'),
                  ('        if(!waiting) { report(DL_SELECT_UNAVAILABLE); cancelling=1; }',
                   '        if(!waiting && dl_job_status(c)==-2) { report(DL_SELECT_UNAVAILABLE); cancelling=1; }'),
                  # status.c: the delay-buffer blocks each core's slots hold, FX1 and FX2 (core 0 bits 0-7, core 1 8-15).
                  ('static struct dl_buffers buffers={0};',
                   'static struct dl_buffers buffers={0};\n'
                   'uint32_t dl_buffers_in_use(void) {\n'
                   '    uint32_t m=0;\n'
                   '    for(unsigned i=0;i<16;++i) {\n'
                   '        if(buffers.live[i]!=DL_BUF_NONE) m|=1u<<(buffers.live[i]+((i&7)<4 ? 8u : 0u)+(i>=8 ? 4u : 0u));\n'
                   '    }\n'
                   '    return m;\n'
                   '}\n'
                   '/* dsp.c\'s source-stage claims: slot i\'s committed or pending charge, whichever is dearer. */\n'
                   'uint32_t dl_slot_cycles(unsigned i) {\n'
                   '    if(i>=16) return 0;\n'
                   '    unsigned a=allocator.active[i],r=allocator.phase ? allocator.requested[i] : DL_NONE;\n'
                   '    uint32_t x=a==DL_NONE ? 0 : dl_catalog[a].cycles,y=r==DL_NONE ? 0 : dl_catalog[r].cycles;\n'
                   '    return x>y ? x : y;\n'
                   '}'),
                  ('extern const struct code dl_codes[2][32];', 'extern struct code dl_codes[2][32];'),
                  ('dl_allocator_init(&allocator,dl_catalog,0,0,0,0);',
                   'dl_allocator_init(&allocator,dl_catalog,0,0,MODWERK_DSP_ALLOWANCE0,MODWERK_DSP_ALLOWANCE1);'),
                  # A module installed while tracks name its effect: observe afresh and park those slots until bound.
                  ('int dl_publication_idle(void) { return phase==0; }',
                   'int dl_publication_idle(void) { return phase==0; }\n'
                   'void dl_residency_nudge(void) { observed_valid=0; for(unsigned i=0;i<16;++i) last[i]=255; }\n'
                   '/* Modwerk diagnostics (dsp.c\'s report): phase | cursor << 8 | waiting << 16 | result << 24 */\n'
                   'uint32_t dl_manager_state(void) { return phase|cursor<<8|waiting<<16|(uint32_t)(result&0xff)<<24; }\n'
                   '#ifndef DL_NATIVE_TEST\n/* Modwerk\'s self-test (dsp.c): a slot on core c running id p runs bound code. */\n'
                   'int dl_bound(unsigned c,unsigned p) { return c<2 && p<32 && slot_bound(c,p); }\n#endif\n'
                   '/* ... and where p\'s code sits on core c: its table offset, -1 when it is not placed. */\n'
                   'int dl_placed(unsigned c,unsigned p) { return c<2 && p<32 && allocator.live[c][p].present ? (int)(DL_CODE_START+allocator.live[c][p].offset) : -1; }\n'
                   '/* ... in an arena of this many words (0 until its core answered a probe). */\n'
                   'unsigned dl_arena(unsigned c) { return c<2 ? allocator.capacity[c] : 0; }'),
                  # dsp.c's self-test places effects by the live array alone: what it holds there is what a parked
                  # slot waits for, not the Part's byte (else the slot is let go to NONE and never loads).
                  ('static unsigned intended(unsigned i) {\n',
                   'volatile uint8_t dl_intended_override[16]={255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255};\n'
                   'static unsigned intended(unsigned i) {\n    if(dl_intended_override[i]!=255) return dl_intended_override[i];\n'),
                  # A pick made while the manager runs its own transaction waits its turn instead of being refused.
                  ('static void advance(void) {\n    if(!phase) return;',
                   'static uint8_t queued_ids[16]={0};\nstatic uint32_t queued_token=0;\n'
                   'static void advance(void) {\n'
                   '    if(!phase && queued_token) { uint32_t t=queued_token; queued_token=0; begin(queued_ids,t,0); }\n'
                   '    if(!phase) return;'),
                  # What needs no DSP job (a Part change within the preloaded set) is ready at once, so the
                  # stock Part change runs in the same tick, as on stock.
                  ('    if(phase) return DL_SELECT_UNAVAILABLE;\n'
                   '    for(unsigned i=0;i<8;++i) if(s->target_source[i]>4) return DL_SELECT_UNAVAILABLE;\n'
                   '    begin(s->target,token,0); advance(); return result;',
                   '    for(unsigned i=0;i<8;++i) if(s->target_source[i]>4) return DL_SELECT_UNAVAILABLE;\n'
                   '    if(phase) { bytes(queued_ids,s->target,16); queued_token=token; return DL_SELECT_WAIT; }\n'
                   '    begin(s->target,token,0);\n'
                   '    for(unsigned n=0;n<4 && phase && phase!=5 && !waiting;++n) advance();\n'
                   '    return result;'),
                  # Preload the union of the bank's Parts: every transaction also holds the effects the four Parts
                  # name (allocator.c's keep), so a Part change only flips dispatch, and the observer reloads when
                  # that changes (a project or bank load, a Part edit). While it fits; else the bank gives way and
                  # code loads as a Part selects it (a Part change then waits for an upload: COMPRESSOR, 9 packets,
                  # on the unit, 11 October 2026). Modules were kept firmly here; ON_DEMAND_EDITS lets them go too.
                  # Memory is admitted over the union, cycles over the target, which is one Part.
                  ('static unsigned observed_valid=0;',
                   'static unsigned observed_valid=0;\nstatic uint32_t observed_held[2]={0,0},observed_played[2]={0,0}; /* parts() when last observed */'),
                  ('static unsigned needed(unsigned index,unsigned mode) {',
                   '/* What the current bank\'s four Parts name, per core: modules (keep), stock effects loaded on demand\n'
                   ' * (soft), and the modules ids names (named). A pattern queued from another bank adds the Part it will\n'
                   ' * play: queued bank and pattern 0x800065bf/c0, equal to the current ones when nothing waits; its Part,\n'
                   ' * bank + pattern * 0x8ed8 + 0x8e57 (Octabam PARTS.md). */\n'
                   '/* The bank\'s Parts its 16 patterns play (bank + pattern * 0x8ed8 + 0x8e57) and the current one, as a mask:\n'
                   ' * what is held when the whole bank does not fit (owner, 20 October 2026: every selected effect stays loaded\n'
                   ' * while it fits; short of room, the Parts the patterns play come first, so play never waits for an upload). */\n'
                   'static unsigned part_mask(uint32_t bank) {\n'
                   '    unsigned part=*(volatile uint8_t *)0x80000003u,m=part<4u ? 1u<<part : 0u;\n'
                   '    for(unsigned p=0;bank && p<16u;++p) { unsigned q=*(volatile uint8_t *)(uintptr_t)(bank+p*0x8ed8u+0x8e57u); if(q<4u) m|=1u<<q; }\n'
                   '    return m;\n'
                   '}\n'
                   'extern const uint32_t modwerk_dsp_modules;\n'
                   'static void parts(const uint8_t ids[16],uint32_t keep[2],uint32_t named[2],uint32_t soft[2],uint32_t played[2]) {\n'
                   '    uint32_t bank=*(volatile uint32_t *)0x46c82456u;\n'
                   '    keep[0]=keep[1]=named[0]=named[1]=soft[0]=soft[1]=played[0]=played[1]=0;\n'
                   '    unsigned qb=*(volatile uint8_t *)0x800065bfu,qp=*(volatile uint8_t *)0x800065c0u,qpart=4u;\n'
                   '    unsigned parts_used=part_mask(bank);\n'
                   '    uint32_t queued=0x400e21e0u+qb*0x9b340u;\n'
                   '    if(bank && qb<16u && qp<16u && queued!=bank) qpart=*(volatile uint8_t *)(uintptr_t)(queued+qp*0x8ed8u+0x8e57u);\n'
                   '    for(unsigned n=0;n<6;++n) for(unsigned i=0;i<16;++i) {\n'
                   '        unsigned p=n==4 ? ids[i] : n==5 ? (qpart<4u ? *(volatile uint8_t *)(uintptr_t)(queued+0x8ed80u+qpart*6322u+i) : 255u)\n'
                   '                 : bank ? *(volatile uint8_t *)(uintptr_t)(bank+0x8ed80u+n*6322u+i) : 255u;\n'
                   '        if(p>=32 || dl_catalog[p].resident || !(dl_catalog[p].slots&(i<8 ? 1u:2u))) continue;\n'
                   '        if(!(modwerk_dsp_modules>>p&1u)) { if(n!=4) { soft[(i&7)<4 ? 1:0]|=1u<<p; if(n==5 || (parts_used>>n&1u)) played[(i&7)<4 ? 1:0]|=1u<<p; } continue; }\n'
                   '        (n==4 ? named : keep)[(i&7)<4 ? 1:0]|=1u<<p;\n'
                   '    }\n'
                   '}\n'
                   '/* Core c lets go of its Parts\' union for this target when the target adds no module to it, or when\n'
                   ' * the union is not held now (a bank that never fitted: a Part change there loads either way). */\n'
                   'static unsigned loose(const uint32_t named[2],unsigned c) {\n'
                   '    if(!(named[c]&~allocator.keep[c])) return 1;\n'
                   '    for(unsigned p=0;p<32;++p) if((allocator.keep[c]>>p&1u) && !allocator.live[c][p].present) return 1;\n'
                   '    return 0;\n'
                   '}\n'
                   'static unsigned needed(unsigned index,unsigned mode) {'),
                  # A target naming a module no Part holds yet must fit beside all of them on its core, while they are
                  # held; anything else that does not (a bank that never fitted) falls back to loading what it runs, per
                  # core (beta run 2: bank A's union was over on both cores, so even Tape Echo's 5 words were refused,
                  # and a pick on T1 was refused for core 0's union).
                  ('        int r=dl_allocator_prepare(&allocator,desired,current);\n',
                   '        uint32_t named[2],soft[2],played[2];\n'
                   '        parts(desired,allocator.keep,named,soft,played);\n'
                   '        uint32_t firm[2]={allocator.keep[0],allocator.keep[1]};\n'
                   '        allocator.keep[0]|=soft[0]; allocator.keep[1]|=soft[1];\n'
                   '        int r=dl_allocator_prepare(&allocator,desired,current);\n'
                   '        if((r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (played[0]!=soft[0] || played[1]!=soft[1])) {\n'
                   '            allocator.keep[0]=firm[0]|played[0]; allocator.keep[1]=firm[1]|played[1];\n'
                   '            r=dl_allocator_prepare(&allocator,desired,current);\n'
                   '        }\n'
                   '        if((r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (soft[0]|soft[1])) {\n'
                   '            allocator.keep[0]=firm[0]; allocator.keep[1]=firm[1];\n'
                   '            r=dl_allocator_prepare(&allocator,desired,current);\n'
                   '        }\n'
                   '        if((r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (allocator.keep[0]|allocator.keep[1]) &&\n'
                   '           (automatic || loose(named,0) || loose(named,1))) {\n'
                   '            for(unsigned c=0;c<2;++c) if(automatic || loose(named,c)) allocator.keep[c]=0;\n'
                   '            r=dl_allocator_prepare(&allocator,desired,current);\n'
                   '        }\n'),
                  ('    for(unsigned i=0;i<16;++i) if(ids[i]!=observed[i]) changed=1;\n    if(!changed) return;',
                   '    for(unsigned i=0;i<16;++i) if(ids[i]!=observed[i]) changed=1;\n'
                   '    static unsigned observe_phase; /* the bank\'s Parts (about 140 uncached reads) every fourth tick, unless the live set changed */\n'
                   '    if(!changed && (++observe_phase&3u)) return;\n'
                   '    uint32_t held[2],named[2],soft[2],played[2];\n'
                   '    parts(ids,held,named,soft,played);\n'
                   '    held[0]|=soft[0]; held[1]|=soft[1];\n'
                   '    if(held[0]!=observed_held[0] || held[1]!=observed_held[1] || played[0]!=observed_played[0] || played[1]!=observed_played[1]) changed=1;\n'
                   '    observed_held[0]=held[0]; observed_held[1]=held[1]; observed_played[0]=played[0]; observed_played[1]=played[1];\n'
                   '    if(!changed) return;'),
                  ('    if(token!=current) return DL_SELECT_UNAVAILABLE;\n    advance(); return result;',
                   '    if(token!=current && token!=queued_token) return DL_SELECT_UNAVAILABLE;\n'
                   '    advance(); return token==current ? result : DL_SELECT_WAIT;'),
                  ('void dl_selection_cancel(uint32_t token) { if(token==current && phase && phase!=6) rollback(); }',
                   'void dl_selection_cancel(uint32_t token) {\n'
                   '    if(token==queued_token) queued_token=0;\n'
                   '    else if(token==current && phase && phase!=6) rollback();\n}')),
    # The switch frame runs the outgoing effect's first sub-block, then the incoming one's init and its
    # second: no instance runs twice, so no overlap charge (it would refuse stock picks beside modules).
    # Each core's sum starts at its machines' source-stage charge (dsp.c), so FX slots are admitted beside it.
    # Each slot is charged at least the dearest stock effect its bank's Parts name there (dsp.c's floors; owner, 24 October
    # 2026): a Part switch or a RELOAD then needs no room it was not given, and a stock pick dearer than that is admitted.
    'allocator.c': (('#include "allocator.h"\n', '#include "allocator.h"\nuint32_t modwerk_dsp_source_charge(unsigned);\n'
                     '/* dsp.c\'s; harnesses without it charge each slot its own effect */\n'
                     '__attribute__((weak)) unsigned modwerk_dsp_slot_floors(const uint8_t ids[16],uint32_t least[16])\n'
                     '{ (void)ids; for(unsigned i=0;i<16;++i) least[i]=0; return 0; }\n'),
                    ('    if(!token || token==a->token) return DL_ALLOC_STALE;\n',
                     '    if(!token || token==a->token) return DL_ALLOC_STALE;\n'
                     '    uint32_t least[16]; unsigned crowded=modwerk_dsp_slot_floors(ids,least); /* 1 + a core a raised floor overfills */\n'),
                    ('        if(pkg->cycles>a->allowance[c]-steady[c]) return DL_ALLOC_CYCLES;\n        steady[c]+=pkg->cycles;\n    }\n',
                     '        uint32_t cost=pkg->cycles>least[i] ? pkg->cycles : least[i];\n'
                     '        if(cost>a->allowance[c]-steady[c]) return DL_ALLOC_CYCLES;\n        steady[c]+=cost;\n    }\n'
                     '    if(crowded) return DL_ALLOC_CYCLES;\n'),
                    ('    uint32_t steady[2]={0,0},overlap[2]={0,0};',
                     '    uint32_t steady[2]={modwerk_dsp_source_charge(0),modwerk_dsp_source_charge(1)};\n'
                     '    if(steady[0]>a->allowance[0] || steady[1]>a->allowance[1]) return DL_ALLOC_CYCLES;'),
                    ('    overlap[0]=steady[0]; overlap[1]=steady[1];\n'
                     '    for(unsigned i=0;i<16;++i) {\n'
                     '        unsigned p=a->active[i],c=core_of(i);\n'
                     '        if(p==DL_NONE || p==ids[i]) continue;\n'
                     '        uint32_t cost=a->catalog[p].cycles;\n'
                     '        if(cost>a->allowance[c]-overlap[c]) return DL_ALLOC_CYCLES;\n'
                     '        overlap[c]+=cost;\n'
                     '    }\n', ''),
                    # Place what keep holds on a core after the target's own ids (manager.c's union of Parts).
                    ('    for(unsigned i=0;i<16;++i) {\n'
                     '        unsigned p=ids[i];\n'
                     '        if(core_of(i)!=c || p==DL_NONE || a->catalog[p].resident || a->target[c][p].present) continue;',
                     '    for(unsigned i=0;i<16+DL_PACKAGES;++i) {\n'
                     '        unsigned p=i<16 ? (core_of(i)==c ? ids[i] : DL_NONE) : (a->keep[c]>>(i-16)&1u ? i-16 : DL_NONE);\n'
                     '        if(p==DL_NONE || a->catalog[p].resident || a->target[c][p].present) continue;'),
                    # A big package (a quarter of the arena or more) goes as high as it fits, the rest as low: a hole
                    # left under a big one could never close once the core's free words are fewer than its own (dsp.c's
                    # compaction moves code by copying it whole).
                    ('        uint32_t base=0,align=pkg->alignment;\n        for(;;) {',
                     '        uint32_t base=0,align=pkg->alignment;\n'
                     '        if(pkg->words*4u>=a->capacity[c]) {\n'
                     '            if(pkg->words>a->capacity[c]) return DL_ALLOC_MEMORY;\n'
                     '            for(base=(a->capacity[c]-pkg->words)&~(align-1);;) {\n'
                     '                unsigned moved=0;\n'
                     '                for(unsigned j=0;j<n && !moved;++j)\n'
                     '                    if(base<(uint32_t)used[j].offset+used[j].words && base+pkg->words>used[j].offset) {\n'
                     '                        if(used[j].offset<pkg->words) return DL_ALLOC_MEMORY;\n'
                     '                        base=(used[j].offset-pkg->words)&~(align-1); moved=1;\n'
                     '                    }\n'
                     '                if(!moved) break;\n'
                     '            }\n'
                     '        } else for(;;) {'),
                    # Compaction without a gap (owner, 11 October 2026): one live package gets a new copy at `offset`,
                    # uploaded and bound while the old one runs, then the old is freed; never over live code.
                    ('int dl_allocator_cancel(struct dl_allocator *a,uint32_t token) {',
                     '/* Modwerk: one live package to `offset` on core c, everything else where it is: a new copy, uploaded\n'
                     ' * and bound while the old one runs, then freed (dsp.c). Never over live code, its own old copy included. */\n'
                     'int dl_allocator_move(struct dl_allocator *a,unsigned c,unsigned p,unsigned offset,uint32_t token) {\n'
                     '    if(a->phase || !token || token==a->token || c>1 || p>=DL_PACKAGES || !a->live[c][p].present) return DL_ALLOC_STALE;\n'
                     '    unsigned n=a->live[c][p].words,align=a->catalog[p].alignment;\n'
                     '    if(!align || (offset&(align-1)) || offset+n>a->capacity[c]) return DL_ALLOC_MEMORY;\n'
                     '    for(unsigned q=0;q<DL_PACKAGES;++q)\n'
                     '        if(a->live[c][q].present && offset<(unsigned)a->live[c][q].offset+a->live[c][q].words &&\n'
                     '           offset+n>a->live[c][q].offset) return DL_ALLOC_TRANSITION;\n'
                     '    copy(a->target,a->live,sizeof a->target);\n'
                     '    a->target[c][p].offset=(uint16_t)offset;\n'
                     '    copy(a->requested,a->active,16); a->token=token; a->ready=0; a->required=(uint8_t)(1u<<c); a->phase=1;\n'
                     '    return DL_ALLOC_OK;\n'
                     '}\n'
                     'int dl_allocator_cancel(struct dl_allocator *a,uint32_t token) {')),
    'allocator.h': (('int dl_allocator_cancel(struct dl_allocator *,uint32_t token);',
                     'int dl_allocator_cancel(struct dl_allocator *,uint32_t token);\n'
                     'int dl_allocator_move(struct dl_allocator *,unsigned core,unsigned p,unsigned offset,uint32_t token);'),
                    ('    uint8_t phase, required, ready;\n};',
                     '    uint8_t phase, required, ready;\n'
                     '    uint32_t keep[2]; /* Modwerk: more ids to place per core, beside the target\'s own */\n};'),),
    # No reads from a DSP (dsp_receiver.asm says why): the receiver answers in the host flags, an upload
    # carries its sum for the receiver to check, and each core's table is the build's (dsp_loader.py).
    # eDMA channel 0 keeps stock's ATTR, which reads its source in 16-byte bursts: an unaligned source
    # stops the channel at its start with a source address error (the probe-A freeze, 10 October 2026).
    # PEEK (8, dsp_receiver.asm): one bit of a DSP P word per packet, its answer HF3; dsp.c reads the
    # receiver's mismatch record with it. Its refusals are bits, so they count neither as rejects nor errors.
    'transfer.h': (('DL_BYPASS=6, DL_BASE=7 };', 'DL_BYPASS=6, DL_BASE=7, DL_PEEK=8, DL_SUM=9 };'),),
    'transfer.c': (('op!=DL_BYPASS && op!=DL_BASE)) return 0;', 'op!=DL_BYPASS && op!=DL_BASE && op!=DL_PEEK)) return 0;'),
                   # A refusal for cycles reads as the DSP being full, not failing (owner, 11 October 2026).
                   ('reason==3 ? "DSP OVERLOAD"', 'reason==3 ? "DSP FULL"'),
                   # diag.c's freeze watch: each frame, whether the UI tick still moves (15 October 2026).
                   ('unsigned dl_frame(void) {\n    ++dl_frames;\n',
                    'void modwerk_diag_frame(void);\nunsigned dl_frame(void) {\n    ++dl_frames;\n    modwerk_diag_frame();\n'),
                   ('opcode==DL_BYPASS || opcode==DL_BASE) {', 'opcode==DL_BYPASS || opcode==DL_BASE || opcode==DL_PEEK || opcode==DL_SUM) {'),
                   # SUM (9, dsp_receiver.asm; dsp.c's self-test): the expected sum's high byte in word 56, as a WRITE's.
                   ('            t[4]=j->id; t[5]=j->init; t[7]=j->proc;\n',
                    '            t[4]=j->id; t[5]=j->init; t[7]=j->proc;\n            if(opcode==DL_SUM) t[56]=(uint16_t)(j->expected>>16);\n'),
                   ('int dl_job_status(unsigned c) {',
                    '/* Modwerk: does the code at table offset `offset` sum, over `count` words (1-256), to `expected`? */\n'
                    'int dl_sum_start(unsigned c,unsigned offset,unsigned count,uint32_t expected) {\n'
                    '    if(c>1 || jobs[c].state || !count || count>256 || offset<DL_CODE_START || offset+count>dl_pool_words[c]) return 0;\n'
                    '    jobs[c].opcode=DL_SUM; jobs[c].id=(uint16_t)count; jobs[c].init=(uint16_t)offset;\n'
                    '    jobs[c].proc=(uint16_t)expected; jobs[c].expected=expected&0xffffffu;\n'
                    '    publish(); jobs[c].state=1; return 1;\n}\n'
                    'int dl_job_status(unsigned c) {'),
                   # The longest time between two frames, DTCN3 counts (132 MHz): the self-test's frame-timing check.
                   ('unsigned dl_frame(void) {\n    ++dl_frames;',
                    'volatile uint32_t dl_frame_gap=0;\nstatic uint32_t frame_at=0;\n'
                    'unsigned dl_frame(void) {\n'
                    '    { uint32_t now=*(volatile uint32_t *)0xfc07c00cu, d=now-frame_at; frame_at=now; if(d>dl_frame_gap) dl_frame_gap=d; }\n'
                    '    ++dl_frames;'),
                   ('volatile uint16_t dl_tx[2][DL_WORDS]={{0}}, dl_rx[2][32]={{0}};',
                    'volatile uint16_t dl_tx[2][DL_WORDS] __attribute__((aligned(16)))={{0}}, '
                    'dl_rx[2][32] __attribute__((aligned(16)))={{0}};'),
                   ('static uint32_t requests=0, stages=0;',
                    'static uint32_t requests=0, stages=0;\n'
                    'unsigned modwerk_dsp_flags(unsigned core); /* dsp.c: HF2 (handled, toggles) | HF3 (refused) << 1 */\n'
                    'static unsigned flags_sent[2]={0,0};'),
                   ('volatile uint32_t dl_pool_base[2]={0,0}, dl_pool_words[2]={0,0};',
                    'volatile uint32_t dl_pool_base[2]={MODWERK_DSP_TABLE0,MODWERK_DSP_TABLE1}, '
                    'dl_pool_words[2]={MODWERK_DSP_WORDS0,MODWERK_DSP_WORDS1};'),
                   ('                j->expected=(j->expected+value)&0xffffffu;\n            }\n',
                    '                j->expected=(j->expected+value)&0xffffffu;\n            }\n'
                    '            t[7]=(uint16_t)j->expected; t[56]=(uint16_t)(j->expected>>16);\n'),
                   # Development (dev.c request 19): a finished PEEK goes again at once, from the frame interrupt, so
                   # a fault that takes one packet in thousands shows in seconds (the DSP stalls of 11 October 2026).
                   ('                pending[c]=0;\n                UNCACHED(dl_tx[c])[0]=0;\n            } else if',
                    '                pending[c]=0;\n                UNCACHED(dl_tx[c])[0]=0;\n'
                    '                if(dl_storm && jobs[c].state==3 && jobs[c].opcode==DL_PEEK) { jobs[c].state=1; ++dl_storm_sent; }\n'
                    '            } else if'),
                   ('volatile uint32_t dl_request_probe=0,', 'volatile uint32_t dl_storm=0, dl_storm_sent=0;\nvolatile uint32_t dl_request_probe=0,'),
                   ('    pending[c]=sequence[c]; age[c]=0;',
                    '    pending[c]=sequence[c]; age[c]=0; flags_sent[c]=modwerk_dsp_flags(c);'),
                   ('        volatile uint16_t *r=UNCACHED(dl_rx[c]);\n', ''),
                   ('            if(r[0]==DL_ACK && r[1]==pending[c]) {\n'
                    '                unsigned valid=r[2]==0 && r[3]==c;\n'
                    '                if(jobs[c].state==2 && jobs[c].opcode==DL_WRITE)\n'
                    '                    valid=valid && (((uint32_t)r[5]<<16)|r[4])==jobs[c].expected;\n'
                    '                if(valid) {\n'
                    '                    ++dl_accepted[c];\n'
                    '                    if(r[6] && r[7]>DL_CODE_START && r[6]+r[7]<=DL_POOL_LIMIT) {\n'
                    '                        dl_pool_words[c]=r[7]; dl_pool_base[c]=r[6];\n'
                    '                    }\n'
                    '                } else',
                    '            unsigned flags=modwerk_dsp_flags(c);\n'
                    '            if((flags^flags_sent[c])&1u) {\n'
                    '                unsigned valid=!(flags&2u);\n'
                    '                if(jobs[c].state==2 && (jobs[c].opcode==DL_PEEK || jobs[c].opcode==DL_SUM)) {}\n'
                    '                else if(valid) ++dl_accepted[c];\n'
                    '                else'),
                   ('        dl_show_message(text,0x30);\n    }\n}\n',
                    '        dl_show_message(text,0x30);\n    }\n}\n'
                    '/* Modwerk: the watchdog (dsp.c) gives up what is in flight, as a timeout would. */\n'
                    'void dl_abort(void) {\n'
                    '    for(unsigned c=0;c<2;++c) if(pending[c] || jobs[c].state==2) {\n'
                    '        ++dl_errors; pending[c]=0; UNCACHED(dl_tx[c])[0]=0;\n'
                    '        if(jobs[c].state==2) jobs[c].state=4;\n'
                    '    }\n'
                    '}\n')),
    # Writes only: no read phases, no write to a core with no packet waiting, and at state 7 core 0's
    # packet only: core 1's goes right after stock's own push to core 1 (dsp_core1.s, hardware 10 Oct 2026).
    # Measured: EPORT pin 1 is core 0's host request, which its next frame's bank word raises. dl_pin7 counts
    # frames whose state 7 saw it high; dl_straddle counts packets during which it changed (the frame began
    # while the packet was written, so the receiver may read a torn one).
    'hooks.s': (('        .global dl_state7, dl_tick', '        .global dl_state7, dl_tick, dl_phase, dl_rx_nbytes, dl_early, dl_pin7, dl_straddle'),
                ('dl_rx_nbytes: .long 0\n', 'dl_rx_nbytes: .long 0\ndl_early: .long 0     | state-7 visits with channel 0 still running\n'
                 'dl_pin7: .long 0\ndl_straddle: .long 0\ndl_pin_sent: .long 0  | 4 | pin 1 when a packet started, 0 none\n'),
                ('        jsr dl_frame\n', '        move.b 0xfc094005,%d0\n        btst #1,%d0\n        beq 1f\n        addq.l #1,dl_pin7\n'
                 '1:\n        jsr dl_frame\n'),
                ('dl_complete:\n', 'dl_complete:\n        move.l dl_pin_sent,%d0\n        beq 1f\n        clr.l dl_pin_sent\n'
                 '        move.b 0xfc094005,%d1\n        andi.l #2,%d1\n        addq.l #4,%d1\n        cmp.l %d0,%d1\n        beq 1f\n'
                 '        addq.l #1,dl_straddle\n1:\n'),
                ('        cmpi.l #3,%d2\n        bcs dl_write\n        cmpi.l #5,%d2\n        bcs dl_read\n',
                 '        cmpi.l #2,%d2           | phase 1, core 0, only\n        bcs dl_write\n'),
                ('dl_write:\n        subq.l #1,%d2\n',
                 'dl_write:\n        subq.l #1,%d2\n'
                 '        move.l %d2,%d0\n'
                 '        lsl.l #7,%d0\n'
                 '        lea dl_tx,%a0\n'
                 '        adda.l #UNCACHED,%a0\n'
                 '        tst.w (%a0,%d0.l)\n'
                 '        bne dl_send\n'
                 '        move.l dl_phase,%d2\n'
                 '        bra dl_next\n'
                 'dl_send:\n'
                 '        move.b 0xfc094005,%d0\n'
                 '        andi.l #2,%d0\n'
                 '        addq.l #4,%d0\n'
                 '        move.l %d0,dl_pin_sent\n')),
}
# The state-7 entry (build_core.py --dsp-hook). Stock can visit state 7 while its last
# transfer still runs on eDMA channel 0: in state 5 it starts state 6's transfer inline,
# and the stale completion of state 5 then dispatches state 7 early. Stock's state 7 only
# unmasks, so that is harmless to stock, but a packet started then rewrites channel 0 and
# the host port under stock's transfer (the probe-A freeze, 10 October 2026, inferred).
# A start not yet taken up (START) or a minor loop running (ACTIVE) counts as running too.
# Both count those visits (dl_early). guard: such a visit only unmasks, as stock's does,
# and the packet goes at the next visit. usbin: Octabam's USB AUDIO IN entry (no channel-1
# acknowledge, no channel-1 NBYTES save), unguarded, for comparison on the unit.
STATE7_ENTRY = ('        moveq #1,%d0\n'
                '        move.b %d0,0xfc04401c   | acknowledge our channel-1 completion too\n'
                '        move.l dl_phase,%d2\n'
                '        bne dl_next\n')
GUARD_ENTRY = ((STATE7_ENTRY,
               '        moveq #1,%d0\n'
               '        move.b %d0,0xfc04401c   | acknowledge our channel-1 completion too\n'
               '        move.w 0xfc04501e,%d0   | TCD0 CSR: idle is DONE (bit 7), not ACTIVE (6), no START (0)\n'
               '        andi.l #0xc1,%d0\n'
               '        cmpi.l #0x80,%d0\n'
               '        beq dl_idle\n'
               '        addq.l #1,dl_early\n'
               '        move.l dl_phase,%d2\n'
               '        bne dl_return           | our own transfer still runs: its completion comes\n'
               '        movem.l (%sp),%d2-%d7/%a2-%a6\n'
               '        lea 44(%sp),%sp\n'
               '        moveq #1,%d1\n'
               '        move.b %d1,0xfc04801d   | what stock\'s early visit does\n'
               '        jmp DONE\n'
               'dl_idle:\n'
               '        move.l dl_phase,%d2\n'
               '        bne dl_next\n'),)
# Hardware bisect of the probe-A freeze (10 October 2026), each guard plus one change:
# pretend: the packet is built and its job runs, but nothing touches eDMA or the host port;
# noflags: real delivery, the host flags never read; long: 96 halfwords, USB AUDIO IN AB's length.
# The effect id width (docs/OCTATRACK_MORE_EFFECT_IDS.md, step 3): Octabam's transport sized and bounded by the base's
# MODWERK_FX_IDS (fxids.h) instead of 32, its id masks as id sets. Applied after DSP_EDITS, to the text they leave.
WIDTH_EDITS = {
    'allocator.h': (('#include <stdint.h>\n#define DL_PACKAGES 32\n',
                     '#include <stdint.h>\n#include "fxids.h"\n#define DL_PACKAGES MODWERK_FX_IDS /* Modwerk: the base\'s effect ids */\n'),
                    ('    uint32_t keep[2]; /* Modwerk: more ids to place per core, beside the target\'s own */',
                     '    fx_set keep[2]; /* Modwerk: more ids to place per core, beside the target\'s own */')),
    'allocator.c': (('(a->keep[c]>>(i-16)&1u ? i-16 : DL_NONE)', '(fx_in(a->keep[c],i-16) ? i-16 : DL_NONE)'),),
    'transfer.h': (('#include <stdint.h>\n#define DL_WORDS 64\n', '#include <stdint.h>\n#include "fxids.h"\n#define DL_WORDS 64\n'),),
    'transfer.c': (('    if(c>1 || jobs[c].state || id>=32 ||', '    if(c>1 || jobs[c].state || id>=MODWERK_FX_IDS ||'),),
    'selection.c': (('s->track>7 || s->row>=32 || !s->bank) return 0;', 's->track>7 || s->row>=MODWERK_LIST_ROWS || !s->bank) return 0;'),
                    ('        if(id>31) return 0;', '        if(id>=MODWERK_FX_IDS) return 0;')),
    'buffers.h': (('#include <stdint.h>\n', '#include <stdint.h>\n#include "fxids.h"\n'),
                  ('                       const uint8_t reads[32]);', '                       const uint8_t reads[MODWERK_FX_IDS]);')),
    'buffers.c': (('                       const uint8_t reads[32]) {', '                       const uint8_t reads[MODWERK_FX_IDS]) {'),
                  ('!(running[i]<32 && reads[running[i]])', '!(running[i]<MODWERK_FX_IDS && reads[running[i]])'),
                  ('        unsigned reader=ids[i]<32 && reads[ids[i]];\n        unsigned same=',
                   '        unsigned reader=ids[i]<MODWERK_FX_IDS && reads[ids[i]];\n        unsigned same='),
                  ('        unsigned reader=ids[i]<32 && reads[ids[i]];\n        if(!reader',
                   '        unsigned reader=ids[i]<MODWERK_FX_IDS && reads[ids[i]];\n        if(!reader')),
    'manager.c': (
        ('extern struct dl_package dl_catalog[32];', 'extern struct dl_package dl_catalog[DL_PACKAGES];'),
        ('extern struct code dl_codes[2][32];', 'extern struct code dl_codes[2][DL_PACKAGES];'),
        ('static uint32_t observed_held[2]={0,0},observed_played[2]={0,0};', 'static fx_set observed_held[2],observed_played[2];'),
        ('static uint32_t stubbed[2]={0,0};', 'static fx_set stubbed[2];'),
        ('extern const uint32_t dl_stub_at_boot;', 'extern const fx_set dl_stub_at_boot;'),
        ('        for(unsigned p=0;p<32;++p) if(allocator.live[c][p].present) words+=allocator.live[c][p].words;',
         '        for(unsigned p=0;p<DL_PACKAGES;++p) if(allocator.live[c][p].present) words+=allocator.live[c][p].words;'),
        ('extern const uint32_t modwerk_dsp_modules;\nstatic void parts(const uint8_t ids[16],uint32_t keep[2],uint32_t named[2],uint32_t soft[2],uint32_t played[2]) {',
         'static void parts(const uint8_t ids[16],fx_set keep[2],fx_set named[2],fx_set soft[2],fx_set played[2]) {'),
        ('    keep[0]=keep[1]=named[0]=named[1]=soft[0]=soft[1]=played[0]=played[1]=0;',
         '    for(unsigned c=0;c<2;++c) keep[c]=named[c]=soft[c]=played[c]=(fx_set){{0}};'),
        ('        if(p>=32 || dl_catalog[p].resident || !(dl_catalog[p].slots&(i<8 ? 1u:2u))) continue;\n'
         '        if(!(modwerk_dsp_modules>>p&1u)) { if(n!=4) { soft[(i&7)<4 ? 1:0]|=1u<<p; if(n==5 || (parts_used>>n&1u)) played[(i&7)<4 ? 1:0]|=1u<<p; } continue; }\n'
         '        (n==4 ? named : keep)[(i&7)<4 ? 1:0]|=1u<<p;',
         '        if(p>=DL_PACKAGES || dl_catalog[p].resident || !(dl_catalog[p].slots&(i<8 ? 1u:2u))) continue;\n'
         '        unsigned k=(i&7)<4 ? 1:0;\n'
         '        if(!fx_in(modwerk_fx_modules,p)) { if(n!=4) { soft[k]=fx_with(soft[k],p); if(n==5 || (parts_used>>n&1u)) played[k]=fx_with(played[k],p); } continue; }\n'
         '        if(n==4) named[k]=fx_with(named[k],p); else keep[k]=fx_with(keep[k],p);'),
        ('    unsigned c=index/32,p=index%32;\n    if(mode==6)', '    unsigned c=index/DL_PACKAGES,p=index%DL_PACKAGES;\n    if(mode==6)'),
        ('!allocator.live[c][p].present && !((stubbed[c]>>p)&1u);', '!allocator.live[c][p].present && !fx_in(stubbed[c],p);'),
        ('            if(desired[i]<32 && !dl_catalog[desired[i]].resident) probe=1;',
         '            if(desired[i]<DL_PACKAGES && !dl_catalog[desired[i]].resident) probe=1;'),
        ('        uint32_t named[2],soft[2],played[2];\n        parts(desired,allocator.keep,named,soft,played);\n'
         '        uint32_t firm[2]={allocator.keep[0],allocator.keep[1]};\n'
         '        allocator.keep[0]|=soft[0]; allocator.keep[1]|=soft[1];',
         '        fx_set named[2],soft[2],played[2];\n        parts(desired,allocator.keep,named,soft,played);\n'
         '        fx_set firm[2]={allocator.keep[0],allocator.keep[1]};\n'
         '        allocator.keep[0]=fx_or(allocator.keep[0],soft[0]); allocator.keep[1]=fx_or(allocator.keep[1],soft[1]);'),
        ('(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (played[0]!=soft[0] || played[1]!=soft[1])) {\n'
         '            allocator.keep[0]=firm[0]|played[0]; allocator.keep[1]=firm[1]|played[1];',
         '(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (!fx_same(played[0],soft[0]) || !fx_same(played[1],soft[1]))) {\n'
         '            allocator.keep[0]=fx_or(firm[0],played[0]); allocator.keep[1]=fx_or(firm[1],played[1]);'),
        ('(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (soft[0]|soft[1])) {',
         '(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (fx_any(soft[0]) || fx_any(soft[1]))) {'),
        ('(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (allocator.keep[0]|allocator.keep[1]) &&\n'
         '           (automatic || loose(named,0) || loose(named,1))) {\n'
         '            for(unsigned c=0;c<2;++c) if(automatic || loose(named,c)) allocator.keep[c]=0;',
         '(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (fx_any(allocator.keep[0]) || fx_any(allocator.keep[1])) &&\n'
         '           (automatic || loose(named,0) || loose(named,1))) {\n'
         '            for(unsigned c=0;c<2;++c) if(automatic || loose(named,c)) allocator.keep[c]=(fx_set){{0}};'),
        ('static unsigned loose(const uint32_t named[2],unsigned c) {\n'
         '    if(!(named[c]&~allocator.keep[c])) return 1;\n'
         '    for(unsigned p=0;p<32;++p) if((allocator.keep[c]>>p&1u) && !allocator.live[c][p].present) return 1;',
         'static unsigned loose(const fx_set named[2],unsigned c) {\n'
         '    if(!fx_any(fx_less(named[c],allocator.keep[c]))) return 1;\n'
         '    for(unsigned p=0;p<DL_PACKAGES;++p) if(fx_in(allocator.keep[c],p) && !allocator.live[c][p].present) return 1;'),
        ('            uint8_t reads[32], now[16];\n            for(unsigned p=0;p<32;++p) reads[p]=dl_catalog[p].buffer;',
         '            uint8_t reads[DL_PACKAGES], now[16];\n            for(unsigned p=0;p<DL_PACKAGES;++p) reads[p]=dl_catalog[p].buffer;'),
        ('        unsigned c=cursor/32;\n        int s=dl_job_status(c);', '        unsigned c=cursor/DL_PACKAGES;\n        int s=dl_job_status(c);'),
        ('            unsigned bit=1u<<(cursor%32);\n            if(phase==3) stubbed[c]&=~bit;\n'
         '            else if(phase==4 || phase==6 || phase==7) {\n'
         '                if(phase==4 || (dl_bypass_unbound && !sent_back)) stubbed[c]|=bit; else stubbed[c]&=~bit;',
         '            unsigned id=cursor%DL_PACKAGES;\n            if(phase==3) stubbed[c]=fx_without(stubbed[c],id);\n'
         '            else if(phase==4 || phase==6 || phase==7) {\n'
         '                stubbed[c]=phase==4 || (dl_bypass_unbound && !sent_back) ? fx_with(stubbed[c],id) : fx_without(stubbed[c],id);'),
        ('    while(cursor<64 && !needed(cursor,mode)) ++cursor;\n    if(cursor<64) {\n        unsigned c=cursor/32,p=cursor%32;',
         '    while(cursor<2u*DL_PACKAGES && !needed(cursor,mode)) ++cursor;\n    if(cursor<2u*DL_PACKAGES) {\n'
         '        unsigned c=cursor/DL_PACKAGES,p=cursor%DL_PACKAGES;'),
        ('        if(p>=32 || dl_catalog[p].resident || slot_bound(c,p)) continue;',
         '        if(p>=DL_PACKAGES || dl_catalog[p].resident || slot_bound(c,p)) continue;'),
        ('        if(p!=last[i] && p<32 && !dl_catalog[p].resident && !slot_bound(c,p) &&\n'
         '           (((stubbed[c]|dl_stub_at_boot)>>p)&1u)) {',
         '        if(p!=last[i] && p<DL_PACKAGES && !dl_catalog[p].resident && !slot_bound(c,p) &&\n'
         '           (fx_in(stubbed[c],p) || fx_in(dl_stub_at_boot,p))) {'),
        ('    uint32_t held[2],named[2],soft[2],played[2];\n    parts(ids,held,named,soft,played);\n'
         '    held[0]|=soft[0]; held[1]|=soft[1];\n'
         '    if(held[0]!=observed_held[0] || held[1]!=observed_held[1] || played[0]!=observed_played[0] || played[1]!=observed_played[1]) changed=1;',
         '    fx_set held[2],named[2],soft[2],played[2];\n    parts(ids,held,named,soft,played);\n'
         '    held[0]=fx_or(held[0],soft[0]); held[1]=fx_or(held[1],soft[1]);\n'
         '    if(!fx_same(held[0],observed_held[0]) || !fx_same(held[1],observed_held[1]) || !fx_same(played[0],observed_played[0]) || !fx_same(played[1],observed_played[1])) changed=1;'),
        ('        if(p>=32 || !dl_catalog[p].qualified', '        if(p>=DL_PACKAGES || !dl_catalog[p].qualified'),
        ('int dl_bound(unsigned c,unsigned p) { return c<2 && p<32 && slot_bound(c,p); }',
         'int dl_bound(unsigned c,unsigned p) { return c<2 && p<DL_PACKAGES && slot_bound(c,p); }'),
        ('int dl_placed(unsigned c,unsigned p) { return c<2 && p<32 && allocator.live',
         'int dl_placed(unsigned c,unsigned p) { return c<2 && p<DL_PACKAGES && allocator.live'),
    ),
}
# A change that fits the arena from scratch but not beside the code live now (DL_ALLOC_TRANSITION) is not refused
# (owner, 20 October 2026; beta findings 54 and 35): the manager first retires, in a transaction of its own, the code no
# slot runs and the request's keep set does not hold (a trim: nothing a track runs changes, so nothing is heard), and when
# the running code itself blocks, the old code of the slots the request changes (an unload: those slots run the dry stub
# until the request binds the new code and the setter applies it, a short gap where before the change was refused).
# The request runs queued after it; each request gets at most one trim and one unload. When that still leaves no one run
# for the new code, the cores are packed (dsp.c's compaction, block by block while everything plays) with the request
# held until that ends, then it runs once more (beta finding 35: EQUALIZER to FILTER at 98 %). Applied with
# WIDTH_EDITS, so the host tests that rebuild the manager (sdk/tests) carry it.
TRANSITION_EDITS = {
    'manager.c': (
        ('static void begin(const uint8_t *ids,uint32_t token,unsigned is_auto) {\n'
         '    bytes(desired,ids,16); current=token; automatic=is_auto;\n',
         'static unsigned trimming,queued_auto,trim_stage; /* Modwerk: a retirement before a queued request, that request\'s\n'
         '                                                   * kind, and what it got (1 a trim, 2 an unload, 3 a pack) */\n'
         'static uint32_t trimmed_for;\n'
         'static fx_set trim_keep[2];\n'
         'volatile uint32_t dl_trims,dl_unloads; /* diagnostics */\n'
         'static void begin(const uint8_t *ids,uint32_t token,unsigned is_auto) {\n'
         '    bytes(desired,ids,16); current=token; automatic=is_auto; trimming=0;\n'),
        ('static uint32_t queued_token=0;\nstatic void advance(void) {\n',
         'static uint32_t queued_token=0;\n'
         '/* Code live on a core that no slot of `now` runs and the keep set of the last try does not hold: a retirement frees it. */\n'
         'static unsigned droppable(const uint8_t now[16]) {\n'
         '    for(unsigned c=0;c<2;++c) for(unsigned p=0;p<DL_PACKAGES;++p) {\n'
         '        if(!allocator.live[c][p].present || fx_in(allocator.keep[c],p)) continue;\n'
         '        unsigned runs=0;\n'
         '        for(unsigned i=0;i<16;++i) if(((i&7)<4 ? 1u:0u)==c && now[i]==p) runs=1;\n'
         '        if(!runs) return 1;\n'
         '    }\n'
         '    return 0;\n'
         '}\n'
         '/* The request in flight waits; a transaction of the running set and that keep retires the rest first. An unload\n'
         ' * also takes the slots the request changes to NONE: their old code goes while the dry stub runs there, until the\n'
         ' * request binds the new code and the setter applies it. 0 when it would free nothing. */\n'
         'static int make_room(unsigned unload) {\n'
         '    uint8_t now[16];\n'
         '    running(now);\n'
         '    /* An unload: a changed slot\'s old effect goes, unless the request runs it elsewhere on the core (that stays). */\n'
         '    if(unload) for(unsigned i=0;i<16;++i) if(desired[i]!=now[i]) {\n'
         '        unsigned p=now[i],c=(i&7)<4 ? 1u:0u,kept_on=0;\n'
         '        for(unsigned j=0;j<16;++j) if(((j&7)<4 ? 1u:0u)==c && desired[j]==p) kept_on=1;\n'
         '        if(!kept_on) now[i]=0;\n'
         '    }\n'
         '    if(!droppable(now)) return 0;\n'
         '    bytes(queued_ids,desired,16); queued_token=current; queued_auto=automatic;\n'
         '    trim_keep[0]=allocator.keep[0]; trim_keep[1]=allocator.keep[1];\n'
         '    trimmed_for=current; trim_stage=unload ? 2u : 1u;\n'
         '    if(++auto_serial==0) auto_serial=0x80000000u;\n'
         '    begin(now,auto_serial,1); trimming=1;\n'
         '    if(unload) dl_unloads=dl_unloads+1; else dl_trims=dl_trims+1;\n'
         '    return 1;\n'
         '}\n'
         '/* dsp.c packs the cores for the request in flight, which waits meanwhile; 0 when it cannot (weak 0 for harnesses). */\n'
         '__attribute__((weak)) int modwerk_dsp_pack(void) { return 0; }\n'
         '__attribute__((weak)) int modwerk_dsp_packing(void) { return 0; }\n'
         'volatile uint32_t dl_packs; /* diagnostics */\n'
         'void dl_residency_nudge(void);\n'
         'static int pack_room(void) {\n'
         '    if(!modwerk_dsp_pack()) return 0;\n'
         '    bytes(queued_ids,desired,16); queued_token=current; queued_auto=automatic;\n'
         '    trimmed_for=current; trim_stage=3u; phase=0; dl_packs=dl_packs+1;\n'
         '    return 1;\n'
         '}\n'
         'static void advance(void) {\n'
         '    if(!phase && queued_token && modwerk_dsp_packing()) return; /* the moves first (dl_move runs only when idle) */\n'),
        ('begin(queued_ids,t,0); }\n', 'begin(queued_ids,t,queued_auto); queued_auto=0; }\n'),
        ('        allocator.keep[0]=fx_or(allocator.keep[0],soft[0]); allocator.keep[1]=fx_or(allocator.keep[1],soft[1]);\n',
         '        allocator.keep[0]=fx_or(allocator.keep[0],soft[0]); allocator.keep[1]=fx_or(allocator.keep[1],soft[1]);\n'
         '        if(trimming) { allocator.keep[0]=trim_keep[0]; allocator.keep[1]=trim_keep[1]; soft[0]=soft[1]=played[0]=played[1]=(fx_set){{0}}; }\n'),
        ('(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (fx_any(allocator.keep[0]) || fx_any(allocator.keep[1])) &&\n'
         '           (automatic || loose(named,0) || loose(named,1))) {',
         '(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && !trimming && (fx_any(allocator.keep[0]) || fx_any(allocator.keep[1])) &&\n'
         '           (automatic || loose(named,0) || loose(named,1))) {'),
        ('        if(r<0) {\n            report(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION ? DL_SELECT_MEMORY :',
         '        if(r==DL_ALLOC_TRANSITION && !trimming) {\n'
         '            unsigned stage=current==trimmed_for ? trim_stage : 0u; /* what this request already got */\n'
         '            if((stage<1u && make_room(0)) || (stage<2u && make_room(1)) || (stage<3u && pack_room())) return;\n'
         '        }\n'
         '        /* A pick refused after its slot\'s old code was unloaded: the slot ran the dry stub under the old effect\'s\n'
         '         * name until the next change (owner\'s MKII, 24 October 2026); the observer loads it back now. Not for an\n'
         '         * automatic request: the observer would ask for that same set again. */\n'
         '        if(r<0 && !automatic && current==trimmed_for && trim_stage>=2u) dl_residency_nudge();\n'
         '        if(r<0) {\n            report(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION ? DL_SELECT_MEMORY :'),
        # A request a retirement put behind it is not the transaction in flight: its answer is WAIT, never the
        # retirement's own result word (which reads READY once that commits).
        ('    for(unsigned n=0;n<4 && phase && phase!=5 && !waiting;++n) advance();\n    return result;',
         '    for(unsigned n=0;n<4 && phase && phase!=5 && !waiting;++n) advance();\n    return token==current ? result : DL_SELECT_WAIT;'),
        ('    begin(ids,token,0);advance();return result;\n', '    begin(ids,token,0);advance();return token==current ? result : DL_SELECT_WAIT;\n'),
        # A request unloaded for and then dropped (another pick replaced it): its slots run the stub on their old ids,
        # and the observer loads those back. The observer waits while a request is queued, so it never reloads what a
        # retirement just freed for that request.
        ('void dl_selection_cancel(uint32_t token) {\n    if(token==queued_token) queued_token=0;\n',
         'void dl_residency_nudge(void);\n'
         'void dl_selection_cancel(uint32_t token) {\n'
         '    if(token==queued_token) { queued_token=0; if(trim_stage>=2u && trimmed_for==token) dl_residency_nudge(); }\n'),
        # A pick made while a retirement runs takes the waiting request's place as a manual one: it kept an automatic
        # request's kind, and an automatic one commits before the stock setter publishes the pick.
        ('    if(phase) { bytes(queued_ids,s->target,16); queued_token=token; return DL_SELECT_WAIT; }\n',
         '    if(phase) { bytes(queued_ids,s->target,16); queued_token=token; queued_auto=0; return DL_SELECT_WAIT; }\n'),
        ('    reinit();\n    if(phase) return;\n', '    reinit();\n    if(phase || queued_token) return;\n'),
    ),
}
for _name, _edits in TRANSITION_EDITS.items():
    WIDTH_EDITS[_name] = WIDTH_EDITS.get(_name, ()) + _edits

# Everything on the DSP loads on demand (owner, 20 October 2026: "meant for all things on the DSP"; a Part switch may
# wait for an upload): module effects give way as stock ones do, so a module never needs the bank's other Parts' code
# beside it. Short of room a core's share of the bank goes, first all but the Parts the patterns play (and the current
# and queued one), then those too, down to what the request runs; one core at a time before both. This replaces the
# firm modules and loose() (a request adding a module had to fit beside every module the Parts name). Applied with
# WIDTH_EDITS, after TRANSITION_EDITS.
ON_DEMAND_EDITS = {
    'manager.c': (
        ('/* What the current bank\'s four Parts name, per core: modules (keep), stock effects loaded on demand\n'
         ' * (soft), and the modules ids names (named).',
         '/* What the current bank\'s four Parts name, per core: modules (keep), stock effects (soft), the modules ids\n'
         ' * names (named), and of keep and soft what the Parts the patterns play name (played); all of it on demand.'),
        ('        if(n==4) named[k]=fx_with(named[k],p); else keep[k]=fx_with(keep[k],p);',
         '        if(n==4) { named[k]=fx_with(named[k],p); continue; }\n'
         '        keep[k]=fx_with(keep[k],p);\n'
         '        if(n==5 || (parts_used>>n&1u)) played[k]=fx_with(played[k],p);'),
        ('/* Core c lets go of its Parts\' union for this target when the target adds no module to it, or when\n'
         ' * the union is not held now (a bank that never fitted: a Part change there loads either way). */\n'
         'static unsigned loose(const fx_set named[2],unsigned c) {\n'
         '    if(!fx_any(fx_less(named[c],allocator.keep[c]))) return 1;\n'
         '    for(unsigned p=0;p<DL_PACKAGES;++p) if(fx_in(allocator.keep[c],p) && !allocator.live[c][p].present) return 1;\n'
         '    return 0;\n'
         '}\n', ''),
        ('        fx_set firm[2]={allocator.keep[0],allocator.keep[1]};\n', ''),
        ('        if((r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (!fx_same(played[0],soft[0]) || !fx_same(played[1],soft[1]))) {\n'
         '            allocator.keep[0]=fx_or(firm[0],played[0]); allocator.keep[1]=fx_or(firm[1],played[1]);\n'
         '            r=dl_allocator_prepare(&allocator,desired,current);\n'
         '        }\n'
         '        if((r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && (fx_any(soft[0]) || fx_any(soft[1]))) {\n'
         '            allocator.keep[0]=firm[0]; allocator.keep[1]=firm[1];\n'
         '            r=dl_allocator_prepare(&allocator,desired,current);\n'
         '        }\n'
         '        if((r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION) && !trimming && (fx_any(allocator.keep[0]) || fx_any(allocator.keep[1])) &&\n'
         '           (automatic || loose(named,0) || loose(named,1))) {\n'
         '            for(unsigned c=0;c<2;++c) if(automatic || loose(named,c)) allocator.keep[c]=(fx_set){{0}};\n'
         '            r=dl_allocator_prepare(&allocator,desired,current);\n'
         '        }\n',
         '        /* Short of room the bank gives way (ON_DEMAND_EDITS): core 0, core 1, then both, to the played Parts, then to none. */\n'
         '        if(!trimming) {\n'
         '            fx_set base[2]={allocator.keep[0],allocator.keep[1]};\n'
         '            for(unsigned t=0;t<2 && (r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION);++t)\n'
         '                for(unsigned m=1;m<4 && (r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION);++m) {\n'
         '                    for(unsigned k=0;k<2;++k) allocator.keep[k]=m>>k&1u ? (t ? (fx_set){{0}} : played[k]) : base[k];\n'
         '                    unsigned same=fx_same(allocator.keep[0],base[0]) && fx_same(allocator.keep[1],base[1]);\n'
         '                    if(m==3) { base[0]=allocator.keep[0]; base[1]=allocator.keep[1]; }\n'
         '                    if(!same) r=dl_allocator_prepare(&allocator,desired,current);\n'
         '                }\n'
         '        }\n'),
    ),
}
for _name, _edits in ON_DEMAND_EDITS.items():
    WIDTH_EDITS[_name] = WIDTH_EDITS.get(_name, ()) + _edits

# DSP FULL and DSP MEMORY FULL say why (owner, 20 October 2026: testers took the bare popup for a bug): the manager
# notes what a refused set asked for, and dl_ui shows status.c's refusal box instead when it can. Applied after every
# other seam but zero_state's, to the text they leave.
REFUSAL_EDITS = {
    'manager.c': (
        ('static void report(int error) {',
         '/* What the last refused set asked for (status.c\'s refusal box): [0] why (1 DSP time, 2 code memory, 3 a Y\n'
         ' * buffer), [1] the first slot it changes (16: none), [2] the effect it asks for there, [3] the one it replaces,\n'
         ' * [4] the cycles it adds there (signed), [5] its code words when not loaded on that core, [6] the buffer-reading\n'
         ' * effects running on that core and slot kind (at most [7]), [7] that kind\'s usable blocks on the core. */\n'
         'volatile uint32_t dl_refusal[8];\n'
         'static void running(uint8_t out[16]);\n'
         'static void refusal_note(unsigned why) {\n'
         '    /* The slot the set changes from what the tracks run: a pick\'s own slot (the committed set can lag them). */\n'
         '    uint8_t now[16];\n'
         '    unsigned slot=16;\n'
         '    running(now);\n'
         '    for(unsigned i=0;i<16;++i) if(desired[i]!=now[i]) { slot=i; break; }\n'
         '    /* Short of code memory, blame a changed slot that asks for words on a core whose target does not fit, else one\n'
         '     * that asks for words, else the first changed (on the owner\'s MKII the box named T1\'s TapeHead for T5-8\'s reverbs). */\n'
         '    if(why==2u) {\n'
         '        unsigned need[2]={0,0},pick=16;\n'
         '        for(unsigned i=0;i<16;++i) {\n'
         '            unsigned p=desired[i],c=(i&7u)<4u ? 1u : 0u,again=0;\n'
         '            if(p>=DL_PACKAGES || dl_catalog[p].resident) continue;\n'
         '            for(unsigned j=0;j<i;++j) if(desired[j]==p && ((j&7u)<4u ? 1u : 0u)==c) again=1;\n'
         '            if(!again) need[c]+=dl_catalog[p].words;\n'
         '        }\n'
         '        for(unsigned pass=0;pass<2u && pick>15u;++pass)\n'
         '            for(unsigned i=0;i<16 && pick>15u;++i) {\n'
         '                unsigned p=desired[i],c=(i&7u)<4u ? 1u : 0u;\n'
         '                if(desired[i]!=now[i] && p<DL_PACKAGES && !dl_catalog[p].resident && !allocator.live[c][p].present &&\n'
         '                   (pass || need[c]>allocator.capacity[c])) pick=i;\n'
         '            }\n'
         '        if(pick<16u) slot=pick;\n'
         '    }\n'
         '    dl_refusal[0]=why; dl_refusal[1]=slot;\n'
         '    if(slot>15) return;\n'
         '    unsigned id=desired[slot],old=now[slot],c=(slot&7u)<4u ? 1u : 0u,k=slot>=8u,readers=0,usable=0;\n'
         '    int32_t add=(int32_t)(id<DL_PACKAGES ? dl_catalog[id].cycles : 0u)-(int32_t)(old<DL_PACKAGES ? dl_catalog[old].cycles : 0u);\n'
         '    dl_refusal[2]=id; dl_refusal[3]=old; dl_refusal[4]=(uint32_t)add;\n'
         '    dl_refusal[5]=id<DL_PACKAGES && !allocator.live[c][id].present ? dl_catalog[id].words : 0u;\n'
         '    for(unsigned i=k*8u;i<k*8u+8u;++i)\n'
         '        if(((i&7u)<4u ? 1u : 0u)==c && observed[i]<DL_PACKAGES && dl_catalog[observed[i]].buffer) ++readers;\n'
         '    for(unsigned b=0;b<4u;++b) usable+=buffers.valid[c][k]>>b&1u;\n'
         '    dl_refusal[6]=readers<usable ? readers : usable; dl_refusal[7]=usable;\n'
         '}\n'
         'static void report(int error) {'),
        ('        if(r<0) {\n            report(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION ? DL_SELECT_MEMORY :',
         '        if(r<0) {\n            refusal_note(r==DL_ALLOC_CYCLES ? 1u : r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION ? 2u : 0u);\n'
         '            report(r==DL_ALLOC_MEMORY || r==DL_ALLOC_TRANSITION ? DL_SELECT_MEMORY :'),
        ('                dl_allocator_cancel(&allocator,current);\n                report(DL_SELECT_MEMORY); phase=0; return;',
         '                dl_allocator_cancel(&allocator,current);\n                refusal_note(3u); report(DL_SELECT_MEMORY); phase=0; return;')),
    'transfer.c': (
        ('extern void dl_residency_tick(void);\nvoid dl_ui(void) {',
         'extern void dl_residency_tick(void);\nint modwerk_status_refused(unsigned reason); /* status.c: its box, or 0 */\nvoid dl_ui(void) {'),
        ('        dl_show_message(text,0x30);', '        if(reason<2u || !modwerk_status_refused(reason)) dl_show_message(text,0x30);')),
}

DSP_HOOK_EDITS = {
    'guard': {'hooks.s': GUARD_ENTRY},
    'pretend': {'hooks.s': GUARD_ENTRY + (('        moveq #1,%d2\n        move.l %d2,dl_phase\n        bra dl_write\n',
                                           '        bra dl_complete           | pretend: no transfer\n'),)},
    'noflags': {'hooks.s': GUARD_ENTRY,
                'transfer.c': (('flags_sent[c]=modwerk_dsp_flags(c);', 'flags_sent[c]=0;'),
                               ('            unsigned flags=modwerk_dsp_flags(c);\n', '            unsigned flags=0;\n'))},
    'long': {'hooks.s': GUARD_ENTRY + (('        move.w #63,%d0\n        move.w %d0,0x2000001c\n',
                                        '        move.w #95,%d0\n        move.w %d0,0x2000001c\n'),
                                       ('        move.w #0x8002,%d0\n        move.w %d0,0xfc045014\n'
                                        '        move.w #0x8002,%d0\n        move.w %d0,0xfc04501c\n',
                                        '        move.w #0x8003,%d0\n        move.w %d0,0xfc045014\n'
                                        '        move.w #0x8003,%d0\n        move.w %d0,0xfc04501c\n'))},
    'usbin': {'hooks.s': ((STATE7_ENTRY,
               '        move.w 0xfc04501e,%d0\n'
               '        andi.l #0xc1,%d0\n'
               '        cmpi.l #0x80,%d0\n'
               '        beq 1f\n'
               '        addq.l #1,dl_early\n'
               '1:\n'
               '        move.l dl_phase,%d2\n'
               '        bne dl_next\n'),
              ('        move.l 0xfc045028,%d0\n        move.l %d0,dl_rx_nbytes\n', ''),
              ('        move.l dl_rx_nbytes,%d0\n        move.l %d0,0xfc045028\n', ''))},
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


# Every USB Audio layout, and USB MIDI alone, links the base's USB sources last and pads them to these sizes, so a
# layout changes nothing outside this block: the base-bound packages (base-binding.json) hold for every layout's base.
USB_GROUP = ('usb_base.s', 'usbmidi.s', 'usbmidi_rx.s', 'usbaudio.s')
USB_RESERVE = {'.text': 8192, '.data': 2560, '.bss': 98304}
USB_ALIGN = {'.text': 512, '.data': 32, '.bss': 32}


def usb_reserve(source, sources, defsym, device, sdk):
    """Moves the USB sources to the end of `sources` between usb_align.s and usb_reserve.s, whose padding brings each
    of their sections to USB_RESERVE. The sizes come from assembling them as Elekloader's build does; the build's
    own symbols prove the result (usb_reserve_check)."""
    from elekloader.sdk.elf import Elf
    group = [name for name in USB_GROUP if name in sources]
    head = ''.join('        %s\n        .balign %d\n        .globl modwerk_usb%s_start\nmodwerk_usb%s_start:\n'
                   % (k, USB_ALIGN[k], k.replace('.', '_'), k.replace('.', '_'))
                   for k in USB_RESERVE)
    (source / 'usb_align.s').write_text(head)
    tool = os.environ.get('ELEKLOADER_CROSS', device.toolchain['prefix']) + 'as'
    defs = [a for k, v in defsym.items() for a in ('--defsym', '%s=%s' % (k, v))]
    work = source / 'usb-reserve.work'
    work.mkdir(exist_ok=True)

    def sections(name):
        out = work / (name + '.o')
        subprocess.run([tool, *device.toolchain['asflags'], '-I', str(source), '-I', sdk.INCLUDE, *defs,
                        '-o', str(out), str(source / name)], check=True, capture_output=True)
        return {s.name: (s.size, max(1, s.align)) for s in Elf.load(str(out)).sections if s.flags & 2}

    def tail(skips):
        return ''.join('        %s\n        .skip %d\n        .globl modwerk_usb%s_end\nmodwerk_usb%s_end:\n'
                       % (k, skips.get(k, 0), k.replace('.', '_'), k.replace('.', '_'))
                       for k in USB_RESERVE)
    (source / 'usb_reserve.s').write_text(tail({}))
    at = dict.fromkeys(USB_RESERVE, 0)
    for name in group + ['usb_reserve.s']:
        for kind, (size, align) in sections(name).items():
            if kind not in USB_RESERVE:
                raise ValueError('%s has a %s section the USB reserve does not cover.' % (name, kind))
            if align > USB_ALIGN[kind]:
                raise ValueError('%s aligns %s to %d, past the USB reserve\'s %d.' % (name, kind, align, USB_ALIGN[kind]))
            at[kind] = -(-at[kind] // align) * align + (size if name != 'usb_reserve.s' else 0)
    if any(at[k] > USB_RESERVE[k] for k in USB_RESERVE):
        raise ValueError('The USB sources outgrow their reserve: %s of %s.' % (at, USB_RESERVE))
    (source / 'usb_reserve.s').write_text(tail({k: USB_RESERVE[k] - at[k] for k in USB_RESERVE}))
    shutil.rmtree(work)
    return [name for name in sources if name not in USB_GROUP] + ['usb_align.s', *group, 'usb_reserve.s']


def usb_reserve_check(symbols):
    """Each USB reserve spans exactly its size in the linked base."""
    for kind, size in USB_RESERVE.items():
        start, end = (symbols.get('modwerk_usb%s_%s' % (kind.replace('.', '_'), edge)) for edge in ('start', 'end'))
        if not start or not end or start[0] != end[0] or end[1] - start[1] != size:
            raise ValueError('The USB %s reserve is not %d bytes in the linked base.' % (kind, size))


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True, stderr=subprocess.PIPE).strip()


def private_output(path):
    path = path.resolve()
    if path.exists():
        raise ValueError('Choose a new private output directory.')
    try:
        git(path.parent, 'rev-parse', '--show-toplevel')
    except subprocess.CalledProcessError:
        pass
    else:
        raise ValueError('All generated source, stock and packages must stay outside Git.')
    path.mkdir()
    return path


def ctext(value):
    if not isinstance(value, str) or any(ord(c) < 32 or ord(c) > 126 for c in value):
        raise ValueError('Logger identity must contain bounded printable ASCII.')
    return json.dumps(value, ensure_ascii=True)


def stock_reference(parts, offset, length, address, stock_at=None):
    """Replace a zero source placeholder with an Elekloader stock-copy recipe.

    This changes data parts only, never layout, relocations or instructions.
    The linker recovers the guarded bytes from the owner's verified stock.
    With stock_at(address, n), a placeholder the builder already stored as a stock run of zeros (code before it
    repeated stock) is split out of that run.
    """
    if not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length <= 0:
        raise ValueError('Stock replay requires a positive bounded source span.')
    before, after, at, found = [], [], 0, 0
    end = offset + length
    for part in parts:
        size = len(part[1]) // 2 if part[0] == 'hex' else part[2]
        lo, hi = max(at, offset), min(at + size, end)
        if lo >= hi:
            (before if at < offset else after).append(part)
        else:
            if part[0] == 'stock' and stock_at and not any(stock_at(int(part[1], 16) + lo - at, hi - lo)):
                if lo > at:
                    before.append(['stock', part[1], lo - at])
                if hi < at + size:
                    after.append(['stock', '0x%08x' % (int(part[1], 16) + hi - at), at + size - hi])
                found += hi-lo
                at += size
                continue
            if part[0] != 'hex' or any(bytes.fromhex(part[1])[lo-at:hi-at]):
                raise ValueError('Stock replay is not a zero source placeholder.')
            if lo > at:
                before.append(['hex', part[1][:(lo-at)*2]])
            if hi < at + size:
                after.append(['hex', part[1][(hi-at)*2:]])
            found += hi-lo
        at += size
    if offset < 0 or found != length:
        raise ValueError('Stock replay is outside the source section.')
    return before + [['stock', hex(address), length]] + after


def replace_literal(parts, offset, old, new, stock_at=None):
    """Replace authored literal bytes at a section offset: layout and relocations stay. A span the builder stored as a
    stock reference (the reservation's bytes coincide with stock, as its zeros and capacity byte do) becomes literal only
    inside the replaced span, and only when stock_at(address, n) shows the reference reproduces exactly `old` there;
    the rest of that reference stays a stock reference."""
    if len(old) != len(new) or not isinstance(offset, int) or offset < 0:
        raise ValueError('A literal replacement keeps its exact length.')
    out, at, seen, end = [], 0, bytearray(), offset + len(old)
    for part in parts:
        size = len(part[1]) // 2 if part[0] == 'hex' else part[2]
        lo, hi = max(at, offset), min(at + size, end)
        if lo >= hi:
            out.append(part)
        elif part[0] == 'stock':
            address = int(part[1], 16)
            if stock_at is None or stock_at(address + lo - at, hi - lo) != old[lo - offset:hi - offset]:
                raise ValueError('A stock reference inside the reserved storage is not the empty reservation.')
            if lo > at:
                out.append(['stock', part[1], lo - at])
            seen += old[lo - offset:hi - offset]
            out.append(['hex', new[lo - offset:hi - offset].hex()])
            if hi < at + size:
                out.append(['stock', '0x%08x' % (address + hi - at), at + size - hi])
        else:
            if part[0] != 'hex':
                raise ValueError('Reserved storage holds a fill part.')
            data = bytearray(bytes.fromhex(part[1]))
            seen += data[lo - at:hi - at]
            data[lo - at:hi - at] = new[lo - offset:hi - offset]
            out.append(['hex', data.hex()])
        at += size
    if bytes(seen) != old:
        raise ValueError('The reserved storage is not the exact empty reservation.')
    return out


def fill_table_owners(document, owners, stock_at):
    """The reviewed table owners (owner decision 14 Oct 2026, module-adapters/table-owners.json): each declaration is
    validated against its exact published package (table_declarations.validate) and the records go into the base's
    fixed table-owner storage before the image is built, so the base admits those packages and no other. Returns the
    storage bytes and the files read."""
    adapters = str(APP / 'sdk/machines/octatrack/module-adapters')
    if adapters not in sys.path:  # table_declarations imports machine_layout beside it
        sys.path.insert(0, adapters)
    spec = importlib.util.spec_from_file_location('base_table_declarations', adapters + '/table_declarations.py')
    declarations = importlib.util.module_from_spec(spec); spec.loader.exec_module(declarations)
    doc = json.loads(owners.read_text())
    if doc.get('schema') != 1 or not isinstance(doc.get('owners'), list) or not doc['owners']:
        raise ValueError('table-owners.json: {"schema": 1, "owners": [...]}.')
    entries, read = [], {str(owners.relative_to(APP)): sha(owners.read_bytes())}
    for owner in doc['owners']:
        if set(owner) != {'module', 'package', 'declaration', 'recipe', 'reviewedSha256', 'approval'}:
            raise ValueError('A table owner names its module, package, declaration, recipe, reviewed hash and approval.')
        files = {}
        for key in ('package', 'declaration', 'recipe'):
            path = (APP / owner[key]).resolve()
            if not path.is_relative_to(APP) or not path.is_file():
                raise ValueError('A table owner file is missing or outside the repository: ' + owner[key])
            files[key] = path.read_bytes()
            read[owner[key]] = sha(files[key])
        entries.append(dict(files, reviewed_sha256=owner['reviewedSha256'], source_root=APP))
    table = declarations.generate(entries)
    section, offset = document['symbols']['modwerk_table_declarations']
    document['sections'][section]['parts'] = replace_literal(document['sections'][section]['parts'], offset,
                                                             declarations.empty(), table, stock_at)
    return table, read


def resident_effect_fills(tag, fx, words, section, offset, effect, original, hooks):
    """Copy original stock words around the exact authored COMP bridges (its proc and its init).

    The recipe already guards and lowers each complete two-word long JSR. They
    must stay literal in the stock-free package: recovering them as original stock
    silently removes the resident hooks on the browser path. No other changed
    word, arbitrary excluded span or caller-authored fill is accepted here.
    """
    if (tag not in ('A', 'B') or type(fx) is not int or not 0 <= fx < 32 or
            type(offset) is not int or offset < 0 or not words or len(words) != len(original) or
            any(type(w) is not int or not 0 <= w <= 0xffffff for w in (*words, *original))):
        raise ValueError('Resident stock fill needs exact complete normalized words.')
    first, count = 0, len(words)
    if effect['key'] != 'COMPRESSOR':
        if words != original:
            raise ValueError('An unreviewed stock effect changed outside the COMP bridge.')
        return [dict(tag=tag, fx=fx, first=first, count=count, section=section, offset=offset)]
    guards = [row for row in hooks['guards'] if row.get('relocated') in ('proc', 'init')]
    spans, expected = [], list(original)
    if (sorted(row['relocated'] for row in guards) != ['init', 'proc'] or type(hooks['origin']) is not int):
        raise ValueError('Resident COMP fill does not preserve its exact guarded authored bridge.')
    for guard in guards:
        at = effect[guard['relocated']]
        if (type(at) is not int or not 0 <= at <= len(words) - 2 or type(guard.get('entry')) is not int or
                not hooks['origin'] <= guard['entry'] <= 0xffffff or
                hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in original[at:at+2])).hexdigest() != guard['expectedSha256'] or
                words[at:at+2] != [0x0bf080, guard['entry']]):
            raise ValueError('Resident COMP fill does not preserve its exact guarded authored bridge.')
        expected[at:at+2] = words[at:at+2]
        spans.append(at)
    spans.sort()
    if expected != words or any(b - a < 2 for a, b in zip(spans, spans[1:])):
        raise ValueError('Resident COMP fill does not preserve its exact guarded authored bridge.')
    cuts = [0] + [x for at in spans for x in (at, at + 2)] + [len(words)]
    return [dict(tag=tag, fx=fx, first=start, count=end-start, section=section, offset=offset+3*start)
            for start, end in zip(cuts[::2], cuts[1::2]) if start < end]


def share_equal_stock_catalog(text, layout):
    """Share only complete byte-identical readonly stock arrays between cores.

    Mutable unpacked words, relocations and per-core code descriptors stay
    independent. Both cores' source recipes must still be recovered/guarded
    before a single original-stock fill is emitted for the shared literal.
    """
    seen, aliases = {}, {}
    for n, tag in enumerate('AB'):
        for fx, words in sorted(layout[tag]['words'].items()):
            if (not words or any(type(w) is not int or not 0 <= w <= 0xffffff for w in words)):
                raise ValueError('Readonly stock sharing needs complete normalized words.')
            key, name = tuple(words), 'stock%d_%d_packed' % (n, fx)
            declaration = 'static const uint8_t %s[] = {%s};' % (name,
                ','.join('%#x' % (w >> shift & 255) for w in words for shift in (16, 8, 0)))
            if text.count(declaration) != 1:
                raise ValueError('Readonly stock catalogue source seam changed.')
            canonical = seen.setdefault(key, (tag, fx, name))
            aliases[(tag, fx)] = canonical[:2]
            if canonical[2] != name:
                text = text.replace(declaration, '')
                text = re.sub(r'\b' + re.escape(name) + r'\b', canonical[2], text)
    return text, aliases


def share_sparse_stock_catalog(text, layout):
    """Reuse A's readonly packed words and reconstruct B in its own mutable RAM.

    This changes only the existing first-tick unpack, never the DSP upload wire.
    Delta values still receive original-source fills below; authored COMP words
    retain the exact bridge guard. No mutable arrays or relocations are shared.
    """
    aliases, deltas, declarations, rows = {}, {}, [], []
    if set(layout['A']['words']) != set(layout['B']['words']):
        raise ValueError('Sparse stock sharing needs matching complete core catalogues.')
    for fx in sorted(layout['A']['words']):
        a, b = (layout[t]['words'][fx] for t in 'AB')
        if (type(fx) is not int or not 0 <= fx < 32 or not a or len(a) != len(b) or
                len(a) > 0xffff or any(type(w) is not int or not 0 <= w <= 0xffffff for w in (*a, *b))):
            raise ValueError('Sparse stock sharing needs bounded complete normalized words.')
        for n, words in enumerate((a, b)):
            name = 'stock%d_%d_packed' % (n, fx)
            declaration = 'static const uint8_t %s[] = {%s};' % (name,
                ','.join('%#x' % (w >> shift & 255) for w in words for shift in (16, 8, 0)))
            if text.count(declaration) != 1:
                raise ValueError('Sparse stock catalogue source seam changed.')
            aliases[('AB'[n], fx)] = ('AB'[n], fx)
        positions = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
        if 5 * len(positions) >= 3 * len(b):
            continue
        text = text.replace(declaration, '')  # the verified complete B declaration
        text = re.sub(r'\bstock1_%d_packed\b' % fx, 'stock0_%d_packed' % fx, text)
        aliases[('B', fx)] = ('A', fx)
        if not positions:
            continue
        positions_name, packed_name = ('stock1_%d_delta_positions' % fx, 'stock1_%d_delta_packed' % fx)
        declarations += ['static const uint16_t %s[] = {%s};' % (positions_name, ','.join(map(str, positions))),
            'static const uint8_t %s[] = {%s};' % (packed_name,
                ','.join('%#x' % (b[i] >> shift & 255) for i in positions for shift in (16, 8, 0)))]
        rows.append('{%s, %s, stock1_%d, %d, %d}' % (packed_name, positions_name, fx, len(positions), len(b)))
        deltas[('B', fx)] = dict(positions=positions, symbol=packed_name)
    start = 'void modwerk_dsp_unpack(void) {\n'
    end = '        all[i].to[w] = (uint32_t)all[i].from[3 * w] << 16 | (uint32_t)all[i].from[3 * w + 1] << 8 | all[i].from[3 * w + 2];\n}'
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError('Sparse stock unpack source seam changed.')
    if rows:
        text = text.replace(start, '\n'.join(declarations)+'\n'+start)
        loop = ('\n    static const struct { const uint8_t *from; const uint16_t *positions; uint32_t *to; '
                'uint16_t count, extent; } differences[] = {%s};\n' % ', '.join(rows) +
                '    for (unsigned i = 0; i < sizeof differences / sizeof *differences; ++i)\n'
                '        for (unsigned w = 0; w < differences[i].count; ++w)\n'
                '            if (differences[i].positions[w] < differences[i].extent)\n'
                '                differences[i].to[differences[i].positions[w]] = '
                '(uint32_t)differences[i].from[3 * w] << 16 | '
                '(uint32_t)differences[i].from[3 * w + 1] << 8 | differences[i].from[3 * w + 2];\n')
        text = text.replace(end, end[:-1]+loop+'}')
    return text, aliases, deltas


def resident_sparse_fills(fx, words, source_words, positions, section, offset, effect, original, hooks):
    """Guard the complete B source before filling only its exact delta words."""
    guarded = resident_effect_fills('B', fx, words, section, 0, effect, original, hooks)
    if (type(offset) is not int or offset < 0 or len(source_words) != len(words) or
            any(type(w) is not int or not 0 <= w <= 0xffffff for w in source_words) or
            not positions or any(type(i) is not int for i in positions) or
            positions != [i for i, (a, b) in enumerate(zip(source_words, words)) if a != b]):
        raise ValueError('Resident stock deltas do not reconstruct the complete independent core.')
    return [dict(tag='B', fx=fx, first=i, count=1, section=section, offset=offset+3*n)
            for n, i in enumerate(positions)
            if any(row['first'] <= i < row['first']+row['count'] for row in guarded)]


def strip(document, fills, words, image, load):
    """-> a copy of `document` without the stock DSP words each fill names, checked against `words(fill)`, the
    words its recipe recovers. Format-2 cannot copy stock into a site or reorder bytes, so these leave as gaps:
    the kit refuses the package until src/engine/elekloader/octatrack-base.ts inserts them from the user's own
    firmware. In a section (the ColdFire's packed copies) a word is big-endian, in a DSP payload site little-endian."""
    document = json.loads(json.dumps(document))
    for fill in sorted(fills, key=lambda f: -f['offset']):  # from the end: earlier offsets stay where they were
        width = usb_post.width(fill)
        start, end = fill['offset'], fill['offset'] + width * fill['count']
        if 'section' in fill:
            expected = b''.join(w.to_bytes(width, 'big') for w in words(fill))
            kept, removed, at = [], b'', 0
            for part in document['sections'][fill['section']]['parts']:
                size = len(part[1]) // 2 if part[0] == 'hex' else part[2]
                data = bytes.fromhex(part[1]) if part[0] == 'hex' else image[int(part[1], 16) - load:][:size]
                lo, hi = max(at, start) - at, min(at + size, end) - at
                if lo >= hi:
                    kept.append(part)
                else:
                    removed += data[lo:hi]
                    for a, b in ((0, lo), (hi, size)):  # what is left of the part, each piece its own part
                        if a < b:
                            kept.append(['hex', data[a:b].hex()] if part[0] == 'hex' else ['stock', hex(int(part[1], 16) + a), b - a])
                at += size
            document['sections'][fill['section']]['parts'] = kept
        else:
            expected = b''.join(w.to_bytes(3, 'little') for w in words(fill))
            site = next(s for s in document['sites'] if s['addr'] == fill['site'])
            removed = bytes.fromhex(site['new'])[start:end]
            site['new'] = site['new'][:2 * start] + site['new'][2 * end:]
        if removed != expected:
            raise ValueError('A stock DSP fill does not name the bytes it removes: %s.' % fill)
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-', help='Use Modwerk\'s reviewed GNU toolchain.')
    parser.add_argument('--dev', action='store_true',
                        help='Development base: drive and watch the unit over USB (dev.c) and stream MAIN/CUE as USB audio. Never for users.')
    parser.add_argument('--usb-midi', action='store_true',
                        help='Private composite-base preparation: bounded USB MIDI receive/transmit plus vendor and MSC.')
    parser.add_argument('--usb-audio', choices=('USB AUDIO OUT TRACKS MAIN CUE', 'USB AUDIO OUT TRACKS',
                        'USB AUDIO OUT MASTER', 'USB AUDIO OUT MAIN CUE', 'USB AUDIO OUT MAIN', usb_post.LAYOUT),
                        help='Private composite-base preparation: one authored output layout, with internal USB MIDI. Requires exact new-base qualification.')
    parser.add_argument('--usb-audio-profiles', action='store_true',
                        help='Offline staging only: source-link all six outputs and off, with --usb-audio as the explicit initial profile. No host settings/recovery or catalogue admission.')
    parser.add_argument('--dsp-hook', choices=tuple(DSP_HOOK_EDITS), default='guard',
                        help="with --dsp-loader: the state-7 entry, guard (default); usbin, pretend, noflags, long: hardware bisect variants")
    parser.add_argument('--dsp-probe', choices=('A', 'B', 'S', 'W', 'M', 'X'),
                        help='Hardware probe of the DSP loader (dsp_loader.PROBES): A delivery only, B answer only, '
                             'S stock DSP payloads (the ColdFire transport alone; nothing answers); '
                             'W full loader, but one word per upload packet to pinpoint a rejected word; '
                             'M (emulator check) a wrong sum on the upload chunk at word 48, so the receiver keeps a record and the tick reads it; '
                             'X the full loader, and the receivers watch X:$7a92-$7fff for anything that writes it (dev request 26).')
    parser.add_argument('--saved-set-export', action='store_true',
                        help='Private fixed-two-file read-only recovery snapshot. No card writes.')
    parser.add_argument('--site-events', action='store_true',
                        help='own the stock sites of sdk/machines/octatrack/events.json and dispatch their events to subscribed modules')
    parser.add_argument('--sample-editor', action='store_true',
                        help='Private staged AED sample-editor service; needs site events and the ordinary DSP loader. Not a released base capability.')
    parser.add_argument('--table-owners', type=Path,
                        help='reviewed table owners (module-adapters/table-owners.json): their records go into the base\'s '
                             'table-owner storage, so it admits those exact packages')
    parser.add_argument('--resident-stock-hooks', action='store_true',
                        help='Private dormant resident SC/Matrix/Analog BD packing. Does not admit their runtime controllers.')
    parser.add_argument('--resident-on-demand', action='store_true',
                        help='With --resident-stock-hooks: leave the SC/Matrix/Analog BD engines out of the permanent block, as '
                             'relocatable units placed in the arena while a controller holds them '
                             '(docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md). Private development: not yet run on hardware.')
    parser.add_argument('--controller-policies', type=Path,
                        help='Private: reviewed controller trust rows (stock_hook_controllers.py) for this exact base link. '
                             'Needs --resident-stock-hooks and --controller-layout.')
    parser.add_argument('--controller-layout', type=Path,
                        help='symbols.json of the empty-row build the rows were encoded against; refused if any symbol moved.')
    parser.add_argument('--dsp-loader', action='store_true',
                        help='Load every DSP effect, stock and module, on demand (needs ELEKLOADER_DSP_ASM, Node 24).')
    parser.add_argument('--dsp-burn', type=int, default=0,
                        help='with --dsp-loader, calibration only: core 0\'s receiver spends this many more cycles (2-4094, even) every frame; negative, core 1\'s.')
    parser.add_argument('--cached-modules', action='store_true',
                        help='Prototype, for a development twin: runtime modules run from the pool\'s cached alias, '
                             'not the uncached one (sdk/runtime/loader/README.md, "Cached modules"). Off by default.')
    parser.add_argument('--module-sets', action='store_true',
                        help='Private whole-set transaction candidate. Retains every predecessor through Keep/Undo; needs exact hardware qualification.')
    parser.add_argument('--fx-ids', type=int, choices=(32, 128), default=128,
                        help='with --dsp-loader: the base\'s effect ids (fxids.h, the dispatch and chooser tables; '
                             'docs/OCTATRACK_MORE_EFFECT_IDS.md). 32, the old width, only to bisect a fault.')
    args = parser.parse_args()
    if args.sample_editor and (not args.site_events or not args.dsp_loader or args.dsp_probe or args.dsp_burn):
        parser.error('--sample-editor needs --site-events and the ordinary --dsp-loader, without probes/burn.')
    if args.usb_audio_profiles and (not args.usb_midi or not args.usb_audio or not args.dsp_loader or args.dev or args.controller_policies):
        parser.error('--usb-audio-profiles needs --usb-midi, an explicit --usb-audio and --dsp-loader; development mode and controller admission are not qualified.')
    if args.saved_set_export and (not args.dsp_loader or args.dsp_probe or args.dsp_burn):
        parser.error('Private saved-set export requires the ordinary DSP loader without probes/burn.')
    if args.resident_stock_hooks and (not args.dsp_loader or args.dsp_probe or args.dsp_burn):
        parser.error('Private resident stock hooks require the ordinary DSP loader, without probes/burn.')
    if args.resident_on_demand and not args.resident_stock_hooks:
        parser.error('--resident-on-demand needs --resident-stock-hooks.')
    if args.resident_stock_hooks and not args.resident_on_demand:
        parser.error('--resident-stock-hooks needs --resident-on-demand: Analog BD\'s engine is its package\'s (ABI 10), placed on demand.')
    if bool(args.controller_policies) != bool(args.controller_layout) or (args.controller_policies and not args.resident_stock_hooks):
        parser.error('Controller trust rows need --resident-stock-hooks and the layout their packages were encoded against.')
    global FX_IDS, FX_WORDS
    FX_IDS, FX_WORDS = args.fx_ids, (args.fx_ids + 31) // 32
    os.environ['ELEKLOADER_CROSS'] = args.cross
    upstream = args.upstream.resolve()
    pin = json.loads((APP / 'vendor/elekloader/kit/kit.json').read_text())['commit']
    if git(upstream, 'rev-parse', 'HEAD') != pin or git(upstream, 'status', '--porcelain', '--untracked-files=no'):
        parser.error('Use the exact clean tracked Elekloader checkout pinned by Modwerk.')
    sys.path.insert(0, str(upstream))
    from elekloader import dsp, formats, elemod, patch
    from elekloader.sdk import build as sdk
    stock, device, release = formats.load(str(args.stock))
    if device.key != 'octatrack' or release.version != '1.40C':
        parser.error('Original Octatrack 1.40C required.')
    image = formats.main_image(stock, device)
    if sha(image) != release.main_sha256:
        parser.error('Original, unmodified MAIN image required.')
    saved_set_proof, saved_set_wiring, saved_set_root = None, None, None
    saved_set_files = ('saved_set_export.c', 'saved_set_export.h', 'saved_set_reader.c',
        'saved_set_session.c', 'saved_set_session.h', 'saved_set_source.py', 'saved_set_wiring.py')
    if args.saved_set_export:
        saved_set_root = APP / 'sdk/machines/octatrack/module-adapters/saved-set-export'
        for name in ('saved_set_source', 'saved_set_wiring'):
            spec = importlib.util.spec_from_file_location(name, saved_set_root / (name + '.py'))
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            if name == 'saved_set_source': saved_set_proof = module.verify_saved_set_source(image)
            else: saved_set_wiring = module
    stock_sha = sha(args.stock.read_bytes())
    out = private_output(args.output)
    source = out / 'source'; source.mkdir()
    logger = APP / 'sdk/runtime/logging'
    guards = json.loads((logger / 'stock-guards.json').read_text())
    for key, guard in guards.items():
        at = guard['address'] - device.main_load
        if at < 0 or sha(image[at:at+guard['length']]) != guard['sha256']:
            raise ValueError('Logger stock ABI guard failed: ' + key)
    original_core = upstream / 'mods/core-ot'
    recipe = json.loads((original_core / 'mod.json').read_text())
    for name in ('core-ot.s', 'bus.s', 'gate.s'):
        shutil.copyfile(original_core / name, source / name)
    bootstrap = (source / 'core-ot.s').read_text()
    marker = '3:      clr.l   (%a1)+'
    if bootstrap.count(marker) != 1:
        raise ValueError('Pinned boot clear seam changed; review before porting.')
    bootstrap = bootstrap.replace(marker, BOOT_CLEAR_SKIP)
    if bootstrap.count(BOOT_RUN_COPY) != 1:
        raise ValueError('Pinned .run copy seam changed; review run_unpack.s before porting.')
    bootstrap = bootstrap.replace(BOOT_RUN_COPY, '        jsr     mw_run_unpack           | .run is stored packed (run_unpack.s)')
    if bootstrap.count(BOOT_FLASH_SEAM) != 1:
        raise ValueError('Pinned core_up seam changed; review flash.c\'s boot snapshot before porting.')
    bootstrap = bootstrap.replace(BOOT_FLASH_SEAM, BOOT_FLASH_SNAPSHOT)
    (source / 'core-ot.s').write_text(bootstrap)
    for p in logger.iterdir():
        if p.suffix in ('.c', '.h') and p.name != 'identity.c':
            shutil.copyfile(p, source / p.name)
    adapter = (source/'stock_140c.c').read_text()
    io_macro = '#define io octamod_log_io'
    if adapter.count(io_macro) != 1:
        raise ValueError('Logger I/O alias seam changed; review the port.')
    # Keep io an array lvalue: stock calls use sizeof io for its capacity.
    adapter = adapter.replace(io_macro,
        '#define io (*(uint8_t (*)[512])((uintptr_t)&octamod_log_retained + 6144u + 0x08000000u))\n'
        'typedef char modwerk_io_capacity[(sizeof io == 512)?1:-1];')
    # Its read-back scratch to .bss as well: olog_stock_read always fills it before it is compared.
    if adapter.count('static uint8_t verify[512] = {0};') != 1:
        raise ValueError('The logger read-back buffer changed; review the .bss edit.')
    adapter = adapter.replace('static uint8_t verify[512] = {0};', 'static uint8_t verify[512];')
    (source/'stock_140c.c').write_text(adapter)
    # The recorder's zeroed buffers to .bss, which core-ot.s clears at boot: 43 KB of zeros out of the image, which a
    # RAM boot must keep under 1.25 MiB (BOOT_IMAGE_BYTES), as selection.c's paste buffer (DSP_EDITS).
    recorder = (source/'octamod_log_firmware.c').read_text()
    zeroed = (('previous = {0}, snapshot = {0};', 'previous, snapshot;'), ('__attribute__((aligned(512))) = {0};', '__attribute__((aligned(512)));'))
    if any(recorder.count(old) != 1 for old, _ in zeroed):
        raise ValueError('The recorder\'s buffers changed; review the .bss edit.')
    for old, new in zeroed:
        recorder = recorder.replace(old, new)
    (source/'octamod_log_firmware.c').write_text(recorder)
    upload = APP / 'sdk/runtime/upload'
    for name in ('upload.c', 'upload.h', 'sha256.c', 'wire.c', 'wire.h', 'vendor.c', 'vendor.h'):
        shutil.copyfile(upload / name, source / name)
    loader = APP / 'sdk/runtime/loader'
    for name in ('loader.c', 'loader.h', 'modwerk_module.h', 'context.h', 'journal.h', 'set_package.h'):
        shutil.copyfile(loader / name, source / name)
    if saved_set_root:
        for name in saved_set_files:
            if Path(name).suffix in ('.c', '.h'):
                shutil.copyfile(saved_set_root / name, source / name)
    machine_trust = APP / 'sdk/machines/octatrack/module-adapters'
    for name in MACHINE_TRUST_SOURCES:
        shutil.copyfile(machine_trust / name, source / name)
    shutil.copyfile(APP / 'sdk/machines/octatrack/include/modwerk_sample_editor.h', source / 'modwerk_sample_editor.h')
    if args.sample_editor:
        for name in SAMPLE_EDITOR_SOURCES:
            shutil.copyfile(machine_trust / name, source / name)
    # Retirements the base carries for contributed machines (machine_contributors.c): Analog BD's Part conversion,
    # when the analog-bd lane's files are present (-O2: it runs with the machine lock held).
    for name in RETIREMENT_SOURCES:
        if (machine_trust / name).is_file():
            shutil.copyfile(machine_trust / name, source / Path(name).name)
    # The base owns the USB configuration and the EP0 unknown-request tail.
    spec = importlib.util.spec_from_file_location('modwerk_usb_base', HERE/'usb_base.py')
    usb = importlib.util.module_from_spec(spec); spec.loader.exec_module(usb)
    usb_functions, usb_profiles, profile_inputs = None, None, {}
    if args.usb_midi or args.usb_audio:
        spec = importlib.util.spec_from_file_location('modwerk_base_usb_functions',
            APP / 'sdk/machines/octatrack/module-adapters/base_usb_functions.py')
        usb_functions = importlib.util.module_from_spec(spec); spec.loader.exec_module(usb_functions)
        audio_path, descriptor_path = usb.audio_paths(args.usb_audio)
        spec = importlib.util.spec_from_file_location('modwerk_authored_usb_descriptors', descriptor_path)
        usb_descriptors = importlib.util.module_from_spec(spec); spec.loader.exec_module(usb_descriptors)
        if args.usb_audio_profiles:
            spec = importlib.util.spec_from_file_location('modwerk_usb_audio_profiles',
                APP / 'sdk/machines/octatrack/module-adapters/usb-audio-profiles/profiles.py')
            usb_profiles = importlib.util.module_from_spec(spec); spec.loader.exec_module(usb_profiles)
    for name in ('ep0.c', 'fxids.h', 'runtime.c', 'runtime.h', 'boot.c', 'boot.h', 'boot.s', 'flash.c', 'flash.h', 'slots.c', 'slots.h', 'modset.c', 'boot_anim.c', 'boot_anim.s', 'crash.c', 'crash.s', 'run_unpack.s') + (('dev.c',) if args.dev else ()) + (
            ('runtime_events.h', 'runtime_events.s', 'machine_registry.c', 'machine_registry.s', 'midi_generators.c',
             'midi_generators.s') if args.site_events else ()):
        shutil.copyfile(HERE / name, source / name)
    # The boot stub's sector, which flash.c writes when it converts a unit to two slots (build_stub.py: stub_body.c).
    sys.path.insert(0, str(HERE))
    import build_stub
    build_stub.build(upstream, source, args.cross + 'gcc')
    if args.dev and args.resident_on_demand:  # dev MEM reaches the engines' diagnostics (resident_engines.dev)
        sys.path.insert(0, str(APP / 'sdk/machines/octatrack/module-adapters'))
        import resident_engines as dev_engines
        (source / 'dev.c').write_text(dev_engines.dev((source / 'dev.c').read_text()))
    if args.site_events:  # the tables' records (struct modwerk_machine, struct modwerk_sequencer_rows)
        shutil.copyfile(APP / 'sdk/machines/octatrack/include/modwerk_events.h', source / 'modwerk_events.h')
    # The startup (boot_anim.c) draws the art the shared startup sources describe, with this base's version.
    spec = importlib.util.spec_from_file_location('modwerk_base_art', APP / 'sdk/runtime/startup/base_art.py')
    base_art = importlib.util.module_from_spec(spec); spec.loader.exec_module(base_art)
    (source / 'boot_art.h').write_text(base_art.header(VERSION.split('-')[0]))
    dsp_sites, dsp_layout, rows = [], None, None
    resident_boot_prepared, resident_boot_helper, resident_factory = None, None, None
    if args.resident_stock_hooks:
        sys.path.insert(0, str(APP / 'sdk/machines/octatrack/module-adapters'))
        import resident_dsp
        import resident_driver
        import resident_source
        import resident_placement
        import resident_journal
        import zero_state
        import resident_boot as resident_boot_helper
        import dsp_packages
        from elekloader.sdk.octabam import Octabam
        resident_ob = Octabam(str(APP / 'sdk/octabam'))
        resident_bundles = {}  # each core's placed block, its on-demand engine units included

        def resident_factory(tag, hi):
            resident_bundles[tag] = resident_dsp.place_resident(
                resident_ob, tag, hi, str(source), dsp_packages.assemble,
                resident_dsp.ALLOWED[tag] if args.resident_on_demand else 0)
            return resident_bundles[tag]
        if args.resident_on_demand:  # the ColdFire side (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md)
            import resident_engines
    if args.dsp_loader:
        spec = importlib.util.spec_from_file_location('modwerk_dsp_loader', HERE/'dsp_loader.py')
        loader_dsp = importlib.util.module_from_spec(spec); spec.loader.exec_module(loader_dsp)
        if args.resident_stock_hooks:
            loader_dsp = resident_source.load_loader(APP)
        for name in DYNLOAD_SOURCES + ('hooks.s',):
            text = (DYNLOAD / name).read_text()
            preserved_dynload = text
            edits = DSP_EDITS.get(name, ()) + WIDTH_EDITS.get(name, ()) + DSP_HOOK_EDITS[args.dsp_hook].get(name, ())
            if name == 'transfer.c' and args.dev:  # the development profile of the frame path (diag.h modwerk_cost)
                edits += (('void dl_ui(void) {\n    dl_selection_tick();\n    dl_residency_tick();\n',
                           'void dl_ui(void) {\n    void modwerk_cost_stamp(unsigned);\n    modwerk_cost_stamp(4);\n    dl_selection_tick(); modwerk_cost_stamp(16);\n    dl_residency_tick(); modwerk_cost_stamp(17);\n'),
                          ('unsigned dl_frame(void) {\n',
                           'extern volatile uint32_t modwerk_cost[28];\nstatic unsigned dl_frame_body(void);\n'
                           'unsigned dl_frame(void) {\n    uint32_t t0=*(volatile uint32_t *)0xfc07c00cu; unsigned r=dl_frame_body();\n'
                           '    modwerk_cost[10]+=*(volatile uint32_t *)0xfc07c00cu-t0; ++modwerk_cost[11]; return r;\n}\n'
                           'static unsigned dl_frame_body(void) {\n'),)
            if name == 'transfer.c' and args.dsp_probe == 'W':
                # One word per upload packet: the count of accepted packets before a reject is the exact
                # index of the first word the DSP read back wrong (device report rejected0/accepted0).
                edits += (('unsigned n=j->upload.count-j->position;\n            if(n>DL_DATA) n=DL_DATA;',
                           'unsigned n=j->upload.count-j->position;\n            if(n>1) n=1;'),
                          ('unsigned n=jobs[c].upload.count-jobs[c].position;\n                        if(n>DL_DATA) n=DL_DATA;',
                           'unsigned n=jobs[c].upload.count-jobs[c].position;\n                        if(n>1) n=1;'))
            if name == 'transfer.c' and args.dsp_probe == 'M':
                edits += (('            t[7]=(uint16_t)j->expected;', '            t[7]=(uint16_t)(j->expected^(j->position==48));'),)
            for old, new in edits:
                if text.count(old) != 1:
                    raise ValueError('Octabam DSP loader seam changed in %s; review the port.' % name)
                text = text.replace(old, new)
            if args.resident_stock_hooks and name == 'buffers.c':
                text = resident_placement.buffers(text)
            elif args.resident_stock_hooks and name == 'manager.c':
                text = resident_journal.manager(resident_placement.manager(text))
                if args.resident_on_demand:
                    text = resident_engines.manager(text)
            if args.resident_stock_hooks and name == 'transfer.c':
                text = resident_driver.transport(text)
                if args.resident_on_demand:
                    text = resident_engines.transport(text)
            if args.resident_stock_hooks and name == 'transfer.h':
                text = resident_driver.transport_header(text)
            if saved_set_wiring and name == 'transfer.c':
                text = saved_set_wiring.transfer(text, args.resident_stock_hooks)
            elif saved_set_wiring and name == 'selection.c':
                text = saved_set_wiring.selection(text)
            for old, new in REFUSAL_EDITS.get(name, ()):
                if text.count(old) != 1:
                    raise ValueError('Octabam DSP loader refusal seam changed in %s; review the port.' % name)
                text = text.replace(old, new)
            if args.resident_on_demand and name == 'allocator.c':  # the key bus's price at a pick
                text = resident_engines.allocator(text)
            elif args.resident_on_demand and name == 'manager.c':  # ... and in the DSP FULL box
                text = resident_engines.refusal(text)
            if args.resident_stock_hooks and name in zero_state.UNITS:  # last, after every other seam
                text = zero_state.unit(name, text, preserved_dynload)
            (source / ('dsp_hooks.s' if name == 'hooks.s' else name)).write_text(text)
        if args.resident_stock_hooks:
            for name in ('stock_hooks.c', 'stock_hooks.h', 'stock_hook_driver.c', 'stock_hook_driver.h', 'stock_hook_resources.c', 'stock_hook_resources.h',
                         'dsp_ledger.h'):
                shutil.copyfile(resident_source.RUNTIME / name, source / name)
            # Explicit strong empty bridge: this size/preparation baseline refuses
            # every unreviewed policy and never starts controller activation.
            policy_root = APP / 'sdk/machines/octatrack/module-adapters/controller-policy'
            for name in CONTROLLER_POLICY_SOURCES:
                shutil.copyfile(policy_root / name, source / name)
            if args.controller_policies:
                # Fixed-capacity storage: filled rows move no symbol the packages name (checked after the link).
                sys.path.insert(0, str(APP / 'sdk/machines/octatrack/module-adapters'))
                import stock_hook_controllers
                rows = stock_hook_controllers.policies_c(json.loads(args.controller_policies.read_text()))
                text = (source / 'controller_write_policy.c').read_text()
                marker = '#ifndef MW_REVIEWED_CONTROLLER_POLICIES\n'
                if text.count(marker) != 1:
                    raise ValueError('The controller trust table seam changed; review build_core.py.')
                (source / 'controller_write_policy.c').write_text(text.replace(
                    marker, '#define MW_REVIEWED_CONTROLLER_POLICIES \\\n' + rows + '\n' + marker))
            # Real caller-owned storage for the compiled association helper.
            # It is zero-initialized and has no backend/authority in this
            # default-closed preparation; no fixture event initializes it.
            (source/'controller_registry.c').write_text('#include "controller_association.h"\n'
                'struct mw_controller_registry modwerk_controller_registry __attribute__((used,aligned(16)));\n')
            (source / 'dsp.c').write_text(resident_source.sources(APP)['dsp.c'])
            if args.resident_on_demand:
                (source / 'dsp.c').write_text(resident_engines.dsp((source / 'dsp.c').read_text()))
        else:
            shutil.copyfile(HERE / 'dsp.c', source / 'dsp.c')
        if saved_set_wiring:
            (source / 'dsp.c').write_text(saved_set_wiring.dsp((source / 'dsp.c').read_text()))
        shutil.copyfile(HERE / 'dsp_core1.s', source / 'dsp_core1.s')
        for name in ('dsp_journal.h', 'dsp_journal_manager.h', 'fxmap.h', 'fxpage.h', 'fxmap.c', 'fxmap.s', 'fxpage.c', 'fxpage.s', 'status.c', 'status.s', 'status.h', 'load_wire.h', 'selftest.h', 'diag.c', 'diag.h'):
            shutil.copyfile(HERE / name, source / name)
        if args.resident_on_demand:
            (source / 'status.c').write_text(resident_engines.status((source / 'status.c').read_text()))
        for lea, stock_list in ((0x40052496, 0x400d6090), (0x40052706, 0x400d6060)):
            if int.from_bytes(image[lea - device.main_load:lea - device.main_load + 4], 'big') != stock_list:
                raise ValueError('An FX selector no longer reads its chooser list at %#x.' % lea)
        dsp_sites, dsp_layout = loader_dsp.recipe(image, device, dsp, lambda path: sdk.dsp_assemble(path, str(source)), str(source),
                                                  args.dsp_probe if args.dsp_probe in ('A', 'B', 'X') else None, args.dsp_burn, FX_IDS,
                                                  **({'resident': resident_factory} if args.resident_stock_hooks else {}))
        if args.resident_stock_hooks:
            resident_boot_prepared = resident_boot_helper.prepare(image, device, dsp, dsp_layout)
            (source / 'resident-dsp-boot.s').write_text(resident_boot_prepared['assembly'])
            bootstrap = (source / 'core-ot.s').read_text()
            seam = '        jsr     BOOT_CONTINUE'
            if bootstrap.count(seam) != 1:
                raise ValueError('Pinned pre-DSP-boot seam changed; review the private resident port.')
            (source / 'core-ot.s').write_text(bootstrap.replace(seam, '        jsr     mw_resident_dsp_boot\n' + seam))
            (source / 'resident-dsp-driver.c').write_text(resident_driver.controller_c(resident_boot_prepared))
            dsp_sites += resident_boot_prepared['sites']
        if args.resident_on_demand:
            (source / 'resident-engines-data.c').write_text(resident_engines.data_c(resident_bundles))
            for name in ('resident_engines.c', 'resident_engines.h'):
                shutil.copyfile(resident_source.RUNTIME / name, source / name)
        chooser_sites, chooser_lists = loader_dsp.choosers(image, FX_IDS)
        at, guard, stepper = KNOB_STEP
        lea = image[at - device.main_load:at - device.main_load + 6]
        if sha(lea) != guard or int.from_bytes(lea[:2], 'big') & 0xf1ff != 0x41f9 or int.from_bytes(lea[2:], 'big') != stepper:
            raise ValueError('The knob routine\'s default-stepper lea at %#x is not the one KNOB_STEP names.' % at)
        chooser_sites.append(dict(addr=hex(at + 2), stock=lea[2:].hex(), op='ptr', target='mw_knob_step'))
        # The Part validator (0x40002318; bank load, battery restore) clears an id that reads negative and clamps one
        # above 31 to 31: four `moveq #31` (docs/OCTATRACK_MORE_EFFECT_IDS.md). Past 32 ids they clamp to the last.
        for at in (VALIDATOR_CLAMPS if FX_IDS != 32 else ()):
            word = image[at - device.main_load:at - device.main_load + 2]
            if word[0] & 0xf1 != 0x70 or word[1] != 31:
                raise ValueError('The Part validator\'s clamp at %#x is not moveq #31.' % at)
            chooser_sites.append(dict(addr=hex(at), stock=word.hex(), op='bytes', new=bytes((word[0], FX_IDS - 1)).hex()))
        dsp_sites += chooser_sites
    (source/'usb_base.h').write_text(usb.header())
    (source/'usb_base.s').write_text(usb_profiles.assembly(usb, usb_functions, usb_descriptors, args.usb_audio) if usb_profiles else
                                   usb_functions.assembly(usb, usb_descriptors, args.usb_audio)
                                   if usb_functions else usb.assembly(args.dev))
    if usb_functions:
        (source/'usbmidi.s').write_text(usb_functions.midi_source((usb.OCTABAM / 'platform/usb-midi/usbmidi.s').read_text()))
        (source/'usbmidi_rx.s').write_text((HERE / 'usbmidi_rx.s').read_text())
        if usb_profiles:
            spec = importlib.util.spec_from_file_location('modwerk_other_usb_descriptors',
                usb.AUDIO_DESCRIPTORS if args.usb_audio == usb_post.LAYOUT else usb.POST_AUDIO_DESCRIPTORS)
            other_descriptors = importlib.util.module_from_spec(spec); spec.loader.exec_module(other_descriptors)
            normal, post_descriptors = ((other_descriptors, usb_descriptors) if args.usb_audio == usb_post.LAYOUT else
                                        (usb_descriptors, other_descriptors))
            post_curve = usb_post.image_words(image, device, dsp)
            profile_sources, profile_inputs = usb_profiles.prepare(usb, usb_functions, normal, post_descriptors,
                                                                  usb_post, post_curve, args.usb_audio)
            for name, text in profile_sources.items():
                (source/name).write_text(text)
        elif args.usb_audio:
            audio_text = usb_functions.audio_source(audio_path.read_text())
            if args.usb_audio != usb_post.LAYOUT:
                audio_text = usb_functions.packet_readiness(audio_text)
            (source/'usbaudio.s').write_text(usb_functions.audio_storage_source(audio_text))
            audio_inc = usb_functions.audio_include(args.usb_audio)
            if args.usb_audio == usb_post.LAYOUT:
                post_curve = usb_post.image_words(image, device, dsp)
                audio_inc += usb_post.include(post_curve)
            (source/'remix.inc').write_text(audio_inc)
    elif args.dev:  # USB AUDIO OUT MAIN CUE (usb_base.py): Octabam's source with our interface numbers
        (source/'usbaudio.s').write_text(usb.audio_assembly())
        (source/'remix.inc').write_text(usb.AUDIO_INC)
    # Identity describes this core-only private base. Later selections need
    # their complete module/version/chooser identities regenerated explicitly.
    folders = (logger, upload, loader, HERE) + ((DYNLOAD,) if args.dsp_loader else ())
    inputs = {str(p.relative_to(APP)): sha(p.read_bytes()) for folder in folders
              for p in sorted(folder.iterdir()) if p.is_file() and p.suffix in ('.c', '.h', '.s', '.asm', '.py', '.json')}
    for path, digest in profile_inputs.items():
        if sha(path.read_bytes()) != digest:
            raise ValueError('A USB profile input changed during source preparation.')
        inputs[str(path.relative_to(APP))] = digest
    inputs['sdk/runtime/m68k_codegen.py'] = sha((APP / 'sdk/runtime/m68k_codegen.py').read_bytes())  # its flag and gate
    for name in MACHINE_TRUST_SOURCES:
        path = machine_trust / name
        inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    path = APP / 'sdk/machines/octatrack/include/modwerk_sample_editor.h'
    inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    if args.sample_editor:
        for name in SAMPLE_EDITOR_SOURCES:
            path = machine_trust / name
            inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    for name in RETIREMENT_SOURCES:
        path = machine_trust / name
        if path.is_file():
            inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    if saved_set_root:
        for name in saved_set_files:
            path = saved_set_root / name
            inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    if args.dev:
        for path in (usb.AUDIO_SOURCE, usb.AUDIO_DESCRIPTORS):
            inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    if usb_functions:
        for path in (Path(usb_functions.__file__), descriptor_path,
                     usb.OCTABAM / 'platform/usb-midi/usbmidi.s',
                     HERE / 'usbmidi_rx.s') + ((audio_path,) if args.usb_audio else ()):
            inputs[str(path.relative_to(APP))] = sha(path.read_bytes())
    if args.dsp_loader:
        for name in ('src/engine/assets/stock-dsp-metadata.json', 'src/engine/assets/chooser-metadata.json',
                     'scripts/octatrack-module-page.mjs'):
            inputs[name] = sha((APP / name).read_bytes())
    if args.resident_stock_hooks:
        for name in ('resident_dsp.py', 'resident_boot.py', 'resident_driver.py', 'resident_source.py', 'resident_placement.py', 'resident_journal.py', 'resident_base.patch', 'resident_base_sources.json'):
            p = APP / 'sdk/machines/octatrack/module-adapters' / name
            inputs[str(p.relative_to(APP))] = sha(p.read_bytes())
        inputs.update({'sdk/octabam/' + p: h for p, h in resident_dsp.verify_sources(resident_ob.root).items()})
        for name in ('dsp-sites.json', 'dsp_sites.py'):  # the ledger dsp_ledger.h is generated from
            inputs['sdk/machines/octatrack/' + name] = sha((APP / 'sdk/machines/octatrack' / name).read_bytes())
        for name in ('stock_hooks.c', 'stock_hooks.h', 'stock_hook_driver.c', 'stock_hook_driver.h', 'stock_hook_resources.c', 'stock_hook_resources.h', 'dsp_ledger.h', 'cue_cfg.s'):
            p = resident_source.RUNTIME / name
            inputs[str(p.relative_to(APP))] = sha(p.read_bytes())
    if args.resident_on_demand:
        for p in (APP / 'sdk/machines/octatrack/module-adapters/resident_engines.py',
                  resident_source.RUNTIME / 'resident_engines.c', resident_source.RUNTIME / 'resident_engines.h'):
            inputs[str(p.relative_to(APP))] = sha(p.read_bytes())
    if args.resident_stock_hooks:
        for name in CONTROLLER_POLICY_SOURCES:
            p = APP / 'sdk/machines/octatrack/module-adapters/controller-policy' / name
            inputs[str(p.relative_to(APP))] = sha(p.read_bytes())
        if args.controller_policies:  # the committed reviewed rows by their path; a private file by its hash only
            policies = args.controller_policies.resolve()
            inputs[str(policies.relative_to(APP)) if policies.is_relative_to(APP) else 'private:controller-policies'] = \
                sha(policies.read_bytes())
    inputs.update({'elekloader/' + p.name: sha(p.read_bytes()) for p in original_core.iterdir() if p.is_file()})
    artwork = APP / 'sdk/runtime/startup/artwork.json'
    inputs['sdk/runtime/startup/artwork.json'] = sha(artwork.read_bytes())
    inputs['sdk/runtime/startup/build.py'] = sha((artwork.parent/'build.py').read_bytes())
    inputs['sdk/runtime/startup/base.json'] = sha((artwork.parent/'base.json').read_bytes())
    inputs['sdk/runtime/startup/base_art.py'] = sha((artwork.parent/'base_art.py').read_bytes())
    if args.table_owners:  # the owners list and every package, declaration and recipe it names
        owners = args.table_owners.resolve()
        inputs[str(owners.relative_to(APP))] = sha(owners.read_bytes())
        for owner in json.loads(owners.read_text()).get('owners', []):
            for key in ('package', 'declaration', 'recipe'):
                inputs[owner[key]] = sha((APP / owner[key]).read_bytes())
    source_hash = sha(json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode())
    chooser = json.loads((APP/'src/engine/assets/chooser-metadata.json').read_text())
    configuration = dict(fx1=['NONE', *chooser['stockFx1']], fx2=['NONE', *chooser['stockFx2']],
                         hidden=[], logger='0.2.0', modules=[], os='1.40C', source=source_hash, stockfx2=True,
                         usb=dict(interfaces=['msc', 'modwerk-vendor'], vendor=1, submit=True, backend='runtime-loader-3'),
                         boot='ram-1', **({'dev': ['key', 'panel', 'state', 'screen', 'usb-audio-main-cue']} if args.dev else {}),
                         **({'cachedModules': 'prototype-1'} if args.cached_modules else {}))
    if args.module_sets:
        configuration['usb']['moduleSets'] = 'mwms-1'
    if args.dsp_loader:
        configuration.update(dsp=dict(loader='dsp-dynload-3', stock='on-demand', rows='runtime',
                                      allowance=DSP_ALLOWANCE, reserve=DSP_RESERVE, probe=args.dsp_probe, burn=args.dsp_burn, hook=args.dsp_hook, arena=[dsp_layout[t]['tableWords'] - loader_dsp.SAVED for t in 'AB']))
    if usb_functions:
        configuration['usb'].update(interfaces=['msc', 'modwerk-vendor', 'midi-control', 'midi-streaming'] +
            (['audio-control', 'audio-streaming'] if args.usb_audio else []),
            midi='bounded-rx-1', audio=args.usb_audio)
        if usb_profiles:
            configuration['usb']['profiles'] = dict(schema=1, initial=usb_functions.AUDIO_LAYOUTS[args.usb_audio] + 1,
                                                     stagingOnly=True, hostSettings=False)
        if args.dev:
            configuration['dev'] = ['key', 'panel', 'state', 'screen']
    if resident_boot_prepared:
        configuration['dsp']['residentStockHooks'] = dict(schema=1, dormant=True, controllersAdmitted=bool(args.controller_policies),
            receiptSha256=sha(json.dumps(resident_boot_prepared['receipt'], sort_keys=True, separators=(',', ':')).encode()),
            **({'onDemand': True} if args.resident_on_demand else {}))
    identity = sha(json.dumps(configuration, separators=(',', ':')).encode())
    values = dict(build=identity[:16], os='1.40C', modules='', configuration=identity,
                  source=source_hash, fx1=';'.join(configuration['fx1']),
                  fx2=';'.join(configuration['fx2']), hidden='')
    definitions = '#include <stdint.h>\n#include "octamod_log_port.h"\n'
    # IDENTIFY reports this configuration identity as the installed base.
    definitions += 'const uint8_t modwerk_base_digest[32] = {%s};\n' % ','.join(
        '0x' + identity[i:i+2] for i in range(0, 64, 2))
    for key, size in FIELDS.items():
        if len(values[key]) >= size:
            raise ValueError('Logger identity field exceeds capacity: ' + key)
        definitions += f'char olog_{key}[{size}] = {ctext(values[key])};\n'
    definitions += 'const struct octamod_log_identity octamod_log_identity = {\n' + ','.join(
        'olog_' + key for key in FIELDS) + ',1};\n'
    definitions += 'typedef char retained_fits[(sizeof(struct octamod_log_retained_state)<=6144)?1:-1];\n'
    if args.dsp_loader:  # dsp.c and manager.c: stock and module effect ids (the null stub until bound), the catalog, each core's arena
        stock = sum(1 << fx for fx in dsp_layout['A']['stock'])
        words = lambda ids: ', '.join('%#xu' % (ids >> 32 * w & 0xffffffff) for w in range(FX_WORDS))  # an fx_set (fxids.h)
        definitions += '#include "allocator.h"\nconst fx_set dl_stub_at_boot = {{%s}};\nconst uint32_t dl_pmap16 = 0;\n' % words(
            dsp_layout['A']['free'] | stock)
        definitions += 'const fx_set modwerk_fx_modules = {{%s}};\n' % words(dsp_layout['A']['free'])
        # fxmap.c: today's catalogue assignments, what a project without '#MODWERK_FX=' lines names.
        names = {m['id']: m['name'] for m in json.loads((APP / 'src/catalog/module-documents.json').read_text())['modules']}
        legacy = [(m['fxId'], m['id']) for m in chooser['modules'] if dsp_layout['A']['free'] >> (m.get('fxId') or 0) & 1]
        definitions += 'struct fx_legacy { uint32_t module; uint32_t id; char name[16]; };\n'
        definitions += 'const struct fx_legacy modwerk_fx_legacy[] = {%s};\nconst uint32_t modwerk_fx_legacy_count = %d;\n' % (
            ', '.join('{%#xu, %d, %s}' % (int.from_bytes(hashlib.sha256(key.encode()).digest()[:4], 'big'), fx,
                                           ctext(names.get(key, key)[:15])) for fx, key in legacy), len(legacy))
        stock_catalog = loader_dsp.catalog_c(dsp_layout, STOCK_CYCLES, FX_IDS)
        stock_packed_aliases, stock_packed_deltas = {}, {}
        if args.resident_stock_hooks:
            stock_catalog, stock_packed_aliases, stock_packed_deltas = share_sparse_stock_catalog(stock_catalog, dsp_layout)
        definitions += stock_catalog + chooser_lists
        # PROJ > MODWERK (status.c's pages): the four stock root rows, copied, then MODWERK with its icon and list. The
        # list descriptor ships initialised (7 visible rows): stock's boot init does not know it (MAINMENU.md section 1).
        if int.from_bytes(image[ROOT_MENU - device.main_load:][:4], 'big') != 4 or \
                int.from_bytes(image[ROOT_ROWS_POINTER - device.main_load:][:4], 'big') != ROOT_ROWS:
            raise ValueError('PROJ\'s root menu is not the four stock rows; review the MODWERK category.')
        stock_rows = image[ROOT_ROWS - device.main_load:][:4 * 24]
        columns = [sum(1 << r for r in range(8) if ICON[r][c] == '#') << 24 for c in range(19)]
        leaves = (('load', 'load'), ('modules', 'modules'), ('missing', 'missing'), ('test', 'test'))
        definitions += ('struct menu_row { const void *label, *window, *action, *value, *child; uint32_t page; };\n'
                        'extern char modwerk_menu_label[], %s;\nvoid %s;\n' % (
                            ', '.join('modwerk_%s_label[]' % label for label, _ in leaves),
                            ', '.join('modwerk_%s_menu(int)' % action for _, action in leaves)) +
                        'static const uint32_t modwerk_icon_plane[19] = {%s};\n' % ', '.join('%#010xu' % c for c in columns) +
                        'static const struct { uint32_t width, height, one; const uint32_t *plane, *mask; } modwerk_icon =\n'
                        '    {0x13, 0x09, 0x01, modwerk_icon_plane, (const uint32_t *)%#xu};\n' % ICON_MASK +
                        'static const struct menu_row modwerk_menu_rows[%d] = {\n%s};\n' % (len(leaves), ',\n'.join(
                            '    {modwerk_%s_label, 0, (const void *)modwerk_%s_menu, 0, 0, 0}' % leaf for leaf in leaves)) +
                        '/* count, scroll, cursor, selection, visible rows, count, rows: the menu engine writes it */\n'
                        'struct { uint32_t count, scroll, cursor, selection, visible, count_again; const struct menu_row *rows; }\n'
                        '    modwerk_menu_list = {%d, 0, 0, 0, 7, %d, modwerk_menu_rows};\n' % (len(leaves), len(leaves)) +
                        'const struct menu_row modwerk_root_rows[5] = {%s,\n    {modwerk_menu_label, &modwerk_icon, 0, 0, &modwerk_menu_list, 0}};\n' % (
                            ',\n'.join('    {' + ', '.join('(const void *)%#xu' % int.from_bytes(stock_rows[24 * r + 4 * f:][:4], 'big')
                                                          for f in range(5)) + ', %#xu}' % int.from_bytes(stock_rows[24 * r + 20:][:4], 'big')
                                         for r in range(4))))
        definitions += 'const uint16_t modwerk_dsp_arena[2] = {%d, %d};\n' % tuple(
            dsp_layout[t]['tableWords'] - loader_dsp.SAVED for t in ('A', 'B'))
    (source/'identity.c').write_text(definitions)
    # Only authored zero placeholders: stock is recovered by format-2 parts.
    spec = importlib.util.spec_from_file_location('modwerk_logger_package', logger/'package.py')
    package = importlib.util.module_from_spec(spec); spec.loader.exec_module(package)
    hook_source = package.hooks(guards)
    if args.sample_editor:
        idle_seam = 'jsr octamod_log_engine_idle\n'
        job_seam = 'jsr octamod_log_engine_begin\naddq.l #4,%sp\n'
        if hook_source.count(idle_seam)!=1 or hook_source.count(job_seam)!=1:
            raise ValueError('The logger engine boundary changed; review the sample-editor composition.')
        hook_source = hook_source.replace(idle_seam, 'jsr mw_sample_engine_idle\n' + idle_seam)
        hook_source = hook_source.replace(job_seam, job_seam +
            'move.l %a2,-(%sp)\njsr mw_sample_engine_job\naddq.l #4,%sp\n')
    (source/'hooks.s').write_text(hook_source)
    (source/'retained.s').write_text('''.section .bss
.balign 512
.globl modwerk_retained_start, modwerk_retained_end, octamod_log_retained
modwerk_retained_start:
octamod_log_retained:
.skip 8192
modwerk_retained_end:
''')
    for name in SIZE_OPTIMIZED:
        path = source / name
        if path.exists():  # the saved-set reader exists only with its option
            path.write_text('#pragma GCC optimize ("Os")\n' + path.read_text())
    recipe.update(version=VERSION, title='Modwerk base prototype', author='irpina; Modwerk contributors',
                  license='GPL-3.0-or-later',
                  description='Private core-only Elekloader base with logger/startup, a USB vendor interface and a runtime module loader (hooks and stock-code sites); NOT a flash candidate.')
    recipe['sources'] += [p.name for p in sorted(source.glob('*.c'))] + ['hooks.s', 'retained.s', 'usb_base.s', 'boot.s', 'boot_anim.s', 'crash.s', 'run_unpack.s'] + (
        ['dsp_hooks.s', 'dsp_core1.s', 'fxmap.s', 'fxpage.s', 'status.s'] if args.dsp_loader else []) + (
        ['usbmidi.s', 'usbmidi_rx.s'] + (['usbaudio.s'] if args.usb_audio else []) if usb_functions else ['usbaudio.s'] if args.dev else [])
    if resident_boot_prepared:
        recipe['sources'].append('resident-dsp-boot.s')
    if args.resident_stock_hooks:
        shutil.copyfile(resident_source.RUNTIME / 'cue_cfg.s', source / 'cue_cfg.s')
        recipe['sources'].append('cue_cfg.s')
    recipe['cflags'] = ['-std=c99', '-ffreestanding', '-fno-builtin', '-fno-common', *CODEGEN.FLAGS,
                        '-fno-zero-initialized-in-bss', '-fno-tree-loop-distribute-patterns',
                        '-fno-merge-constants', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables',
                        '-Wall', '-Wextra', '-Werror', '-DMODWERK_RUNTIME_METADATA_EXTERNAL', '-DMODWERK_RUNTIME_VOLATILE_JOURNAL', '-DMODWERK_FX_IDS=%du' % FX_IDS] + (['-DMODWERK_DSP_XWATCH'] if args.dsp_probe == 'X' else []) + [
                        '-DRUNTIME_MODULES=%du' % RUNTIME_MODULES, '-DRUNTIME_POOL_BYTES=%du' % RUNTIME_POOL_BYTES] + (['-DMODWERK_DEV'] if args.dev else []) + (
        ['-DMODWERK_DSP_LOADER', '-DMODWERK_DSP_ALLOWANCE0=%d' % DSP_ALLOWANCE[0], '-DMODWERK_DSP_ALLOWANCE1=%d' % DSP_ALLOWANCE[1],
         '-DMODWERK_DSP_RESERVE=%d' % DSP_RESERVE] +
        ['-DMODWERK_DSP_%s%d=%d' % (key, n, dsp_layout[t][field]) for n, t in enumerate('AB')
         for key, field in (('TABLE', 'table'), ('WORDS', 'tableWords'), ('MISS', 'miss'), ('METER', 'meter'))] if args.dsp_loader else [])
    if args.cached_modules:  # loader.c, runtime.c, fxpage.c, controller_board.c
        recipe['cflags'].append('-DMODWERK_CACHED_MODULES')
    if args.module_sets:
        recipe['cflags'].append('-DMODWERK_RUNTIME_SETS')
    if args.saved_set_export:
        recipe['cflags'].append('-DMODWERK_SAVED_SET_EXPORT')
    if args.resident_stock_hooks:
        recipe['cflags'].append('-DMODWERK_RESIDENT_STOCK_HOOKS')
    if args.resident_on_demand:
        recipe['cflags'].append('-DMODWERK_RESIDENT_ON_DEMAND')
    if args.site_events:  # the base owns these stock sites; packages subscribe (sdk/machines/octatrack/EVENTS.md)
        recipe['cflags'].append('-DMODWERK_RUNTIME_EVENTS')
        recipe['sources'] += ['runtime_events.s', 'machine_registry.s', 'midi_generators.s']
        for addr, n, guard, label in EVENTS.base_sites():
            stock = image[addr - device.main_load:addr - device.main_load + n]
            if sha(stock) != guard:
                raise ValueError('Stock bytes at %#x are not the ones events.json names.' % addr)
            recipe['sites'].append(dict(addr=hex(addr), stock=stock.hex(), op='jmp', target=label))
        for addr, n, guard, label in FRAME_SITES:
            stock = image[addr - device.main_load:addr - device.main_load + n]
            if sha(stock) != guard:
                raise ValueError('The frame interrupt at %#x is not stock; review the frame guard.' % addr)
            recipe['sites'].append(dict(addr=hex(addr), stock=stock.hex(), op='jmp', target=label))
        # The tables' sites: the machine registry's and the SEQUENCER rows' (machine_registry.c/.s). 'own' sites keep
        # their stock bytes; the registry rewrites their immediates while the table changes.
        for s in EVENTS.owned_sites():
            if s['table']=='ot_sample_editor_actions' and not args.sample_editor:
                continue  # knowing the staged registry entry does not enable its stock sites
            addr, n = s['site'], s['length']
            stock = image[addr - device.main_load:addr - device.main_load + n]
            if sha(stock) != s['guard']:
                raise ValueError('Stock bytes at %#x are not the ones events.json names for %s.' % (addr, s['table']))
            if s['op'] == 'jmp':
                recipe['sites'].append(dict(addr=hex(addr), stock=stock.hex(), op='jmp', target=s['target']))
            elif s['op'] in ('ptr', 'lea'):  # an lea keeps its opcode: its operand is the pointer
                at = addr + (2 if s['op'] == 'lea' else 0)
                recipe['sites'].append(dict(addr=hex(at), stock=stock[at - addr:at - addr + 4].hex(), op='ptr', target=s['target']))
    if '-DMODWERK_RUNTIME_VOLATILE_JOURNAL' in recipe['cflags']:
        for name in VOLATILE_SERVICE_SOURCES:
            shutil.copyfile(HERE / name, source / name)
        recipe['sources'].append('volatile_service.c')
        if args.dsp_loader and args.resident_stock_hooks:  # the board journal adapter needs the manager journal
            shutil.copyfile(HERE / 'journal_board.c', source / 'journal_board.c')
            recipe['sources'].append('journal_board.c')
    for key in ('idle', 'job', 'transport', 'open', 'read', 'write', 'close'):
        guard = guards[key]; n = guard.get('patchLength', guard['length'])
        at = guard['address'] - device.main_load
        # The USB transport is serviced on the engine before the logger's idle hook.
        target = usb.IDLE_HOOK if key == 'idle' else 'olog_' + key + '_hook'
        recipe['sites'].append(dict(addr=hex(guard['address']), stock=image[at:at+n].hex(),
                                    op='jmp', target=target))
    stock_at = lambda addr, n: image[addr-device.main_load:addr-device.main_load+n]
    for addr, n, guard, site in (CUE_CFG_WIDENING if args.resident_stock_hooks else ()):
        if sha(stock_at(addr, n)) != guard:
            raise ValueError('Stock bytes at %#x are not the CUE CFG clamp/check cue_cfg.s widens.' % addr)
        recipe['sites'].append(dict({k: v for k, v in site.items() if k != 'length'},
                                    addr=hex(addr), stock=stock_at(addr, site['length']).hex()))
    recipe['sites'] += (usb_profiles.sites(usb, usb_functions, stock_at, args.usb_audio) if usb_profiles else
                       usb_functions.sites(usb, stock_at, args.usb_audio) if usb_functions else usb.sites(stock_at, args.dev))
    # RAM boot: the gate at the OS entry, and the DSP park in both payloads.
    at = BOOT_GATE[0] - device.main_load
    if image[at:at+6].hex() != BOOT_GATE[1]:
        raise ValueError('The OS entry changed; review the RAM boot gate.')
    recipe['sites'].append(dict(addr=hex(BOOT_GATE[0]), stock=BOOT_GATE[1], op='jmp', target='modwerk_boot_gate'))
    # The startup: boot_anim.s replaces the stock logo loop from its first instruction.
    at = BOOT_LOGO[0] - device.main_load
    if image[at:at+6].hex() != BOOT_LOGO[1]:
        raise ValueError('The stock logo loop changed; review boot_anim.s.')
    recipe['sites'].append(dict(addr=hex(BOOT_LOGO[0]), stock=BOOT_LOGO[1], op='jmp', target='modwerk_boot_loop'))
    for tag in ('A', 'B'):
        for lo, words in DSP_PARK.items():
            addr = dsp.p_span(image, device, tag, lo, lo + len(words)); at = addr - device.main_load
            if [dsp.w24(image, at + 3*k) for k in range(len(words))] != [0 if k % 2 else 0x0c0000 | (lo + k)
                                                                        for k in range(len(words))]:
                raise ValueError('Payload %s P:%#x is not the dead vectors the park replaces.' % (tag, lo))
            recipe['sites'].append(dict(addr=hex(addr), stock=image[at:at+3*len(words)].hex(), op='bytes',
                                        new=b''.join(w.to_bytes(3, 'little') for w in words).hex(), kind='data'))
    # The machine-neutral loader's events (sdk/runtime/loader/loader.h), from core-ot's bus.
    recipe.setdefault('subscribe', []).extend(dict(event='ev_' + e, fn='modwerk_runtime_' + e, order=90)
                                              for e in ('tick', 'draw', 'key', 'enc'))
    if args.sample_editor:
        recipe['cflags'].append('-DMODWERK_SAMPLE_EDITOR')
        recipe['sources'].append('sample_editor_hooks.s')
        recipe['subscribe'] += [dict(event='ev_tick', fn='mw_sample_ui_tick', order=89),
                                dict(event='ev_key', fn='mw_sample_ui_key', order=87)]
    recipe['subscribe'].append(dict(event='ev_draw', fn='modwerk_boot_draw', order=10))  # boot_anim.c, while it runs
    # The host time limit counts on the same tick (ep0.c).
    recipe['subscribe'].append(dict(event='ev_tick', fn='modwerk_ep0_tick', order=91))
    recipe['subscribe'].append(dict(event='ev_tick', fn='modwerk_crash_tick', order=96))  # crash.c: restart after a crash
    if args.dev:  # the screen as composed, modules' drawing included
        recipe['subscribe'].append(dict(event='ev_draw', fn='modwerk_dev_draw', order=95))
    if args.dsp_loader:  # the DSP manager's UI work (its own hook was the UI tick, 0x4005221e) and its ColdFire hooks
        recipe['subscribe'].append(dict(event='ev_tick', fn='modwerk_dsp_tick', order=92))  # dsp.c's test picks
        recipe['subscribe'].append(dict(event='ev_tick', fn='dl_ui', order=93))
        if args.resident_stock_hooks:  # controller_board.c: activation and retirement of trusted controllers
            recipe['subscribe'].append(dict(event='ev_tick', fn='modwerk_controller_tick', order=95))
        # The status modal (status.c): CUE + PROJ before stock and the modules see it, drawn under the dev capture.
        recipe['subscribe'] += [dict(event='ev_key', fn='modwerk_status_key', order=89),
                                dict(event='ev_enc', fn='modwerk_status_enc', order=89),
                                dict(event='ev_tick', fn='modwerk_status_tick', order=94),
                                dict(event='ev_draw', fn='modwerk_status_draw', order=94)]
        # The diagnostics log (diag.c): every key press before the status page may take it, and the meters after
        # status.c has read them; dl_frame calls its freeze watch (DSP_EDITS).
        recipe['subscribe'] += [dict(event='ev_key', fn='modwerk_diag_key', order=88),
                                dict(event='ev_tick', fn='modwerk_diag_tick', order=97)]
        for addr, n, guard, label in DYNLOAD_HOOKS:
            stock = image[addr - device.main_load:addr - device.main_load + n]
            if sha(stock) != guard:
                raise ValueError('Stock bytes at %#x are not the ones the DSP loader hooks.' % addr)
            recipe['sites'].append(dict(addr=hex(addr), stock=stock.hex(), op='jmp', target=label))
        recipe['sites'] += [] if args.dsp_probe == 'S' else dsp_sites
        recipe['sites'] += [dict(addr=hex(ROOT_MENU), stock=image[ROOT_MENU - device.main_load:][:4].hex(), op='bytes', kind='data',
                                 new='00000005'),
                            dict(addr=hex(ROOT_ROWS_POINTER), stock=image[ROOT_ROWS_POINTER - device.main_load:][:4].hex(), op='ptr',
                                 target='modwerk_root_rows')]
    spec = importlib.util.spec_from_file_location('modwerk_startup', artwork.parent/'build.py')
    startup = importlib.util.module_from_spec(spec); spec.loader.exec_module(startup)
    for guard, authored in startup.writes():
        at = guard['address'] - device.main_load
        if sha(image[at:at+len(authored)]) != guard['sha256']:
            raise ValueError('Startup stock table guard failed.')
        recipe['sites'].append(dict(addr=hex(guard['address']), stock=image[at:at+len(authored)].hex(),
                                    op='bytes', new=authored.hex(), kind='data'))
    # A detour's way back must not land inside a patched site (fxmap.s once returned two bytes short).
    spans = [(int(site['addr'], 16), len(bytes.fromhex(site['stock']))) for site in recipe['sites']]
    inside = sorted({hex(t) for f in source.glob('*.s') for t in map(lambda h: int(h, 16), re.findall(
        r'\bj(?:mp|sr)\s+0x([0-9a-fA-F]+)', f.read_text())) for a, n in spans if a < t < a + n})
    if inside:
        raise ValueError('Base code jumps into the middle of a patched site: ' + ', '.join(inside))
    locked = catalogue_overlaps(recipe['sites'])
    if locked:
        raise ValueError('Base sites overlap what these catalogue modules patch: ' + ', '.join(locked))
    if usb_functions and not usb_profiles:
        recipe['sources'] = usb_reserve(source, recipe['sources'], recipe.get('defsym', {}), device, sdk)
    (source/'mod.json').write_text(json.dumps(recipe, indent=2)+'\n')
    path, _ = sdk.build(str(source), str(args.stock), str(out/'package'))
    if usb_functions and not usb_profiles:
        usb_reserve_check(json.loads(Path(path).read_text())['symbols'])
    # Every C object of the base, before anything is packaged (sdk/runtime/m68k_codegen.py).
    if not CODEGEN.check_mcf54455(sorted((out/'package').glob('*.work/*.c.o')), args.cross + 'objdump'):
        raise ValueError('The base build left no C objects to check.')
    document = json.loads(Path(path).read_text())
    for key in ('idle', 'job', 'transport', 'open', 'read', 'write', 'close'):
        section, offset = document['symbols']['olog_replay_' + key]
        guard = guards[key]; n = guard.get('patchLength', guard['length'])
        document['sections'][section]['parts'] = stock_reference(
            document['sections'][section]['parts'], offset, n, guard['address'])
    # Displaced stock instructions the events' tails and the machine registry replay: modwerk_stock_<address>_<n>
    # placeholders, filled from the user's own OS (events.py, machine_registry.s).
    for name, (section, offset) in sorted(document['symbols'].items()):
        found = re.fullmatch(r'modwerk_stock_([0-9a-f]{8})_(\d+)', name)
        if found:
            document['sections'][section]['parts'] = stock_reference(
                document['sections'][section]['parts'], offset, int(found.group(2)), int(found.group(1), 16),
                lambda a, n: image[a - device.main_load:a - device.main_load + n])
    table_storage = None
    if args.table_owners:  # the reviewed table owners' records, in the storage the base reserved (no relink)
        table_storage, read = fill_table_owners(document, args.table_owners.resolve(),
                                                lambda a, n: image[a - device.main_load:a - device.main_load + n])
        if any(inputs.get(name) != digest for name, digest in read.items()):
            raise ValueError('A table owner file changed during the base build.')
    Path(path).write_text(json.dumps(document, indent=1)+'\n')
    if args.dsp_loader:  # the package without stock bytes, for Git and the browser: base.elemod and base-fills.json
        fills = [fill for t in 'AB' for fill in dsp_layout[t]['fills']]
        stock_metadata = json.loads(loader_dsp.METADATA.read_text()) if args.resident_stock_hooks else None
        if stock_metadata and stock_metadata['sourceSha256'] != sha(image):
            raise ValueError('Resident stock fills require the exact original OS metadata.')
        filled_stock = set()
        for n, t in enumerate('AB'):
            if stock_metadata:
                payload = next(p for p in stock_metadata['payloads'] if p['tag'] == t)
                stock_read, _, _ = loader_dsp.payload_words(image, device, dsp, t)
            for fx, words in sorted(dsp_layout[t]['words'].items()):
                canonical_tag, canonical_fx = stock_packed_aliases.get((t, fx), (t, fx))
                section, offset = document['symbols']['stock%d_%d_packed' % ('AB'.index(canonical_tag), canonical_fx)]
                if stock_metadata:
                    original_recipe = next(p for p in payload['packages'] if p['fxId'] == fx)
                    original = loader_dsp.recovered(stock_read, original_recipe)
                    effect = dsp_layout[t]['stock'][fx]
                    if (effect['key'], effect['proc']) != (original_recipe['key'], original_recipe['proc']):
                        raise ValueError('Resident stock effect metadata drifted before literal recovery.')
                    guarded_fills = resident_effect_fills(t, fx, words, section, offset, effect, original,
                                                         dsp_layout[t]['residentHooks'])
                    if (canonical_tag, canonical_fx) not in filled_stock:
                        fills += guarded_fills
                        filled_stock.add((canonical_tag, canonical_fx))
                    delta = stock_packed_deltas.get((t, fx))
                    if delta:
                        delta_section, delta_offset = document['symbols'][delta['symbol']]
                        fills += resident_sparse_fills(fx, words, dsp_layout[canonical_tag]['words'][canonical_fx],
                            delta['positions'], delta_section, delta_offset, effect, original,
                            dsp_layout[t]['residentHooks'])
                else:
                    fills.append(dict(tag=t, fx=fx, first=0, count=len(words), section=section, offset=offset))
        if args.usb_audio == usb_post.LAYOUT or usb_profiles:
            section, offset = document['symbols']['post_xlv']
            fills.append(usb_post.fill(section, offset))
        recovered = lambda f: (post_curve if 'curve' in f else dsp_layout[f['tag']]['words'][f['fx']] if 'fx' in f else
                               dsp_layout[f['tag']]['shared'][f['shared']])[f['first']:f['first'] + f['count']]
        (out/'base.elemod').write_text(json.dumps(strip(document, fills, recovered, image, device.main_load), indent=1)+'\n')
        (out/'base-fills.json').write_text(json.dumps(fills, indent=1)+'\n')
        # What the base's source hash covers, so a test without the stock file sees the package go stale.
        (out/'base-sources.json').write_text(json.dumps(dict(folders=[str(f.relative_to(APP)) for f in folders], sources=inputs),
                                                        indent=1, sort_keys=True)+'\n')
    mod = elemod.load_any(path)
    if set(mod.imports) - {'__run_load','__run_start','__run_words','__bss_start','__bss_words',
                      'arena_base','__arena_pages','__arena_fill','__arena_clear',
                      'ev_tick','ev_draw','ev_key','ev_enc','ev_midi','ev_frame'}:
        raise ValueError('Core has unexpected unresolved imports: ' + str(mod.imports))
    outputs, manifest = patch.build(str(args.stock), [path], version='ELEKLOADER')
    mapping = manifest.pop('_map')
    # MAIN stores .run packed (run_pack.py): the linked image again without its plain copy, repacked and verified as
    # patch.build does, so the RAM boot bound and every hash below are the packed image's.
    from elekloader.codec import aplib
    spec = importlib.util.spec_from_file_location('modwerk_run_pack', HERE/'run_pack.py')
    run_pack = importlib.util.module_from_spec(spec); spec.loader.exec_module(run_pack)
    parsed = formats.load(str(args.stock))[0]
    linked = formats.main_image(formats.parse(outputs['bin'], device), device)
    main_packed, run_proof = run_pack.pack(linked, manifest['link']['layout'], mapping, device.main_load, aplib.pack_section)
    outputs = formats.write(parsed, formats.pack_main(main_packed, device), device, manifest['version'])
    manifest.update(main_sha256=sha(main_packed), main_len=len(main_packed),
                    output=formats.verify(outputs, parsed, main_packed, device, manifest['version']))
    for ext, data in outputs.items():
        target = out / ('NOT_FLASH_CANDIDATE.' + ext); target.write_bytes(data)
        if sha(target.read_bytes()) != sha(data):
            raise ValueError('Saved file hash differs.')
    if args.dsp_loader and any(mapping[name] % 16 for name in ('dl_tx', 'dl_rx')):
        raise ValueError('The DSP loader packet buffers must be 16-byte aligned for eDMA channel 0.')
    (out/'symbols.json').write_text(json.dumps(mapping, indent=2)+'\n')
    if args.controller_layout and json.loads(args.controller_layout.read_text()) != mapping:
        raise ValueError('Controller trust rows moved a linked symbol: their packages name the other layout.')
    if resident_boot_prepared:
        linked = manifest['link']['layout']
        resident_boot_helper.check_linked(resident_boot_prepared['receipt'], mapping, linked['ddr'], linked['bss'], linked['boot'])
    stage = mapping['modwerk_boot_stage']
    if stage % 16 or not BOOT_RESERVE[0] <= stage <= BOOT_RESERVE[1] - 320 - BOOT_IMAGE_BYTES:
        raise ValueError('The RAM boot stage at %#x is outside the reserve the gate scans.' % stage)
    # The unpacked image a RAM boot sends (`npm run device -- boot`); private like the rest.
    main_out = formats.main_image(formats.parse(str(out/'NOT_FLASH_CANDIDATE.bin'), device), device)
    trust_storage = check_trust_storage(run_pack.unpack(main_out, manifest['link']['layout'], mapping, device.main_load),
                                        mapping, manifest['link']['layout'], device.main_load, table_storage)
    if saved_set_proof:
        saved_set_proof['storage'] = check_saved_set_storage(mapping, manifest['link']['layout'])
    zero_proof = None
    if args.resident_stock_hooks:
        from elekloader.sdk.elf import Elf
        zero_proof = check_zero_state(Elf.load(str(Path(path).parent / (recipe['id'] + '.work') / (recipe['id'] + '.o'))),
                                      zero_state.MOVED, manifest['link']['layout'], mapping, (source / 'core-ot.s').read_text())
    if (int.from_bytes(main_out[:4], 'big') != OS_FIRST or len(main_out) > BOOT_IMAGE_BYTES or
            main_out[OS_VEROFF:OS_VEROFF+2] != image[OS_VEROFF:OS_VEROFF+2]):
        raise ValueError('The built MAIN image cannot be booted from RAM.')
    (out/'MAIN.raw').write_bytes(main_out)
    report = dict(schema=1, kind='modwerk-elekloader-base-prototype', coreVersion=VERSION,
                  upstream=pin, sources=inputs, configuration=configuration, configurationHash=identity,
                  dspLoader={t: {k: (hex(v) if isinstance(v, int) else v) for k, v in dsp_layout[t].items() if k not in ('words', 'shared', 'residentUploadRecords')} for t in dsp_layout} if dsp_layout else None,  # no stock words in proofs
                  residentDspBoot=resident_boot_prepared['receipt'] if resident_boot_prepared else None,
                  savedSetExport=saved_set_proof, zeroState=zero_proof, runPack=run_proof,
                  packageSha256=sha(Path(path).read_bytes()), manifest=manifest,
                  savedHashes={ext:sha(data) for ext,data in outputs.items()}, trustStorage=trust_storage,
                  productionReady=False, hardware='not tested', emulator='not tested',
                  limitations=['Up to 128 ColdFire runtime modules at once (hooks on ev_tick, ev_draw, ev_key and ev_enc, stock-code sites that no two modules share) in a 768 KiB pool reclaimed once no task can reach a module; no data-table sites, MIDI or frame hooks, or DSP modules and DSP resource ledger yet.',
                               'The base owns the USB configuration: USB MIDI/Audio cannot be combined with it yet.',
                               'RAM boot (boot.s): any host on the vendor interface can boot a whole OS image without a confirmation on the unit; development only. Nothing it does writes flash; the image must carry NOR\'s bootstrap version.',
                               'Logger retention/ABI and modified bootstrap require emulator/hardware qualification.',
                               'Core-only identity; catalogue selections need exact configuration integration.'])
    (out/'proofs.json').write_text(json.dumps(report, indent=2)+'\n')
    if sha(args.stock.read_bytes()) != stock_sha:
        raise ValueError('Input stock file changed.')
    print('Private source-linked core prototype saved. Do not flash; qualification is pending.')


if __name__ == '__main__':
    main()
