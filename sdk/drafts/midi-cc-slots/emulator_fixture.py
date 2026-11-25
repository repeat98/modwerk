"""Private after-boot runtime publication for native probes; no name/channel injection."""
import hashlib
import json
from pathlib import Path


def load(path, stock):
    path=Path(path).resolve();spec=json.loads(path.read_text())
    module=(path.parent/spec['moduleFile']).resolve()
    assert module.parent==path.parent
    data=module.read_bytes()
    assert hashlib.sha256(data).hexdigest()==spec['moduleSha256']
    assert hashlib.sha256(stock).hexdigest()==spec['stockSha256']
    spec['image']=data
    return spec


def publish(spec,command,read):
    data=spec['image'];origin=spec['origin']
    for at in range(0,len(data),512):
        assert not any(read(origin+at,min(512,len(data)-at))), 'fixture RAM is already in use'
    for site in spec['sites']:
        assert read(site['address'],len(bytes.fromhex(site['stock'])))==bytes.fromhex(site['stock']), 'fixture site guard failed'
    for at in range(0,len(data),512):command(f'poke {hex(origin+at)} '+data[at:at+512].hex())
    for site in spec['sites']:command(f"poke {hex(site['address'])} {site['data']}")


def restore(spec,command):
    for site in spec['sites']:command(f"poke {hex(site['address'])} {site['stock']}")
