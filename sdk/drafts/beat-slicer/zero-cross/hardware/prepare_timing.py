# SPDX-License-Identifier: MIT
"""Prepare a separate private measurement base; never boots, flashes or releases."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = 'sdk/machines/octatrack/module-adapters/sample_editor_board.c'
DEV = 'sdk/machines/octatrack/elekloader/dev.c'
PREIMAGES = {BOARD: '11f0874b47ff792fa236fd7799e1ceab57763da777bab927b013920eacbc2c17',
             DEV: 'd272d09ae9a86ed7547901166afdb95e67fee74975af0dcd98b5428fdb91f5be'}

TIMING = '''/* Private hardware measurement overlay, not release code.
 * DTCN3 is the existing free-running 132 MHz timer; subtraction wraps modulo
 * 2^32 (each measured span must be below 32.5 seconds). No clock programming.
 * The sampling overhead is included in observed behavior; no printf/USB here.
 */
#include <stddef.h>
/* Host readers use these target-compiled offsets, never their host ABI. */
const uint32_t mw_sample_test_offsets[5]={
    offsetof(struct mw_sample_editor,serial),offsetof(struct mw_sample_editor,state),
    offsetof(struct mw_sample_editor,completion),
    offsetof(struct mw_sample_editor,snap)+offsetof(struct mw_sample_snap,reads),
    sizeof(struct mw_sample_editor)};
struct mw_sample_measurement {
    volatile uint32_t sequence,spans,last,maximum,total_low,total_high;
};
struct mw_sample_measurement mw_sample_scan_cost,mw_sample_writer_cost;
static uint32_t writer_at;
static void measurement_add(struct mw_sample_measurement *m,uint32_t elapsed)
{
    ++m->sequence;
    ++m->spans;m->last=elapsed;if(elapsed>m->maximum)m->maximum=elapsed;
    uint32_t old=m->total_low;m->total_low=old+elapsed;
    if(m->total_low<old)++m->total_high;
    ++m->sequence;
}
'''


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Measurement seam changed: ' + before[:80])
    return text.replace(before, after)


def overlay(root):
    root = Path(root)
    for name, expected in PREIMAGES.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError('Re-review measurement source preimage: ' + name)
    board = (root / BOARD).read_text()
    seam = 'static uint32_t lock(void *unused){(void)unused;return modwerk_machine_lock();}\nstatic void unlock(void *unused,uint32_t sr){(void)unused;modwerk_machine_unlock(sr);}'
    replacement = TIMING + '''static uint32_t lock(void *unused)
{
    (void)unused;uint32_t saved=modwerk_machine_lock();
    writer_at=READ(0xfc07c00cu);return saved;
}
static void unlock(void *unused,uint32_t sr)
{
    (void)unused;
    measurement_add(&mw_sample_writer_cost,READ(0xfc07c00cu)-writer_at);
    modwerk_machine_unlock(sr);
}'''
    board = replace_once(board, seam, replacement)
    board = replace_once(board,
        '        unsigned why=mw_sample_editor_analyze_step(&mw_sample_editor);',
        '''        uint32_t scan_at=READ(0xfc07c00cu);
        unsigned why=mw_sample_editor_analyze_step(&mw_sample_editor);
        uint32_t scan_elapsed=READ(0xfc07c00cu)-scan_at;
        uint32_t cost_saved=modwerk_machine_lock();
        measurement_add(&mw_sample_scan_cost,scan_elapsed);
        modwerk_machine_unlock(cost_saved);''')
    (root / BOARD).write_text(board)
    dev = (root / DEV).read_text()
    # MEM remains read-only. Only the exact two sample-settings arrays are
    # additionally readable; no arbitrary battery RAM or new write command.
    dev = replace_once(dev, '    static const uint32_t spans[4][2] =',
        '''    if (n && at + n > at &&
        ((at >= 0x100b14f0u && at + n <= 0x100b14f0u + 136u * 1096u) ||
         (at >= 0x100d5b30u && at + n <= 0x100d5b30u + 128u * 1096u)))return 1;
    static const uint32_t spans[4][2] =''')
    (root / DEV).write_text(dev)
    receipt = {'scope': 'Separate private measurement overlay; not release code or hardware evidence',
               'timerHz': 132000000, 'perSpanMaximumSeconds': (2 ** 32) / 132000000,
               'counters': ['mw_sample_scan_cost', 'mw_sample_writer_cost'],
               'preimages': PREIMAGES,
               'postimages': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in PREIMAGES},
               'source': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               'deviceOperations': 'none'}
    (root / 'private-snap-measurement.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('snap_prepare', HERE.parent / 'prepare_base.py')
    stage = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(stage)
    stage.prepare(args.source, args.output, full=True)
    print(json.dumps(overlay(args.output), indent=2))
