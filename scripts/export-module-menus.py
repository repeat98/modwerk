"""Export authored ROM objects, menu recipes and native fingerprints; no stock bytes."""
import argparse,contextlib,hashlib,importlib,io,json,os,pathlib,re,shutil,subprocess,sys,tempfile

def sha(data):return hashlib.sha256(data).hexdigest()
def run(args):subprocess.run([str(x) for x in args],check=True,capture_output=True)
def nm(elf):
    rows=[line.split() for line in subprocess.check_output(['m68k-elf-nm',str(elf)],text=True).splitlines()]
    return {r[2]:int(r[0],16) for r in rows if len(r)==3 and r[1].isupper() and r[1]!='U'}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('worktree',type=pathlib.Path);p.add_argument('destination',type=pathlib.Path);p.add_argument('--app',type=pathlib.Path,required=True)
    a=p.parse_args();root=a.worktree.resolve();app=a.app.resolve();dest=a.destination.resolve();dest.mkdir(parents=True,exist_ok=True)
    revision=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
    if revision!=json.loads((app/'src/catalog/native-metadata.json').read_text())['revision']:p.error('Use the pinned worktree.')
    if subprocess.run(['git','-C',str(root),'diff','--quiet','HEAD']).returncode:p.error('Native tracked sources must be clean.')
    stock=(root/'out/raw/section_3_MAIN_OS.bin').read_bytes();sourceHash=json.loads((app/'src/engine/assets/stock-dsp-metadata.json').read_text())['sourceSha256']
    if sha(stock)!=sourceHash:p.error('Original OS fingerprint mismatch.')
    sys.path[:0]=[str(root/'tools/build'),str(root/'tools')];os.chdir(root)
    os.environ.update(REMIX='miniverb',XBUS='1',SPEC='1',DEV='0',NOROUNDTRIP='0',OCTABAM_STATIC_STOCK='0',OCTABAM_NO_CACHE='1',BUILD='79')
    import toolpath,label_fmt,mode_names,wide_dial,dsp_modmap as dm
    from remix import registry
    from remix.schema import Remix
    known=registry.modules();order=['miniverb','tapeecho','euclid','repitch'];byid={m.name:m for m in known.values()}
    packages=[];recipes=[];patches=[];guards=[]
    def guard(address,length):
        data=stock[address-dm.BASE:address-dm.BASE+length]
        if len(data)!=length:raise ValueError('Guard outside OS.')
        return {'address':address,'guardLength':length,'guardSha256':sha(data)}
    with tempfile.TemporaryDirectory(prefix='octamod-own-menu.') as tmp:
        work=pathlib.Path(tmp)
        specifications=[('repitch','repitch',byid['repitch'].linked[0].source,byid['repitch'].linked[0].cpu),('tape-time','tapeecho',byid['tapeecho'].cf_patches[0].source,byid['tapeecho'].cf_patches[0].cpu),('wide-dial',None,'tools/build/wide_dial.py','5475')]
        for label,moduleId,source,cpu in specifications:
            original=(root/source).read_text();text=wide_dial.source([]) if label=='wide-dial' else original
            if re.search(r'^\s*\.?(?:include|incbin)\b',text,re.M|re.I):raise ValueError('Transcluded source requires review.')
            asm=work/(label+'.s');obj=work/(label+'.o');asm.write_text(text)
            run(['m68k-elf-as','-mcpu='+cpu,'-o',obj,asm]);data=obj.read_bytes();proofs=[]
            for base in [0x1000,0x400d24d0,0x400d7500,0x400d7700]:
                elf=work/(label+'.elf');binary=work/(label+'.bin')
                externals={}
                run(['m68k-elf-ld',f'-Ttext=0x{base:x}',*[f'--defsym={k}=0x{v:x}' for k,v in externals.items()],'-o',elf,obj]);run(['m68k-elf-objcopy','-O','binary','-j','.text',elf,binary]);raw=binary.read_bytes()
                if label=='tape-time' and raw!=byid['tapeecho'].cf_patches[0].pinned:raise ValueError('Tape TIME source drift.')
                proofs.append({'base':base,'bytes':len(raw),'sha256':sha(raw),'exports':nm(elf),'externals':externals})
            packages.append({'label':label,'moduleId':moduleId,'key':byid[moduleId].key if moduleId else 'shared-wide-dial','author':byid[moduleId].author if moduleId else 'sambanks','cpu':cpu,'source':source,'sourceSha256':sha(original.encode()),'bytes':len(data),'sha256':sha(data),'code':data.hex(),'proofs':proofs})
        for id in order:
            mod=byid[id]
            for slot,param in enumerate(mod.params):
                if not(param.active and param.labels):continue
                views=mod.name_views_for(slot);ren=mode_names.complete(mod,slot,views) if views else {}
                if slot==mod.mode_slot:ren=mode_names.with_selfname(ren,slot,param.labels)
                encoded={str(value):{str(k):v.decode('latin1') for k,v in names.items()} for value,names in ren.items()}
                proofs=[]
                for address in [0x400d6b36,0x400d7376]:
                    data=mode_names.emit(param.labels,address,ren) if ren else label_fmt.emit(param.labels)
                    if ren:mode_names.verify(param.labels,address,ren)
                    else:label_fmt.verify(param.labels)
                    proofs.append({'namesAddress':address,'bytes':len(data),'sha256':sha(data)})
                recipes.append({'id':id,'key':mod.key,'author':mod.author,'slot':slot,'name':param.name.decode('latin1'),'labels':list(param.labels),'renames':encoded,'wideMaximum':param.count-1 if slot in mod.wide_stepped_slots else None,'proofs':proofs})
            if id!='repitch':continue
            for detour in mod.detours:
                g=guard(detour.site,len(detour.expect))
                if sha(detour.expect)!=g['guardSha256'] or detour.kind!='jmp' or detour.unit!='repitch':raise ValueError('Repitch detour profile drift.')
                patches.append({**g,'kind':'detour','symbol':detour.symbol,'bytes':detour.pad_to or 6,'note':detour.note})
            for ref in mod.symbol_refs:
                g=guard(ref.addr,4)
                if sha(ref.expect.to_bytes(4,'big'))!=g['guardSha256']:raise ValueError('Repitch pointer drift.')
                patches.append({**g,'kind':'pointer','symbol':ref.symbol,'addend':ref.addend,'note':ref.note})
            for poke in mod.pokes:
                g=guard(poke.addr,len(poke.expect))
                if sha(poke.expect)!=g['guardSha256']:raise ValueError('Repitch poke drift.')
                patches.append({**g,'kind':'poke','code':poke.write.hex(),'note':poke.note})
        wideGuard=guard(wide_dial.SITE,len(wide_dial.STOCK))
        if wideGuard['guardSha256']!=sha(wide_dial.STOCK):raise ValueError('Wide dial guard drift.')
        # Native synthetic rows prove table appending without a runtime toolchain.
        wideProofs=[]
        for rows,base in [([(0x400d7400,31)],0x400d7600),([(0x400d7400,31),(0x400d7480,32),(0x400d7500,31)],0x400d24d0)]:
            asm=work/'wide-rows.s';obj=work/'wide-rows.o';elf=work/'wide-rows.elf';binary=work/'wide-rows.bin';asm.write_text(wide_dial.source(rows))
            run(['m68k-elf-as','-mcpu=5475','-o',obj,asm]);run(['m68k-elf-ld',f'-Ttext=0x{base:x}','-o',elf,obj]);run(['m68k-elf-objcopy','-O','binary',elf,binary]);raw=binary.read_bytes()
            wideProofs.append({'rows':rows,'base':base,'bytes':len(raw),'sha256':sha(raw)})
    selections=[[],['repitch'],['tapeecho','euclid']]
    originalRemix=registry.remix;proofs=[]
    try:
        for ids in selections:
            remix=registry.with_platform(Remix(name='octamod-menu-proof',doc='Disposable native byte comparison; never flashed.',modules=tuple(byid[id].key for id in order if id in ids),fallback='NONE'),known);registry.remix=lambda _:remix
            with tempfile.TemporaryDirectory(prefix='octamod-menu-proof.') as tmp:
                work=pathlib.Path(tmp)
                for name in ['modules','dsp','vendor']:os.symlink(root/name,work/name,target_is_directory=True)
                (work/'out').mkdir();os.chdir(work);sys.modules.pop('build_bus',None);build=importlib.import_module('build_bus');build.IMG=root/'out/raw/section_3_MAIN_OS.bin';build.OUT=work/'out/image.bin';dm.IMG=build.IMG
                log=io.StringIO();snapshot={}
                line=next(i for i,l in enumerate((root/'tools/build/build_bus.py').read_text().splitlines(),1) if l.strip()=='_fx1 = list(REMIX.fx1)')
                def trace(frame,event,arg):
                    if frame.f_code==build.main.__code__ and event=='line' and frame.f_lineno==line:
                        loc=frame.f_locals;img=loc['img'];regions=[]
                        def region(address,count,note):regions.append({'address':address,'bytes':count,'sha256':sha(img[address-dm.BASE:address-dm.BASE+count]),'note':note})
                        for key,address in loc['clone_addr'].items():
                            if not known[key].is_stock:region(address,build.DESC_LEN,key+' descriptor')
                        for key,unit in [(known[k],u) for k in remix.modules for u in known[k].linked if not u.dram]:
                            syms=loc['_sym'][unit.label];oracle=next(x['proofs'][0] for x in packages if x['label']==unit.label);address=syms['tstr_fmt']-(oracle['exports']['tstr_fmt']-oracle['base']);region(address,oracle['bytes'],unit.label)
                        for cave,data in loc['_plan']:
                            # Native replaces the floating immutable recipe when placed.
                            registration=cave.registers_formatter
                            if registration:
                                descriptor=loc['clone_addr'][registration.module];address=int.from_bytes(img[descriptor-dm.BASE+0xca+registration.slot*4:descriptor-dm.BASE+0xce+registration.slot*4],'big');count=len(data);region(address,count,cave.label)
                        for key,slot,name,address,count,labels,renames in loc['_lbl']:region(address,count,key+' '+name)
                        if loc['_wide']:region(loc['_at'],len(loc['_wb']),'wide dial')
                        for g in patches if 'repitch' in ids else []:region(g['address'],g.get('bytes',g['guardLength']),g['note'])
                        if loc['_wide']:region(wideGuard['address'],6,'wide dial hook')
                        snapshot.update(regions=regions,caveCursor=loc['_lbl_top'],overflowCursor=loc['_ovf_top'],caveLimit=loc['cave_limit'])
                    return trace
                try:
                    sys.settrace(trace)
                    with contextlib.redirect_stdout(log):build.main()
                    if not snapshot:raise ValueError('Native menu snapshot was not captured.')
                    proofs.append({'moduleIds':ids,**snapshot})
                except BaseException:print(log.getvalue()[-8000:]);raise
                finally:
                    sys.settrace(None)
                    if build._SCRATCH is not None:shutil.rmtree(build._SCRATCH,ignore_errors=True)
                    os.chdir(root)
    finally:registry.remix=originalRemix
    (dest/'menu-recipes.json').write_text(json.dumps({'schema':1,'revision':revision,'sourceSha256':sourceHash,'license':'/licenses/octabam.txt','recipes':recipes,'repitchPatches':patches,'wideGuard':wideGuard,'proofs':proofs},indent=2)+'\n')
    (dest/'rom-packages.json').write_text(json.dumps({'schema':1,'revision':revision,'license':'/licenses/octabam.txt','packages':packages,'wideProofs':wideProofs},indent=2)+'\n')
    print(f'{len(packages)} own ROM objects with four-origin native proofs; {len(recipes)} authored label recipes and four complete native menu snapshots. No stock bytes exported or emulator / stress gates run.')
if __name__=='__main__':main()
