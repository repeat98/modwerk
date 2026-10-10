"""Native complete-image identities and chooser facts. Never retain stock bytes."""
import argparse,contextlib,hashlib,importlib,io,json,os,pathlib,shutil,subprocess,sys,tempfile

def sha(data):return hashlib.sha256(data).hexdigest()
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('worktree',type=pathlib.Path);p.add_argument('destination',type=pathlib.Path);p.add_argument('--app',type=pathlib.Path,required=True);p.add_argument('--stock-bin',type=pathlib.Path);p.add_argument('--static-stock',action='store_true',help='Loader-free builds: stock DSP code stays built in; every module subset with and without stock FX2')
    p.add_argument('--vendored-sdk',action='store_true',help='Verify reviewed SDK sources against the app checkout instead of the legacy upstream worktree')
    p.add_argument('--suite',choices=['original','tapehead','tapehead-utilities','sidechain','sidechain-visible','sidechain-analog-bd','analog-bd','visible'],default='original')
    p.add_argument('--modules',help='Generic mode (scripts/module-verify.mjs): the comparison pool, comma-separated in catalog order. Builds only the --select profiles, with chooser menus from --menus keyed by selection.')
    p.add_argument('--metadata-only',action='store_true',help='Write chooser-metadata.json for the --modules pool and build nothing.')
    p.add_argument('--cache',action='store_true',help="Reuse octabam's content-addressed compiler memo (source, options and tool bytes are in its key; placement and validation still run). Evidence is made without it unless this is given.")
    p.add_argument('--verbose',action='store_true',help='Print each native build log (placement addresses, no firmware bytes).')
    p.add_argument('--image-dir',type=pathlib.Path,help='Write each native image here for private diffing. Stock-derived: keep it outside the checkout and delete it afterwards.')
    p.add_argument('--select',action='append',help='Build only this profile: module ids joined by +, then :true or :false (repeatable)')
    p.add_argument('--menus',type=pathlib.Path,help='Precomputed defaultChoosers JSON for containers without Node')
    p.add_argument('--shard',type=int,default=0);p.add_argument('--shards',type=int,default=1)
    p.add_argument('--packing-vendor',type=pathlib.Path,help='Reviewed local elektron-firmware-tool checkout')
    a=p.parse_args();root=a.worktree.resolve();app=a.app.resolve();dest=a.destination.resolve();dest.mkdir(parents=True,exist_ok=True)
    if not 0<=a.shard<a.shards:p.error('Invalid shard index/count.')
    if a.vendored_sdk:
        revision=json.loads((app/'sdk/catalog.json').read_text())['sourceRevision']
        # Run only in the private isolated container, after source review. Fingerprint
        # every executable source against the reviewed checkout before importing it.
        for directory in ['modules','platform','tools','dsp','licenses']:
            expected={str(path.relative_to(app/'sdk/octabam')):sha(path.read_bytes()) for path in (app/'sdk/octabam'/directory).rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc'}
            actual={str(path.relative_to(root)):sha(path.read_bytes()) for path in (root/directory).rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc'}
            if actual!=expected:p.error('Private SDK differs from reviewed source: '+directory)
    else:
        revision=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
        if revision!=json.loads((app/'src/catalog/native-metadata.json').read_text())['revision']:p.error('Use the pinned worktree.')
        if subprocess.run(['git','-C',str(root),'diff','--quiet','HEAD']).returncode:p.error('Native tracked sources must be clean.')
    if (a.suite!='original' or a.modules) and not(a.vendored_sdk and a.static_stock):p.error('This suite requires the reviewed vendored SDK and static stock mode.')
    if a.metadata_only and not a.modules:p.error('--metadata-only needs --modules.')
    original=(root/'out/raw/section_3_MAIN_OS.bin').read_bytes();sourceHash=json.loads((app/'src/engine/assets/stock-dsp-metadata.json').read_text())['sourceSha256']
    if sha(original)!=sourceHash:p.error('Original OS fingerprint mismatch.')
    sys.path[:0]=[str(root/'tools/build'),str(root/'tools')];os.chdir(root)
    os.environ.update(REMIX='tapehead-spring' if a.vendored_sdk else 'miniverb',XBUS='1',SPEC='1',DEV='0',NOROUNDTRIP='0',OCTABAM_STATIC_STOCK='1' if a.static_stock else '0',OCTABAM_NO_CACHE='0' if a.cache else '1',BUILD='79')
    import toolpath,dsp_modmap as dm
    dm.IMG=root/'out/raw/section_3_MAIN_OS.bin'
    from remix import registry,stock
    from remix.schema import Remix
    known=registry.modules()
    # build_bus reads a remix when it is imported. The vendored SDK carries no remixes, so it gets an empty probe; every case below
    # installs its own before importing build_bus again.
    if a.vendored_sdk:registry.remix=lambda _:registry.with_platform(Remix(name='octamod-probe',doc='Import probe; never built.',modules=(),fallback='NONE'),known)
    from build_bus import fx1_hazard
    order=['spectrum','modulation','character','miniverb','tapeecho','euclid','repitch']+(['tapehead'] if a.vendored_sdk else []);
    if a.suite=='tapehead':order=['miniverb','tapeecho','euclid','repitch','tapehead','analog-bassdrum','usb-audio-out-tracks-main-cue','quantizer']
    if a.suite=='tapehead-utilities':order=['repitch','tapehead','usb-audio-out-tracks-main-cue','quantizer','previewvol','cc-map']
    if a.suite=='sidechain':order=['spectrum','modulation','character','miniverb','tapeecho','euclid','repitch','tapehead','sidechain-compressor']
    # Retain historical suites; the Analog BD suite below covers its current shared layout.
    if a.suite=='sidechain-visible':order=['miniverb','tapeecho','euclid','repitch','tapehead','usb-audio-out-tracks-main-cue','quantizer','previewvol','cc-map','sidechain-compressor']
    if a.suite=='visible':order=['miniverb','tapeecho','euclid','repitch','tapehead','usb-audio-out-tracks-main-cue','quantizer','previewvol','cc-map']
    if a.suite in ('sidechain-analog-bd','analog-bd'):order=['analog-bassdrum','miniverb','tapeecho','euclid','repitch','tapehead','airwindows-chorus','usb-audio-out-tracks-main-cue','quantizer','previewvol','cc-map','sidechain-compressor']
    if a.modules:order=a.modules.split(',')
    if a.vendored_sdk:order=[row['id'] for row in json.loads((app/'sdk/catalog.json').read_text())['modules'] if row['id'] in order]
    byid={m.name:m for m in known.values()}
    stockKeys={m.menu.fx2_id:m.key for m in known.values() if m.is_stock and m.menu is not None}
    stockFx1=[stockKeys[id] for id in stock.fx1_order() if id];stockFx2=[stockKeys[id] for id in stock._chooser_order(stock.FX2_CHOOSER) if id]
    # CPU Tape Echo is a post-FX2 contribution; a hazard-free DSP shim alone
    # does not establish that its ColdFire effect runs on FX1.
    # Effects whose manifest places them on FX1 (spectrum, modulation, character, euclid, tapehead and sidechain-compressor today).
    fx1Capable={row['id'] for row in json.loads((app/'src/catalog/module-documents.json').read_text())['modules'] if 'FX1' in row['compatibility']['location']}
    modules=[]
    for id in order:
        m=byid[id]
        modules.append({'id':id,'key':m.key,'fxId':m.menu.fx2_id if m.menu else None,'fx1':m.name in fx1Capable and m.menu is not None and fx1_hazard(m) is None,'fx1Only':bool(m.claims and m.claims.fx1_only),**({'replaces':m.menu.replaces} if m.menu and m.menu.stock_dsp else {})})
    def profile(ids,default):
        selected=[byid[id] for id in order if id in ids]
        fx1=stockFx1+[m.key for m in selected if m.name in fx1Capable and m.menu and fx1_hazard(m) is None] if default or ids==order else []
        hidden=[m.key for m in selected if m.key in fx1 and m.claims and m.claims.fx1_only]
        fx2=stockFx2+[m.key for m in selected if m.menu and m.key not in hidden] if default else [m.key for m in selected if m.menu and m.key not in hidden]
        return {'fx1':fx1,'fx2':fx2,'hidden':hidden}
    cases=[([],False),(['repitch'],False),(['tapeecho','euclid'],False),(order,False),([],True),(['spectrum','modulation','character','euclid'],True),(order[:-1],True),(['miniverb','tapeecho','euclid','repitch'],True),(order,True)]
    if a.static_stock and not a.modules:
        # The site's own chooser rule, read from choosers.ts defaultChoosers (Node 24): stock FX1 plus FX1-capable
        # modules; stock FX2 minus the effects whose code the modules take when kept, none when not. Every subset,
        # both ways, so each selection a visitor can make has an oracle.
        cases=[([id for bit,id in enumerate(order) if mask>>bit&1],keep) for mask in range(1<<len(order)) for keep in (True,False)]
        site="import {readFileSync} from 'node:fs';const {defaultChoosers}=await import(process.argv[1]);console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(([ids,keep])=>defaultChoosers(ids,keep,false))))"
        menus=json.loads(a.menus.read_text()) if a.menus else json.loads(subprocess.run(['node','--input-type=module','-e',site,str(app/'src/engine/choosers.ts')],input=json.dumps(cases),text=True,capture_output=True,check=True).stdout)
        if len(menus)!=len(cases):p.error('Incomplete precomputed menu matrix.')
        siteMenus={(tuple(ids),keep):menu for (ids,keep),menu in zip(cases,menus)}
        def profile(ids,keep):
            menu=siteMenus[(tuple(ids),keep)];selected=[byid[id] for id in order if id in ids]
            hidden=[m.key for m in selected if m.key in menu['fx1'] and m.claims and m.claims.fx1_only]
            return {'fx1':menu['fx1'],'fx2':menu['fx2'],'hidden':hidden}
    if a.modules:
        menusByKey=json.loads(a.menus.read_text()) if a.menus else {}
        cases=[]
        for row in a.select or []:
            names,keep=row.rsplit(':',1);ids=[id for id in order if id in names.split('+')]
            if sorted(ids)!=sorted(names.split('+')) or keep not in ('true','false'):p.error('--select names a module outside --modules: '+row)
            cases.append((ids,keep=='true'))
        missing=[ids for ids,keep in cases if '+'.join(sorted(ids))+':'+str(keep).lower() not in menusByKey]
        if missing:p.error('--menus has no chooser profile for '+'+'.join(missing[0]))
        def profile(ids,keep):
            menu=menusByKey['+'.join(sorted(ids))+':'+str(keep).lower()];selected=[byid[id] for id in order if id in ids]
            hidden=[m.key for m in selected if m.key in menu['fx1'] and m.claims and m.claims.fx1_only]
            return {'fx1':menu['fx1'],'fx2':menu['fx2'],'hidden':hidden}
    if a.suite=='tapehead':cases=[(ids,keep) for ids,keep in cases if 'tapehead' in ids and any(id in ids for id in ['analog-bassdrum','usb-audio-out-tracks-main-cue','quantizer'])]
    if a.suite=='tapehead-utilities':cases=[(ids,keep) for ids,keep in cases if 'tapehead' in ids and any(id in ids for id in ['previewvol','cc-map'])]
    if a.suite=='sidechain':cases=[(ids,keep) for ids,keep in cases if 'sidechain-compressor' in ids]
    if a.suite=='sidechain-visible':cases=[(ids,keep) for ids,keep in cases if 'sidechain-compressor' in ids]
    if a.suite=='analog-bd':
        dsp={'miniverb','tapeecho','euclid','tapehead','sidechain-compressor','airwindows-chorus'}
        utilities={'repitch','usb-audio-out-tracks-main-cue','quantizer','previewvol','cc-map'}
        # Every DSP subset plus every single-DSP/single-utility pairing and
        # each DSP companion with all utilities. Both chooser profiles.
        cases=[(ids,keep) for ids,keep in cases if 'analog-bassdrum' in ids and (
            not utilities.intersection(ids) or
            len(dsp.intersection(ids)) <= 1 and len(utilities.intersection(ids)) in (1,5))]
    if a.suite=='sidechain-analog-bd':cases=[(ids,keep) for ids,keep in cases if 'sidechain-compressor' in ids and 'analog-bassdrum' in ids and len(ids) in (2,3,len(order))]
    if a.metadata_only:cases=[]
    if a.select and not a.modules:
        wanted={(tuple(sorted(row.rsplit(':',1)[0].split('+') if row.rsplit(':',1)[0] else [])),row.rsplit(':',1)[1]=='true') for row in a.select}
        cases=[(ids,keep) for ids,keep in cases if (tuple(sorted(ids)),keep) in wanted]
        if len(cases)!=len(wanted):p.error('--select named a profile this suite does not carry.')
    cases=cases[a.shard::a.shards]
    # The browser always links the core logger, which moves the runtime and everything that points into it. Those pointers are the
    # platform writes (arena sizes, the boot call, runtime detours), so a native image is compared with them reset to the original bytes.
    platform=json.loads((app/'src/engine/assets/platform-writes.json').read_text());osBase=platform['osBase']
    def platformSpans(ids):
        spans=[(row['address'],4) for row in platform['arena']]+[(platform['boot']['address'],6)]
        for group in platform['groups']:
            if group['moduleId']!='dsp-dynload-stock' and group['moduleId'] in ids:spans+=[(row['address'],row['writeLength']) for row in group['detours']]
        return spans
    def maskedOsSha(image,ids):
        data=bytearray(image[:len(original)])
        for address,length in platformSpans(ids):data[address-osBase:address-osBase+length]=original[address-osBase:address-osBase+length]
        return sha(bytes(data))
    proofs=[];originalRemix=registry.remix
    packTemp=None;packing=None
    if a.stock_bin:
        packTemp=tempfile.TemporaryDirectory(prefix='octamod-native-pack.',dir=root/'out')
        try:
            packRoot=pathlib.Path(packTemp.name);payload=packRoot/'payload.bin'
            subprocess.run([sys.executable,str(root/'tools/build/bin_decode.py'),str(a.stock_bin.resolve()),'-o',str(payload)],check=True,capture_output=True)
            data=payload.read_bytes();size=int.from_bytes(data[:4],'big')
            if size<26 or size+4>len(data) or len(data)-size-4>3 or any(data[size+4:]):raise ValueError('Native decoded container length / padding invalid.')
            stockContainer=packRoot/'stock-container.bin';stockContainer.write_bytes(data[4:4+size]);payload.unlink()
            oracle=packRoot/'oracle.c';oracle.write_text((pathlib.Path(__file__).resolve().parent/'native-container-oracle.c').read_text());executable=packRoot/'oracle'
            vendor=a.packing_vendor.resolve() if a.packing_vendor else root/'vendor/elektron-firmware-tool'
            subprocess.run(['cc','-O2','-I',str(vendor),str(oracle),*[str(vendor/name) for name in ['compress.c','decompress.c','integrity.c']],'-o',str(executable)],check=True,capture_output=True)
            seed=int.from_bytes(a.stock_bin.read_bytes()[4:8],'big')
            packing={'version':'OCTAMOD79','sourceUpgradeSha256':sha(a.stock_bin.read_bytes()),'oracleSha256':sha(oracle.read_bytes()),'sources':{str(path.relative_to(root)):sha(path.read_bytes()) for path in [vendor/name for name in ['main.c','compress.c','decompress.c','integrity.c']]+[root/'tools/build/bin_decode.py',root/'tools/build/make_bin.py']}}
        except BaseException:packTemp.cleanup();raise
    try:
        for ids,default in cases:
            # A module that replaces a stock effect (menu.stock_dsp) keeps that effect's chooser row. While stock FX2 stays it is listed at that slot, ahead of every module of its own, and native places clones in that order; the browser leads its placement with the same modules.
            menu=profile(ids,default);replacing={byid[id].key for id in ids if byid[id].menu and byid[id].menu.stock_dsp}
            keys=[k for k in menu['fx2'] if known[k].is_stock]+[byid[id].key for id in order if id in ids]
            if replacing and any(known[k].is_stock for k in menu['fx2']):keys=[k for k in menu['fx2'] if known[k].is_stock or k in replacing]+[byid[id].key for id in order if id in ids and byid[id].key not in replacing]
            if 'usb-audio-out-tracks-main-cue' in ids:keys.append('USB MIDI')
            remix=registry.with_platform(Remix(name='octamod-composition-proof',doc='Disposable local full-image identity; never flashed.',modules=tuple(keys),fx1=tuple(menu['fx1']),hidden=tuple(menu['hidden']),fallback='NONE'),known)
            registry.remix=lambda _:remix
            # Recorder code compares the live pool base. Reserve the browser's
            # logger pages too, so those module-owned literals are compared exactly.
            # No logger code or hook is injected into this native source oracle.
            loggerGeometry = 'recorder-loop-fix' in ids
            os.environ['OCTAMOD_CORE_LOGGER_PAGES'] = '16' if loggerGeometry else '0'
            with tempfile.TemporaryDirectory(prefix='octamod-composition.') as tmp:
                work=pathlib.Path(tmp)
                for name in ['modules','platform','dsp','vendor']:os.symlink(root/name,work/name,target_is_directory=True)
                (work/'out').mkdir();os.chdir(work);sys.modules.pop('build_bus',None);build=importlib.import_module('build_bus');build.IMG=root/'out/raw/section_3_MAIN_OS.bin';build.OUT=work/'out/image.bin';log=io.StringIO()
                # Analog BD's assembler outputs must share this selection's
                # disposable workspace, never a second worker's SDK out/ tree.
                importlib.import_module('ab_image').OUT=work/'out/analog-bassdrum'
                if build.ORDER!=menu['fx2']:raise ValueError('Native carried / hidden order does not match the declared FX2 chooser: native '+json.dumps(build.ORDER)+' vs declared '+json.dumps(menu['fx2'])+'.')
                try:
                    with contextlib.redirect_stdout(log):build.main()
                    image=build.OUT.read_bytes()
                    if a.verbose:print(log.getvalue())
                    if a.image_dir:a.image_dir.mkdir(parents=True,exist_ok=True);(a.image_dir/(('+'.join(sorted(ids)) or 'stock')+('-keep' if default else '-compact')+'.bin')).write_bytes(image)
                    proof={'moduleIds':ids,**({'keepStockFx2':default} if a.static_stock else {'default':default}),'menu':menu,'bytes':len(image),'sha256':sha(image),'osSha256':sha(image[:len(original)]),'maskedOsSha256':maskedOsSha(image,ids),'appendSha256':sha(image[len(original):]),**({'platformArena':True} if loggerGeometry else {})}
                    if packing:
                        container=work/'out/container.bin';update=work/'out/update.bin';version=packing['version']
                        subprocess.run([str(executable),str(stockContainer),str(build.OUT),version,str(container)],check=True,capture_output=True)
                        subprocess.run([sys.executable,str(root/'tools/build/make_bin.py'),str(container),'--seed',hex(seed),'-o',str(update)],check=True,capture_output=True)
                        c=container.read_bytes();f=update.read_bytes();proof['firmware']={'version':version,'containerBytes':len(c),'containerSha256':sha(c),'bytes':len(f),'sha256':sha(f)}
                    proofs.append(proof)
                    print(f"{ids or ['stock']} default={default}: {len(image)} bytes, full native identity captured.")
                except (SystemExit,AssertionError) as error:
                    if a.static_stock and any(word in str(error) for word in ('has colliding modules:','overruns the region','nowhere to place','does not fit','do not fit','chooser list of','currently composes with stock effects only',' not free','past the stock zero run','fits neither the clone window','cannot share DSP memory','pre-boot analog bd payload A dst overlaps runtime stage:')):
                        proofs.append({'moduleIds':ids,'keepStockFx2':default,'menu':menu,'error':str(error)});print(f"{ids or ['stock']} keep={default}: refused: {str(error)[:90]}")
                    elif ids==order and default and ('does not fit' in str(error) or 'do not fit' in str(error)):
                        proofs.append({'moduleIds':ids,'default':default,'menu':menu,'error':str(error)});print('Crowded all-module / stock-chooser selection rejects placement, as expected.')
                    else:print(log.getvalue()[-8000:]);raise
                finally:
                    if build._SCRATCH is not None:shutil.rmtree(build._SCRATCH,ignore_errors=True)
                    os.chdir(root)
    finally:
        registry.remix=originalRemix
        if packTemp is not None:packTemp.cleanup()
    if a.metadata_only or not cases:build=sys.modules['build_bus']   # nothing built: the layout comes from the import probe
    # Address, id and membership facts; no descriptor, list or instruction bytes.
    metadata={'schema':1,'revision':revision,'sourceSha256':sourceHash,'curveReaders':sorted({key for keys in stock.curve_bank_readers().values() for key in keys}),'stockFx1':stockFx1,'stockFx2':stockFx2,'stockEffects':[{'key':m.key,'fxId':m.menu.fx2_id} for m in known.values() if m.is_stock and m.menu is not None],'modules':modules,'customIds':sorted({m.menu.fx2_id for m in known.values() if m.menu and not m.is_stock and not m.menu.replaces}),'layout':{k:getattr(build,k) for k in ['FX1_IDS','FX1_LIST','FX1_NONE','FX1_ID2POS','FX1_ROWCOUNT_INSN','FX1_ROWCOUNT_AT','FX2_IDS','FX2_LIST','ID2POS','ROWCOUNT_INSN','ROWCOUNT_AT','NEW_LIST','LONG_LIST','ZERO_RUN_END','OVERFLOW_RUN','OVERFLOW_RUN_END']},'fx1References':build.FX1_LIST_REFS,'fx2References':build.LIST_REFS}
    (dest/'chooser-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
    provenance={}
    if a.suite=='analog-bd':
        provenance={'builderSources':{name:sha((root/name).read_bytes()) for name in ['tools/build/build_bus.py','tools/build/ab_image.py','tools/remix/loader.S']},
                    'moduleSourceTreeSha256':json.loads((app/'src/engine/assets/module-build.json').read_text())['sourceTreeSha256']}
    (dest/('static-composition-proofs.json' if a.static_stock else 'composition-proofs.json')).write_text(json.dumps({'schema':1,'revision':revision,'sourceSha256':sourceHash,'staticStock':bool(a.static_stock),**provenance,'packing':packing,'proofs':proofs},indent=2)+'\n')
    print('Only fingerprints and chooser format facts retained; temporary native files removed. No stress, render or emulator gates run.')
if __name__=='__main__':main()
