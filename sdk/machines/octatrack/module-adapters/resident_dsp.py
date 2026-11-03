#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Private resident stock-DSP hooks; this does not admit a runtime package.

Permanent two-word branch stubs preserve registers and CCR on their dormant path.
The frame receiver may change only their fixed address operands. COMPRESSOR's
normalized proc prefix, rather than its former stock address, calls the SC stub.
The caller must retain controller ownership until both required core ACKs and
must initialize the declared state before activating a dormant engine.
No stock words, assembled images or coefficient records are saved by this file.
"""
import hashlib
import json
from pathlib import Path
import re
import sys

SIDECHAIN, MATRIX, ANALOG_BD, KEYBUS = 1, 2, 4, 8
FEATURES = (SIDECHAIN, MATRIX, ANALOG_BD, KEYBUS)
# Features whose engine and initial words are their controller's package's (ABI 10, dsp-sites.json "packaged"): the
# base keeps only their stubs, base words and regions, so their DSP changes ship as packages. Always on demand.
PACKAGED = ANALOG_BD
SITES = Path(__file__).resolve().parents[1] / 'dsp-sites.json'
NAMES = {SIDECHAIN: 'sidechain', MATRIX: 'matrix', ANALOG_BD: 'analog-bd', KEYBUS: 'keybus'}
ENGINE_ORIGINS = (0x100000, 0x200000)  # long forms only: every relocated word is a whole address or displacement
ENGINE_PROOFS = (0x1000, 0x1333, 0x17ff, 0x1c01)
ALLOWED = {'A': SIDECHAIN | MATRIX | ANALOG_BD | KEYBUS, 'B': SIDECHAIN | ANALOG_BD | KEYBUS}
SOURCES = {
    'modules/sidechain-compressor/manifest.py': '62f004df8eb3e727da05430b18785142f6f3de6c1418b42de49b9073d6f17e44',
    'modules/sidechain-compressor/patch_sc_dsp3.asm': '11022dbd84e1fffa71946aa19e8d8f0a51b1f25371c5b6b794066c855012ddf8',
    'modules/sidechain-compressor/sc_tables.py': 'cf4bba489c652fca75021f9d81a8aa8ecf0247ce6edc36b01420903c74324054',
    'modules/sidechain-compressor/sc_keyfilt.py': '8e68216a2ec8ec366c686fd7d6ab0690776b66065de58ab2aa807a5e88438edb',
    'modules/output-matrix/manifest.py': '65d1ae009dc1c956ce2036181667434e31b361179ca138e5c8f1091227b55619',
    'modules/output-matrix/matrix_mix.asm': '8f58596d8bd23bf50651d4288745c187ace9e6f9e0efffd34dcdad627b89476e',
}


# Reviewed changes to a pinned module DSP source, applied to the resident engine only (the permanent block and the
# on-demand units alike); the module's own octabam build keeps the author's text. module -> (the pinned source's
# SHA-256, ((exact old text, exact new text), ...), the changed text's SHA-256, per-core values of the new markers).
# Each old text must occur exactly once; any drift stops the build.
#
# Sidechain Compressor, key phase (owner-approved 15 Oct 2026). Upstream seeds each core's generation counter (GCNT)
# to 0 at that core's own first block; scdet reads a foreign key two generations behind its OWN counter. Native
# octabam boots both cores together, so the counters agree and the key is always two blocks late. The base enables
# core 0 a tick or more before core 1, so the counters differed by a random number of blocks per enable: the key
# lagged 1 to 4 blocks, and at 4 the reader read the slot the writer was filling. Here a core that is not yet seeded
# adopts the OTHER core's counter: provisionally at its local track 0 (its first publishes then never land in the
# slot the other core reads that block) and for good at its local track 2, half a frame from the other core's own
# advance at its local track 0, so a skew of under two track slots between the cores cannot change the result.
# Both counters then agree as on a native boot, on every enable and in either order. Reading the writer's counter
# at each read instead (XBUS's "rotation read" defect) races the writer's advance every block when the reader is
# on its core's first track: the key then jumps between two and three blocks late (sdk/tests/test_resident_engines.py).
#
# MON: 0.1.x's scdet set MON_ON[track] on every block it ran with MON on and only scdet cleared it, so a COMPRESSOR
# taken off a track with MON on left moncommit replaying its last key stash; two changes here made moncommit consume
# MON_ON. Since 0.2.0 the source does that itself (MON_ON is a per-block arm that moncommit consumes, with a 64-sample
# crossfade), so only the key-phase change remains.
_SC_KEY_PHASE = (
    ('''sctap:
; -- generation counter advance (Session 77), gated on core-local track 0 --
        move    x:>$420,a               ; a1 = track index 0..7
        cmp     #>@COREBASE@,a
        bne     zz30                    ; not this core's local index 0 -> skip
; GSEED holds the exact sentinel $10000 once this core has ever run this
; path before -- same "exact match, not nonzero" idiom as MON_ON (this
; file's own moncommit hazard fix), needed because true cold DSP RAM in a
; region nothing has ever written before is NOT reliably zero (the
; "persistent slot" trap) and a plain nonzero test would very likely read
; boot garbage as "already seeded" and skip the one-time reset to a KNOWN
; value both cores must agree on. HARDWARE-ONLY validation gap: dsp_host /
; dsp_host_xcore zero all DSP RAM at their own "boot", so no emulator run
; can exercise the TRUE cold-boot garbage case -- see NOTES.md.
        move    #>@GSEED@,r1
        move    y:(r1),b               ; b = seed sentinel word
        cmp     #>$10000,b
        beq     zz29                    ; already seeded -> normal advance
        move    #1,b                    ; (q2) stores as $10000, matching the
        move    b,y:(r1)                ; cmp above -- same quirk, same fix
        move    #>@GCNT@,r1
        move    #0,b
        move    b,y:(r1)                ; first-ever block -> generation 0
        bra     zz30
zz29:
''', '''sctap:
; -- generation counter (Modwerk resident change, 15 Oct 2026): advanced at
; core-local track 0 once seeded; until then it follows the other core's
; counter, adopted for good at local track 2 (resident_dsp.py has why) --
        move    x:>$420,a               ; a1 = track index 0..7
        cmp     #>@COREBASE@,a
        beq     kph1                    ; local track 0 -> advance, or follow
        cmp     #>@COREMID@,a
        bne     zz30                    ; local tracks 1 and 3 -> skip
        move    #>@GSEED@,r1
        move    y:(r1),b               ; b = seed sentinel word
        cmp     #>$10000,b
        beq     zz30                    ; seeded -> nothing at local track 2
        bsr     kph2                    ; GCNT = the other core's counter, or 0
        move    #1,b                    ; (q2) stores as $10000, matching the
        move    #>@GSEED@,r1
        move    b,y:(r1)                ; seeded, only after GCNT is written
        bra     zz30
kph1:
        move    #>@GSEED@,r1
        move    y:(r1),b               ; b = seed sentinel word
        cmp     #>$10000,b
        beq     zz29                    ; already seeded -> normal advance
        bsr     kph2                    ; not yet: follow the other core
        bra     zz30
zz29:
'''),
    ('''        move    x:>$208,r6              ; --- displaced (move #$6,n6 stays stock) ---
        rts
''', '''        move    x:>$208,r6              ; --- displaced (move #$6,n6 stays stock) ---
        rts
; GCNT = the other core's counter once that core is seeded, else 0. a, b, r1.
kph2:
        clr     a                       ; (clr: an instruction form the source itself uses)
        move    #>@FGSEED@,r1
        move    y:(r1),b               ; b = the other core's sentinel
        cmp     #>$10000,b
        bne     kph3                    ; not seeded -> 0
        move    #>@FGCNT@,r1
        move    y:(r1),b
        and     #>3,b                   ; (masking risk on b)
        move    b1,a                   ; (q3) a = clean 0..3
kph3:
        move    #>@GCNT@,r1
        move    a,y:(r1)
        rts
'''),
)
REVIEWED = {
    'sidechain-compressor': (
        '11022dbd84e1fffa71946aa19e8d8f0a51b1f25371c5b6b794066c855012ddf8', _SC_KEY_PHASE,
        '3c8e1aa02e880099488788d94f568648aefa18f2427db92262108f6bf5df5c8d',
        {'A': {'@COREMID@': '6', '@FGSEED@': '$3bdfe', '@FGCNT@': '$3bdff'},
         'B': {'@COREMID@': '2', '@FGSEED@': '$33dfe', '@FGCNT@': '$33dff'}}),
}


def reviewed_source(name, text, tag):
    """`name`'s pinned DSP text with its reviewed resident changes, per core; fails closed on any drift."""
    if name not in REVIEWED:
        return text
    pinned, changes, result, markers = REVIEWED[name]
    if hashlib.sha256(text.encode()).hexdigest() != pinned:
        raise ValueError('A reviewed DSP source changed; review the resident change again: ' + name)
    for old, new in changes:
        if text.count(old) != 1:
            raise ValueError('A reviewed DSP change no longer applies exactly once: ' + name)
        text = text.replace(old, new)
    if hashlib.sha256(text.encode()).hexdigest() != result:
        raise ValueError('A reviewed DSP change differs from the reviewed text: ' + name)
    for old, new in markers[tag].items():
        text = text.replace(old, new)
    return text


# The key bus (KEYBUS, docs/OCTATRACK_PACKAGE_DSP_HOOKS.md): Sidechain's own publish tap (`sctap` to `zz31`, the
# displaced instruction and its rts, then #640's `kph2`/`kph3`) is a base feature of its own, which any live package
# that requires it holds, and a held Sidechain too (dsp-sites.json: SIDECHAIN implies KEYBUS). The reviewed text is
# split, never edited: the tap, and everything else (the header, `scdet`, `moncommit`), which stays Sidechain's. The
# permanent block assembles the two in the original order, so its words are the unsplit text's. SHA-256 of each part
# of the reviewed (key-phase) text before the per-core markers: any drift stops the build.
KEYBUS_SPLIT = ('\nsctap:\n', '\n; ---- HOOK 2 ',
                '2a79b3cd53cb4bf33989a7b6b6c6b1c09e5d0002a9c2559c87693b8a1fc0c2cc',
                '8c6a4ff6eaac6655f499eacf1bfb7a4d3baecc947cf0566c49bf7e8080bc567c')


def split_sidechain(text, pinned=True):
    """(Sidechain's detector text, the key bus tap's text) from Sidechain's reviewed resident text."""
    start, end, detector_sha, tap_sha = KEYBUS_SPLIT
    if text.count(start) != 1 or text.count(end) != 1 or text.index(start) > text.index(end):
        raise ValueError('The key bus tap no longer splits out of Sidechain\'s DSP text exactly once')
    a, b = text.index(start) + 1, text.index(end) + 1
    detector, tap = text[:a] + text[b:], text[a:b]
    if pinned and (hashlib.sha256(detector.encode()).hexdigest(), hashlib.sha256(tap.encode()).hexdigest()) != (detector_sha, tap_sha):
        raise ValueError('The key bus split differs from the reviewed split')
    return detector, tap


def keybus_executed(tap):
    """The key bus tap's cost: executed instructions per sample for one core's four tracks, seeded (its steady state),
    counted statically from its text (`split_sidechain`'s second part): each DO body 32 times, the stock site's JSR and
    the stub's JMP included, a block of 16 samples. Not a modeled cycle count and not a hardware timing."""
    segments, label = {}, None
    for line in tap.splitlines():
        code = line.split(';')[0].rstrip()
        if not code.strip():
            continue
        if not code[0].isspace() and code.endswith(':'):
            label = code[:-1]
            segments[label] = []
        else:
            segments[label].append(code.split()[0])

    def run(name, first=0, last=None):
        ops = segments[name][first:last]
        if 'do' in ops:  # the DO's body is the rest of the segment
            at = ops.index('do')
            return at + 1 + 32 * (len(ops) - at - 1)
        return len(ops)
    # 0.2.0's one-pass tap: the counter block opens `sctap`, the slot set-up and the one DO loop are `zz30`, `zz01`
    # holds the displaced instruction and the rts. A seeded core's local track 0 advances (kph1 -> zz29, falling into
    # zz30), tracks 1 and 3 skip at the second compare, track 2 also reads the seed mark.
    if ([segments['sctap'][i] for i in (2, 4, 8)] != ['beq', 'bne', 'beq'] or segments['kph1'][3] != 'beq' or
            'do' not in segments['zz30'] or segments['zz01'] != ['move', 'rts']):
        raise ValueError('The key bus tap\'s paths changed: count its cost again')
    common = 2 + run('sctap', 0, 3) + run('zz30') + run('zz01')
    paths = (run('kph1', 0, 4) + run('zz29'), run('sctap', 3, 5), run('sctap', 3, 9), run('sctap', 3, 5))  # local tracks 0-3
    return -(-sum(common + extra for extra in paths) // 16)


def verify_sources(sdk):
    sdk = Path(sdk).resolve()
    for path, expected in SOURCES.items():
        if hashlib.sha256((sdk / path).read_bytes()).hexdigest() != expected:
            raise ValueError('Resident DSP source changed; review the port: ' + path)
    # The key bus split of Sidechain's reviewed text, before its per-core markers (KEYBUS_SPLIT).
    pinned, changes = REVIEWED['sidechain-compressor'][:2]
    text = (sdk / 'modules/sidechain-compressor/patch_sc_dsp3.asm').read_text()
    for old, new in changes:
        text = text.replace(old, new)
    split_sidechain(text)
    return dict(SOURCES)


def resource_ranges(tag):
    if tag not in ALLOWED:
        raise ValueError('Unknown DSP core')
    shared = 0x33dfe if tag == 'A' else 0x3bdfe
    ranges = [dict(owner=SIDECHAIN, space='y', address=0x7f0, words=0x210),
              dict(owner=SIDECHAIN, space='y', address=shared, words=0x202),
              dict(owner=ANALOG_BD, space='x', address=0x2840, words=0x3700 - 0x2840)]
    if tag == 'A':
        ranges.append(dict(owner=MATRIX, space='y', address=0xc00, words=0xc1))
    # The key bus: inside what Sidechain always owned (its reset keeps its 1,042 words); its own reset is 1,026. The
    # window first, so a reset's first chunk zeroes its seed mark and counter (+$3DFE, +$3DFF): a reader never takes a
    # stale mark from an earlier run for a live bus (controller_board.c's scrub after a disable is that one chunk).
    ranges += [dict(owner=KEYBUS, space='y', address=shared, words=0x202),
               dict(owner=KEYBUS, space='y', address=0x800, words=0x200)]
    return ranges


def boot_ranges(tag):
    """The ranges the boot upload zeroes: each word once (the key bus lies inside Sidechain's ranges)."""
    out = []
    for r in resource_ranges(tag):
        if not any(o['space'] == r['space'] and o['address'] <= r['address'] and
                   r['address'] + r['words'] <= o['address'] + o['words'] for o in out):
            out.append(r)
    return out


def buffer_fits(tag, slot, base, words, active):
    """Actual contiguous Y span, including stock tenants and hook reservations."""
    if tag not in ALLOWED or slot not in (1, 2) or words < 0 or active & ~ALLOWED[tag]:
        return False
    bases = (0x1000, 0x1c00, 0x2800, 0x3400) if slot == 1 else \
        ((0x4000, 0x8000, 0x30000, 0x34000) if tag == 'A' else (0x4000, 0x8000, 0x38000, 0x3c000))
    if base not in bases or words > (3072 if slot == 1 else 16384):
        return False
    return not any(r['space'] == 'y' and active & r['owner'] and
                   base < r['address'] + r['words'] and r['address'] < base + words
                   for r in resource_ranges(tag))


def _section(ob, name, tag, table_address):
    module = ob.modules[name]
    section = module.dsp
    text = reviewed_source(name, (Path(ob.root) / section.asm).read_text(), tag)
    for old, new in (section.subst or {}).get(tag, {}).items():
        if old not in text:
            raise ValueError('A DSP source substitution disappeared: ' + old)
        text = text.replace(old, new)
    # ptable2 follows the ptable, as octabam's build places it; each marker names its own start.
    ptable2 = list(getattr(section, 'ptable2', None) or ())
    text = text.replace('$fab1e0', '$%x' % table_address)
    if ptable2:
        text = text.replace('$fab2e0', '$%x' % (table_address + len(section.ptable)))
    code = '\n'.join(line.split(';')[0] for line in text.splitlines())
    if re.search(r'@[A-Z_]+@|\$fab1e0|\$fab2e0', code, re.I):
        raise ValueError('An unresolved DSP source marker remains')
    return [w & 0xffffff for w in list(section.ptable) + ptable2], text


def assemble_authored(text, origin, work, assemble):
    """Lower absolute authored JMP to a proven long, CCR-neutral BRA.

    The installed dsp_asm accepts only b-forms. Two NOPs size each absolute
    jump first; fresh symbol addresses then produce its signed displacement.
    The final labels must be identical, so no instruction boundary can drift.
    Imported source stays exact and no decoded stock instruction is involved.
    """
    targets = []
    def placeholder(match):
        label = 'habs_%d' % len(targets)
        targets.append((label, match[1]))
        return label + ':\n        nop\n        nop'
    sized = re.sub(r'^\s*jmp\s+(\$[0-9a-fA-F]+|[a-zA-Z_][a-zA-Z_0-9]*)\s*(?:;[^\n]*)?$',
                   placeholder, text, flags=re.M)
    if not targets:
        return assemble(text, origin, work)
    _, labels = assemble(sized, origin, work)
    final = sized
    for label, target in targets:
        at = int(target[1:], 16) if target.startswith('$') else labels[target]
        displacement = at - labels[label]
        branch = '$%x' % (displacement & 0xffffff)
        final = final.replace(label + ':\n        nop\n        nop', label + ':\n        bra >' + branch)
    words, other = assemble(final, origin, work)
    if labels != other:
        raise ValueError('An absolute DSP jump changed an instruction boundary')
    return words, other


def _engines(ob, tag, table_origin, features):
    """(P table, texts) of `features` in the permanent order; their tables start at table_origin. The key bus tap
    comes first and Sidechain's detector after it, the order of Sidechain's own text. A packaged feature has none."""
    table, texts = [], []
    if features & (SIDECHAIN | KEYBUS):
        sc_table, sc = _section(ob, 'sidechain-compressor', tag, table_origin)
        detector, tap = split_sidechain(sc, pinned=False)
        if features & SIDECHAIN:
            table += sc_table
        if features & KEYBUS:
            texts.append(tap)
        if features & SIDECHAIN:
            texts.append(detector)
    if tag == 'A' and features & MATRIX:
        matrix_table, matrix = _section(ob, 'output-matrix', tag, table_origin + len(table))
        table += matrix_table
        texts.append(matrix)
    return table, texts


def assemble_resident(ob, tag, origin, work, assemble, on_demand=0):
    """Return private words plus fixed descriptors, stock hook guards and X/Y ledger.

    `assemble(text, origin, work)` is the native assembler API in dsp_packages.py.
    The result's `words` are private build inputs, never catalogue
    assets. Every stub starts dormant; enabling requires receiver CAS and ACKs.
    `on_demand` (a feature mask, 0 by default: today's bytes) leaves those
    features' engines out of the permanent block: each becomes a relocatable
    unit (`engines`) the base places in the arena while its controller is
    active, and its stubs reach it through a per-feature base word in the
    block (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md).
    """
    if tag not in ALLOWED or not isinstance(origin, int) or not 0 <= origin < 0x2000:
        raise ValueError('Resident code requires an actual private P origin')
    if not isinstance(on_demand, int) or on_demand & ~ALLOWED[tag]:
        raise ValueError('An on-demand engine this core does not carry')
    if on_demand & PACKAGED & ALLOWED[tag] != PACKAGED & ALLOWED[tag]:
        raise ValueError('A packaged engine is its package\'s: build the resident hooks on demand')
    sources = verify_sources(ob.root)
    table, texts = _engines(ob, tag, origin, ALLOWED[tag] & ~on_demand)
    entries = [('hsc_tap', 'sctap', KEYBUS, 'move x:>$208,r6\nrts'),
               ('hsc_det', 'scdet', SIDECHAIN, 'move r0,n6\nmove #$61,r4\nrts'),
               ('hsc_commit', 'moncommit', SIDECHAIN, 'move x:>$206,r0\nrts'),
               ('hsc_init', 'scinit', SIDECHAIN, 'move #>$20c5,x0\nrts')]
    if tag == 'A':
        entries += [('hom_mix', 'omx_mix', MATRIX,
                     'btst #10,a\nbcs hom_stockm\nrts\nhom_stockm:\nmove ssh,x0\njmp $292'),
                    ('hom_phn', 'omx_phn', MATRIX, 'move x:>$205,r0\nrts')]
    entries.append(('hab_source', 'zg01', ANALOG_BD, 'move a,x:>$20e\nrts'))
    # Forwarding branches change no register or CCR. The frame receiver may rewrite
    # only the second word, before this frame reaches any track's source/FX.
    shims = '\n'.join('%s:\njmp %s_off\n%s_off:\n%s\n' % (stub, stub, stub, off)
                       for stub, _, _, off in entries)
    # An on-demand feature keeps one P word here: the absolute P address of its
    # placed engine, 0 while unplaced (the boot upload's zero). Only the receiver writes it.
    bases = ''.join('hwbase%d:\n        nop\n' % feature for feature in FEATURES if on_demand & feature)
    words, labels = assemble_authored(shims + '\n' + bases + '\n'.join(texts), origin + len(table), work, assemble)
    words = table + words
    if origin + len(words) > 0x2000:
        raise ValueError('Resident hook code exceeds private P')
    engines = {feature: engine_unit(ob, tag, feature, work, assemble)
               for feature in FEATURES if on_demand & feature & ~PACKAGED}
    descriptors = []
    for stub, on, owner, _ in entries:
        start = labels[stub] - origin
        if words[start + 1] != labels[stub + '_off'] - labels[stub]:
            raise ValueError('A dormant branch does not have a complete displacement operand')
        if owner & on_demand:
            # A packaged engine is entered at its first word (the board checks its package's hook entry).
            at = 0 if owner & PACKAGED else engines[owner]['entries'].get(on)
            if at is None or labels['hwbase%d' % owner] - origin >= len(words):
                raise ValueError('An on-demand engine lost its entry or base word')
            descriptors.append(dict(owner=owner, operand=labels[stub] + 1, off=labels[stub + '_off'], on=None,
                                    entry=labels[stub], base=labels['hwbase%d' % owner],
                                    onOffset=at, offValue=(labels[stub + '_off'] - labels[stub]) & 0xffffff,
                                    onValue=None))
            continue
        descriptors.append(dict(owner=owner, operand=labels[stub] + 1,
                                off=labels[stub + '_off'], on=labels[on], entry=labels[stub],
                                offValue=(labels[stub + '_off'] - labels[stub]) & 0xffffff,
                                onValue=(labels[on] - labels[stub]) & 0xffffff))
    guards = []
    for name in ('sidechain-compressor', 'output-matrix'):
        if name == 'output-matrix' and tag != 'A':
            continue
        for hook in ob.modules[name].dsp.hooks:
            stub = {'sctap': 'hsc_tap', 'scdet': 'hsc_det', 'moncommit': 'hsc_commit', 'scinit': 'hsc_init',
                    'omx_mix': 'hom_mix', 'omx_phn': 'hom_phn'}[hook.label]
            guards.append(dict(module=name, site=hook.site_on(tag), expectedSha256=hook.stock.sha256,
                               entry=labels[stub], relocated=RELOCATED.get(hook.label, False)))
    # Analog BD's seam: the catalogue's site (dsp-sites.json), whose guard is the displaced instruction the stub replays.
    site = next(s for s in json.loads(SITES.read_text())['sites'] if s['feature'] == ANALOG_BD)
    at = labels['hab_source_off'] - origin
    if hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words[at:at + 2])).hexdigest() != site['guardSha256']:
        raise ValueError('Analog BD\'s dormant replay differs from its catalogued guard')
    guards.append(dict(module='analog-bassdrum', site=int(site[tag], 16), expectedSha256=site['guardSha256'],
                       entry=labels['hab_source'], relocated=False))
    result = dict(tag=tag, origin=origin, words=words, labels=labels, descriptors=descriptors,
                  allowed=ALLOWED[tag], guards=guards, resources=resource_ranges(tag), sources=sources)
    if on_demand:
        result.update(onDemand=on_demand, engines=engines)
    return result


def place_resident(ob, tag, end, work, assemble, on_demand=0):
    """Place the permanent hooks at the top of the known harvested P run."""
    if not isinstance(end, int) or not 0x1000 <= end <= 0x2000:
        raise ValueError('The harvested P end is outside the measured private block')
    sized = assemble_resident(ob, tag, 0x1000, work, assemble, on_demand)
    result = assemble_resident(ob, tag, end - len(sized['words']), work, assemble, on_demand)
    if len(result['words']) != len(sized['words']) or result['origin'] + len(result['words']) != end:
        raise ValueError('Resident DSP packing changed its size')
    return result


ENTRIES = {SIDECHAIN: ('scdet', 'moncommit', 'scinit'), MATRIX: ('omx_mix', 'omx_phn'), KEYBUS: ('sctap',)}
# Hooks inside stock COMPRESSOR, whose code is its own normalized stock package in this base: each is bridged at that
# package's entry of this name (compressor_bridge) instead of at its stock address.
RELOCATED = {'scdet': 'proc', 'scinit': 'init'}


def engine_unit(ob, tag, feature, work, assemble):
    """One on-demand engine as a relocatable unit: its P table first, then its code.

    Assembled at two high origins, where dsp_asm has only long forms: a word that
    moves with the origin is an address (relocation index), one that moves against
    it a displacement to a fixed stock address (index | 0x8000), as transfer.c's
    relocator reads them. `words` hold the value at base 0. Fresh assemblies at
    four arena bases must equal the relocated words (`proofs`). Authored module
    code only, a private build input like the permanent block.
    """
    if tag not in ALLOWED or feature not in FEATURES or not feature & ALLOWED[tag] or feature & PACKAGED:
        raise ValueError('An on-demand engine this core does not carry')

    def build(org):
        table, texts = _engines(ob, tag, org, feature)
        words, labels = assemble_authored('\n'.join(texts), org + len(table), work, assemble)
        return table + words, labels

    (first, labels), (other, moved) = build(ENGINE_ORIGINS[0]), build(ENGINE_ORIGINS[1])
    delta = ENGINE_ORIGINS[1] - ENGINE_ORIGINS[0]
    if len(first) != len(other) or {k: v - ENGINE_ORIGINS[0] for k, v in labels.items()} != \
            {k: v - ENGINE_ORIGINS[1] for k, v in moved.items()}:
        raise ValueError('An on-demand engine assembles differently at two origins')
    words, relocations = [], []
    for i, (a, b) in enumerate(zip(first, other)):
        change = (b - a) & 0xffffff
        if change == 0:
            words.append(a)
        elif change == delta:
            relocations.append(i)
            words.append((a - ENGINE_ORIGINS[0]) & 0xffffff)
        elif change == (-delta) & 0xffffff:
            relocations.append(i | 0x8000)
            words.append((a + ENGINE_ORIGINS[0]) & 0xffffff)
        else:
            raise ValueError('An on-demand engine word moves in a way the relocator cannot follow: %d' % i)
    if len(words) >= 0x8000:
        raise ValueError('An on-demand engine exceeds the relocation index')
    entries = {name: labels[name] - ENGINE_ORIGINS[0] for name in ENTRIES[feature]}
    unit = dict(tag=tag, feature=feature, words=words, relocations=relocations, entries=entries,
                sha256=hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words)).hexdigest())
    proofs = []
    for base in ENGINE_PROOFS:
        fresh, fresh_labels = build(base)
        if fresh != relocate(unit, base) or any(fresh_labels[name] != base + at for name, at in entries.items()):
            raise ValueError('A relocated on-demand engine differs from a fresh assembly at $%x' % base)
        proofs.append(dict(base=base, sha256=hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in fresh)).hexdigest()))
    unit['proofs'] = proofs
    return unit


def relocate(unit, base):
    """The unit's words at absolute P `base`, as the base's engine placement writes them."""
    words = list(unit['words'])
    for r in unit['relocations']:
        i = r & 0x7fff
        words[i] = (words[i] - base if r & 0x8000 else words[i] + base) & 0xffffff
    return words


def compressor_bridge(stock, words, bundle):
    """Bridge normalized stock COMP at its proc and its init, retaining each complete original replay.

    Each called resident SC entry replays its two displaced instructions and returns
    to the dynamically placed stock procedure. Its resident address is fixed,
    so it is deliberately absent from the stock package's relocation list.
    """
    hooks = [row for row in bundle['guards'] if row['relocated']]
    if stock['key'] != 'COMPRESSOR' or sorted(row['relocated'] for row in hooks) != sorted(set(RELOCATED.values())):
        raise ValueError('The normalized COMPRESSOR bridges changed')
    moved, dropped = list(words), set()
    for hook in hooks:
        at = stock[hook['relocated']]
        if not 0 <= at <= len(words) - 2 or \
                hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words[at:at + 2])).hexdigest() != hook['expectedSha256']:
            raise ValueError('The normalized COMPRESSOR %s prefix changed' % hook['relocated'])
        moved[at:at + 2] = [0x0bf080, hook['entry']]  # same native long JSR used by the frame hook
        dropped |= {at, at + 1}
    result = dict(stock)
    result['relocations'] = [r for r in stock['relocations'] if (r & 0x7fff) not in dropped]
    return result, moved


def initialization_records(bundle):
    """Authored boot/reset records. These are private build inputs, not sites.

    A subsequent activation needs the same owned ranges reset while dormant,
    through bounded frame work and verified acknowledgements, before `ready`.
    """
    if bundle['resources'] != resource_ranges(bundle['tag']):
        raise ValueError('Resident reset resources changed')
    return [dict(space='y', address=r['address'], words=[0] * r['words'])
            for r in boot_ranges(bundle['tag']) if r['space'] == 'y']


def receiver_control(bundle):
    """Bounded frame CAS. Packet word4 expected mask, word5 desired mask.

    HF2 completion with HF3 clear proves that this core switched every named
    stub in the same frame. A stale expected mask or unsupported owner refuses
    before any executable word changes. State resets/publication stay caller-owned.
    """
    tag = bundle['tag']
    if bundle['allowed'] != ALLOWED[tag] or len(bundle['descriptors']) != (7 if tag == 'A' else 5):
        raise ValueError('Resident hook descriptor layout changed')
    on_demand = bundle.get('onDemand', 0)
    if not isinstance(on_demand, int) or on_demand & ~ALLOWED[tag] or bool(on_demand) != ('engines' in bundle):
        raise ValueError('Resident on-demand layout changed')
    end = bundle['origin'] + len(bundle['words'])
    # Word 7 (0 for every CAS the board sends) selects PLACE (the engine's words, 1..$1fff) on an on-demand build.
    lines = ['move x:(r0+7),a', 'tst a', 'bne hplace'] if on_demand else []
    lines += ['move x:(r0+4),x0', 'move #>hookstate,r1', 'move p:(r1),a',
              'cmp x0,a', 'bne badsaved', 'move x:(r0+5),x1', 'move x1,a',
              'and #>$%x,a' % (0xffffff ^ ALLOWED[tag]), 'bne badsaved',
              'move #>hookready,r3', 'move p:(r3),a', 'and x1,a', 'cmp x1,a', 'bne badsaved']
    # No enable of an unplaced engine: refused before any state or branch word changes.
    for feature in FEATURES:
        if feature & on_demand:
            base = _base_word(bundle, feature, end)
            lines += ['btst #%d,x1' % (feature.bit_length() - 1), 'bcc hwchk%d' % feature,
                      'move #>$%x,r3' % base, 'move p:(r3),a', 'tst a', 'beq badsaved', 'hwchk%d:' % feature]
    # A disable invalidates that feature's initialized state. A complete fixed
    # reset sequence must restore it before the receiver accepts another enable.
    # r3 points at hookready again: the check above left it on a base word.
    if on_demand:
        lines += ['move #>hookready,r3']
    for feature in FEATURES:
        if not feature & ALLOWED[tag]:
            continue
        bit = feature.bit_length() - 1
        lines += ['btst #%d,x0' % bit, 'bcc hreadykeep%d' % bit, 'btst #%d,x1' % bit,
                  'bcs hreadykeep%d' % bit, 'move p:(r3),a', 'and #>$%x,a' % (0xffffff ^ feature),
                  'move a1,p:(r3)', 'hreadykeep%d:' % bit]
    for i, row in enumerate(bundle['descriptors']):
        placed = row['owner'] & on_demand
        if row['owner'] not in FEATURES or not row['owner'] & ALLOWED[tag] or \
                not all(bundle['origin'] <= row[k] < end for k in ('operand', 'off') + (() if placed else ('on',))):
            raise ValueError('A resident hook escapes its owned P block')
        if row['offValue'] != (row['off'] - row['entry']) & 0xffffff or (not placed and row['onValue'] != (row['on'] - row['entry']) & 0xffffff):
            raise ValueError('A resident branch has an invalid displacement')
        if placed:
            # A packaged engine is entered at its first word; the build's at one of its unit's entries.
            entries = (0,) if row['owner'] & PACKAGED else bundle['engines'][row['owner']]['entries'].values()
            if row['on'] is not None or row['onValue'] is not None or row['onOffset'] not in entries or \
                    row['base'] != _base_word(bundle, row['owner'], end):
                raise ValueError('An on-demand branch has an invalid engine entry')
            # The placed engine's entry, from the base word the receiver itself wrote at PLACE.
            on = ['move #>$%x,r3' % row['base'], 'move p:(r3),a',
                  'add #>$%x,a' % ((row['onOffset'] - row['entry']) & 0xffffff), 'move a1,x0']
        else:
            on = ['move #>$%x,x0' % row['onValue']]
        lines += ['move #>$%x,x0' % row['offValue'], 'btst #%d,x1' % (row['owner'].bit_length() - 1),
                  'bcc hkeep%d' % i] + on + ['hkeep%d:' % i,
                  'move #>$%x,r3' % row['operand'], 'move x0,p:(r3)']
    lines += ['move x1,p:(r1)', 'bra accepted']
    if on_demand:
        lines += receiver_place(bundle, end)
    return '\n'.join('        ' + line if not line.endswith(':') else line for line in lines) + '\n'


def _base_word(bundle, feature, end):
    base = bundle['labels']['hwbase%d' % feature]
    if not bundle['origin'] <= base < end or bundle['words'][base - bundle['origin']] != 0:
        raise ValueError('An on-demand base word escapes its owned P block')
    return base


def receiver_place(bundle, end):
    """PLACE (op 10, word7 the engine's words, 1..$1fff): word4 one on-demand feature, word5 its table offset, 0 to unplace.

    Only while that feature is dormant on this core. A placement must lie whole
    inside the arena (64 saved words up to the permanent block) and needs a
    prior unplace; its base word becomes dltable + offset. The base already
    wrote and read back every engine word (WRITE); a CAS enables only a placed
    feature and computes its branch from this word. The size comes with the
    packet, so an engine from a package (PACKAGED) is placed as one from the
    base. Registers: a, x0, x1, r1, r3.
    """
    on_demand = bundle['onDemand']
    # Word 4 is the feature's own owner bit: dormant means that bit clear in hookstate.
    lines = ['hplace:', 'move x:(r0+7),a', 'cmp #>$2000,a', 'bge badsaved', 'move a1,x1', 'move x:(r0+4),x0',
             'move #>hookstate,r1', 'move p:(r1),a', 'and x0,a', 'bne badsaved', 'move x0,a']
    features = [feature for feature in FEATURES if feature & on_demand]
    for feature in features:
        lines += ['cmp #>%d,a' % feature, 'beq hwfeat%d' % feature]
    lines += ['bra badsaved']
    for feature in features:
        lines += ['hwfeat%d:' % feature, 'move #>$%x,r3' % _base_word(bundle, feature, end)]
        if feature != features[-1]:
            lines += ['bra hwshared']
    lines += ['hwshared:', 'move p:(r3),a', 'tst a', 'bne hwplaced',
              'move x:(r0+5),a', 'tst a', 'beq accepted',
              'cmp #>64,a', 'blt badsaved', 'add x1,a', 'move a1,x1',
              'bsr tablebase', 'add x1,a', 'cmp #>$%x,a' % bundle['origin'], 'bgt badsaved',
              'move x:(r0+5),a', 'move a1,x0', 'bsr tablebase', 'add x0,a', 'move a1,p:(r3)', 'bra accepted',
              'hwplaced:', 'move x:(r0+5),a', 'tst a', 'bne badsaved', 'move a1,p:(r3)', 'bra accepted']
    return lines


def receiver_reset(bundle):
    """Fixed X/Y initialization chunks, only while the feature is dormant.

    Packet count word4 (1..24), logical record offset word5, feature word7;
    payload words8..55. Neither the host nor a module can name a DSP address.
    Every chunk is read back and advances a per-feature cursor only on equality.
    Its final ACK marks initialized; partial/failed resets keep it unavailable.
    """
    tag = bundle['tag']
    if bundle['resources'] != resource_ranges(tag):
        raise ValueError('Resident reset resources changed')
    lines = ['move x:(r0+4),a', 'and #>$ffff,a', 'cmp #>1,a', 'blt badsaved',
             'cmp #>24,a', 'bgt badsaved', 'move a1,x1', 'move x:(r0+7),a', 'and #>$ffff,a']
    features = [feature for feature in FEATURES if feature & ALLOWED[tag]]
    for feature in features:
        lines += ['cmp #>%d,a' % feature, 'beq hreset%d' % feature]
    lines += ['bra badsaved']
    for feature in features:
        ranges = [row for row in bundle['resources'] if row['owner'] == feature]
        total = sum(row['words'] for row in ranges)
        lines += ['hreset%d:' % feature, 'move #>hookstate,r1', 'move p:(r1),a',
                  'btst #%d,a' % (feature.bit_length() - 1), 'bcs badsaved',
                  'move x:(r0+5),a', 'and #>$ffff,a', 'move #>hookpos%d,r1' % feature,
                  'tst a', 'beq hresetfirst%d' % feature, 'move p:(r1),x0', 'cmp x0,a',
                  'bne badsaved', 'bra hresetbounds%d' % feature, 'hresetfirst%d:' % feature,
                  'move #>hookready,r3', 'move p:(r3),a', 'and #>$%x,a' % (0xffffff ^ feature),
                  'move a1,p:(r3)', 'move #>0,a', 'hresetbounds%d:' % feature,
                  'move r1,x:(r0+62)', 'move #>%d,x0' % total, 'move x0,x:(r0+58)']
        logical = 0
        for i, row in enumerate(ranges):
            end = logical + row['words']
            lines += ['cmp #>%d,a' % end, 'bge hresetnext%d_%d' % (feature, i),
                      'add x1,a', 'cmp #>%d,a' % end, 'bgt badsaved', 'move a1,x:(r0+60)',
                      'sub x1,a', 'sub #>%d,a' % logical, 'add #>$%x,a' % row['address'],
                      'move a,r3', 'move #>%d,x0' % (1 if row['space'] == 'x' else 2),
                      'move x0,x:(r0+61)', 'bra hresetwrite', 'hresetnext%d_%d:' % (feature, i)]
            logical = end
        lines += ['bra badsaved']
    lines += ['hresetwrite:', 'move #>0,x0', 'move x0,x:(r0+59)', 'move r0,a', 'add #>8,a',
              'move a,r1', 'move x:(r0+61),a', 'cmp #>1,a', 'bne hrywords']
    for space in ('x', 'y'):
        if space == 'y':
            lines += ['hrywords:']
        lines += ['move x1,a', 'do a,hresetdone' + space, 'move x:(r1)+,a', 'and #>$ffff,a',
                  'asl #8,a,a', 'move a1,x0', 'move x:(r1)+,a', 'and #>$ff,a', 'or x0,a', 'move a1,x0',
                  'move x0,%s:(r3)' % space, 'move %s:(r3),a' % space, 'eor x0,a', 'move a1,x0',
                  'move x:(r0+59),a', 'or x0,a', 'move a1,x:(r0+59)', 'move r3,a', 'add #>1,a', 'move a,r3',
                  'hresetdone' + space + ':', 'bra hresetverify']
    lines += ['hresetverify:', 'move x:(r0+59),a', 'tst a', 'bne badsaved',
              'move x:(r0+62),r1', 'move x:(r0+60),a', 'move a1,p:(r1)',
              'move x:(r0+58),x0', 'cmp x0,a', 'bne accepted', 'move #>hookready,r1',
              'move p:(r1),a', 'move x:(r0+7),x0', 'or x0,a', 'move a1,p:(r1)', 'bra accepted']
    return '\n'.join('        ' + line if not line.endswith(':') else line for line in lines) + '\n'
