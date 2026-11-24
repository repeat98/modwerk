"""Stage a disposable one-time-template project; never edit an input project."""
import hashlib
import json
from pathlib import Path
import zlib

PART_BASE, PART_STRIDE = 0x8eed6, 0x18bb
CHANNEL = 9 + 0x4e2


def bank_channels(data, part):
    return bytes(data[PART_BASE+part*PART_STRIDE+CHANNEL+t*36] for t in range(8))


def stage(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists():
        raise ValueError('Destination must be new; initialization is explicit and once only.')
    for parent in [destination, *destination.parents]:
        if (parent/'.git').exists():
            raise ValueError('Project files must stay outside Git.')
    files={p.name:p.read_bytes() for p in source.iterdir() if p.is_file()}
    banks=[]
    for bank in range(1,17):
        name=f'bank{bank:02d}.work'
        data=files[name]
        if len(data)!=636113 or data[:4]!=b'FORM' or data[8:16]!=b'DPS1BANK':
            raise ValueError('Unrecognized bank: '+name)
        if int.from_bytes(data[-2:],'big')!=sum(data[16:-2])&65535:
            raise ValueError('Invalid bank checksum: '+name)
        for part in range(8):
            at=PART_BASE+part*PART_STRIDE
            if data[at:at+4]!=b'PART' or any(v>16 for v in bank_channels(data,part)):
                raise ValueError('Invalid Part/channel data: '+name)
        banks.append(data)
    profiles=[]
    for name in ['MIDI3_0.DAT','MIDI3_1.DAT']:
        if name not in files:continue
        data=files[name]
        if len(data)!=4096 or data[:8]!=b'MM2P\0\0\0\2' or int.from_bytes(data[-4:],'big')!=zlib.crc32(data[:-4]):
            raise ValueError('Invalid name checkpoint: '+name)
        profiles.append(data)
    if not profiles:raise ValueError('A verified naming profile is required.')
    profile=bytearray(max(profiles,key=lambda d:int.from_bytes(d[8:12],'big')))
    defaults=bank_channels(banks[0],0)
    for bank,data in enumerate(banks,1):
        edited=bytearray(data)
        for part in range(8):
            for track,channel in enumerate(defaults):
                edited[PART_BASE+part*PART_STRIDE+CHANNEL+track*36]=channel
        edited[-2:]=(sum(edited[16:-2])&65535).to_bytes(2,'big')
        files[f'bank{bank:02d}.work']=bytes(edited)
        # An initialized template's saved project state matches its work state.
        files[f'bank{bank:02d}.strd']=bytes(edited)
    # Snapshot effective names so later Bank A edits cannot propagate.
    for bank in range(1,16):
        for track in range(8):
            at=688+(bank-1)*128+track*16
            profile[at:at+16]=profile[16+track*16:32+track*16]
        profile[672+bank]=255
    profile[664:672]=b'\xff'*8
    for slot in range(2):
        profile[8:12]=(slot+1).to_bytes(4,'big')
        profile[-4:]=zlib.crc32(profile[:-4]).to_bytes(4,'big')
        files[f'MIDI3_{slot}.DAT']=bytes(profile)
    # No old format can accidentally become a fallback in this fresh fixture.
    files={n:d for n,d in files.items() if not n.startswith('MIDI2_')}
    receipt={'prototype':True,'channels':list(defaults),'banks':16,'partsPerBank':4,
             'savedPartCopies':True,'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in source.iterdir() if p.is_file()}}
    destination.mkdir(parents=True,mode=0o700)
    for name,data in files.items():(destination/name).write_bytes(data)
    (destination/'TEMPLATE.PROTOTYPE.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt
