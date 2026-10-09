"""Compile the owner-reviewed SDK modules without stock firmware.

Run untrusted changes only in the isolated build container. This developer
command executes reviewed native declarations in a disposable source copy.
It assembles and proves relocation; it never boots, renders or stress-tests.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, os, re, shutil, struct, subprocess, sys, tempfile

APP = Path(__file__).resolve().parents[1]
ORDER = ['spectrum', 'modulation', 'character', 'miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'airwindows-chorus', 'everb']
HOOKED = ['sidechain-compressor']
REQUESTED = ['analog-bassdrum', 'midi-scenes', 'usb-audio-out-tracks-main-cue', 'quantizer', 'synth', 'vector', 'playmodes', 'mute-modes', 'recorder-loop-fix', 'poly8']
UTILITIES = ['previewvol', 'cc-map']
ASSET_NAMES = ['dsp-packages.json', 'coldfire-packages.json', 'resident-dsp.json', 'rom-packages.json',
               'bootstrap-package.json', 'menu-recipes.json', 'descriptor-recipes.json', 'platform-writes.json', 'requested-packages.json', 'utility-packages.json', 'usb-audio-packages.json']
HASH = lambda data: hashlib.sha256(data).hexdigest()


def json_file(path): return json.loads(path.read_text())
def code_bytes(words): return b''.join(word.to_bytes(3, 'big') for word in words)
def dump(path, value): path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def run(arguments, cwd):
    result = subprocess.run([str(arg) for arg in arguments], cwd=cwd, capture_output=True, text=True)
    if result.returncode: raise RuntimeError(str(arguments[0]) + ' failed: ' + result.stderr[-2000:])
    return result.stdout


def exported_symbols(elf, root):
    rows = [line.split() for line in run(['m68k-elf-nm', elf], root).splitlines()]
    return {row[2]: int(row[0], 16) for row in rows if len(row) == 3 and row[1].isupper() and row[1] != 'U'}


def validate_source(text):
    if re.search(r'^\s*\.?(?:include|incbin)\b', text, re.M | re.I):
        raise ValueError('Transcluded source or binary content is not allowed in a module package')


def is_documentation(relative):
    """Files in a module folder that no compiler reads. Mirrors isDocumentationPath in scripts/module-source.mjs."""
    parts = relative.split('/')
    if parts[0] != 'modules' or len(parts) < 3: return False
    inside = '/'.join(parts[2:])
    return parts[2] in ('media', 'presentation', 'evidence') and len(parts) > 3 or inside.lower().endswith('.md') or inside == 'qualification.example.json'


def manifest_build_fields(text):
    """The only manifest fields the compilers read, as the same JSON array scripts/module-source.mjs hashes."""
    document = json.loads(text)
    source = document.get('source')
    fields = [document.get('id'), document.get('version'), document.get('key'), (document.get('author') or {}).get('github'),
              [source.get('repository'), source.get('revision'), source.get('path')] if source else None,
              (document.get('compatibility') or {}).get('effectId'), (document.get('build') or {}).get('status')]
    return json.dumps(fields, separators=(',', ':'), ensure_ascii=False)


def source_hashes(root):
    files = {}
    for group in ['modules', 'platform', 'tools', 'dsp', 'licenses']:
        for path in sorted((root / group).rglob('*')):
            if path.is_symlink(): raise ValueError('Source symlinks are not allowed: ' + str(path))
            # Finder metadata is never source; the release checkout never contains it.
            if not path.is_file() or '__pycache__' in path.parts or path.suffix == '.pyc' or path.name == '.DS_Store': continue
            relative = path.relative_to(root).as_posix()
            if is_documentation(relative): continue
            if path.suffix.lower() in ('.bin', '.syx', '.exe', '.dll', '.dylib', '.zip') or path.name == 'stock_labels.json':
                raise ValueError('Firmware/binary input is not allowed in source compilation')
            if re.fullmatch(r'modules/[^/]+/octamod\.module\.json', relative): files[relative] = HASH(manifest_build_fields(path.read_text(encoding='utf-8')).encode())
            else: files[relative] = HASH(path.read_bytes())
    return files


def fingerprint(reference, address):
    from remix.stock_guard import LocalStockSpan
    if isinstance(reference, LocalStockSpan):
        if reference.address != address: raise ValueError('Protected span address differs from its declaration')
        return len(reference), reference.sha256
    if isinstance(reference, bytes): return len(reference), HASH(reference)
    raise ValueError('A protected span must be declared with a fingerprint')


def requested_release_scope(buildable):
    """Permit the reviewed scope; MIDISC2.0 is a standalone local-stock recipe."""
    ordinary = [id for id in buildable if id not in UTILITIES + HOOKED]
    if [id for id in buildable if id in UTILITIES] not in ([], UTILITIES):
        raise ValueError('Unsupported utility module scope')
    scopes = (ORDER, ORDER + REQUESTED, ORDER + [id for id in REQUESTED if id != 'midi-scenes'])
    if ordinary not in scopes:
        raise ValueError('Unsupported reviewed module scope')
    return [id for id in REQUESTED if id in buildable and id != 'midi-scenes']


def retain_pending_requested(compiled, baseline, ids, standalone=False):
    """Keep inactive, previously verified objects unchanged; never compile their pending source."""
    if standalone:
        baseline = dict(baseline, objects=[r for r in baseline['objects'] if r['moduleId'] != 'midi-scenes'], groups=[r for r in baseline['groups'] if r['moduleId'] != 'midi-scenes'], moduleVersions={k:v for k,v in baseline['moduleVersions'].items() if k != 'midi-scenes'})
    pending = set(REQUESTED) - set(ids)
    if pending & set(baseline['moduleVersions']):
        raise ValueError('Pending modules must be absent from verified version pins')
    for field, key in [('objects', 'label'), ('groups', 'moduleId')]:
        actual = {row[key]: row for row in compiled[field]}
        expected = {row[key] for row in baseline[field] if row['moduleId'] not in pending}
        previous = {row[key] for row in baseline[field]}
        new = {row[key] for row in compiled[field] if row[key] not in previous and row['moduleId'] in ids}
        if len(actual) != len(compiled[field]) or set(actual) != expected | new:
            raise ValueError('Compiled requested package scope differs from the verified baseline')
        compiled[field] = [row if row['moduleId'] in pending else actual[row[key]] for row in baseline[field]] + [actual[k] for k in actual if k in new]
    return compiled


def compile_requested(root, known, documents, versions, revision, provenance, native, sources, assembler, disassembler, ids):
    """Authored objects and runtime recipes only; inherited USB spans are masked."""
    byid = {m.name: m for m in known.values()}
    selected = [byid[id] for id in ids + (['repitch'] if 'poly8' in ids else [])] + [known['USB MIDI']]
    selection = {m.key: m for m in selected}
    from remix.machine_composition import POLICY
    composition = json.loads(json.dumps(POLICY))
    objects, groups = [], []
    for m in selected:
        author = documents[m.name]['author']['github'] if m.name in documents else 'markandrus'
        for u in m.linked:
            work = root / 'requested' / u.label; work.mkdir(parents=True)
            text = (root / u.source).read_text(); validate_source(text.replace('.include "remix.inc"', ''))
            extra = []
            if u.include:
                (work / 'remix.inc').write_text(u.include(selection)); extra = ['-I', work]
            obj = work / 'unit.o'; cpu = '54455' if u.dram else u.cpu
            from remix.platform_build import as_defsyms, redefined
            run(['m68k-elf-as', '-mcpu=' + cpu, *extra, *as_defsyms(u.defsyms), '-o', obj, root / u.source], root)
            if redefined(obj, u.defsyms):
                raise ValueError(f'{u.label}: source redefines declared build constants')
            data = bytearray(obj.read_bytes()); copies = []
            if u.stock_copies:
                from remix.stock_copies import object_copies
                copies.extend(object_copies(data, u.stock_copies))
            if u.label == 'usbmidi_cfg':
                shoff, = struct.unpack_from('>I', data, 32); shnum, = struct.unpack_from('>H', data, 48)
                headers = [struct.unpack_from('>10I', data, shoff + i * 40) for i in range(shnum)]
                sym = next(h for h in headers if h[1] == 2); strings = headers[sym[6]]
                names = data[strings[4]:strings[4]+strings[5]]; symbols = {}
                for at in range(sym[4], sym[4] + sym[5], 16):
                    name, value, _, _, _, section = struct.unpack_from('>IIIBBH', data, at)
                    symbols[bytes(names[name:names.index(0,name)]).decode()] = (section, value)
                for label, address in [('cfg_fs',0x400e201c),('cfg_hs',0x400e203c),('cfg_os_fs',0x400e205c),('cfg_os_hs',0x400e207c)]:
                    section, value = symbols[label]; offset = headers[section][4] + value + 9
                    inherited = bytes(data[offset:offset+23]); data[offset:offset+23] = bytes(23)
                    copies.append(dict(section=section, offset=value+9, source=address+9, bytes=23, sha256=HASH(inherited)))
            manifest = 'platform/usb-midi/manifest.py' if m.name == 'usb-midi' else f'modules/{m.name}/manifest.py'
            objects.append(dict(label=u.label,moduleId=m.name,version=documents[m.name]['version'] if m.name in documents else None,key=m.key,author=author,nativeAuthor=m.author,cpu=cpu,dram=u.dram,caveAddress=u.cave_addr,source=u.source,sources={q:sources[q] for q in [u.source,manifest]},bytes=len(data),code=data.hex(),sha256=HASH(data),stockCopies=copies,placement="linked",poolBaseLiterals=0,variants=[]))
        if m.name in ('repitch', 'mute-modes'):
            for unit in m.linked:
                if unit.label not in ('repitch','mm_softmute'): continue
                work = root / 'requested' / unit.label
                pkg = next(row for row in objects if row['label'] == unit.label)
                for sidechain in ([False,True] if m.name=='mute-modes' else [False]):
                    extra=[]
                    if unit.include:
                        includes=dict(selection)
                        if sidechain: includes['SIDECHAIN_COMPRESSOR']=known['SIDECHAIN_COMPRESSOR']
                        (work/'remix.inc').write_text(unit.include(includes));extra=['-I',work]
                    obj=work/('poly-sidechain.o' if sidechain else 'poly.o')
                    run(['m68k-elf-as','-mcpu=54455',*extra,'-o',obj,root/unit.source],root)
                    from remix.platform_build import promote_symbols
                    recipe=next(r for r in composition['groups'] if r['moduleId']==m.name)
                    exports=recipe.get('runtimeExports',{}).get(unit.label,{})
                    promote_symbols(obj,exports.get('symbols',[]) if sidechain and exports.get('whenModule')=='sidechain-compressor' else [])
                    raw=obj.read_bytes()
                    pkg['variants'].append(dict(whenModules=['poly8']+(['sidechain-compressor'] if sidechain else []),withoutModules=[] if sidechain or m.name=='repitch' else ['sidechain-compressor'],bytes=len(raw),code=raw.hex(),sha256=HASH(raw)))
        if m.name == 'synth' and 'poly8' in ids:
            recipe=next(r for r in composition['groups'] if r['moduleId']==m.name)
            for unit in m.linked:
                exports=recipe.get('runtimeExports',{}).get(unit.label,{})
                if not exports: continue
                pkg=next(row for row in objects if row['label']==unit.label)
                work=root/'requested'/unit.label;obj=work/'poly8-exported.o'
                obj.write_bytes(bytes.fromhex(pkg['code']))
                from remix.platform_build import promote_symbols
                promote_symbols(obj,exports['symbols'])
                raw=obj.read_bytes()
                pkg['variants'].append(dict(whenModules=['poly8'],withoutModules=[],bytes=len(raw),code=raw.hex(),sha256=HASH(raw)))
        if m.name == 'mute-modes':
            unit = next(u for u in m.linked if u.label == 'mm_softmute')
            work = root / 'requested' / unit.label
            (work / 'remix.inc').write_text(unit.include({**selection, 'SIDECHAIN_COMPRESSOR': known['SIDECHAIN_COMPRESSOR']}))
            obj = work / 'sidechain.o'
            run(['m68k-elf-as', '-mcpu=' + unit.cpu, '-I', work, '-o', obj, root / unit.source], root)
            raw = obj.read_bytes()
            pkg = next(row for row in objects if row['label'] == unit.label)
            pkg['variants'].append(dict(whenModules=['sidechain-compressor'],withoutModules=['poly8'],bytes=len(raw),code=raw.hex(),sha256=HASH(raw)))
        for index, patch in enumerate(m.cf_patches if m.name == 'recorder-loop-fix' else ()):
            label = 'recorder_cave_' + str(index)
            work = root / 'requested' / label; work.mkdir(parents=True)
            text = (root / patch.source).read_text().replace('.include "modules/recorder-loop-fix/fix.inc"', (root / 'modules/recorder-loop-fix/fix.inc').read_text())
            validate_source(text)
            text = '.text\n.global ' + label + '_entry\n' + label + '_entry:\n' + text
            src = work / 'source.s'; src.write_text(text)
            obj = work / 'unit.o'
            run(['m68k-elf-as', '-mcpu=' + patch.cpu, '-o', obj, src], root)
            raw = obj.read_bytes()
            manifest = 'modules/recorder-loop-fix/manifest.py'
            objects.append(dict(label=label,moduleId=m.name,version=documents[m.name]['version'],key=m.key,author=author,nativeAuthor=m.author,cpu=patch.cpu,dram=False,caveAddress=patch.cave_addr,source=patch.source,sources={q:sources[q] for q in [patch.source,manifest,'modules/recorder-loop-fix/fix.inc']},bytes=len(raw),code=raw.hex(),sha256=HASH(raw),stockCopies=[],placement='cave',poolBaseLiterals=patch.pool_base_literals,variants=[]))
        detours, refs, pokes, tables = [], [], [], []
        for d in m.detours:
            length, digest = fingerprint(d.expect,d.site)
            detours.append(dict(address=d.site,guardLength=length,guardSha256=digest,unit=d.unit,symbol=d.symbol,target=d.target,kind=d.kind,writeLength=d.pad_to or 6,note=d.note))
        for index, patch in enumerate(m.cf_patches if m.name == 'recorder-loop-fix' else ()):
            length,digest=fingerprint(patch.hook_stock,patch.hook_addr)
            label='recorder_cave_'+str(index)
            detours.append(dict(address=patch.hook_addr,guardLength=length,guardSha256=digest,unit=label,symbol=label+'_entry',target=None,kind='jsr',writeLength=length,note=patch.label))
        for r in m.symbol_refs:
            refs.append(dict(address=r.addr,guardLength=4,guardSha256=HASH(r.expect.to_bytes(4,'big')),unit=r.unit,symbol=r.symbol,addend=r.addend,note=r.note))
        for q in m.pokes:
            length,digest=fingerprint(q.expect,q.addr)
            pokes.append(dict(address=q.addr,guardLength=length,guardSha256=digest,code=q.write.hex(),note=q.note))
        for t in m.tables:
            tables.append(dict(label=t.label,old=t.old,count=t.count,symbols=[dict(unit=u,symbol=n) for u,n in t.symbols],refs=[dict(address=a,old=o) for a,o in t.refs],insertAt=t.count if t.insert_at is None else t.insert_at))
        groups.append(dict(moduleId=m.name,key=m.key,author=author,nativeAuthor=m.author,activeWith="poly8" if m.name=="repitch" else None,detours=detours,refs=refs,pokes=pokes,tables=tables))
        rule=next((r for r in composition["groups"] if r["moduleId"]==m.name and "suppliedBy" in r),None)
        if rule is not None: rule["suppliedGroup"]=groups[-1]
    import ab_image, dsp909
    ab_image.OUT = root / 'requested/analog'; dsp909.DSP_ASM=assembler; dsp909.DISASM=disassembler
    lay,vbase=ab_image.layout(); variants=[]
    for tag,c in ab_image.PAY.items():
        words,syms=ab_image.assemble(c['spring'],c['cont'],lay,vbase,tag)
        variants.append(dict(tag=tag,payloadAddress=c['payload'][0],payloadBytes=c['payload'][1],pointer=c['pointer'],spring=c['spring'],null=list(c['null']),seam=c['seam'],entry=syms['zg01'],words=words,sha256=HASH(code_bytes(words)),calls=list(ab_image.SHARED_CALLS[tag]),destination=ab_image.PRE[tag][0],stage=ab_image.PRE[tag][1]))
    analog=dict(variants=variants,xBase=ab_image.TABLES,xWords=ab_image.x_image(lay,vbase),springWords=ab_image.SPRING_WORDS,sharedWords=ab_image.SHARED_WORDS,sharedOffset=ab_image.SHARED_OFFSET,sharedSha256=ab_image.SHARED_SHA256)
    work=root/'requested/bootstrap'; work.mkdir()
    (work/'table.inc').write_text('        .long 1\n        .long blob0,0,0,0,0,0,0,0\n        .align 4\nblob0:\n')
    (work/'pretable.inc').write_text('        .long 2\n        .long preblob0,0,0,0,0,0,0,0\n        .long preblob1,0,0,0,0,0,0,0\n        .align 4\npreblob0:\npreblob1:\n')
    loader = (root/'tools/remix/loader.S').read_text()
    if loader.count('lea     pretable:l,%a2') != 1: raise ValueError('Changed pre-boot pointer needs review')
    (work/'loader.S').write_text(loader.replace('lea     pretable:l,%a2', 'lea     octamod_pre_table:l,%a2'))
    obj=work/'loader.o';run(['m68k-elf-as','-mcpu=5475','-I',work,'--defsym','PREBOOT=1','-o',obj,work/'loader.S'],root)
    raw=obj.read_bytes(); bootstrap=dict(bytes=len(raw),code=raw.hex(),sha256=HASH(raw))
    print(f'Compiled {len(objects)} requested ColdFire objects, both Analog BD engines and stock-free pre-boot skeleton.',flush=True)
    return dict(schema=1,revision=revision,**provenance,objects=objects,groups=groups,composition=composition,analog=analog,bootstrap=bootstrap)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vendor', type=Path, required=True, help='Patched DSP assembler/disassembler toolchain directory')
    parser.add_argument('--output', type=Path, required=True, help='New stock-free artifact directory; never overwritten')
    parser.add_argument('--source-commit', help='Exact clean Octamod Git commit for a release build; absent means development')
    parser.add_argument('--include-requested', action='store_true', help='Development-only assembly for parity verification; does not unlock pending module builds')
    parser.add_argument('--verify-existing', action='store_true', help='Compare every compiled code package with the pinned browser baseline')
    args = parser.parse_args()
    destination, vendor = args.output.resolve(), args.vendor.resolve()
    if destination.exists(): parser.error('Output already exists; refusing to replace immutable artifacts')
    assembler = vendor / 'dsp56300/build/source/dsp_host/dsp_asm'
    disassembler = vendor / 'dsp56300/build/source/disassemble/dsp56kDisassemble'
    if not assembler.is_file() or not disassembler.is_file(): parser.error('Patched DSP assembler and disassembler are required')
    if args.source_commit:
        if not re.fullmatch('[a-f0-9]{40}', args.source_commit): parser.error('An exact source commit is required')
        head = run(['git', 'rev-parse', 'HEAD'], APP).strip()
        if head != args.source_commit: parser.error('Source commit differs from this checkout')
        run(['git', 'diff', '--exit-code', 'HEAD', '--', 'sdk', 'src', 'scripts'], APP)
        if run(['git', 'ls-files', '--others', '--exclude-standard', '--', 'sdk', 'src', 'scripts'], APP).strip():
            parser.error('Untracked source is not allowed in a release build')
    if args.include_requested and args.source_commit: parser.error('Pending modules may be compiled only for local development verification')
    sdk = APP / 'sdk/octabam'
    sources = source_hashes(sdk)
    baseline = {name: json_file(APP / 'src/engine/assets' / name) for name in ASSET_NAMES}
    catalog = json_file(APP / 'sdk/catalog.json')
    catalog_documents = {module['id']: json_file(sdk / 'modules' / module['id'] / 'octamod.module.json') for module in catalog['modules']}
    for module in catalog['modules']:
        if catalog_documents[module['id']]['version'] != module['version']: parser.error('Stale catalog module version: ' + module['id'])
    buildable = [module for module in catalog['modules'] if catalog_documents[module['id']].get('build', {}).get('status') != 'pending']
    try:
        approved_requested = requested_release_scope([module['id'] for module in buildable])
    except ValueError as error:
        parser.error(str(error))
    standalone = 'midi-scenes' in [module['id'] for module in buildable]
    if standalone and catalog_documents['midi-scenes']['version'] != '0.2.4-experimental': parser.error('Unknown standalone MIDI Scenes release')
    requested_ids = [id for id in REQUESTED if id != 'midi-scenes'] if args.include_requested else approved_requested
    if "poly8" in requested_ids:
        # Local PC16 operands can wrap before ELF relocations exist. Run the
        # compiled-address gate in this isolated source-build environment.
        print(run([sys.executable, "-B", sdk / "modules/poly8/verify-addressing.py"], APP).strip(), flush=True)
        print(run([sys.executable, "-B", sdk / "modules/poly8/verify-initialization.py"], APP).strip(), flush=True)
        with tempfile.TemporaryDirectory(prefix="poly8-shared-validation-", dir=destination.parent) as test_dir:
            executable = Path(test_dir) / "shared-validation-test"
            run(["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror",
                 "-fsanitize=address,undefined", "-ffunction-sections", "-fdata-sections",
                 sdk / "modules/poly8/shared-machine.c",
                 sdk / "modules/poly8/shared-validation-test.c",
                 sdk / "modules/vector/persistence.c", "-Wl,--gc-sections",
                 "-o", executable], APP)
            print(run([executable], APP).strip(), flush=True)
    include_requested = bool(requested_ids)
    versions = {module['id']: module['version'] for module in buildable}
    hooked_ids = [id for id in HOOKED if id in versions]
    revision = catalog['sourceRevision']
    utility_ids = [id for id in UTILITIES if id in versions]
    documents = {id: json_file(sdk / 'modules' / id / 'octamod.module.json') for id in ORDER + REQUESTED + utility_ids + hooked_ids}
    provenance = {'sourceCommit': args.source_commit, 'moduleVersions': versions}
    products = {}
    with tempfile.TemporaryDirectory(prefix='octamod-source-build.') as temporary:
        root = Path(temporary)
        # Pending imports stay in the source fingerprint, but are never evaluated or compiled.
        (root / 'modules').mkdir()
        for id in ORDER + requested_ids + utility_ids + hooked_ids:
            shutil.copytree(sdk / 'modules' / id, root / 'modules' / id, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))
        for group in ['platform', 'tools', 'dsp']:
            shutil.copytree(sdk / group, root / group, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))
        sys.path[:0] = [str(root / 'tools'), str(root / 'tools/build')]
        os.chdir(root)
        for flag in ('NOSHIM', 'MARKER', 'PROBE', 'XPROBE', 'TPROBE', 'DELAYPROBE', 'RVSRC', 'DLSRC', 'NOROUNDTRIP'):
            os.environ.pop(flag, None)
        os.environ.update(REMIX='source-build', XBUS='1', SPEC='1', DEV='0', OCTABAM_STATIC_STOCK='0', BUILD='79')
        import toolpath
        from remix import registry, stock_guard
        from remix.schema import Remix
        def deny_stock(): raise RuntimeError('Source builds never accept or resolve stock firmware')
        stock_guard._verified_image = deny_stock
        registry.PLATFORM_NAMES = ('dsp-dynload-stock', 'dsp-dynload-stock-b') + (('usb-midi',) if include_requested else ())
        known = registry.modules()
        byid = {module.name: module for module in known.values()}
        public = sorted(module.name for module in known.values() if not module.is_stock and module.name not in registry.PLATFORM_NAMES)
        if public != sorted(ORDER + requested_ids + utility_ids + hooked_ids): raise ValueError('Unexpected module scope')
        for id in ORDER + hooked_ids:
            module, doc = byid[id], documents[id]
            if doc['version'] != versions[id] or doc['key'] != module.key or doc['author']['github'] != module.author or doc['compatibility']['effectId'] != (module.menu.fx2_id if module.menu else None):
                raise ValueError(id + ': website metadata differs from its native declaration')
        profile = registry.with_platform(Remix(name='source-build', doc='Compile authored packages without firmware.', modules=tuple(byid[id].key for id in ORDER + hooked_ids), fallback='NONE'), known)
        registry.remix = lambda _: profile
        import build_bus as native
        import label_fmt, mode_names, wide_dial
        from remix import platform_build
        native.DIS, native.DISASM = assembler, disassembler

        def hashes(*paths): return {path: sources[path] for path in paths}
        def package(module, text):
            validate_source(text)
            words, relocations, init, proc = native._package(module.key, text, tuple(module.dsp.ptable))
            proofs = []
            for base in (0x1000, 0x1400, 0x1801, 0x2407):
                fresh, _ = native.assemble_syms(text.replace(native.PTABLE_LITERAL, f'${base:x}'), base + len(module.dsp.ptable), label=module.key)
                proofs.append({'base': base, 'sha256': HASH(code_bytes(list(module.dsp.ptable) + fresh))})
            code = code_bytes(words)
            return {'id': module.name, 'version': versions[module.name], 'key': module.key, 'author': module.author,
                    'sources': hashes(module.dsp.asm, f'modules/{module.name}/manifest.py'), 'fxId': module.menu.fx2_id,
                    'words': len(words), 'code': code.hex(), 'sha256': HASH(code), 'relocations': relocations,
                    'init': init, 'proc': proc, 'proofs': proofs}

        packages = []
        for id in sorted(ORDER):
            module = byid[id]
            if not module.dsp or id == 'character': continue
            text = native._loadable_text(module)
            if text is None: raise ValueError(id + ': changed native placement needs a supported browser recipe')
            packages.append(package(module, text))

        for id in hooked_ids:
            module = byid[id]
            if not module.menu.stock_dsp or not module.dsp.hooks:
                raise ValueError(id + ': stock DSP hook package requires a preserved dispatch and hooks')
            text = (root / module.dsp.asm).read_text()
            for tag in sorted(module.dsp.payloads):
                source = module.dsp.source_for(tag, text)
                validate_source(source)
                words, symbols = native.assemble_syms(source.replace(native.PTABLE_LITERAL, '$0'), len(module.dsp.ptable), label=module.key)
                words = list(module.dsp.ptable) + words
                relocations = None; proofs = []
                for base in (0x1000, 0x1400, 0x1801, 0x2407):
                    fresh, _ = native.assemble_syms(source.replace(native.PTABLE_LITERAL, '$'+format(base,'x')), base + len(module.dsp.ptable), label=module.key)
                    fresh = list(module.dsp.ptable) + fresh
                    changed = [i for i, (a,b) in enumerate(zip(words,fresh)) if a != b]
                    if len(fresh) != len(words) or any(fresh[i] != words[i] + base or not 0 <= words[i] < len(words) for i in changed):
                        raise ValueError(id + ': unsupported relocation')
                    if relocations is not None and changed != relocations: raise ValueError(id + ': origin-dependent relocation map')
                    relocations = changed
                    proofs.append({'base':base,'sha256':HASH(code_bytes(fresh))})
                hooks = [{'site':h.site_on(tag),'words':len(h.stock),'guardSha256':h.stock.sha256,
                          'entry':symbols[h.label],'note':h.note} for h in module.dsp.hooks]
                code = code_bytes(words)
                packages.append({'id':id,'version':versions[id],'key':module.key,'author':module.author,
                    'sources':hashes(module.dsp.asm,f'modules/{id}/manifest.py'),'fxId':module.menu.fx2_id,
                    'tag':tag,'stockDsp':True,'stockKey':module.menu.replaces,
                    'words':len(words),'code':code.hex(),'sha256':HASH(code),'relocations':relocations,
                    'init':hooks[0]['entry'],'proc':hooks[1]['entry'],'hooks':hooks,'proofs':proofs})

        products['dsp-packages.json'] = {'schema': 1, 'revision': revision, 'license': '/licenses/octabam.txt', **provenance,
            'packages': packages, 'excluded': [{'id': 'character', 'reason': 'Native resident placement.'}]}
        print('Compiled loadable DSP modules with four-origin relocation proofs.', flush=True)

        character = byid['character']
        text = (root / character.dsp.asm).read_text()
        text = re.sub(r'\$9([0-9a-f]{2})\b', lambda match: '$%x' % (0x36000 + int(match[1], 16)), text)
        if any(marker in text for marker in ('; ROTLATCH', '; XBUS_GATE', '.include', '.incbin')): raise ValueError('Changed resident placement needs review')
        resident = package(character, text)
        resident.update(mode='resident', xbusBase=0x36000, ptableMemory='P')
        receiver_source = 'platform/dsp-dynload-transport/receiver_runtime.asm'
        receiver = (root / receiver_source).read_text()
        marker = '; OCTAMOD_LOCAL_NULL_STUB'
        if receiver.count(marker) != 1: raise ValueError('Receiver must reserve exactly one local stock tail')
        receiver = receiver.replace(marker, '; stock-free reserved tail during source compilation')
        validate_source(receiver)
        variants = []
        for old in baseline['resident-dsp.json']['variants']:
            payload = next(row for row in json_file(APP / 'src/engine/assets/stock-dsp-metadata.json')['payloads'] if row['core'] == old['core'])
            table = payload['sharedEnd'] + (resident['words'] if old['hasCharacter'] else 0)
            probe, _ = native.assemble_syms(receiver.replace('@DLWORDS@', '0').replace('$fab1e0', f'${table:x}'), table, label='DSP DYNLOAD STOCK')
            arena = payload['effectEnd'] - table - len(probe)
            if arena < 1131: raise ValueError('Receiver and module do not fit the stock DSP region')
            code_address = table + arena
            words, symbols = native.assemble_syms(receiver.replace('@DLWORDS@', str(arena)).replace('$fab1e0', f'${table:x}'), code_address, label='DSP DYNLOAD STOCK')
            offset = symbols['dlstubinit'] - code_address
            if len(words) != len(probe) or len(words) - offset != 9 or symbols['dlstubdone'] != code_address + offset + 8: raise ValueError('Receiver reserved-tail geometry differs')
            masked = words[:offset] + [0] * 9
            copy = dict(old['stockCopy'], destinationOffset=offset, sha256=None,
                        adjustments=[{'offset': 3, 'delta': code_address + offset - old['stockCopy']['sourceAddress']}])
            # Static dispatch entries stay on stock's own null stub (the declared copy source); the receiver
            # redirects ids to its local copy only at runtime. The native static-placement oracle relies on that.
            variant = dict(old, tableAddress=table, tableWords=arena, codeAddress=code_address, words=len(words),
                           code=code_bytes(masked).hex(), sha256=HASH(code_bytes(masked)), frame=symbols['frame'], nullInit=copy['sourceAddress'], nullProc=copy['sourceAddress'] + 1, stockCopy=copy, completeSha256=None)
            if variant['sha256'] == old['sha256'] and copy['adjustments'] == old['stockCopy']['adjustments']:
                variant['completeSha256'] = old['completeSha256']; copy['sha256'] = old['stockCopy']['sha256']
            variants.append(variant)
        products['resident-dsp.json'] = dict(baseline['resident-dsp.json'], **provenance, character=resident, variants=variants,
            receiverSource=receiver_source, receiverSourceSha256=sources[receiver_source])
        print('Compiled resident Character and four stock-free receiver templates.', flush=True)

        compiled_cf = []
        for key in ['DSP DYNLOAD STOCK', 'EUCLID', 'TAPE ECHO']:
            module = known[key]
            manifest = f'platform/{module.name}/manifest.py' if module.name in registry.PLATFORM_NAMES else f'modules/{module.name}/manifest.py'
            for unit in module.linked:
                if not unit.dram or unit.include is not None: continue
                text = (root / unit.source).read_text(); validate_source(text)
                obj = root / (unit.label + '.o')
                run(['m68k-elf-as', '-mcpu=54455', '-o', obj, unit.source], root)
                data = obj.read_bytes()
                compiled_cf.append({'label': unit.label, 'moduleId': module.name, 'version': versions.get(module.name),
                    'key': module.key, 'author': module.author, 'cpu': '54455', 'dram': True, 'source': unit.source,
                    'sources': hashes(unit.source, manifest), 'bytes': len(data), 'code': data.hex(), 'sha256': HASH(data)})
        products['coldfire-packages.json'] = dict(baseline['coldfire-packages.json'], **provenance, packages=compiled_cf)

        rom = []
        for old in baseline['rom-packages.json']['packages']:
            module = byid.get(old['moduleId'])
            source = old['source']; original = (root / source).read_text()
            text = wide_dial.source([]) if old['label'] == 'wide-dial' else original
            validate_source(text)
            asm, obj = root / (old['label'] + '.s'), root / (old['label'] + '.o'); asm.write_text(text)
            run(['m68k-elf-as', '-mcpu=' + old['cpu'], '-o', obj, asm], root)
            data = obj.read_bytes(); proofs = []
            for proof in old['proofs']:
                elf, binary = root / 'rom.elf', root / 'rom.bin'
                run(['m68k-elf-ld', f'-Ttext=0x{proof["base"]:x}', *[f'--defsym={key}=0x{value:x}' for key, value in proof['externals'].items()], '-o', elf, obj], root)
                run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', elf, binary], root)
                raw = binary.read_bytes()
                if old['label'] == 'tape-time' and raw != byid['tapeecho'].cf_patches[0].pinned: raise ValueError('Authored Tape TIME source differs from its pinned reference')
                proofs.append(dict(proof, bytes=len(raw), sha256=HASH(raw), exports=exported_symbols(elf, root)))
            rom.append(dict(old, version=versions.get(old['moduleId']), key=module.key if module else old['key'],
                author=module.author if module else old['author'], sourceSha256=sources[source], bytes=len(data), code=data.hex(), sha256=HASH(data), proofs=proofs))
        products['rom-packages.json'] = dict(baseline['rom-packages.json'], **provenance, packages=rom)
        (root / 'table.inc').write_text('        .long 1\n        .long blob0,0,0,0,0,0,0,0\n        .align 4\nblob0:\n')
        obj = root / 'bootstrap.o'
        run(['m68k-elf-as', '-mcpu=5475', '-I', root, '-o', obj, root / 'tools/remix/loader.S'], root)
        data = obj.read_bytes()
        products['bootstrap-package.json'] = dict(baseline['bootstrap-package.json'], **provenance,
            sourceSha256=sources['tools/remix/loader.S'], bytes=len(data), code=data.hex(), sha256=HASH(data))
        print('Compiled eleven ColdFire runtime objects, four ROM units and the authored bootstrap.', flush=True)

        recipes = []
        for id in ORDER:
            module = byid[id]
            for slot, param in enumerate(module.params):
                if not param.prints_labels: continue
                views = module.name_views_for(slot)
                names = mode_names.complete(module, slot, views) if views else {}
                if slot == module.mode_slot: names = mode_names.with_selfname(names, slot, param.labels)
                encoded = {str(value): {str(key): label.decode('latin1') for key, label in row.items()} for value, row in names.items()}
                proofs = []
                for address in (0x400d6b36, 0x400d7376):
                    code = mode_names.emit(param.labels, address, names) if names else label_fmt.emit(param.labels)
                    proofs.append({'namesAddress': address, 'bytes': len(code), 'sha256': HASH(code)})
                recipes.append({'id': id, 'key': module.key, 'author': module.author, 'slot': slot, 'name': param.name.decode('latin1'),
                    'labels': list(param.labels), 'renames': encoded, 'wideMaximum': param.count - 1 if slot in module.wide_stepped_slots else None, 'proofs': proofs})
        repitch = byid['repitch']; patches = []
        for detour in repitch.detours:
            length, sha = fingerprint(detour.expect, detour.site)
            if detour.kind != 'jmp' or detour.unit != 'repitch': raise ValueError('Unsupported Repitch detour')
            patches.append({'address': detour.site, 'guardLength': length, 'guardSha256': sha, 'kind': 'detour', 'symbol': detour.symbol, 'bytes': detour.pad_to or 6, 'note': detour.note})
        for ref in repitch.symbol_refs:
            patches.append({'address': ref.addr, 'guardLength': 4, 'guardSha256': HASH(ref.expect.to_bytes(4, 'big')), 'kind': 'pointer', 'symbol': ref.symbol, 'addend': ref.addend, 'note': ref.note})
        for poke in repitch.pokes:
            length, sha = fingerprint(poke.expect, poke.addr)
            patches.append({'address': poke.addr, 'guardLength': length, 'guardSha256': sha, 'kind': 'poke', 'code': poke.write.hex(), 'note': poke.note})
        products['menu-recipes.json'] = dict(baseline['menu-recipes.json'], **provenance, recipes=recipes, repitchPatches=patches)

        descriptors = []
        descriptor_guards = list(baseline['descriptor-recipes.json']['recipes'])
        if not any(row['id'] == 'airwindows-chorus' for row in descriptor_guards):
            # Locally verified 1.40C: same donor and unused-slot fingerprint as
            # Character. Only addresses/hashes are retained, never stock bytes.
            donor = next(row for row in descriptor_guards if row['id'] == 'character')
            descriptor_guards.append(dict(donor, id='airwindows-chorus', key='AIR CHORUS',
                author='repeat98', fxId=0x1e, fx2Slot=0x400d6054))
        if not any(row['id'] == 'everb' for row in descriptor_guards):
            # Locally verified on private OS 1.40C: DARK REV descriptor and
            # stock NONE at unused FX2 id 0x1b. Never retain stock bytes.
            descriptor_guards.append(dict(id='everb', key='EVERB', author='user1303836',
                fxId=0x1b, donorAddress=0x400d58f0,
                donorSha256='3b3f9b15f2f6addfea9fc281f5b9fdf054bf305778059b8d43db41d390f0401f',
                fx2Slot=0x400d6048,
                slotSha256='79bc740214b4d029e385d06d21e224d04e8f91b53fb26ea08ffa4e5d70964b7a'))
        for old in descriptor_guards:
            module = byid[old['id']]
            if module.menu.donor_desc + 0x38 != old['donorAddress'] or module.menu.fx2_id != old['fxId']:
                raise ValueError(module.name + ': changed stock descriptor/ID needs locally verified guard metadata')
            integers = []; strings = []
            def integer(offset, size, value): integers.append({'offset': offset, 'width': size, 'value': value})
            def string(offset, maximum, value): strings.append({'offset': offset, 'width': maximum, 'value': value.decode('latin1')})
            name = native.FULLNAME[module.key]
            integer(native.P_ID_BYTE, 1, module.menu.fx2_id)
            string(native.P_ABBR, 5, module.menu.abbr); string(native.P_FULLNAME, 13, name)
            for slot, param in enumerate(module.params):
                if param.name is not None: string(0x16 + slot * 6, 6, param.name)
                if param.default is not None: integer(0x5e + slot, 1, param.default)
            if module.stepped_slots:
                for slot in range(12):
                    integer(0xca + slot * 4, 4, 0); integer(0xfa + slot * 4, 4, 0)
            for slot in module.stepped_slots:
                integer(0xca + slot * 4, 4, 0x4003c718); integer(0xfa + slot * 4, 4, 0x40047254 if module.params[slot].count is not None and module.params[slot].count <= 5 else 0); integer(0x12a + slot * 4, 4, 0)
            for slot in module.bipolar_slots:
                integer(0xca + slot * 4, 4, 0x4003c7a0); integer(0xfa + slot * 4, 4, 0); integer(0x12a + slot * 4, 4, 0x400328e4)
            for slot, param in enumerate(module.params):
                if param.count is not None: integer(0x9a + slot * 4, 4, param.count); integer(0x6a + slot * 4, 4, 0)
            raw = []
            for slot, param in enumerate(module.params):
                for offset, value in [(0xca, param.formatter_word), (0xfa, param.widget_word), (0x12a, param.word_12a)]:
                    if value is None: continue
                    if isinstance(value, int): integer(offset + slot * 4, 4, value)
                    else: raw.append({'offset':offset + slot * 4,'unit':value[0],'symbol':value[1]})
            lo, hi = native.penable(module.active_params, module.linked_params)
            integer(native.P_PENABLE_LO, 4, lo); integer(native.P_PENABLE_HI, 4, hi)
            extra = {'inheritedEnable': list(module.inherited_enable), 'rawPointers':raw, 'replaces':module.menu.replaces} if module.menu.stock_dsp else {}
            descriptors.append(dict(old, sourceSha256=sources[f'modules/{module.name}/manifest.py'], integers=integers, strings=strings, **extra))
        products['descriptor-recipes.json'] = dict(baseline['descriptor-recipes.json'], **provenance, recipes=descriptors)
        groups = []
        for old in baseline['platform-writes.json']['groups']:
            module = known[old['key']]; rows = []
            for detour in module.detours:
                length, sha = fingerprint(detour.expect, detour.site)
                if detour.kind not in ('jmp', 'jsr') or detour.target is not None: raise ValueError('Unsupported native detour')
                rows.append({'address': detour.site, 'length': length, 'sha256': sha, 'note': detour.note, 'unit': detour.unit,
                             'symbol': detour.symbol, 'kind': detour.kind, 'writeLength': detour.pad_to or 6})
            manifest = f'platform/{module.name}/manifest.py' if module.name in registry.PLATFORM_NAMES else f'modules/{module.name}/manifest.py'
            groups.append(dict(old, source=manifest, sourceSha256=sources[manifest], detours=rows))
        products['platform-writes.json'] = dict(baseline['platform-writes.json'], **provenance, groups=groups)
        if include_requested:
            requested = compile_requested(root, known, documents, versions, revision, provenance, native, sources, assembler, disassembler, requested_ids)
            products['requested-packages.json'] = retain_pending_requested(requested, baseline['requested-packages.json'], requested_ids + (['repitch'] if 'poly8' in requested_ids else []), standalone=standalone) if not args.include_requested else requested
        if stock_guard._cache is not None: raise RuntimeError('Stock must never be read during source compilation')
        if native._SCRATCH is not None: shutil.rmtree(native._SCRATCH, ignore_errors=True)

    if args.verify_existing:
        for name in ['dsp-packages.json', 'coldfire-packages.json', 'rom-packages.json']:
            key = 'id' if name == 'dsp-packages.json' else 'label'
            expected = {(row[key],row.get('tag')): row for row in baseline[name]['packages']}
            for row in products[name]['packages']:
                if row['code'] != expected[(row[key],row.get('tag'))]['code']: raise ValueError(name + ': compiled code differs from native baseline for ' + row[key])
        if products['resident-dsp.json']['character']['code'] != baseline['resident-dsp.json']['character']['code']: raise ValueError('Resident Character differs from baseline')
        # Placement and dispatch bindings change composed firmware as much as code bytes do.
        for row, old in zip(products['resident-dsp.json']['variants'], baseline['resident-dsp.json']['variants']):
            if row != old: raise ValueError('Receiver differs from baseline: ' + ', '.join(sorted(key for key in row.keys() | old.keys() if row.get(key) != old.get(key))))
        if products['bootstrap-package.json']['code'] != baseline['bootstrap-package.json']['code']: raise ValueError('Bootstrap differs from baseline')
        for name, field in [('menu-recipes.json', 'recipes'), ('menu-recipes.json', 'repitchPatches')]:
            if products[name][field] != baseline[name][field]: raise ValueError(name + ': native recipes differ')
        for name, field in [('descriptor-recipes.json', 'recipes'), ('platform-writes.json', 'groups')]:
            strip_source = lambda rows: [{key: value for key, value in row.items() if key not in ('source', 'sourceSha256')} for row in rows]
            if strip_source(products[name][field]) != strip_source(baseline[name][field]): raise ValueError(name + ': native declarations differ')
        if [row['proofs'] for row in products['rom-packages.json']['packages']] != [row['proofs'] for row in baseline['rom-packages.json']['packages']]: raise ValueError('ROM relocation proofs differ')
        if include_requested:
            clean = lambda doc: {key: value for key, value in doc.items() if key not in ('sourceCommit', 'moduleVersions')}
            if clean(products['requested-packages.json']) != clean(baseline['requested-packages.json']): raise ValueError('Requested authored packages or placement recipes differ from the verified baseline')
        print('Every authored compiled package and receiver matches the existing browser/native baseline.', flush=True)

    regions = [dict(moduleId=m.name, symbol=r.symbol, size=r.size, align=r.align)
               for m in known.values() for r in m.dram_regions]
    if any(m.keeps or m.conflicts or any(c.reserve for c in m.cf_patches) for m in known.values()):
        contracts = []
        for m in known.values():
            contracts.append(dict(moduleId=m.name, key=m.key,
                spans=[dict(kind=k, address=a, bytes=n, label=l) for k,a,n,l in m.write_spans()],
                keeps=[dict(address=k.addr, bytes=fingerprint(k.expect,k.addr)[0], sha256=fingerprint(k.expect,k.addr)[1]) for k in m.keeps],
                conflicts=[dict(key=k, reason=r) for k,r in m.conflicts]))
        products['coldfire-packages.json']['contracts'] = contracts
    if regions:
        products['coldfire-packages.json']['memoryRegions'] = regions

    os.chdir(APP)
    if utility_ids:
        spec = importlib.util.spec_from_file_location('octamod_utility_compiler', APP / 'scripts/build-utility-packages.py')
        compiler = importlib.util.module_from_spec(spec); spec.loader.exec_module(compiler)
        products['utility-packages.json'] = compiler.compile_packages(APP, provenance=provenance)
    spec = importlib.util.spec_from_file_location('modwerk_usb_compiler', APP / 'scripts/build-usb-audio-packages.py')
    usb_compiler = importlib.util.module_from_spec(spec); spec.loader.exec_module(usb_compiler)
    products['usb-audio-packages.json'] = dict(usb_compiler.build(), **provenance)
    destination.mkdir(parents=True)
    files = {}
    notice_name = 'THIRD_PARTY_NOTICES.txt'
    notice_bytes = (sdk / 'licenses' / notice_name).read_bytes()
    (destination / notice_name).write_bytes(notice_bytes)
    notices = {'name': notice_name, 'bytes': len(notice_bytes), 'sha256': HASH(notice_bytes)}
    for name in products:
        path = destination / name; dump(path, products[name]); files[name] = {'bytes': path.stat().st_size, 'sha256': HASH(path.read_bytes())}
    tree = HASH(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode())
    dump(destination / 'module-build.json', {'schemaVersion': 1, 'kind': 'source-packages', 'sourceCommit': args.source_commit,
        'nativeRevision': revision, 'sourceTreeSha256': tree, 'moduleVersions': versions, 'sources': sources, 'files': files, 'notices': notices,
        'compilerSha256': HASH(Path(__file__).read_bytes()),
        'stockRead': False, 'qualification': 'assembly and relocation only; no new hardware, audio or stress qualification'})
    print('Stock-free source artifact written to ' + str(destination), flush=True)


if __name__ == '__main__': main()
