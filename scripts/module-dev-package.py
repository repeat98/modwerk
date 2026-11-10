#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""A development package (.mwrm) of one Octatrack module, straight from its source, for npm run module:dev.

  python3 -B scripts/module-dev-package.py ID -o OUT.mwrm [--slots both] [--cycles 600] [--cycles-kind modeled] [--state 132]

The module must sit under sdk/octabam/modules/ID while this runs; module:dev stages a draft there and removes it after.
No firmware, no Docker, no catalogue entry. It runs the same package builder the site's packages come from
(sdk/runtime/loader/build.py), unchanged:
- a DSP effect: its DSP package from its source, as dsp_packages.py builds the catalogue's (ELEKLOADER_DSP_ASM), and
  an FX page recipe derived from its manifest as scripts/build-module-packages.py derives a listed module's. A listed
  module's recipe comes from the committed assets; a draft has none, so this derives it. Stepped knobs get their
  stock widget but no label formatter until the module is listed: they show numbers.
- ColdFire code (units, detours, pokes, runtime.json): build.py --octabam, the runtime package of a catalogue module.
The DSP figures are what the base budgets the effect by. The defaults are generous (the most state words, a high cycle
figure); give measured ones as soon as you have them. A development package is for your own unit: never publish it."""
import argparse, importlib.util, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SDK = APP / 'sdk/octabam'
BUILD = APP / 'sdk/runtime/loader/build.py'
PAGE = APP / 'scripts/octatrack-module-page.mjs'
DSP_PACKAGES = APP / 'sdk/machines/octatrack/elekloader/dsp_packages.py'
DEFAULT_ASM = Path.home() / '.cache/modwerk-upstream/octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm'
DEFAULT_UPSTREAM = Path.home() / '.cache/modwerk-upstream/elekloader'

# The effect-record offsets build_bus.py names (P_ID_BYTE ... P_PENABLE_HI) and the stock renderers
# scripts/build-module-packages.py writes for stepped and bipolar knobs: addresses, never stock bytes.
P_ID_BYTE, P_ABBR, P_FULLNAME, P_PARAM_NAMES, P_DEFAULTS = 0x03, 0x04, 0x09, 0x16, 0x5e
P_PENABLE_LO, P_PENABLE_HI = 0x18e, 0x18a
STEPPED_FORMATTER, STEPPED_WIDGET, BIPOLAR_FORMATTER, BIPOLAR_12A = 0x4003c718, 0x40047254, 0x4003c7a0, 0x400328e4
BUILD_TAG = b'79'  # build_bus.BUILD_TAG as the catalogue's source build sets it (BUILD=79)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def penable(active, linked=()):
    """build_bus.penable: one nibble per knob, bit 0 draws it, bit 1 draws the link to its left neighbour."""
    lo = hi = 0
    for i in active:
        bits = 3 if i in linked else 1
        if i < 8:
            lo |= bits << (4 * i)
        else:
            hi |= bits << (4 * (i - 8))
    return lo, hi


def draft_page(m, Formatter):
    """The FX page recipe of a module the committed assets do not know yet, as scripts/build-module-packages.py derives a
    listed one's (integers and strings over its donor descriptor), without label formatters. (page, notes)."""
    if m.menu.stock_dsp:
        raise ValueError(m.name + ' replaces a stock effect in place; its page needs the base, not a development package.')
    donor = m.menu.donor_desc + 0x38
    known = json.loads((APP / 'src/engine/assets/descriptor-recipes.json').read_text())['recipes']
    guard = next((row for row in known if row['donorAddress'] == donor), None)
    if not guard:
        raise ValueError('%s clones the stock descriptor at %#x, which no listed effect clones: its guard needs a local check '
                         'against your OS first (scripts/build-module-packages.py, descriptor_guards).' % (m.name, m.menu.donor_desc))
    integers, strings, notes = [], [], []
    integer = lambda offset, width, value: integers.append({'offset': offset, 'width': width, 'value': value})
    string = lambda offset, width, value: strings.append({'offset': offset, 'width': width, 'value': value.decode('latin1')})
    integer(P_ID_BYTE, 1, m.menu.fx2_id)
    string(P_ABBR, 5, m.menu.abbr)
    string(P_FULLNAME, 13, m.menu.fullname + (BUILD_TAG if m.menu.build_tag else b''))
    for slot, param in enumerate(m.params):
        if param.name is not None: string(P_PARAM_NAMES + slot * 6, 6, param.name)
        if param.default is not None: integer(P_DEFAULTS + slot, 1, param.default)
    plain = tuple(i for i, p in enumerate(m.params) if p.formatter is Formatter.PLAIN and p.active is not False)
    for slot in (range(12) if m.stepped_slots else plain):
        integer(0xca + slot * 4, 4, 0); integer(0xfa + slot * 4, 4, 0)
    for slot in m.stepped_slots:
        count = m.params[slot].count
        integer(0xca + slot * 4, 4, STEPPED_FORMATTER); integer(0xfa + slot * 4, 4, STEPPED_WIDGET if count is not None and count <= 5 else 0)
        integer(0x12a + slot * 4, 4, 0)
    for slot in m.bipolar_slots:
        integer(0xca + slot * 4, 4, BIPOLAR_FORMATTER); integer(0xfa + slot * 4, 4, 0); integer(0x12a + slot * 4, 4, BIPOLAR_12A)
    for slot, param in enumerate(m.params):
        if param.count is not None: integer(0x9a + slot * 4, 4, param.count); integer(0x6a + slot * 4, 4, 0)
    for slot, param in enumerate(m.params):
        for offset, value in ((0xca, param.formatter_word), (0xfa, param.widget_word), (0x12a, param.word_12a)):
            if isinstance(value, int): integer(offset + slot * 4, 4, value)
            elif value is not None: notes.append('knob %d draws with a unit renderer (%s), which needs the listed module\'s page' % (slot, value[1]))
    lo, hi = penable(m.active_params, m.linked_params)
    integer(P_PENABLE_LO, 4, lo); integer(P_PENABLE_HI, 4, hi)
    if m.stepped_slots:
        notes.append('stepped knobs %s show numbers, not their labels, until the module is listed' % ', '.join(map(str, m.stepped_slots)))
    return dict(id=m.name, donor=donor, donorSha256=guard['donorSha256'], inheritedEnable=list(m.inherited_enable),
                integers=integers, strings=strings, formatters=[]), notes


def pack_page(build, page):
    """The bytes build.page_section makes of a page recipe (scripts/module-dev.test.mjs checks the two agree)."""
    import struct
    inherited = sum(1 << slot for slot in page['inheritedEnable'])
    head = build.PAGE_MAGIC + struct.pack('>I', page['donor']) + bytes.fromhex(page['donorSha256']) + struct.pack(
        '>HBBBBHI', inherited, len(page['integers']), len(page['strings']), len(page['formatters']), 0, 0, 0)
    body = b''.join(struct.pack('>HBBI', f['offset'], f['width'], 0, f['value']) for f in page['integers'])
    for f in page['strings']:
        text = f['value'].encode('latin-1')
        entry = struct.pack('>HBB', f['offset'], f['width'], len(text)) + text
        body += entry + b'\0' * (-len(entry) % 4)
    entries, at = [], len(head) + len(body)
    for f in page['formatters']:
        entries.append(struct.pack('>BBBBIHH', f['slot'], len(f['fixups']), int(f['clearWidget']), f.get('wideMaximum') or 0, 0, len(f['code']) // 2, 0) +
                       struct.pack('>%dH' % len(f['fixups']), *f['fixups']))
        entries[-1] += b'\0' * (-len(entries[-1]) % 4)
    image, relocations = bytearray(head + body + b''.join(entries)), []
    for f, entry_at in zip(page['formatters'], [at + sum(len(e) for e in entries[:i]) for i in range(len(entries))]):
        code = bytes.fromhex(f['code'])
        struct.pack_into('>I', image, entry_at + 4, len(image))
        relocations.append(entry_at + 4)
        relocations += [len(image) + r for r in f['relocations']]
        image += code + b'\0' * (-len(code) % 4)
    return bytes(image), sorted(relocations)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id')
    ap.add_argument('-o', '--output', type=Path, required=True)
    ap.add_argument('--upstream', type=Path, default=Path(os.environ.get('ELEKLOADER_UPSTREAM', DEFAULT_UPSTREAM)))
    ap.add_argument('--slots', help='fx1, fx2 or both (default: its published package\'s, else both)')
    ap.add_argument('--cycles', type=int, help='worst-case DSP cycles per sample and instance (default: published, else 600)')
    ap.add_argument('--cycles-kind', help='executed, modeled or hardware (default: published, else modeled)')
    ap.add_argument('--state', type=int, help='r7 state words per instance (default: published, else the most the base allows)')
    ap.add_argument('--buffer', type=int, help='Y words of the slot buffer the effect reads (default: published, else 0)')
    ap.add_argument('--check-page', metavar='LISTED_ID', help='test only: print whether pack_page matches build.page_section for a listed effect')
    a = ap.parse_args()
    os.environ.setdefault('ELEKLOADER_DSP_ASM', str(DEFAULT_ASM))
    os.environ.setdefault('ELEKLOADER_UPSTREAM', str(a.upstream))
    build = load('modwerk_build', BUILD)
    if a.check_page:  # the packing against build.py, and the derived recipe against the committed one (formatters aside)
        page = json.loads(subprocess.run(['node', str(PAGE), a.check_page], capture_output=True, text=True, check=True).stdout)
        dsp_packages = load('modwerk_dsp_packages', DSP_PACKAGES)
        m = dsp_packages.Octabam(str(SDK)).modules[a.check_page]
        derived, _ = draft_page(m, sys.modules['remix.schema'].Formatter)
        same = lambda key: sorted(map(json.dumps, derived[key])) == sorted(map(json.dumps, page[key]))
        print('packing ' + ('identical' if pack_page(build, page) == build.page_section(a.check_page) else 'differs'),
              'recipe ' + ('identical' if all(map(same, ('integers', 'strings'))) and derived['donor'] == page['donor'] else 'differs'))
        return
    folder = SDK / 'modules' / a.id
    if not (folder / 'manifest.py').exists():
        sys.exit('No module %s under sdk/octabam/modules (npm run module:dev stages a draft there for you).' % a.id)
    document = json.loads((folder / 'octamod.module.json').read_text())
    dsp_packages = load('modwerk_dsp_packages', DSP_PACKAGES)  # also points Python at Elekloader's Octabam reader
    ob = dsp_packages.Octabam(str(SDK))
    if a.id not in ob.modules:
        sys.exit('%s does not load as an Octabam module: %s' % (a.id, ob.broken.get(a.id, 'unknown reason')))
    m = ob.modules[a.id]
    Formatter = sys.modules['remix.schema'].Formatter  # the manifest's own schema, loaded by the reader
    coldfire = bool(m.linked or m.detours or m.pokes)
    # A listed module builds as the site's package does (sdk/machines/octatrack/elekloader/module_packages.py): its published
    # figures, its committed page recipe. A draft gets generous figures and the page derived from its manifest.
    published = next((row for row in json.loads((APP / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
                      if row['id'] == a.id), {})
    slots = a.slots or published.get('slots') or 'both'
    cycles = a.cycles or published.get('cycles') or 600
    kind = a.cycles_kind or published.get('cyclesKind') or 'modeled'
    state = a.state or published.get('state') or build.STATE_WORDS
    buffer = a.buffer if a.buffer is not None else published.get('buffer') or 0
    special = [key for key in ('standalone', 'machine', 'tables', 'base', 'requiresFeatures', 'sources') if published.get(key)]
    if special:
        print('Note: the site builds %s\'s package with its reviewed %s path (npm run octatrack:module-packages); this is its plain '
              'runtime package, which can differ.' % (a.id, '/'.join(special)))
    listed_page = any(row['id'] == a.id for row in json.loads((APP / 'src/engine/assets/descriptor-recipes.json').read_text())['recipes'])
    # build.py names a listed module from the catalogue's documents; a draft is not in them yet.
    documented = any(row.get('id') == a.id for row in json.loads((APP / 'src/catalog/module-documents.json').read_text()).get('modules', []))
    args = [str(BUILD), '-o', str(a.output)] + ([] if documented else ['--name', document['name'][:15]])
    if coldfire:
        missing = [tool for tool in ('as', 'ld', 'readelf', 'objcopy', 'nm') if not shutil.which('m68k-elf-' + tool)]
        if missing:
            sys.exit('ColdFire code needs m68k-elf binutils on PATH; missing: ' + ', '.join('m68k-elf-' + t for t in missing) +
                     ' (docs/ADD_A_MODULE.md, The fast loop).')
        if not (a.upstream / 'elekloader').is_dir():
            sys.exit('No Elekloader checkout at %s: run npm run upstream:tools, or give --upstream.' % a.upstream)
        args += ['--octabam', a.id, '--upstream', str(a.upstream)] + (['--pinned'] if published.get('pinned') else [])
    with tempfile.TemporaryDirectory(prefix='modwerk-dev.') as work:
        if m.dsp:
            if not Path(os.environ['ELEKLOADER_DSP_ASM']).exists():
                sys.exit('No DSP assembler at %s. Build it once in the octabam checkout `npm run upstream:tools` keeps '
                         '(make setup), or set ELEKLOADER_DSP_ASM.' % os.environ['ELEKLOADER_DSP_ASM'])
            package = dsp_packages.package(ob, a.id, document['version'], work)
            packages = Path(work) / 'dsp-packages.json'
            packages.write_text(json.dumps(dict(packages=[package])))
            args += ['--dsp', '%s:%s' % (packages, a.id), '--slots', slots, '--cycles', str(cycles),
                     '--cycles-kind', kind, '--state', str(state), '--buffer', str(buffer)]
            if not listed_page:
                page, notes = draft_page(m, Formatter)
                committed = build.page_section
                build.page_section = lambda module_id: pack_page(build, page) if module_id == a.id else committed(module_id)
                for note in notes:
                    print('Page: ' + note)
            print('DSP: %d words; budgeted as %d %s cycles and %d state words in %s%s.' % (
                package['words'], cycles, kind, state, slots, '' if published else '. Measure, then give --cycles and --state'))
        elif not coldfire:
            sys.exit('%s has neither DSP code nor ColdFire units: nothing to build.' % a.id)
        sys.argv = args
        build.main()


if __name__ == '__main__':
    try:
        main()
    except ValueError as refusal:  # the builders refuse with a sentence that names what the package cannot carry
        sys.exit(str(refusal))
