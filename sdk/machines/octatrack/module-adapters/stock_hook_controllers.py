# SPDX-License-Identifier: GPL-3.0-or-later
"""Private source-pinned resident-hook controllers and their encoded packages.

Imported originals stay exact. A native authored-source oracle precedes each
adaptation. `encode` links the reviewed derivative against one exact base's
lease entry symbols and emits the stock-free ABI 7 package plus the trust rows
(`policy_rows`) that the same base must compile in (build_core.py
--controller-policies). Nothing here admits a package: an empty row table, the
default, refuses every lease and every controller activation.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys

import cave_runtime
_ROOT = Path(__file__).resolve().parents[4]
sys.path.append(str(_ROOT / 'sdk'))  # firmware_codec
import firmware_codec  # noqa: E402


def controller_sha256(data):
    """What a trust row pins: the package without its DSP part (sdk/runtime/loader/abi9.py, as the loader computes it)."""
    spec = importlib.util.spec_from_file_location('trust_abi9', _ROOT / 'sdk/runtime/loader/abi9.py')
    abi9 = importlib.util.module_from_spec(spec); spec.loader.exec_module(abi9)
    return abi9.controller_sha256(data)
_spec = importlib.util.spec_from_file_location('stock_hook_private_paths', _ROOT / 'scripts/runtime_private_paths.py')
_private = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_private)

SOURCE_PINS = {
    'modules/sidechain-compressor/manifest.py': '62f004df8eb3e727da05430b18785142f6f3de6c1418b42de49b9073d6f17e44',
    'modules/sidechain-compressor/patch_sidechain.s': '0cbd52f14497253f067f91f54e9bbeb96176e73bb8a438edb89aaf3d09abd325',
    'modules/sidechain-compressor/ui_switch.s': '643c8e68a6f914896740406599369c5d6e0112f1b2f388233a2bfcda10b7b4ab',
    'modules/output-matrix/manifest.py': '65d1ae009dc1c956ce2036181667434e31b361179ca138e5c8f1091227b55619',
    'modules/output-matrix/matrix.s': 'a4b9f74062520437ed0db2f8b497d6af89661621ab3deef5078158514194b287',
}
# module -> (its sources: the adapted unit first, then any linked unchanged beside it; feature; leased entries).
# Sidechain's second unit is ui_switch.s (sc_ui): the KEY switch and KWID's clip widgets, which its page names.
UNITS = {
    'sidechain-compressor': (('modules/sidechain-compressor/patch_sidechain.s', 'modules/sidechain-compressor/ui_switch.s'),
                             1, ('sc_norm',)),
    'output-matrix': (('modules/output-matrix/matrix.s',), 2, ('page_levels', 'matrix_leave', 'matrix_enter')),
}
# Leased entries a base trusts once the package is reviewed.
DEFAULT_ENTRIES = {'sidechain-compressor': ('sc_norm',), 'output-matrix': ('page_levels', 'matrix_leave', 'matrix_enter')}
# Output Matrix's project-load CUE CFG clamp and CS1 power-up check run in stock
# boot, before any package is installed: the resident base owns the widening
# (resident-runtime/cue_cfg.s, `modwerk_cue_cfg_clamp`), so MATRIX survives a power cycle and
# the package leaves those three sites out.
BASE_OWNED_SITES = {'output-matrix': (0x4008732a, 0x400100be, 0x400100c4)}
BASE_OWNED_MARK = 'modwerk_cue_cfg_clamp'
# Authored spans that equal stock code byte for byte (both unchanged stock-free
# scanners refuse them: 16-byte literal runs and 12 non-zero bytes): shipped as
# zeros and ABI 7 stock copies the base fills from its running code after
# checking the hash. (symbol, offset, stock address, length, SHA-256 of the
# authored bytes, which equal the stock bytes there.) No module or the base
# patches a source span (test_stock_hook_controllers checks the gate's claims).
STOCK_COPIES = {'output-matrix': (
    ('audio_enter', 8, 0x4006541c, 18, '854793f1a989aaa29a4978b316713fd1dfd25f24367bdf5ce0a654c632414ab9'),
    ('mw_mode_done', 2, 0x40055e62, 14, '91a4bbc12afccfa7100e67201876284c378c5e2ce3fa01d7729b37c918a4e9cb'),
    ('part_cue', 0, 0x4000eab0, 16, '76615980349044858d2d9013919133c736ea96190fad78cc59e5e55748ca263b'),
    ('part_cue', 22, 0x4004eb96, 13, 'f6bb5520b783d035828391c47f07f2457e9bf7f6cb785f9518abf6829d44f3da'),
    ('lev_box_cue', 38, 0x4003ffd8, 14, 'e3d21ed07e823ecac61ec2b4dd20ebf1eac251c1886b5381ce9c33a9d1783e48'),
    ('lev_box_lev', 38, 0x4003ffd8, 14, 'e3d21ed07e823ecac61ec2b4dd20ebf1eac251c1886b5381ce9c33a9d1783e48')),
    # Sidechain 0.2.0: three formatter/widget call sequences equal to stock code, and rows of the KEY switch's own
    # glyphs and masks equal to stock's glyph and mask tables (ui_switch.s draws them through stock's widget).
    'sidechain-compressor': (
    ('hz_print2', 2, 0x4003b462, 16, '7425b4b7d8aeda891ab0becbeb97996196e62fac07344c487f8f55f458b69650'),
    ('sw_fmt', 18, 0x4003c178, 26, '37a3364699ca07219e4cfe34019092eb342bb1f4bc105f2cb4aa886dbd03f329'),
    ('clip_knob', 58, 0x4004e43a, 16, 'f161e9b55f26ec5abda4bdbbd82bed573f1cd547a6e54daa2b63c185f3e9df01'),
    ('sw_g1', 16, 0x400bddae, 16, 'd910ce9383b969c768cec683309b1d5ec139733c52612a2d2aaed3c58c3e7463'),
    ('sw_g1', 36, 0x400bddae, 16, 'd910ce9383b969c768cec683309b1d5ec139733c52612a2d2aaed3c58c3e7463'),
    ('sw_g1', 56, 0x400bddae, 16, 'd910ce9383b969c768cec683309b1d5ec139733c52612a2d2aaed3c58c3e7463'),
    ('sw_px1', 45, 0x400c7bbf, 23, '7909466014926ba5aebed4321fa990152867ec0d147a6b5c53e82479253f7e49'),
    ('sw_px3', 45, 0x400c7bbf, 23, '7909466014926ba5aebed4321fa990152867ec0d147a6b5c53e82479253f7e49'))}
# Sidechain's MON/KEY/KGN/KBAS/KWID on COMPRESSOR's own page: the catalogue's
# descriptor recipe, carried at the head of the image as an MWPP record the
# board applies in place while the controller is ACTIVE (controller_board.c).
PAGE_RECIPES = {'sidechain-compressor': 'src/engine/assets/descriptor-recipes.json'}
PAGE_BYTES = 0x192
REQUIRED_CORES = {1: 3, 2: 1, 4: 3}  # stock_hooks.c: Matrix is core A only; Analog BD's row is base_bound.py's
TITLES = {'sidechain-compressor': 'SIDECHAIN COMP', 'output-matrix': 'OUTPUT MATRIX'}
REVISIONS = (1, 1, 1)  # policy, state, parameter: the scoped derivative's first reviewed contract
POLICY_CAPACITY = 24  # controller_write_lease.h MW_CONTROLLER_WRITE_POLICY_CAPACITY
# Sidechain answers the base's raised ev_mute_keep (Mute Modes asks which muted
# tracks still feed a key) instead of Mute Modes' native SC_KEY variant.
MUTE_KEEP = dict(event='ev_mute_keep', fn='sc_mute_keep', order=50)
# Mute Modes' native SC_KEY scan (patch_softmute.s p1_key, Session 116) in the
# C convention, as the mute-modes lane's mute_keep_provider_fixture.s proposes:
# the tracks a COMPRESSOR (FX id 0x18) on FX1 or FX2 names as its KEY (page-2
# slot 8: 0 OFF, 1..8 T1..T8) in this frame's per-track DSP record. Read-only:
# stock's 0x7f default or OFF fall outside bits 0..7, so no lease is needed.
_MUTE_KEEP_SOURCE = '''
        .text
        .balign 2
        .global sc_mute_keep
sc_mute_keep:
        lea     0x80000110,%a0          | track 0's record, ping-pong half 0
        moveq   #0,%d0
sk_loop:
        move.b  (55,%a0),%d1            | FX1 id
        cmpi.b  #0x18,%d1
        bne.s   sk_fx2
        mvz.b   (38,%a0),%d1            | its KEY 0..8
        subq.l  #1,%d1                  | -> track 0..7; OFF lands on bit 31
        bset    %d1,%d0
sk_fx2:
        move.b  (57,%a0),%d1            | FX2 id
        cmpi.b  #0x18,%d1
        bne.s   sk_next
        mvz.b   (50,%a0),%d1
        subq.l  #1,%d1
        bset    %d1,%d0
sk_next:
        lea     (64,%a0),%a0
        cmpa.l  #0x80000310,%a0
        bne.s   sk_loop
        andi.l  #0xff,%d0               | the contract's bits 0..7
        rts
'''
# Sidechain's units as the author built them (manifest.py's references): source, origin, bytes, SHA-256.
SC_REFERENCES = (('modules/sidechain-compressor/patch_sidechain.s', 0x400d7000, 698,
                  '976f9f958bf378f54d92f66719f9f59388aec7170efbe78c80b74d7ac7771a35'),
                 ('modules/sidechain-compressor/ui_switch.s', 0x400d7300, 616,
                  'b2c45834b780a1e8b361c1104fca7a875ad25fdcc89a578b6d13d2ec9d2d6978'))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def sources(name, sdk):
    if name not in UNITS:
        raise ValueError('No reviewed controller source port: ' + str(name))
    sdk = Path(sdk).resolve()
    result = {}
    for relative in ('modules/' + name + '/manifest.py', *UNITS[name][0]):
        path = (sdk / relative).resolve()
        if not path.is_relative_to(sdk) or not path.is_file() or sha(path.read_bytes()) != SOURCE_PINS[relative]:
            raise ValueError('Controller source changed; review its source/ownership contract: ' + relative)
        result[relative] = path.read_text()
    return result


def linked_objects(name, sdk, work, cross):
    """The module's other units, assembled unchanged from their pinned sources (sources() checks the pins)."""
    texts, objects = sources(name, sdk), []
    for index, relative in enumerate(UNITS[name][0][1:]):
        path = Path(work) / ('beside%d.s' % index)
        path.write_text(texts[relative])
        obj = Path(work) / ('beside%d.o' % index)
        cave_runtime.run([cross + 'as', '-mcpu=54455', path, '-o', obj])
        objects.append(obj)
    return objects


def write_wrapper(entry, feature, body, denied='', before='', capture='', after='', precheck=''):
    """Source-only strong board lease wrapper. No caller readiness inputs.

    The 104-byte caller frame has the opaque lease, complete register/CCR
    snapshots and two source-owned notification snapshots. Begin's retained
    interrupt mask must survive: only CCR is restored until End. Failed End
    returns immediately without a stock/custom replay or notification.

    `precheck` runs first, reading only: when the body would write nothing it
    returns exactly as a refused lease does (every register and CCR as on
    entry, then `denied`); otherwise it falls through to Begin with every
    register and CCR as on entry, and the body checks again under the lease.
    The lease guards writes; a frame hook that writes nothing takes none.
    """
    return f'''
        .balign 4
        .global {entry}
{entry}:
{precheck}
        lea -104(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,32(%sp)
        move.w %sr,%d0
        move.w %d0,92(%sp)
        pea (%sp)
        pea {feature}.w
        pea {entry}:l
        jsr modwerk_controller_write_begin
{entry}_begun:
        lea 12(%sp),%sp
        cmpi.l #1,%d0
        bne {entry}_denied
        move.w 92(%sp),%d0
        move.w %d0,%ccr
        movem.l 32(%sp),%d0-%d7/%a0-%a6
{before}
        bsr {body}
        movem.l %d0-%d7/%a0-%a6,32(%sp)
        move.w %sr,%d0
        move.w %d0,92(%sp)
{capture}
        pea (%sp)
        jsr modwerk_controller_write_end
{entry}_ended:
        addq.l #4,%sp
        cmpi.l #1,%d0
        bne {entry}_end_failed
        move.w 92(%sp),%d0
        move.w %d0,%ccr
        movem.l 32(%sp),%d0-%d7/%a0-%a6
{after}
        lea 104(%sp),%sp
        rts
{entry}_end_failed:
        move.w 92(%sp),%d0
        move.w %d0,%ccr
        movem.l 32(%sp),%d0-%d7/%a0-%a6
        lea 104(%sp),%sp
        rts
{entry}_denied:
        move.w 92(%sp),%d0
        move.w %d0,%ccr
        movem.l 32(%sp),%d0-%d7/%a0-%a6
        lea 104(%sp),%sp
{denied}
        rts
'''


# Sidechain's frame hook writes only to reset a COMPRESSOR whose KEY is above 8 (sc_norm, sn_fix): the same
# checks, reading only, in the same two copies (the working store and the live lane, each by its own FX id).
_SC_NORM_PRECHECK = '''        lea     -32(%sp),%sp
        movem.l %d0/%d2-%d4/%a0-%a3,(%sp)
        move.w  %sr,%d4
        moveq   #0,%d0
        move.b  CUR_PART,%d0
        mulu.w  #0x18b2,%d0
        movea.l DBPTR,%a0
        adda.l  %d0,%a0
        adda.l  #0x8ed80,%a0                | the current part's working store: FX ids at +0 / +8
        lea     (0x2f2+14,%a0),%a1          | track 0's FX1 KEY there (FX2's at +6), 30 bytes a track
        lea     LIVE_IDS,%a2                | live FX ids at +0 / +8
        lea     LANE,%a3                    | track 0's lane (KEY at +0x34 / +0x3a), 72 bytes a track
        moveq   #8,%d3
        moveq   #0,%d2                      | the track
mw_sn_scan:
        move.b  (0,%a0,%d2.l),%d0
        cmpi.b  #COMP_ID,%d0
        bne.s   mw_sn_s2
        mvz.b   (%a1),%d0
        cmp.l   %d3,%d0
        bhi.s   mw_sn_write
mw_sn_s2:
        move.b  (8,%a0,%d2.l),%d0
        cmpi.b  #COMP_ID,%d0
        bne.s   mw_sn_l1
        mvz.b   (6,%a1),%d0
        cmp.l   %d3,%d0
        bhi.s   mw_sn_write
mw_sn_l1:
        move.b  (0,%a2,%d2.l),%d0
        cmpi.b  #COMP_ID,%d0
        bne.s   mw_sn_l2
        mvz.b   (0x34,%a3),%d0
        cmp.l   %d3,%d0
        bhi.s   mw_sn_write
mw_sn_l2:
        move.b  (8,%a2,%d2.l),%d0
        cmpi.b  #COMP_ID,%d0
        bne.s   mw_sn_next
        mvz.b   (0x3a,%a3),%d0
        cmp.l   %d3,%d0
        bhi.s   mw_sn_write
mw_sn_next:
        lea     (30,%a1),%a1
        lea     (72,%a3),%a3
        addq.l  #1,%d2
        cmp.l   %d3,%d2
        bne.s   mw_sn_scan
        move.w  %d4,%ccr                    | nothing to reset: as a refused lease, without one
        movem.l (%sp),%d0/%d2-%d4/%a0-%a3
        lea     32(%sp),%sp
        lea     0x80000a50,%a3              | displaced
        rts
mw_sn_write:
        move.w  %d4,%ccr
        movem.l (%sp),%d0/%d2-%d4/%a0-%a3
        lea     32(%sp),%sp
'''
# Output Matrix's frame hook writes, outside MATRIX, only $3b's clear: with it already clear, nothing.
_PAGE_LEVELS_PRECHECK = '''        lea     -8(%sp),%sp
        movem.l %d0-%d1,(%sp)
        move.w  %sr,%d1
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   mw_pl_write
        tst.w   PG_MATRIX(%a2)
        bne.s   mw_pl_write
        move.w  %d1,%ccr                    | nothing to write: as a refused lease, without one
        movem.l (%sp),%d0-%d1
        lea     8(%sp),%sp
        move.b  0x80000032,%d3              | the displaced load
        rts
mw_pl_write:
        move.w  %d1,%ccr
        movem.l (%sp),%d0-%d1
        lea     8(%sp),%sp
'''


def _replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Reviewed derivative seam changed: ' + old.strip().splitlines()[0])
    return source.replace(old, new)


# The authored CUE + TRACK CC notification loop, cut from cue_mask_from_live so
# it runs after the lease ends (no stock call inside a held span).
_MATRIX_CC_LOOP = '''        moveq   #0,%d7
4:      moveq   #16,%d0
        add.l   %d7,%d0
        btst    %d0,%d6
        beq.s   6f
        moveq   #0,%d1
        btst    %d0,%d5
        beq.s   5f
        moveq   #1,%d1                   | now cued
5:      move.l  %d1,-(%sp)               | value
        moveq   #0x33,%d0
        move.l  %d0,-(%sp)               | CC 51
        move.l  %d7,-(%sp)               | track
        jsr     CC_OUT
        lea     12(%sp),%sp
6:      addq.l  #1,%d7
        moveq   #8,%d0
        cmp.l   %d0,%d7
        bne.s   4b
        rts
'''
_MATRIX_MODE_TAIL = '''9:      move.b  %d2,CUE_CFG
        move.b  %d2,CUE_CFG_CS1
        movem.l (%sp),%d2-%d7/%a2-%a3
        lea     32(%sp),%sp
        pea     -1.w
        jsr     MENU_REDRAW
        addq.l  #4,%sp
act_none:
        rts
'''
# YES on a CUE CFG row. NORMAL <-> STUDIO stays the authored store; a switch
# into or out of MATRIX runs the authored whole-bank conversion under the
# board lease (matrix_enter / matrix_leave). Refused: nothing changes. The
# redraw and any CC notification run after the lease ends.
_MATRIX_FRONT = '''set_mode:
        move.l  %d2,-(%sp)
        move.l  %d0,%d2                  | the new mode
        moveq   #0,%d0
        move.l  %d0,mw_matrix_cc:l       | no notification unless a conversion makes one
        mvs.b   CUE_CFG,%d1              | the old one
        cmp.l   %d1,%d2
        beq.s   mw_mode_plain
        moveq   #2,%d0
        cmp.l   %d0,%d2
        beq.s   mw_mode_enter
        cmp.l   %d0,%d1
        beq.s   mw_mode_leave
mw_mode_plain:
        move.l  %d2,%d0
        bsr     mw_matrix_mode_body
        bra.s   mw_mode_done
mw_mode_enter:
        move.l  %d2,%d0
        bsr     matrix_enter
        bra.s   mw_mode_done
mw_mode_leave:
        move.l  %d2,%d0
        bsr     matrix_leave
mw_mode_done:
        move.l  (%sp)+,%d2
        pea     -1.w
        jsr     MENU_REDRAW
        addq.l  #4,%sp
        rts
mw_matrix_mode_body:
'''


def page_record(name):
    """The MWPP record (GNU as) for a module whose page extends a stock effect in
    place: magic, version 1, integer/text/pointer counts, the stock descriptor and
    the SHA-256 of its PAGE_BYTES, then (offset, width, 0, value) integers and
    (offset, 4, 1, mask) inherits, (offset, width, length, text) strings padded
    to 4, and (offset, 0, image offset) pointers to the module's own formatters.
    An inherit puts the donor's own bits under its mask back after the integers:
    the recipe's inheritedEnable slots keep the stock enable nibble, as the
    browser's descriptor clone does (src/engine/descriptors.ts). The board reads
    them from the running descriptor, so the record carries no stock bytes."""
    if name not in PAGE_RECIPES:
        return ''
    recipes = json.loads((_ROOT / PAGE_RECIPES[name]).read_text())['recipes']
    recipe = next(r for r in recipes if r['id'] == name)
    if recipe.get('sourceSha256') != SOURCE_PINS['modules/%s/manifest.py' % name] or not recipe.get('replaces'):
        raise ValueError('The page recipe is not the pinned in-place source: ' + name)
    ints, texts, pointers = recipe['integers'], recipe['strings'], recipe['rawPointers']
    inherited = recipe.get('inheritedEnable', [])
    if any(type(slot) is not int or not 0 <= slot <= 11 for slot in inherited):
        raise ValueError('Invalid inherited descriptor control: ' + name)
    masks = {offset: sum(0xf << (slot % 8) * 4 for slot in inherited if (slot < 8) == (offset == 0x18e))
             for offset in (0x18e, 0x18a)}  # the enable words: slots 0-7, then 8-11 (descriptors.ts)
    inherits = [dict(offset=offset, mask=mask) for offset, mask in masks.items() if mask]
    if (len(ints) + len(inherits) > 64 or len(texts) > 16 or len(pointers) > 16 or
            any(i['width'] not in (1, 2, 4) or i['offset'] + i['width'] > PAGE_BYTES for i in ints) or
            any(len(s['value'].encode('latin-1')) >= s['width'] or s['offset'] + s['width'] > PAGE_BYTES for s in texts) or
            any(p['offset'] + 4 > PAGE_BYTES for p in pointers)):
        raise ValueError('The page recipe exceeds the board record bounds: ' + name)
    lines = ['        .text', '        .balign 4', 'mw_page:', '        .ascii "MWPP"',
             '        .byte 1, %d, %d, %d' % (len(ints) + len(inherits), len(texts), len(pointers)),
             '        .long 0x%08x' % recipe['donorAddress'],
             '        .byte ' + ', '.join('0x%02x' % b for b in bytes.fromhex(recipe['donorSha256']))]
    lines += ['        .word %d\n        .byte %d, 0\n        .long 0x%x' % (i['offset'], i['width'], i['value'] & 0xffffffff) for i in ints]
    lines += ['        .word %d\n        .byte 4, 1\n        .long 0x%08x' % (i['offset'], i['mask']) for i in inherits]
    for s in texts:
        text = s['value'].encode('latin-1')
        lines += ['        .word %d\n        .byte %d, %d' % (s['offset'], s['width'], len(text)),
                  '        .byte ' + ', '.join(str(b) for b in text + bytes(-(len(text) + 4) % 4))]
    lines += ['        .word %d, 0\n        .long %s - mw_page' % (p['offset'], p['symbol']) for p in pointers]
    return '\n'.join(lines) + '\n        .balign 2\n'


def adapted_source(name, sdk):
    """Emit an authored derivative while refusing any imported-source drift.

    Sidechain: sc_norm under a frame-time lease. Matrix: page_levels under a
    frame-time lease, and the mode transaction: the authored whole-bank
    conversion runs unchanged under one lease at the board's level-4 lock
    (tasks, USB and storage wait; frames run). Its CC 51 notifications and
    the menu redraw run after End. No truncated conversion or caller-provided
    mode flag substitutes for the lease, and Matrix retirement still refuses
    while MATRIX is selected (controller_board.c).
    """
    source = sources(name, sdk)[UNITS[name][0][0]]
    if name == 'sidechain-compressor':
        source = _replace_once(source, '    .text\n', '    .text\n' + page_record(name), )
        source = _replace_once(source, 'sc_norm:\n', 'mw_sc_norm_body:\n')
        return source + write_wrapper('sc_norm', 1, 'mw_sc_norm_body', denied='        lea 0x80000a50,%a3',
                                     precheck=_SC_NORM_PRECHECK) + _MUTE_KEEP_SOURCE
    source = _replace_once(source, 'page_levels:\n', 'mw_matrix_page_body:\n')
    source = _replace_once(source, 'set_mode:\n', _MATRIX_FRONT)
    source = _replace_once(source, _MATRIX_MODE_TAIL, _MATRIX_MODE_TAIL.replace(
        '''        pea     -1.w
        jsr     MENU_REDRAW
        addq.l  #4,%sp
''', ''))
    source = _replace_once(source, _MATRIX_CC_LOOP, '''        lea     mw_matrix_cc:l,%a0
        move.l  %d6,(%a0)                | the cue bits that changed, CC 51 after End
        move.l  %d5,4(%a0)
        rts
''')
    notify = ('''
        .text
| After the mode lease ends: CC 51 for each track whose cue state changed.
mw_matrix_notify:
        lea     -12(%sp),%sp
        movem.l %d5-%d7,(%sp)
        lea     mw_matrix_cc:l,%a0
        move.l  (%a0),%d6
        move.l  4(%a0),%d5
''' + _MATRIX_CC_LOOP.replace('        rts\n', '''        movem.l (%sp),%d5-%d7
        lea     12(%sp),%sp
        rts
''') + '''        .data
        .balign 4
mw_matrix_cc:   .long 0, 0                | changed, new cue bits
        .text
''')
    return (source + notify + write_wrapper('page_levels', 2, 'mw_matrix_page_body',
                                            denied='        move.b 0x80000032,%d3', precheck=_PAGE_LEVELS_PRECHECK)
            + write_wrapper('matrix_leave', 2, 'mw_matrix_mode_body', after='        bsr mw_matrix_notify')
            + write_wrapper('matrix_enter', 2, 'mw_matrix_mode_body', after='        bsr mw_matrix_notify'))


def compile_original(name, sdk, builder, work, cross='m68k-elf-', pool_origins=(), fixture_imports=None):
    """Fresh low/high and optional pool links of the untouched authored source.

    `builder` is explicitly trusted source, not an MCP/uploaded argument. This
    proves native relocation only. It does not create encoded identities,
    strip DSP declarations or broaden the builder's resource admission.
    Output must already be a new private directory outside all Git worktrees.
    """
    texts = sources(name, sdk)
    work = _private.private_directory(work)
    if any(work.iterdir()):
        raise ValueError('Use a new empty private controller compilation directory.')
    if subprocess.run(['git', '-C', str(work), 'rev-parse', '--show-toplevel'], capture_output=True).returncode == 0:
        raise ValueError('Controller images must stay outside Git.')
    source = Path(sdk).resolve() / UNITS[name][0][0]
    objects = []
    if fixture_imports is not None:
        if (set(fixture_imports) != {'modwerk_controller_write_begin', 'modwerk_controller_write_end'}
                or any(type(value) is not int or not 0x47400000 <= value < 0x47420000 or value & 3
                       for value in fixture_imports.values())):
            raise ValueError('Private native fixture imports require the exact bounded strong lease seam.')
        source = work / 'authored-adaptation.s'
        source.write_text(adapted_source(name, sdk))
        imports = work / 'fixture-imports.s'
        imports.write_text(''.join(f'.global {symbol}\n.set {symbol}, {value}\n'
                                  for symbol, value in sorted(fixture_imports.items())))
        import_obj = work / 'fixture-imports.o'
        cave_runtime.run([cross + 'as', '-mcpu=54455', imports, '-o', import_obj])
        objects.append(import_obj)
    obj = work / 'authored.o'
    cave_runtime.run([cross + 'as', '-mcpu=54455', source, '-o', obj])
    objects.insert(0, obj)
    beside = linked_objects(name, sdk, work, cross)
    objects[1:1] = beside
    low, symbols, bss = cave_runtime.link_objects(builder, objects, cross, 0, work / 'low')
    high, _, high_bss = cave_runtime.link_objects(builder, objects, cross, builder.SHIFT, work / 'high')
    if bss != high_bss:
        raise ValueError('Controller BSS changes between fresh native origins.')
    offsets = builder.relocations(low, high, len(low) + bss)
    cave_runtime.validate_relocations(low, offsets, len(low) + bss)
    if name == 'sidechain-compressor' and fixture_imports is None:
        # Each authored unit alone at the author's own origin is the author's bytes (its image may carry the
        # runtime's normal alignment padding after them, zero). No source byte may be trimmed.
        for unit, (relative, origin, length, digest) in zip([obj, *beside], SC_REFERENCES):
            reference, _, reference_bss = cave_runtime.link_objects(builder, [unit], cross, origin,
                                                                    work / ('reference-' + Path(relative).stem))
            if (len(reference) < length or sha(reference[:length]) != digest or any(reference[length:])
                    or reference_bss):
                raise ValueError('Sidechain authored native reference changed: ' + relative)
    placed = []
    for index, origin in enumerate(pool_origins):
        if type(origin) is not int or origin < 0x40000000 or origin & 15 or origin & 0x08000000 or origin + len(low) + bss > 0x48000000:
            raise ValueError('Private controller origin is not a bounded canonical ColdFire extent.')
        fresh, _, fresh_bss = cave_runtime.link_objects(builder, objects, cross, origin, work / ('pool%d' % index))
        if fresh_bss != bss or cave_runtime.placed(low, offsets, origin) != fresh:
            raise ValueError('Controller relocation differs from fresh native pool assembly.')
        placed.append(dict(origin=origin, bytes=len(fresh), sha256=sha(fresh)))
    preparation = ('sdk/runtime/loader/build.py',
                   'sdk/machines/octatrack/module-adapters/cave_runtime.py',
                   'sdk/machines/octatrack/module-adapters/stock_hook_controllers.py',
                   'sdk/machines/octatrack/module-adapters/stock_hook_write_lease.h')
    return dict(image=low, symbols=symbols, bss=bss, offsets=offsets, nativePools=placed,
                sourceHashes={relative: sha(text.encode()) for relative, text in texts.items()},
                preparationHashes={relative: sha((_ROOT / relative).read_bytes()) for relative in preparation},
                adaptedSourceSha256=sha(source.read_bytes()),
                feature=UNITS[name][1], entries=UNITS[name][2], encodedSha256=None,
                productionLeaseBound=False, admission=False,
                fixtureImports=fixture_imports, matrixModeLeased=name == 'output-matrix')


LEASE_IMPORTS = ('modwerk_controller_write_begin', 'modwerk_controller_write_end')


def lease_imports(base_symbols):
    """The exact base's strong lease entries (its build_core symbols.json).

    A package names them by absolute address, so it belongs to that one base
    link: build_core.py --controller-policies refuses a rebuilt base whose
    symbols moved (--controller-layout).
    """
    if not isinstance(base_symbols, dict):
        raise ValueError('Controller packages need the exact base symbol map.')
    imports = {name: base_symbols.get(name) for name in LEASE_IMPORTS}
    if (any(type(v) is not int or v & 1 or not 0x40000400 <= v < 0x48000000 for v in imports.values())
            or len(set(imports.values())) != 2):
        raise ValueError('The base does not export the strong controller lease entries.')
    return imports


def controller_sites(name, upstream, symbols, builder):
    """ABI 7 stock-code sites from the module's own manifest (hashes, no bytes).

    The same records `build.py --octabam` makes for detours, pokes and symbol
    references; anything else such a package cannot carry is refused.
    """
    firmware_codec.use_elekloader(Path(upstream).expanduser().resolve())
    from elekloader.sdk import octabam as port
    m = port.Octabam(str(_ROOT / 'sdk/octabam')).modules[name]
    extra = [what for what, there in (('requires', m.requires), ('tables', m.tables), ('keeps', m.keeps),
                                      ('DRAM regions', m.dram_regions), ('overrides', m.overrides),
                                      ('caves', m.cf_patches)) if there]
    extra += ['stock copies'] if any(getattr(u, 'stock_copies', ()) for u in m.linked) else []
    if extra or len(m.linked) != len(UNITS[name][0]):
        raise ValueError(name + ' carries what a controller package cannot: ' + ', '.join(extra or ['units']))

    def symbol(label, addend=0):
        if label not in symbols:
            raise ValueError('%s names %s, which the derivative does not define.' % (name, label))
        return struct.pack('>I', symbols[label] + addend)
    sites = []
    for d in m.detours:
        n = d.pad_to or 6
        if d.kind not in builder.OPCODES or d.kind == 'lea' or d.target is not None or n < 6 or n % 2:
            raise ValueError('Detour at %#x: only jmp or jsr to the module\'s own symbol.' % d.site)
        digest, checked = builder.stock_digest(d.expect)
        # The pad after the jump is never reached from its start; a long one begins with a bra.s
        # to its end (same effect as nops, no CCR change) so it is not a stock-like nop run.
        pad = b'\x4e\x71' * ((n - 6) // 2) if n - 6 < 12 else bytes((0x60, n - 8)) + b'\x4e\x71' * ((n - 8) // 2)
        sites.append((d.site, digest, builder.OPCODES[d.kind] + symbol(d.symbol) + pad, [2], 0, checked))
    for poke in m.pokes:
        digest, checked = builder.stock_digest(poke.expect)
        sites.append((poke.addr, digest, bytes(poke.write), [], 0, checked))
    for ref in m.symbol_refs:
        digest, checked = builder.stock_digest(ref.expect.to_bytes(4, 'big'))
        sites.append((ref.addr, digest, symbol(ref.symbol, ref.addend), [0], 0, checked))
    return sorted(sites, key=lambda s: s[0])


def encode(name, sdk, builder, work, base_symbols, upstream, cross='m68k-elf-', registry=None):
    """The reviewed derivative as one stock-free ABI 7 package for one base.

    Linked at two origins (self-references only move; the lease entries are
    absolute), sites from the manifest by hash, a display name and layout 1.
    Returns the bytes, their SHA-256, the module id and every leased entry's
    image offsets (entry, Begin and End return PCs) for `policy_rows`.
    """
    texts = sources(name, sdk)
    imports = lease_imports(base_symbols)
    work = _private.private_directory(work)
    if any(work.iterdir()):
        raise ValueError('Use a new empty private controller package directory.')
    source = work / 'authored-adaptation.s'
    source.write_text(adapted_source(name, sdk))
    obj = work / 'authored.o'
    cave_runtime.run([cross + 'as', '-mcpu=54455', source, '-o', obj])
    objects = [obj, *linked_objects(name, sdk, work, cross)]
    defsyms = sorted(imports.items())
    low, symbols, bss = cave_runtime.link_objects(builder, objects, cross, 0, work / 'low', defsyms)
    high, _, high_bss = cave_runtime.link_objects(builder, objects, cross, builder.SHIFT, work / 'high', defsyms)
    if bss != high_bss:
        raise ValueError('Controller BSS changes between fresh native origins.')
    offsets = builder.relocations(low, high, len(low) + bss)
    cave_runtime.validate_relocations(low, offsets, len(low) + bss)
    entries = {}
    for entry in UNITS[name][2]:
        at = [symbols.get(entry + suffix) for suffix in ('', '_begun', '_ended')]
        if any(type(v) is not int or v & 1 or not 0 <= v < len(low) for v in at) or len(set(at)) != 3:
            raise ValueError('A leased entry of the derivative is not inside its image: ' + entry)
        entries[entry] = dict(entry=at[0], beginReturn=at[1], endReturn=at[2])
    sites = controller_sites(name, upstream, symbols, builder)
    if name in BASE_OWNED_SITES:
        if BASE_OWNED_MARK not in base_symbols:
            raise ValueError('This base does not own Output Matrix\'s boot widenings; rebuild it with --resident-stock-hooks.')
        sites = [s for s in sites if s[0] not in BASE_OWNED_SITES[name]]
    image, copies = bytearray(low), []
    for label, delta, address, length, digest in STOCK_COPIES.get(name, ()):
        at = symbols[label] + delta
        if (sha(bytes(image[at:at + length])) != digest or
                any(at < o + 4 and o < at + length for o in offsets)):
            raise ValueError('An authored stock-copy span changed or holds a relocation: ' + label)
        image[at:at + length] = bytes(length)
        copies.append((at, address, length, bytes.fromhex(digest)))
    low = bytes(image)
    if name in PAGE_RECIPES and (symbols.get('mw_page') != 0 or low[:4] != b'MWPP'):
        raise ValueError('The page record does not head the image.')
    # Subscribe exactly when this base raises the event (base-bound like the lease).
    hooks = []
    if name == 'sidechain-compressor' and 'modwerk_raise_' + MUTE_KEEP['event'] in base_symbols:
        hooks = builder.subscribe([builder.NONE] * len(builder.HANDLERS), [MUTE_KEEP], symbols, registry)
    data = builder.package(low, bss, hooks, offsets, sites=sites, name=name, hashed=True, copies=copies,
                           title=TITLES[name], layout=1, abi=8 if hooks else None)
    policy = dict(schema=1, module=name, feature=UNITS[name][1], revisions=list(REVISIONS),
                  sourceHashes={relative: sha(text.encode()) for relative, text in texts.items()},
                  adaptedSourceSha256=sha(source.read_bytes()), entries=entries)
    return dict(package=data, packageSha256=sha(data), controllerSha256=controller_sha256(data),
                moduleId=builder.module_id(name), imageBytes=len(low),
                bss=bss, sites=len(sites), copies=len(copies), entries=entries, imports=imports, hooks=hooks,
                sourcePolicySha256=sha(json.dumps(policy, sort_keys=True, separators=(',', ':')).encode()),
                policy=policy)


def policy_rows(name, encoded, entries=None):
    """Trust rows for controller_write_policy.c, one per leased entry.

    `entries` defaults to DEFAULT_ENTRIES.
    """
    entries = DEFAULT_ENTRIES[name] if entries is None else tuple(entries)
    feature = UNITS[name][1]
    if not entries or len(set(entries)) != len(entries) or set(entries) - set(encoded['entries']):
        raise ValueError('Trust rows name only the derivative\'s own leased entries.')
    return [dict(module=name, moduleId=encoded['moduleId'], controllerSha256=encoded['controllerSha256'],
                 sourcePolicySha256=encoded['sourcePolicySha256'], revisions=list(REVISIONS),
                 feature=feature, requiredCores=REQUIRED_CORES[feature], version=1,
                 imageBytes=encoded['imageBytes'], entryName=entry, **encoded['entries'][entry])
            for entry in entries]


def policies_c(rows):
    """C initializers for MW_REVIEWED_CONTROLLER_POLICIES, checked like the board does."""
    if not isinstance(rows, list) or len(rows) > POLICY_CAPACITY:
        raise ValueError('Controller trust rows exceed the fixed capacity.')
    seen, text = set(), ''
    for row in rows:
        digest, policy = bytes.fromhex(row['controllerSha256']), bytes.fromhex(row['sourcePolicySha256'])
        key = (digest, row['entry'])
        if (len(digest) != 32 or len(policy) != 32 or not any(digest) or not any(policy) or key in seen or
                row['feature'] not in REQUIRED_CORES or row['requiredCores'] != REQUIRED_CORES[row['feature']] or
                row['version'] != 1 or list(row['revisions']) != list(REVISIONS) or not 0 < row['moduleId'] < 1 << 32 or
                any(type(row[k]) is not int or row[k] & 1 or not 0 <= row[k] < row['imageBytes']
                    for k in ('entry', 'beginReturn', 'endReturn')) or row['beginReturn'] == row['endReturn']):
            raise ValueError('Malformed or duplicate controller trust row.')
        seen.add(key)
        hexes = lambda b: '{' + ','.join('0x%02x' % v for v in b) + '}'
        text += ('    {{%s, %s, 0x%08xu, %du, %du, %du, %du, %du}, %du, %du, %du, %du, %du}, \\\n'
                 % (hexes(digest), hexes(policy), row['moduleId'], *row['revisions'], row['feature'],
                    row['requiredCores'], row['version'], row['imageBytes'], row['entry'], row['beginReturn'], row['endReturn']))
    return text


def main(argv=None):
    parser = argparse.ArgumentParser(description='Encode the reviewed controller packages for one exact base.')
    parser.add_argument('--base-symbols', type=Path, required=True, help='that base build_core symbols.json')
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True, help='new private directory outside Git')
    args = parser.parse_args(argv)
    spec = importlib.util.spec_from_file_location('controller_builder', _ROOT / 'sdk/runtime/loader/build.py')
    builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    symbols = json.loads(args.base_symbols.read_text())
    out = _private.private_directory(args.out)
    if any(out.iterdir()):
        raise ValueError('Use a new empty private output directory.')
    rows, receipt = [], dict(schema=1, baseSymbolsSha256=sha(args.base_symbols.read_bytes()), packages={})
    for name in UNITS:
        encoded = encode(name, _ROOT / 'sdk/octabam', builder, out / (name + '-work'), symbols, args.upstream)
        _private.save(out / (name + '.mwrm'), encoded['package'])
        rows += policy_rows(name, encoded)
        receipt['packages'][name] = {k: v for k, v in encoded.items() if k != 'package'}
    policies_c(rows)
    receipt['rows'] = rows
    _private.save(out / 'controller-policies.json', json.dumps(rows, indent=1).encode())
    _private.save(out / 'receipt.json', json.dumps(receipt, indent=1, sort_keys=True).encode())
    print(json.dumps({name: dict(sha256=v['packageSha256'], sites=v['sites'], imageBytes=v['imageBytes'])
                      for name, v in receipt['packages'].items()}))


if __name__ == '__main__':
    main()
