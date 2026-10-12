"""FM SYNTH: Tim Hastie's FM engine and machine-list chooser (octatrick 2.12).

The engine, the PLAYBACK page and, since 2.10, the FM SYNTH chooser itself
(upstream/synth/machine.s: FLEX + "FM", 1 in unused NEIGHBOR PLAYBACK bytes,
the sample-free source supplier and START callback, the Part validator wrap)
are the author's pinned source; his chooser is adapted from Modwerk's 0.1.1
chooser (upstream/LICENSE). Since 2.12 a machine change to or from FM SYNTH
resets the track's machine parameters to init (machine.s ml_reset; step and
scene locks kept, as in stock), and the frame builder's metronome-click clear
is no longer hooked. Since 2.11 the rows after PICKUP are the author's
row table and the row count and bounds are detours reading it (SELECT MACHINE
TYPE scrolls); a build with FM Synth alone has one row, FM SYNTH, and the
units' remix.inc sets HAVE_SYDRUM 0, so the engine assembles as 2.10's.
This wrapper adds only what the Modwerk build needs: the page as a Linked unit at its pinned cave, checked against the
author's ratified page bytes; the resolver's jump into it; and the matching
quantizer bundled privately. Combining with the public quantizer or Analog BD
is refused for overlapping registrations. The author's manifest also names the
Analog BD conflict as a native `conflicts` entry; Modwerk declares conflicts in
octamod.module.json (compatibility.conflicts already lists analog-bassdrum), and
a native entry would turn on the browser's whole-catalogue span-contract check,
so this wrapper clears it.
"""
import dataclasses
import pathlib
import runpy
from remix.schema import Category, Linked, Poke, Proof
_HERE=pathlib.Path(__file__).resolve().parent
_REL=lambda path: str((_HERE/path).relative_to(pathlib.Path.cwd()))
_UP=runpy.run_path(str(_HERE/'upstream/synth/manifest.py'))
_SY=_UP['MODULE']
_QZ=runpy.run_path(str(_HERE/'upstream/quantizer/manifest.py'))['MODULE']
# Package labels are unique across the source catalog. These private copies
# retain the upstream symbols and fixed mailbox, but never alias public QZ objects.
_QL={u.label:'fm_'+u.label for u in _QZ.linked}
_QZ=dataclasses.replace(_QZ,
    linked=tuple(dataclasses.replace(u,label=_QL[u.label]) for u in _QZ.linked),
    detours=tuple(dataclasses.replace(d,unit=_QL[d.unit]) for d in _QZ.detours),
    tables=tuple(dataclasses.replace(t,symbols=tuple((_QL[u],n) for u,n in t.symbols)) for t in _QZ.tables))

# The author's page cave: page.s linked at PAGE_AT and compared with the bytes
# he ratified (1,868 B; fm_descriptor first, pg_resolve at +16, which machine.s
# and the resolver jump below name by address). The resolver's kind-0 table
# load becomes `jmp PAGE_AT+16`, the exact write of the author's emit_page.
_PAGE_SHA256='b43d76c9c13c1441f16e32b85826ac2e7664352947fa4dc393401ff332710f92'
_RESOLVER_JMP=bytes.fromhex('4ef9')+(_UP['PAGE_AT']+_UP['PG_RESOLVE_AT']).to_bytes(4,'big')

MODULE=dataclasses.replace(_SY,
    category=Category.MACHINES, author='timhastie', author_url='https://github.com/timhastie',
    doc='Dedicated FM SYNTH machine: two-operator FM, one to four voices, chords, MIDI and glide.',
    proof=Proof.UNTESTED, proof_note='Octatrick 2.12 engine and machine list; emulator-qualified, hardware report for this build pending',
    requires=(), conflicts=(), cf_patches=(),
    linked=_SY.linked+_QZ.linked+(
        Linked('fmpage',_REL('upstream/synth/page.s'),cpu='5475',cave_addr=_UP['PAGE_AT'],
               reference=(_UP['PAGE_AT'],_PAGE_SHA256)),),
    detours=_SY.detours+_QZ.detours,
    pokes=_SY.pokes+_QZ.pokes+(
        Poke(_UP['RESOLVER_HOOK'],_UP['RESOLVER_STOCK'],_RESOLVER_JMP,
             'page resolver: the kind-0 PLAYBACK table load jumps to the page cave (pg_resolve, PAGE_AT + 16)'),),
    tables=_SY.tables+_QZ.tables,
    pressure_blocker='The DSP-side transport of the CF-generated source is not priced by the FX pricer.')
