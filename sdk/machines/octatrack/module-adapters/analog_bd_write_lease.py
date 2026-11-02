# SPDX-License-Identifier: GPL-3.0-or-later
"""Private strong AB write-lease emitter; no production authority by itself.

The AB renderer's control-record writes go inside one board write lease of the
reviewed ABI (`stock_hook_write_lease.h`, MW_CONTROLLER_WRITE_ANALOG_BD). The
two lease functions stay undefined, strong imports: a native fixture may bind
explicit test functions, an encoded package only the exact base's exports.
Unsigned tracks still reach the stock renderer before any lease. The stock
frame builder resets the cursor to each track's fixed slot and ignores the
renderer's result, so a refused lease renders that frame's slot silent.
"""
from pathlib import Path
import hashlib
import subprocess
from dataclasses import replace

HEADER = Path(__file__).with_name('stock_hook_write_lease.h')
HEADER_SHA256 = 'ab14679a5faae84ef47d1ca37e46b3171da45252d12310e0b4458228be8334be'
CONTROLLER_ADAPTER_SHA256 = 'b9c0e0f96632a0d0ab5283387edaae1b604e4e82e27e26b3fdc1666867d31daf'
IMPORTS = ('modwerk_controller_write_begin', 'modwerk_controller_write_end')


def source(original):
    import analog_bd_runtime
    if hashlib.sha256(Path(analog_bd_runtime.__file__).read_bytes()).hexdigest() != CONTROLLER_ADAPTER_SHA256:
        raise ValueError('Reviewed AB descriptor adapter changed before lease emission.')
    if hashlib.sha256(HEADER.read_bytes()).hexdigest() != HEADER_SHA256:
        raise ValueError('Reviewed controller write-lease ABI changed.')
    text = analog_bd_runtime.control_source(original)
    seams = (
        ('#include "engine.h"', '''#include "engine.h"
#include "stock_hook_write_lease.h"
/* One End call site: the backend binds exactly one reviewed End return PC,
 * and GCC otherwise duplicates the tail call into each render branch. */
static int __attribute__((noinline)) ab_lease_end(struct mw_controller_write_lease *lease)
{ return modwerk_controller_write_end(lease)==1 ? 0 : -1; }'''),
        ('    ++ab_render_calls;', '''    struct mw_controller_write_lease lease;
    /* Without an owned lease the frame still needs this track's record: the
     * stock silent source (kinds 5..7) writes an empty header and zero samples
     * at the track's cursor, never an AB signature or borrowed Part bytes.
     * The frame's first call (before the event offset) writes no control
     * record, only that reservation: it goes there at once, so a frame takes
     * one lease, not two (each Begin/End proves the owner through uncached
     * reads; two a frame cost the ColdFire about 20 points, 22 Oct 2026). The
     * second call writes the record at the packer's fixed slot either way. */
    if(end!=16)
        return ((int (*)(unsigned,unsigned,unsigned,unsigned))0x400047f0u)(track,ping,start,end);
    if(modwerk_controller_write_begin((uintptr_t)ab_render,
        MW_CONTROLLER_WRITE_ANALOG_BD,&lease)!=1)
        return ((int (*)(unsigned,unsigned,unsigned,unsigned))0x400047f0u)(track,ping,start,end);
    ++ab_render_calls;'''),
        ('        U32(0x80001c80u)=(uint32_t)(uintptr_t)(cursor+4+2*n);\n        return 0;',
         '''        U32(0x80001c80u)=(uint32_t)(uintptr_t)(cursor+4+2*n);
        /* No stock call, wait, redraw or notification occurs within this
         * bounded producer span. Never replay writes after a failed End. */
        return ab_lease_end(&lease);'''),
    )
    for before, after in seams:
        if text.count(before) != 1:
            raise ValueError('Reviewed AB write span changed.')
        text = text.replace(before, after)
    return text


def port(module, sdk_root, work, cross='m68k-elf-'):
    import analog_bd_runtime
    sdk = Path(sdk_root).resolve();folder = Path(work).resolve();folder.mkdir(parents=True, exist_ok=True)
    # First require the unchanged imported units; this explicit source variant
    # cannot accept an already adapted, duplicate or foreign controller unit.
    analog_bd_runtime.port(module, sdk, folder / 'descriptor-proof', cross=cross)
    control, assembly = folder / 'analog-bd-lease-control.c', folder / 'analog-bd-lease-control.s'
    upstream = sdk / 'modules/analog-bassdrum'
    control.write_text(source((upstream / 'control.c').read_text()))
    from machine_composition import FLAGS
    subprocess.run([cross + 'gcc', *FLAGS, '-I', str(upstream), '-I', str(HEADER.parent), '-S', str(control), '-o', str(assembly)],
                   check=True, capture_output=True)
    return replace(module, linked=tuple(replace(u, source=str(assembly), dram=True, cave_addr=None)
                                        if u.label == 'abcontrol' else u for u in module.linked))
