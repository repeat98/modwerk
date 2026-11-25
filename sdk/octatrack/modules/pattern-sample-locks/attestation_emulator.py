# SPDX-License-Identifier: MIT
"""Compare this CF-only package's entire relocated image and its live sites."""
import importlib.util
from pathlib import Path
import struct

def verify(port,package,root):
    spec=importlib.util.spec_from_file_location('psl_static_verify',Path(root)/'sdk/runtime/loader/verify_static.py')
    parser=importlib.util.module_from_spec(spec);spec.loader.exec_module(parser)
    image,offsets,sites,copies,fills=parser.unpack_recipe(package)
    assert not copies and not fills,'this attestation is for the original CF-only prototype'
    assert not sites,'0.1.9 patches no stock site: its Part Edit row is an ot_part_menu record'
    exact=port.profile_symbols;assert exact,'attestation needs the exact package profile symbols'
    row=int.from_bytes(port.peek(port.base_symbols['modwerk_runtime_event_row']+4*(53-4),4),'big')
    base=int.from_bytes(port.peek(row,4),'big')-exact['psl_part_menu']
    actual=b''.join(port.peek(base+n,min(4096,len(image)-n)) for n in range(0,len(image),4096))
    assert actual==parser.placed(image,offsets,base),'live initialized image differs from the exact package'
    for address,_,new,relocs,*hashed in sites:
        assert not hashed or hashed[0]==0,'unexpected stock keep prefix'
        assert port.peek(address,len(new))==parser.placed(new,relocs,base),'live site differs from package'
    return dict(runtimeImageMatchesPackage=True,runtimeSitesMatchPackage=True,
                runtimeInitializedBytesCompared=len(image),runtimeSitesCompared=len(sites))
