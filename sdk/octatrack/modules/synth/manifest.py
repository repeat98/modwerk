"""FM SYNTH: dedicated machine chooser, Tim Hastie's FM engine.

Modwerk dedicated-machine integration: FLEX + FM/1 stored in Parts, no marker
file or sample-slot mutation. The matching quantizer is bundled privately;
combining with the public quantizer/Analog BD is refused for overlapping registrations. Historical upstream hardware
reports do not qualify this current runtime change.
"""
import dataclasses
import pathlib
import runpy
from remix.schema import Category, Detour, Linked, Poke, Proof, SymbolRef
from remix.stock_guard import stock_guard
H=bytes.fromhex
_HERE=pathlib.Path(__file__).resolve().parent
_REL=lambda path: str((_HERE/path).relative_to(pathlib.Path.cwd()))
_SY=runpy.run_path(str(_HERE/'upstream/synth/manifest.py'))['MODULE']
_QZ=runpy.run_path(str(_HERE/'upstream/quantizer/manifest.py'))['MODULE']
# Package labels are unique across the source catalog. These private copies
# retain the upstream symbols and fixed mailbox, but never alias public QZ objects.
_QL={u.label:'fm_'+u.label for u in _QZ.linked}
_QZ=dataclasses.replace(_QZ,
    linked=tuple(dataclasses.replace(u,label=_QL[u.label]) for u in _QZ.linked),
    detours=tuple(dataclasses.replace(d,unit=_QL[d.unit]) for d in _QZ.detours),
    tables=tuple(dataclasses.replace(t,symbols=tuple((_QL[u],n) for u,n in t.symbols)) for t in _QZ.tables))

_REG_DETOURS=(Detour(1073951960, stock_guard(1073951960, 6, 'd6c9f1f60272197a17511f496fc19dd21ddd7df5f1f1ec0cab7a16cad60b0609'), 'fmmachine', 'fm_machine_name', 'format machine row 5 as FM SYNTH'),Detour(1073989928, stock_guard(1073989928, 6, '237cd1acd4da7acb61dc7fda7c88e648a5186b36732f433b4dd91966c5a669af'), 'fmmachine', 'fm_src_names', 'point SRC SETUP at six machine names', kind='lea'),Detour(1073993496, stock_guard(1073993496, 6, '53b8d23acf2c3fe0f794c0a5f37475b17c3433bc6a466e0e1861515989cfecda'), 'fmmachine', 'fm_name_a', 'main page name lookup for the signed FM track'),Detour(1074053994, stock_guard(1074053994, 6, '53b8d23acf2c3fe0f794c0a5f37475b17c3433bc6a466e0e1861515989cfecda'), 'fmmachine', 'fm_name_b', 'second main page name lookup for the signed FM track'),Detour(1073990016, stock_guard(1073990016, 6, '237e017ccd95444195ca390a3e6ca6076fbfa1f0931f2e7dfbdbee8c5ec72ca3'), 'fmmachine', 'fm_setup_row', 'SRC SETUP row highlights FM on a signed FLEX track'),Detour(1074235080, stock_guard(1074235080, 4, 'f829e3570d9d9e95b7d7b9b0433b1aad2f13c0ac087873dbf981482521301309'), 'fmmachine', 'fm_chooser_row', 'main chooser row highlights FM on a signed FLEX track'),Detour(1074103772, stock_guard(1074103772, 10, '22fb6e2bea4520003d2fae7035c0cd57bcd6fe6f2cfdd5b70580a3f6f2a68034'), 'fmmachine', 'fm_setup_open', 'SRC SETUP opens on FM SYNTH for the FM track', pad_to=10),Detour(1074078238, stock_guard(1074078238, 10, '8f0fa4f7d6db857f695996b185b38b788fa6af0eacd86d7dd01e2ff61201ffed'), 'fmmachine', 'fm_tick_hook', 'publish the FM Synth SRC SETUP descriptor', pad_to=10),Detour(1074235526, stock_guard(1074235526, 10, 'fe6cb52458c7d968dc467c1cd7721d832baf6bc2fac1826c8c10ed07fee2e7f8'), 'fmmachine', 'fm_chooser_open', "the track's machine list opens on FM SYNTH for the FM track", pad_to=10),Detour(1073946228, stock_guard(1073946228, 8, 'bba32826863751ec568719c202735da1ba8f06560e4d375a80637ae6653caa8f'), 'fmmachine', 'fm_resolve_pb', "resolve the signed track's FM page without changing other FLEX tracks", pad_to=10),Detour(1074239516, stock_guard(1074239516, 6, '89c50ac3ca041fdf5647ec5ee2c3580f9a67dd79f0b5cc15ceadda4b9e9bede0'), 'fmmachine', 'fm_main_commit', 'admit FM Synth at main chooser commit'),Detour(1074112022, stock_guard(1074112022, 6, '7a7350a69423ec41ec468a189ba167059626cb7f499d9862394d2388a23c8b59'), 'fmmachine', 'fm_src_commit', 'admit FM Synth at SRC SETUP commit'),Detour(1074112592, stock_guard(1074112592, 6, '7a7350a69423ec41ec468a189ba167059626cb7f499d9862394d2388a23c8b59'), 'fmmachine', 'fm_src_commit2', "the same at SRC SETUP's second commit path"),Detour(1073980718, stock_guard(1073980718, 8, 'cae34bf50383462ed4f92d8044e3021247edb8bf69c17a9c7ead62f6edf79510'), 'fmmachine', 'fm_setup_edit6', "SETUP editor addresses FM SYNTH as FLEX", pad_to=8),Detour(1073991064, stock_guard(1073991064, 8, 'ed71ef874312890edc87cef7e19cd8c0f8ac4ac9b90182c2364f78d3a4567f45'), 'fmmachine', 'fm_setup_draw6', "SETUP drawer addresses FM SYNTH as FLEX", pad_to=8),Detour(1073750808, stock_guard(1073750808, 8, '3d25d06bf11f3a7bccef894d0016b52adbb4ae468a0f475dd497d7b5966e2694'), 'fmmachine', 'fm_validate', "the Part validator reads an FM track's controls without stock FLEX clamping", pad_to=8),)
_REG_POKES=(Poke(1074238024, stock_guard(1074238024, 4, '8fbd3190028fe564c11b56e3e73e8eaf36925cbabf94164176eeb4c4f57bc6ac'), H('48780006'), 'machine chooser has six rows, FM SYNTH the last'), Poke(1074103802, stock_guard(1074103802, 4, '8fbd3190028fe564c11b56e3e73e8eaf36925cbabf94164176eeb4c4f57bc6ac'), H('48780006'), 'SRC SETUP selector has six rows'), Poke(1073989968, stock_guard(1073989968, 2, '74d01dadcbe6a57ef61bc53a5a65404cd8446c6738ff0ac86b1b1a78d8ae7d41'), H('7205'), 'SRC SETUP name lookup admits FM'), Poke(1074235000, stock_guard(1074235000, 2, '04cd1c6d463ba6752ff68f9125991b1c4af983ae355b62366122ba2d47eee3b2'), H('7005'), 'machine chooser draws FM'), Poke(1074235086, stock_guard(1074235086, 2, '04cd1c6d463ba6752ff68f9125991b1c4af983ae355b62366122ba2d47eee3b2'), H('7005'), 'machine chooser highlights FM'), Poke(1074239748, stock_guard(1074239748, 2, '577d7ba37f9786ab02a7dc9eeb612bb55936018179b550b14f4b9f000a89bf20'), H('7605'), 'machine chooser persists FM'))
MODULE=dataclasses.replace(_SY,
    category=Category.MACHINES, author='timhastie', author_url='https://github.com/timhastie',
    doc='Dedicated FM SYNTH machine: two-operator FM, one to four voices, chords, MIDI and glide.',
    proof=Proof.UNTESTED, proof_note='0.1.2 software regressions pass; owner-approved experimental release, current hardware and chip timing untested',
    requires=(), cf_patches=(),
    symbol_refs=_SY.symbol_refs+(SymbolRef(0x400d6458,0x4000f450,"poly","fm_start",note="Signed FM starts without sample resources; ordinary FLEX keeps stock start"),),
    linked=_SY.linked+_QZ.linked+(
        Linked('fmpage',_REL('upstream/synth/page.s'),cpu='5475',cave_addr=0x400d24d0),
        Linked('fmmachine',_REL('machine.s'),cpu='5475',dram=True),
        Linked('fmregistration',_REL('registration.s'),cpu='5475',dram=True)),
    detours=tuple(d for d in _SY.detours if d.site not in (0x40079816,0x4005a848))+_QZ.detours+_REG_DETOURS+(
        Detour(0x4000d514,stock_guard(0x4000d514,8,'39173055fb04ac0a6c355f89561b48834bc5b31ad67609e3fe53efbff7de1866'),'poly','fm_source_dispatch',kind='jmp',pad_to=8),
        Detour(0x40031ece,stock_guard(0x40031ece,6,'5aed68f7498659f87e414631493741e91f3442c5319f46e6893b567c423ce24f'),'fmpage','pg_resolve',kind='jmp'),),
    pokes=_SY.pokes+_QZ.pokes+_REG_POKES,
    tables=_SY.tables+_QZ.tables,
    pressure_blocker='ColdFire sample generation and maximum-load timing remain unmeasured.')
