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
from contextlib import contextmanager
import hashlib
import importlib.util
from pathlib import Path
import re
import sys

SIDECHAIN, MATRIX, ANALOG_BD = 1, 2, 4
FEATURES = (SIDECHAIN, MATRIX, ANALOG_BD)
NAMES = {SIDECHAIN: 'sidechain', MATRIX: 'matrix', ANALOG_BD: 'analog-bd'}
ENGINE_ORIGINS = (0x100000, 0x200000)  # long forms only: every relocated word is a whole address or displacement
ENGINE_PROOFS = (0x1000, 0x1333, 0x17ff, 0x1c01)
ALLOWED = {'A': SIDECHAIN | MATRIX | ANALOG_BD, 'B': SIDECHAIN | ANALOG_BD}
SOURCES = {
    'modules/sidechain-compressor/manifest.py': '3bba6ac8ba315e10d6d7f2cb6342fb5ce6564e1ba6cd6ec362787d685c5e0cd7',
    'modules/sidechain-compressor/upstream/tools/patch_sc_dsp3.asm': 'aaa1a1c947a8bcb5d19ebc9454ec3f020d1f00afe51fe786fe1f3ed4d5eccde3',
    'modules/sidechain-compressor/upstream/tools/sc_tables.py': '8045e06f97fa462ca3f986b5a46e8ee48f9f9663691ae291221ce8ed6489c71a',
    'modules/output-matrix/manifest.py': '65d1ae009dc1c956ce2036181667434e31b361179ca138e5c8f1091227b55619',
    'modules/output-matrix/matrix_mix.asm': '8f58596d8bd23bf50651d4288745c187ace9e6f9e0efffd34dcdad627b89476e',
    'tools/build/ab_image.py': 'c4573d4e0715961f7081dc1d5a0639d42ac63313ccc9e50a0737ac0685e2fc14',
    'tools/build/ab_records.py': '71f44c4c54b281b5c813ffbab3abb98501620ad980582367004a1daeb2eeca45',
    'modules/analog-bassdrum/manifest.py': '20fa1f744630354b3986a3ad82ac6a41744345796dc783891a4c9f0bd81c787e',
    'modules/analog-bassdrum/ab_glue.asm': 'c78dc31dfcfc7a0c6f10ae24b39744a88bed5211346bcae4f6931e2e6489223c',
    'modules/analog-bassdrum/dsp909.py': 'd31d2fd1340e9c5055389a37f20959ebccd78d45636daec824ae3e1e84f4d67d',
    'modules/analog-bassdrum/dsp808.py': '3d61ba9c258c319d90d7beb47f6cbc7dafb7336c49d8386912478d284cef603d',
    'modules/analog-bassdrum/bd909.asm': '9c86c3bd06e95a998fbe4e0db5a05b9ff65e988686c81f98f6d6c9f4c3b8ee2f',
    'modules/analog-bassdrum/bd808.asm': 'e7306bd284e9bca067cffc54dcbfb18ae7a0fc7b3a27253a246e58898ae9ee92',
    'modules/analog-bassdrum/fit909.json': '6917d613b5033069f226b9f6a440f6eefd935e596452546d5bc27b73c5e3dd08',
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
# Also MON: scdet sets MON_ON[track] on every block it runs with MON on, and only scdet clears it, so a COMPRESSOR
# taken off a track with MON on left moncommit replaying the last 16-sample key stash there until the next RESET.
# moncommit now consumes MON_ON (it runs once per track per block, after both FX procs, which set it again).
_SC_KEY_PHASE = (
    ('''zz01:
; -- generation counter advance (Session 77), gated on core-local track 0 --
        move    x:>$420,a               ; a1 = track index (reload; a/r0/r1/n1/x0
                                        ; all spent by the loop above)
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
''', '''zz01:
; -- generation counter (Modwerk resident change, 15 Oct 2026): advanced at
; core-local track 0 once seeded; until then it follows the other core's
; counter, adopted for good at local track 2 (resident_dsp.py has why) --
        move    x:>$420,a               ; a1 = track index (reload; a/r0/r1/n1/x0
                                        ; all spent by the loop above)
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
        move    #0,a
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
    ('''        move    y:(r1)+,b             ; b = MON_ON ; r1 now -> MON_KEY[my track]
''', '''        move    y:(r1),b              ; b = MON_ON ; r1 stays on it
'''),
    ('''mc09:
        move    y:(r1),b              ; b = MON_KEY 0..7 (still via r1, no r2/n2 needed)
''', '''mc09:
        move    #0,b
        move    b,y:(r1)+             ; consume MON_ON (scdet sets it each block
                                       ; it runs) ; r1 -> MON_KEY[my track]
        move    y:(r1),b              ; b = MON_KEY 0..7 (still via r1, no r2/n2 needed)
'''),
)
REVIEWED = {
    'sidechain-compressor': (
        'aaa1a1c947a8bcb5d19ebc9454ec3f020d1f00afe51fe786fe1f3ed4d5eccde3', _SC_KEY_PHASE,
        'a850c60dfc8c0d55f8e1f2dcff0437d106ea5e7e64f149b5134644014ec30f1a',
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


def verify_sources(sdk):
    sdk = Path(sdk).resolve()
    for path, expected in SOURCES.items():
        if hashlib.sha256((sdk / path).read_bytes()).hexdigest() != expected:
            raise ValueError('Resident DSP source changed; review the port: ' + path)
    return dict(SOURCES)


@contextmanager
def analog_sources(sdk):
    """Load exact authored generators without writing their SDK/out directory."""
    paths = {'dsp909': 'modules/analog-bassdrum/dsp909.py',
             'dsp808': 'modules/analog-bassdrum/dsp808.py',
             'ab_records': 'tools/build/ab_records.py',
             'ab_image': 'tools/build/ab_image.py'}
    old_path, previous = list(sys.path), {name: sys.modules.get(name) for name in paths}
    loaded = {}
    try:
        for name, path in paths.items():
            spec = importlib.util.spec_from_file_location(name, Path(sdk) / path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
            loaded[name] = module
        yield loaded
    finally:
        sys.path[:] = old_path
        for name, module in previous.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module


def resource_ranges(tag):
    if tag not in ALLOWED:
        raise ValueError('Unknown DSP core')
    shared = 0x33dfe if tag == 'A' else 0x3bdfe
    ranges = [dict(owner=SIDECHAIN, space='y', address=0x7f0, words=0x210),
              dict(owner=SIDECHAIN, space='y', address=shared, words=0x202),
              dict(owner=ANALOG_BD, space='x', address=0x2840, words=0x3700 - 0x2840)]
    if tag == 'A':
        ranges.append(dict(owner=MATRIX, space='y', address=0xc00, words=0xc1))
    return ranges


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
    text = text.replace('$fab1e0', '$%x' % table_address)
    code = '\n'.join(line.split(';')[0] for line in text.splitlines())
    if re.search(r'@[A-Z_]+@|\$fab1e0', code, re.I):
        raise ValueError('An unresolved DSP source marker remains')
    return [w & 0xffffff for w in section.ptable], text


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


def _analog(root, tag):
    """Analog BD's authored engine text and its boot X record (fixed X tables, kept resident)."""
    with analog_sources(root) as loaded:
        ab, nine, eight = (loaded[name] for name in ('ab_image', 'dsp909', 'dsp808'))
        layout, voices = ab.layout()
        glue = ab.GLUE.read_text().replace('@VBASE@', '$%x' % voices).replace('@V808@', '$%x' % ab.VOICES808)
        glue = glue.replace('@CONT@', '$%x' % ab.PAY[tag]['cont'])
        analog = glue + '\n' + nine.source(layout, shared_desk=True, include_desk=False) + '\n' + \
            eight.source(eight.layout(ab.TABLES808), layout, shared_desk=True) + '\n' + nine.shared_desk_source(layout)
        xrecord = dict(space='x', address=ab.TABLES, words=ab.x_image(layout, voices))
    return analog, xrecord


def _engines(ob, tag, table_origin, features, analog):
    """(P table, texts) of `features` in the permanent order; their tables start at table_origin."""
    table, texts = [], []
    if features & SIDECHAIN:
        sc_table, sc = _section(ob, 'sidechain-compressor', tag, table_origin)
        table += sc_table
        texts.append(sc)
    if tag == 'A' and features & MATRIX:
        matrix_table, matrix = _section(ob, 'output-matrix', tag, table_origin + len(table))
        table += matrix_table
        texts.append(matrix)
    if features & ANALOG_BD:
        texts.append(analog)
    return table, texts


def assemble_resident(ob, tag, origin, work, assemble, on_demand=0):
    """Return private words plus fixed descriptors, stock hook guards and X/Y ledger.

    `assemble(text, origin, work)` is the native assembler API in dsp_packages.py.
    The result's `words` and `xRecord` are private build inputs, never catalogue
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
    sources = verify_sources(ob.root)
    analog, xrecord = _analog(ob.root, tag)
    table, texts = _engines(ob, tag, origin, ALLOWED[tag] & ~on_demand, analog)
    entries = [('hsc_tap', 'sctap', SIDECHAIN, 'move x:>$208,r6\nrts'),
               ('hsc_det', 'scdet', SIDECHAIN, 'move r0,n6\nmove #$61,r4\nrts'),
               ('hsc_commit', 'moncommit', SIDECHAIN, 'move x:>$206,r0\nrts')]
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
    engines = {feature: engine_unit(ob, tag, feature, work, assemble, analog)
               for feature in FEATURES if on_demand & feature}
    descriptors = []
    for stub, on, owner, _ in entries:
        start = labels[stub] - origin
        if words[start + 1] != labels[stub + '_off'] - labels[stub]:
            raise ValueError('A dormant branch does not have a complete displacement operand')
        if owner & on_demand:
            unit = engines[owner]
            if on not in unit['entries'] or labels['hwbase%d' % owner] - origin >= len(words):
                raise ValueError('An on-demand engine lost its entry or base word')
            descriptors.append(dict(owner=owner, operand=labels[stub] + 1, off=labels[stub + '_off'], on=None,
                                    entry=labels[stub], base=labels['hwbase%d' % owner],
                                    onOffset=unit['entries'][on], offValue=(labels[stub + '_off'] - labels[stub]) & 0xffffff,
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
            stub = {'sctap': 'hsc_tap', 'scdet': 'hsc_det', 'moncommit': 'hsc_commit',
                    'omx_mix': 'hom_mix', 'omx_phn': 'hom_phn'}[hook.label]
            guards.append(dict(module=name, site=hook.site_on(tag), expectedSha256=hook.stock.sha256,
                               entry=labels[stub], relocated=hook.label == 'scdet'))
    guards.append(dict(module='analog-bassdrum', site={'A': 0x39c, 'B': 0x1a2}[tag],
                       expectedSha256=hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in
                           words[labels['hab_source_off'] - origin:labels['hab_source_off'] - origin + 2])).hexdigest(),
                       entry=labels['hab_source'], relocated=False))
    result = dict(tag=tag, origin=origin, words=words, labels=labels, descriptors=descriptors,
                  allowed=ALLOWED[tag], guards=guards, resources=resource_ranges(tag),
                  xRecord=xrecord, sources=sources)
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


ENTRIES = {SIDECHAIN: ('sctap', 'scdet', 'moncommit'), MATRIX: ('omx_mix', 'omx_phn'), ANALOG_BD: ('zg01',)}


def engine_unit(ob, tag, feature, work, assemble, analog=None):
    """One on-demand engine as a relocatable unit: its P table first, then its code.

    Assembled at two high origins, where dsp_asm has only long forms: a word that
    moves with the origin is an address (relocation index), one that moves against
    it a displacement to a fixed stock address (index | 0x8000), as transfer.c's
    relocator reads them. `words` hold the value at base 0. Fresh assemblies at
    four arena bases must equal the relocated words (`proofs`). Authored module
    code only, a private build input like the permanent block.
    """
    if tag not in ALLOWED or feature not in FEATURES or not feature & ALLOWED[tag]:
        raise ValueError('An on-demand engine this core does not carry')
    if analog is None:
        analog, _ = _analog(ob.root, tag)

    def build(org):
        table, texts = _engines(ob, tag, org, feature, analog)
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
    """Bridge normalized stock COMP proc, retaining its complete original replay.

    The called resident SC entry replays both displaced instructions and returns
    to the dynamically placed stock procedure. Its resident address is fixed,
    so it is deliberately absent from the stock package's relocation list.
    """
    hook = next(row for row in bundle['guards'] if row['relocated'])
    at = stock['proc']
    if stock['key'] != 'COMPRESSOR' or not 0 <= at <= len(words) - 2 or \
            hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words[at:at + 2])).hexdigest() != hook['expectedSha256']:
        raise ValueError('The normalized COMPRESSOR proc prefix changed')
    moved = list(words)
    moved[at:at + 2] = [0x0bf080, hook['entry']]  # same native long JSR used by the frame hook
    result = dict(stock)
    result['relocations'] = [r for r in stock['relocations'] if (r & 0x7fff) not in (at, at + 1)]
    return result, moved


def initialization_records(bundle):
    """Authored boot/reset records. These are private build inputs, not sites.

    A subsequent activation needs the same owned ranges reset while dormant,
    through bounded frame work and verified acknowledgements, before `ready`.
    """
    return [bundle['xRecord']] + [dict(space='y', address=r['address'], words=[0] * r['words'])
                                for r in bundle['resources'] if r['space'] == 'y']


def receiver_control(bundle):
    """Bounded frame CAS. Packet word4 expected mask, word5 desired mask.

    HF2 completion with HF3 clear proves that this core switched every named
    stub in the same frame. A stale expected mask or unsupported owner refuses
    before any executable word changes. State resets/publication stay caller-owned.
    """
    tag = bundle['tag']
    if bundle['allowed'] != ALLOWED[tag] or len(bundle['descriptors']) != (6 if tag == 'A' else 4):
        raise ValueError('Resident hook descriptor layout changed')
    on_demand = bundle.get('onDemand', 0)
    if not isinstance(on_demand, int) or on_demand & ~ALLOWED[tag] or bool(on_demand) != ('engines' in bundle):
        raise ValueError('Resident on-demand layout changed')
    end = bundle['origin'] + len(bundle['words'])
    # Word 7 (0 for every CAS the board sends) selects PLACE (1) on an on-demand build.
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
    for feature in (SIDECHAIN, MATRIX, ANALOG_BD):
        if not feature & ALLOWED[tag]:
            continue
        bit = feature.bit_length() - 1
        lines += ['btst #%d,x0' % bit, 'bcc hreadykeep%d' % bit, 'btst #%d,x1' % bit,
                  'bcs hreadykeep%d' % bit, 'move p:(r3),a', 'and #>$%x,a' % (0xffffff ^ feature),
                  'move a1,p:(r3)', 'hreadykeep%d:' % bit]
    for i, row in enumerate(bundle['descriptors']):
        placed = row['owner'] & on_demand
        if row['owner'] not in (SIDECHAIN, MATRIX, ANALOG_BD) or not row['owner'] & ALLOWED[tag] or \
                not all(bundle['origin'] <= row[k] < end for k in ('operand', 'off') + (() if placed else ('on',))):
            raise ValueError('A resident hook escapes its owned P block')
        if row['offValue'] != (row['off'] - row['entry']) & 0xffffff or (not placed and row['onValue'] != (row['on'] - row['entry']) & 0xffffff):
            raise ValueError('A resident branch has an invalid displacement')
        if placed:
            unit = bundle['engines'][row['owner']]
            if row['on'] is not None or row['onValue'] is not None or row['onOffset'] not in unit['entries'].values() or \
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
    """PLACE (op 10, word7 1): word4 one on-demand feature, word5 its table offset, 0 to unplace.

    Only while that feature is dormant on this core. A placement must lie whole
    inside the arena (64 saved words up to the permanent block) and needs a
    prior unplace; its base word becomes dltable + offset. The base already
    wrote and read back every engine word (WRITE); a CAS enables only a placed
    feature and computes its branch from this word. Registers: a, x0, x1, r1, r3.
    """
    on_demand = bundle['onDemand']
    # Word 4 is the feature's own owner bit: dormant means that bit clear in hookstate.
    lines = ['hplace:', 'move x:(r0+7),a', 'cmp #>1,a', 'bne badsaved', 'move x:(r0+4),x0',
             'move #>hookstate,r1', 'move p:(r1),a', 'and x0,a', 'bne badsaved', 'move x0,a']
    features = [feature for feature in FEATURES if feature & on_demand]
    for feature in features:
        lines += ['cmp #>%d,a' % feature, 'beq hwfeat%d' % feature]
    lines += ['bra badsaved']
    for feature in features:
        words = len(bundle['engines'][feature]['words'])
        if not 0 < words < 0x2000:
            raise ValueError('An on-demand engine has no P size')
        lines += ['hwfeat%d:' % feature, 'move #>$%x,r3' % _base_word(bundle, feature, end), 'move #>%d,x1' % words]
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
    features = [feature for feature in (SIDECHAIN, MATRIX, ANALOG_BD) if feature & ALLOWED[tag]]
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
