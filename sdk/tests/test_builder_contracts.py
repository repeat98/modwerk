"""Synthetic contracts only; never load firmware or execute native code."""
from pathlib import Path
import json,sys,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'octabam/tools'))
import toolpath
from remix.schema import Module,Kind,Poke,Detour,CavePatch,Keep,DramRegion,Linked,Formatter
from remix import ledger,keep,detour_guard,platform_build,registry
BASE=0x40000400
RECIPES=Path(__file__).resolve().parents[2]/'src/engine/assets/descriptor-recipes.json'
def mod(name,**kwargs):return Module(name=name,key=name,kind=Kind.CF_PATCH,doc='Synthetic fixture',**kwargs)
class BuilderContracts(unittest.TestCase):
    def test_an_effect_id_is_preferred_up_to_the_bases_and_a_card_remix_keeps_stocks_32(self):
        from remix.schema import MenuEntry
        effect=lambda name,fx:mod(name,menu=MenuEntry(fx,0,b'T',b'TEST'))
        for fx in (0x06,0x1f,0x20,0x7f):self.assertEqual(effect('a',fx).menu.fx2_id,fx)
        with self.assertRaises(ValueError):effect('a',0x03)
        # Two on one preferred id: the base gives each its own at install; one card image cannot hold both.
        self.assertEqual(ledger.check([effect('a',0x0a),effect('b',0x0a)]),['fx2 id: a and b both claim 0x0a'])
        registry.card_ids('card',[effect('a',0x06),effect('b',0x1f),mod('c')])
        for fx in (0x20,0x7f):
            with self.assertRaisesRegex(SystemExit,"remix 'card': b takes an fx2 id past 0x1f"):registry.card_ids('card',[effect('a',0x1f),effect('b',fx)])
    def test_the_registry_loads_two_modules_on_one_free_id_but_not_on_one_stock_id(self):
        import tempfile
        from remix.schema import MenuEntry
        manifest=lambda name,fx,extra='':f"from remix.schema import Kind,MenuEntry,Module\nMODULE=Module(name={name!r},key={name.upper()!r},kind=Kind.CF_PATCH,doc='synthetic',menu=MenuEntry({fx},0,b'T',b'TEST'{extra}))\n"
        for fx,extra,refused in ((0x0a,'',False),(0x18,",replaces='COMPRESSOR'",True)):
            with self.subTest(fx=fx),tempfile.TemporaryDirectory() as folder:
                for name in ('aa','bb'):(Path(folder)/name).mkdir();(Path(folder)/name/'manifest.py').write_text(manifest(name,fx,extra))
                with patch.object(registry,'MODULES_DIR',Path(folder)),patch.object(registry,'PLATFORM_NAMES',()),patch.object(registry,'_cache',None):
                    if refused:
                        with self.assertRaisesRegex(SystemExit,'two modules claim FX2 id 0x18: aa and bb'):registry.modules()
                    else:self.assertEqual({m.name for m in registry.modules().values() if m.menu.fx2_id==fx},{'aa','bb'})
    def test_offset_tail_overlap_and_adjacency(self):
        a=mod('a',detours=(Detour(BASE+0x100,b'\0'*4,target=BASE,pad_to=10),))
        for offset in (2,6,8):
            b=mod('b',pokes=(Poke(BASE+0x100+offset,b'\0'*2,b'\0'*2),))
            self.assertTrue(ledger.check([a,b]))
        self.assertEqual(ledger.check([a,mod('b',pokes=(Poke(BASE+0x10a,b'\0'*2,b'\0'*2),))]),[])
    def test_kept_overlapping_bytes_and_source_reserve(self):
        a=mod('a',keeps=(Keep(BASE+0x100,b'abcd'),))
        self.assertEqual(ledger.check([a,mod('b',keeps=(Keep(BASE+0x102,b'cd'),))]),[])
        self.assertTrue(ledger.check([a,mod('b',keeps=(Keep(BASE+0x102,b'zz'),))]))
        self.assertTrue(ledger.check([a,mod('b',pokes=(Poke(BASE+0x102,b'cd',b'zz'),))]))
        with self.assertRaises(ValueError):mod('self',keeps=a.keeps,pokes=(Poke(BASE+0x102,b'cd',b'zz'),))
        image=bytearray(b'\0'*0x200);image[0x100:0x104]=b'abcd'
        self.assertEqual(keep.violations(image,BASE,[a]),[])
        image[0x103]=0;self.assertTrue(keep.violations(image,BASE,[a]))
        self.assertTrue(keep.violations(b'',BASE,[a]))
        c=mod('source',cf_patches=(CavePatch('reserve',BASE+0x100,b'\0'*4,reserve=32),))
        self.assertTrue(ledger.check([c,mod('tail',pokes=(Poke(BASE+0x11e,b'\0'*2,b'\0'*2),))]))
    def test_explicit_conflicts_and_region_declarations(self):
        self.assertTrue(ledger.check([mod('a',conflicts=(('b','shared state'),)),mod('b')]))
        with self.assertRaises(ValueError):mod('self',conflicts=(('self','invalid'),))
        with self.assertRaises(ValueError):mod('requires',requires=('a',),conflicts=(('a','invalid'),))
        with self.assertRaises(ValueError):mod('no-runtime',dram_regions=(DramRegion('ring',64),))
        for region in [('_end',64,16),('bad-name',64,16),('x',0,16),('x',16,3),('x',17*1024*1024,16)]:
            with self.assertRaises(ValueError):DramRegion(*region)
        unit=Linked('unit','synthetic.s',dram=True)
        self.assertTrue(ledger.check([mod('a',linked=(unit,),dram_regions=(DramRegion('ring',64),)),mod('b',linked=(unit,),dram_regions=(DramRegion('ring',64),))]))
    def test_legacy_detour_extends_only_verified_original_bytes(self):
        d=Detour(BASE,b'abcd',target=BASE)
        with patch('remix.stock_guard._verified_image',return_value=b'abcdef'):
            self.assertEqual(detour_guard.expected(d),b'abcdef')
        with patch('remix.stock_guard._verified_image',return_value=b'abcdez'):
            self.assertEqual(detour_guard.expected(d),b'abcdez')
        with patch('remix.stock_guard._verified_image',return_value=b'wrong!'):
            with self.assertRaises(ValueError):detour_guard.expected(d)
        with patch('remix.stock_guard._verified_image',side_effect=ValueError('original changed')):
            with self.assertRaises(ValueError):detour_guard.expected(d)
    def test_preboot_avoids_bss_and_regions(self):
        layout=dict(base=0x1000,runtime_end=0x2000,stage=0x2000,stage_end=0x2100,bss_end=0x4000,ceiling=0x10000,regions={'ring':[0xe000,0x1000]})
        def entry(dst):return dict(name='upload',dst=dst,rawlen=16,stage=0x5000,blob=b'packed')
        for dst in (0x3000,0xe010,0x48003000,0x10000):
            with self.assertRaises(ValueError):platform_build.preboot_layout(layout,[entry(dst)])
        self.assertEqual(len(platform_build.preboot_layout(layout,[entry(0x6000)])),2)
    def test_plain_knobs_zero_both_formatter_words(self):
        # Formatter.PLAIN means both words zero, with or without a stepped slot
        # (#626: AIR CHORUS has none and kept DARK REV's words on drawn knobs).
        mods={m.key:m for m in registry.modules().values()}
        for recipe in json.loads(RECIPES.read_text())['recipes']:
            last={w['offset']:w['value'] for w in recipe['integers']}
            drawn=[i for i,p in enumerate(mods[recipe['key']].params) if p.formatter is Formatter.PLAIN and p.active is not False]
            for slot in drawn:
                for word in (0xca,0xfa):
                    self.assertEqual(last.get(word+slot*4),0,f"{recipe['id']} slot {slot} word {word:#x}")
