import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const exporter = fileURLToPath(new URL('./export-static-dsp.py', import.meta.url))
const probe = code => JSON.parse(execFileSync('python3', ['-B', '-c', String.raw`
import importlib.util, json, sys
from pathlib import Path
from types import SimpleNamespace as N
spec=importlib.util.spec_from_file_location('exporter',sys.argv[1])
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
` + code, exporter], { encoding: 'utf8' }))

describe('reviewed static DSP metadata exporter', () => {
  it('discovers new catalog DSP inserts with native priority and stable catalog ties', () => {
    expect(probe(String.raw`
def module(id,fx,priority):
    return N(name=id,key=id.upper(),author='someone',is_stock=False,
             menu=N(fx2_id=fx) if fx is not None else None,
             dsp=N(priority=priority) if priority is not None else None)
modules=[module('old-insert',23,15),module('new-insert',30,15),module('cf-only',None,None),module('pending-insert',29,16)]
known={m.key:m for m in modules}
catalog={'modules':[{'id':m.name,'version':'0.1.0'} for m in modules]}
documents={m.name:{'id':m.name,'version':'0.1.0','key':m.key,'author':{'github':'someone'},'compatibility':{'effectId':m.menu.fx2_id if m.menu else None}} for m in modules}
documents['pending-insert']['build']={'status':'pending'}
# ColdFire packages bind their authored/native credits separately; this
# metadata-only exporter does not rewrite them or emit placement entries.
documents['cf-only']['author']['github']='registered-import-author'
rows=e.catalog_modules(catalog,documents,known)
assert all(set(row)=={'id','key','fxId','priority'} for row in rows)
print(json.dumps(rows))
`)).toEqual([
      { id: 'old-insert', key: 'OLD-INSERT', fxId: 23, priority: 15 },
      { id: 'new-insert', key: 'NEW-INSERT', fxId: 30, priority: 15 },
    ])
  })

  it('refuses stale pins, duplicate ids and mismatched native attribution or effect ids', () => {
    expect(probe(String.raw`
import copy
m=N(name='new-insert',key='NEW_INSERT',author='someone',is_stock=False,menu=N(fx2_id=30),dsp=N(priority=18))
catalog={'modules':[{'id':m.name,'version':'0.1.0'}]}
documents={m.name:{'id':m.name,'version':'0.1.0','key':m.key,'author':{'github':'someone'},'compatibility':{'effectId':30}}}
checks=[]
def refused(c,d,expected):
    try:e.catalog_modules(c,d,{m.key:m})
    except ValueError as error: assert expected in str(error);checks.append(expected)
    else:raise AssertionError('invalid metadata accepted')
bad=copy.deepcopy(documents);bad[m.name]['version']='0.0.9';refused(catalog,bad,'Stale catalog')
bad=copy.deepcopy(catalog);bad['modules']*=2;refused(bad,documents,'Invalid catalog')
bad=copy.deepcopy(documents);bad[m.name]['author']['github']='other';refused(catalog,bad,'attribution differs')
bad=copy.deepcopy(documents);bad[m.name]['compatibility']['effectId']=29;refused(catalog,bad,'effect ID differs')
print(json.dumps(checks))
`)).toEqual(['Stale catalog', 'Invalid catalog', 'attribution differs', 'effect ID differs'])
  })

  it('binds the exact private SDK inventory and original-OS fingerprint before native imports', () => {
    expect(probe(String.raw`
import tempfile
with tempfile.TemporaryDirectory() as directory:
    base=Path(directory);app=base/'app';private=base/'private'
    (app/'sdk').mkdir(parents=True)
    (app/'sdk/catalog.json').write_text(json.dumps({'sourceRevision':'a'*40}))
    for group in e.SOURCE_GROUPS:
        for sdk in (app/'sdk/octabam',private):
            path=sdk/group/'source.py';path.parent.mkdir(parents=True);path.write_text('value=1\n')
    assert e.reviewed_revision(private,app,True)=='a'*40
    cache=private/'modules/__pycache__/ignored.pyc';cache.parent.mkdir();cache.write_bytes(b'ignored')
    assert e.reviewed_revision(private,app,True)=='a'*40
    def refused(expected):
        try:e.reviewed_revision(private,app,True)
        except ValueError as error:assert expected in str(error)
        else:raise AssertionError('unreviewed source accepted')
    source=private/'tools/source.py';source.write_text('value=2\n');refused('differs from reviewed source: tools');source.write_text('value=1\n')
    extra=private/'dsp/unreviewed.asm';extra.write_text('nop\n');refused('differs from reviewed source: dsp');extra.unlink()
    link=private/'modules/link.py';link.symlink_to(private/'modules/source.py');refused('symlinks are prohibited');link.unlink()
    original=private/'out/raw/section_3_MAIN_OS.bin';original.parent.mkdir(parents=True);original.write_bytes(b'synthetic guard input')
    assert e.verified_stock(private,e.sha(original.read_bytes()))==original
    try:e.verified_stock(private,'0'*64)
    except ValueError as error:assert 'OS fingerprint is invalid' in str(error)
    else:raise AssertionError('unverified OS accepted')
print(json.dumps({'inventory':'exact','stock':'fingerprinted','nativeImports':False}))
`)).toEqual({ inventory: 'exact', stock: 'fingerprinted', nativeImports: false })
  })
})
