#!/usr/bin/env python3
"""Firmware-free module gates: provenance, safe declarations and reproducibility inputs."""
from pathlib import Path
import ast, hashlib, json, re
root=Path(__file__).resolve().parent
record=json.loads((root/'import.json').read_text())
for item in record['files']:
 assert hashlib.sha256((root/item['path']).read_bytes()).hexdigest()==item['sha256'],item['path']
meta=json.loads((root/'octamod.module.json').read_text())
assert meta['id']=='poly8' and meta['key']=='POLY8'
assert 'qualification' not in meta['tests']
manifest=ast.parse((root/'manifest.py').read_text())
spans=[]
for node in ast.walk(manifest):
 if not isinstance(node,ast.Call):continue
 kind=getattr(node.func,'id','')
 if kind in ['Detour','Poke']:
  guard=node.args[1];assert isinstance(guard,ast.Call) and getattr(guard.func,'id','')=='stock_guard'
  addr,length,digest=[x.value for x in guard.args]
  assert addr==node.args[0].value and length>0 and re.fullmatch('[0-9a-f]{64}',digest)
  spans.append((addr,addr+length))
spans.sort()
assert all(a[1]<=b[0] for a,b in zip(spans,spans[1:])), 'overlapping stock edits'
assert (root/'registration.s').read_text().count('.space ')==4,'four locally guarded replay holes required'
assert 'Copyright (c) 2026 Sam Banks' in (root/'LICENSE').read_text()
assert meta['access']['steps']==json.loads((root/'usage.json').read_text())
print(f'PASS: snapshot hashes, {len(spans)} non-overlapping guarded edits, public build inputs, replay inputs, licence and tutorial')
