#!/usr/bin/env python3
"""Private native test build. Run inside the reviewed isolated toolchain.
Use a locally extracted, verified original 1.40C MAIN OS; never commit input
or output. This does not add the module to the public catalogue or bypass
qualification. The browser builder is not used or parity-qualified here.
"""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE=pathlib.Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'sdk/octabam/tools').is_dir())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-os',type=pathlib.Path,required=True)
    parser.add_argument('--vendor',type=pathlib.Path,required=True)
    parser.add_argument('--output',type=pathlib.Path,required=True)
    args=parser.parse_args()
    raw=args.raw_os.resolve()
    vendor=args.vendor.resolve()
    output=args.output.resolve()
    if output.exists():
        parser.error('Output exists; choose a new private path')
    if hashlib.sha256(raw.read_bytes()).hexdigest()!='164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e':
        parser.error('Input is not the verified original 1.40C MAIN OS')
    with tempfile.TemporaryDirectory(prefix='air-chorus-native-') as tmp:
        native=pathlib.Path(tmp)
        for folder in ['modules','platform','tools','dsp']:
            shutil.copytree(ROOT/'sdk/octabam'/folder,native/folder,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        if not (native/'modules/airwindows-chorus').exists():
            shutil.copytree(HERE,native/'modules/airwindows-chorus',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        (native/'vendor').symlink_to(vendor,target_is_directory=True)
        (native/'out/raw').mkdir(parents=True)
        shutil.copyfile(raw,native/'out/raw/section_3_MAIN_OS.bin')
        os.chdir(native)
        sys.path[:0]=[str(native/'tools'),str(native/'tools/build')]
        os.environ.update(REMIX='air-chorus-private',XBUS='1',SPEC='1',DEV='0',OCTABAM_NO_CACHE='1',BUILD='01',OCTABAM_STATIC_STOCK='1')
        import toolpath
        from remix import registry
        from remix.schema import Remix,NO_FALLBACK
        known=registry.modules()
        stock=tuple(k for k,m in known.items() if m.is_stock)
        profile=registry.with_platform(Remix(name='air-chorus-private',doc='Private hardware-untested Air Chorus.',modules=('AIR CHORUS',),fallback=NO_FALLBACK),known)
        registry.remix=lambda _:profile
        import build_bus
        build_bus.main()
        output.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(build_bus.OUT,output)
        record={'version':json.loads((HERE/'octamod.module.json').read_text())['version'],'modules':profile.modules,'bytes':output.stat().st_size,
                'mainOsSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'hardwareStatus':'untested'}
        output.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')
        print(json.dumps(record))

if __name__=='__main__':
    main()
