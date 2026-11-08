# SPDX-License-Identifier: MIT
"""Guarded machine composition for runtime packages, including VECTOR + FM without POLY.

The catalogue sources stay exact. The internal bridge borrows the MIT shared
controller by Sam Banks / repeat98, adapts only its participant policy, and
builds into the caller's private work directory. It is not a POLY machine.
Apply before the FM runtime adapter. Package, inventory, retirement and hardware
qualification remain the caller's obligations.
"""
from dataclasses import replace
from pathlib import Path
import hashlib
import importlib
import subprocess
import sys

SDK = Path(__file__).resolve().parents[3] / 'octabam'
PINS = {
    'modules/poly8/manifest.py': 'f8759dbcbb246b247c195e61f0c0464fd0cdc0dd40b68dd8f74c03b46c584afc',
    'modules/poly8/shared-machine.c': '74dd81c5f3bd1bf3474350989655ea76f5e1b52e7919fa8b11b2e1423e79317c',
    'modules/poly8/shared-machine-hooks.s': '30701d6e4c3c556bd570a7fd2388679f6cf31021d8b8f056665f522bb976426a',
    'modules/poly8/composition.json': 'f8e29f63314e979e23e1cedf080ac0bb9a14be7a4b188230606ea81fc1a5e538',
}
COMMON = frozenset(('mr_resolve_pb', 'mr_validate_hook', 'mr_pool_title', 'mr_list_draw', 'mr_pool_open',
                    'mr_machine_name', 'mr_src_names', 'mr_name_a', 'mr_name_b', 'mr_setup_row',
                    'mr_chooser_row', 'mr_setup_open', 'mr_tick_hook', 'mr_chooser_open', 'mr_main_commit',
                    'mr_src_commit', 'mr_src_commit2', 'mr_setup_edit6', 'mr_setup_draw6'))
FLAGS = ('-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin', '-fno-common',
         '-fno-jump-tables', '-fno-optimize-sibling-calls', '-fno-asynchronous-unwind-tables', '-fno-ident', '-fomit-frame-pointer',
         '-fno-zero-initialized-in-bss', '-Wall', '-Wextra', '-Werror')


def _read(sdk, name):
    text = (sdk / name).read_text()
    if hashlib.sha256(text.encode()).hexdigest() != PINS[name]:
        raise ValueError('Reviewed shared machine source changed: ' + name)
    return text


def _once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Shared machine adapter seam changed: ' + old.splitlines()[0])
    return text.replace(old, new)


def controller_source(sdk=SDK, include_poly=False):
    """The exact controller with POLY/AB absent, preserving unknown saved signatures."""
    text = _read(Path(sdk), 'modules/poly8/shared-machine.c')
    text = _once(text, 'U32(0x400d5f4cu)=page;', '(void)page; /* Runtime groups keep their descriptor pointers in private data. */')
    if include_poly:
        return text
    declarations = '''extern unsigned pm_type(unsigned,const Part *),pm_chooser_type(unsigned,const Part *);
extern unsigned pm_assign(Part *,unsigned,unsigned),pm_selected(void);
extern void pm_ui_tick(void),pm_clear_extensions(unsigned),pm_pool_choice_open(void),pm_stock_pool_open(void);
extern void pm_pool_left(unsigned,unsigned),pm_pool_right(unsigned,unsigned);'''
    # Unreachable POLY branches retain their source shape, with safe no-op
    # helpers rather than any POLY engine, state, hooks or chooser row.
    helpers = '''static inline unsigned pm_chooser_type(unsigned type,const Part *ptr) { (void)ptr;return type; }
static inline unsigned pm_assign(Part *part,unsigned track,unsigned on) { (void)on;return part[0x22+track]; }
static inline void pm_ui_tick(void) {}
static inline void pm_clear_extensions(unsigned track) { (void)track; }
static inline void pm_pool_choice_open(void) {}
static inline void pm_pool_left(unsigned key,unsigned edge) { (void)key;(void)edge; }
extern void bridge_stock_pool_open(void),bridge_stock_list_draw(void);
#define pm_stock_pool_open bridge_stock_pool_open
#define pm_lipm_draw bridge_stock_list_draw'''
    text = _once(text, declarations, helpers)
    text = _once(text, 'return kind==POLY || (kind==AB && ab_type) || (kind==VECTOR && st_type) || (kind==FM && fm_type);',
                 'return (kind==VECTOR && st_type) || (kind==FM && fm_type);')
    text = _once(text, "if(s[0]=='P' && s[1]=='L' && s[2]==1) return POLY;", "if(s[0]=='P' && s[1]=='L' && s[2]==1) return STOCK;")
    text = _once(text, "if(s[0]=='A' && s[1]=='B' && s[2]==1) return AB;", "if(s[0]=='A' && s[1]=='B' && s[2]==1) return STOCK;")
    text = _once(text, "if(s[0]=='S' && s[1]=='2' && (s[2]==1 || s[2]==2)) return VECTOR;", "if(s[0]=='S' && s[1]=='2' && (s[2]==1 || s[2]==2)) return present(VECTOR)?VECTOR:STOCK;")
    text = _once(text, "if(s[0]=='F' && s[1]=='M' && s[2]==1) return FM;", "if(s[0]=='F' && s[1]=='M' && s[2]==1) return present(FM)?FM:STOCK;")
    text = _once(text, 'mr_pb_table[mr_row(POLY)]=0x400d31aeu;', '/* No absent participant writes row zero. */')
    return text


def hook_source(sdk=SDK, include_poly=False):
    """Only common chooser hooks; no POLY keyboard, voice, rate or stop hooks."""
    text = _read(Path(sdk), 'modules/poly8/shared-machine-hooks.s')
    text = _once(text, '.long 0x400b3eac,0x400b3e98,0x400b7c67,0x400b5413,0x400b7a63', '.space 20')
    if include_poly:
        return text
    prefix, suffix = text.split('| Dispatch the overlapping audio/key sites without altering the entry ABI.', 1)
    names = suffix[suffix.index('| Authored bounded name table'):]
    for old, new in (('pm_main_replay', 'bridge_main_replay'), ('pm_edit_replay', 'bridge_edit_replay'),
                     ('pm_draw_replay', 'bridge_draw_replay'), ('pm_stock_pool_open', 'bridge_stock_pool_open')):
        prefix = prefix.replace(old, new)
    # The fallback routines are the common stock passthroughs, with the same
    # caller ABI as the authored VECTOR routines. No firmware bytes copied.
    return prefix + names + '''
        .text
        .global bridge_stock_pool_open,bridge_stock_list_draw
bridge_stock_pool_open:
        .space 8
        jmp 0x400791ec
bridge_stock_list_draw:
        lea -24(%sp),%sp
        movem.l %d2-%d3/%a2-%a5,(%sp)
        jmp 0x4006d78c
        .balign 4
        .global bridge_main_replay,bridge_edit_replay,bridge_draw_replay
bridge_main_replay:
        .space 6
        jmp 0x40079822
bridge_edit_replay:
        .space 8
        jmp 0x4003a536
bridge_draw_replay:
        .space 8
        jmp 0x4003cda0
'''


def effective_modules(selected, sdk_root=None, work=None, cross='m68k-elf-'):
    """Return reviewed runtime modules with one common site owner and private descriptors.

    `work` owns the returned private source files and must outlive assembly.
    No package or extra user-visible member is added by this adapter.
    """
    selected = list(selected)
    names = {m.name for m in selected}
    sdk = Path(sdk_root or SDK).resolve()
    sys.path.insert(0, str(sdk / 'tools'))
    policy = importlib.import_module('remix.machine_composition')
    if 'analog-bassdrum' in names and ('poly8' in names or names.intersection(('vector', 'synth'))):
        raise ValueError('Runtime machine composition does not include an Analog BD DSP source port.')
    if 'poly8' in names:
        _read(sdk, 'modules/poly8/manifest.py')
        _read(sdk, 'modules/poly8/composition.json')
        if work is None:
            raise ValueError('Runtime machine composition needs a private source work directory.')
        from remix.schema import StockCopy
        from remix.stock_guard import stock_guard
        from vector_runtime import port
        folder = Path(work).resolve();folder.mkdir(parents=True, exist_ok=True)
        source, compiled, asm = folder / 'shared-runtime-controller.c', folder / 'shared-runtime-controller.s', folder / 'shared-runtime-bridge.s'
        source.write_text(controller_source(sdk, include_poly=True))
        subprocess.run([cross + 'gcc', *FLAGS, '-S', str(source), '-o', str(compiled)], check=True, capture_output=True)
        asm.write_text(compiled.read_text() + '\n#APP\n' + hook_source(sdk, include_poly=True))
        copy = StockCopy('mr_src_names', stock_guard(0x400a78c8, 20, '96966986164a24f9ca5be84cca807a016a828da2bcc3167b831be52acad2a9a7'))
        result = []
        for module in policy.effective_modules(selected):
            if module.name == 'poly8':
                module = replace(module, linked=tuple(replace(u, source=str(asm), stock_copies=u.stock_copies + (copy,)) if u.label == 'machine_registry' else u for u in module.linked))
            if module.name == 'vector':
                module = port(module, sdk, folder / 'vector')
            result.append(module)
        return result
    if not names.intersection(('vector', 'synth')):
        return policy.effective_modules(selected)
    if work is None:
        raise ValueError('Runtime machine composition needs a private source work directory.')
    _read(sdk, 'modules/poly8/composition.json')
    from remix import registry
    from remix.schema import Linked, StockCopy
    _read(sdk, 'modules/poly8/manifest.py')
    template = registry._load_one(sdk / 'modules/poly8/manifest.py')
    # FM bundles the exact reviewed Quantizer. Let the supplied-signature
    # policy normalize a redundant selection and reject any changed layout;
    # do not apply POLY-only replacement rules to other companion modules.
    bundled_quantizer = 'synth' in names and 'quantizer' in names
    composed = policy.effective_modules([template, *[m for m in selected if m.name in ('vector', 'synth') or
                                                    (bundled_quantizer and m.name == 'quantizer')]])
    participants = [m for m in composed if m.name != 'poly8']
    # No POLY keyboard bridge replaces FM's octave-number hook. Keep it.
    if 'synth' in names:
        original_fm = next(m for m in selected if m.name == 'synth')
        octave = tuple(d for d in original_fm.detours if d.site == 0x400449be)
        if len(octave) != 1:
            raise ValueError('FM octave-number declaration changed.')
        participants = [replace(m, detours=m.detours + octave) if m.name == 'synth' else m for m in participants]
    # Other modules never inherit POLY-only deduplication in this bridge.
    participants += [m for m in selected if m.name not in ('vector', 'synth') and
                    not (bundled_quantizer and m.name == 'quantizer')]
    folder = Path(work).resolve();folder.mkdir(parents=True, exist_ok=True)
    source, compiled, asm = folder / 'vector-fm-controller.c', folder / 'vector-fm-controller.s', folder / 'vector-fm-bridge.s'
    source.write_text(controller_source(sdk))
    subprocess.run([cross + 'gcc', *FLAGS, '-S', str(source), '-o', str(compiled)], check=True, capture_output=True)
    asm.write_text(compiled.read_text() + '\n#APP\n' + hook_source(sdk))
    copies = {c.symbol: c.span for u in template.linked for c in u.stock_copies}
    stock_copies = tuple(StockCopy('bridge_' + name + '_replay', copies['pm_' + name + '_replay']) for name in ('main', 'edit', 'draw'))
    pool = next(d.expect for d in template.detours if d.symbol == 'mr_pool_open')
    stock_copies += (StockCopy('bridge_stock_pool_open', pool),)
    # First five stock names, hash/length found in the user's 1.40C and never
    # carried by the package. The loader fills this table from running stock.
    from remix.stock_guard import stock_guard
    stock_copies += (StockCopy('mr_src_names', stock_guard(0x400a78c8, 20,
                          '96966986164a24f9ca5be84cca807a016a828da2bcc3167b831be52acad2a9a7')),)
    count = 5 + len(names.intersection(('vector', 'synth')))
    bridge = replace(template, name='machine-bridge', key='RUNTIME_MACHINE_BRIDGE',
                     doc='Internal VECTOR/FM chooser and private parameter-page owner; no POLY engine or member.',
                     linked=(Linked('machine_registry', str(asm), cpu='5475', dram=True, stock_copies=stock_copies),),
                     detours=tuple(d for d in template.detours if d.unit == 'machine_registry' and d.symbol in COMMON),
                     symbol_refs=tuple(r for r in template.symbol_refs if r.symbol in ('mr_pb_table', 'mr_source_render', 'mr_choice_left', 'mr_pool_left', 'mr_pool_right', 'mr_chooser_name')),
                     pokes=tuple(replace(p, write=p.write[:-1] + bytes([count if len(p.write) == 4 else count - 1]))
                                 for p in template.pokes if p.addr in policy.POLICY['countSites']))
    from vector_runtime import port
    participants = [port(m, sdk, folder / 'vector') if m.name == 'vector' else m for m in participants]
    return [bridge, *participants]
