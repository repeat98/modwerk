"""Guarded POLY8 bridge: replace only reviewed chooser and dispatch seams.

Other configurations retain their author's original declarations. Unknown
claims remain in the ledger; changed replacement guards are refused.
"""
from pathlib import Path
from dataclasses import replace
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
POLICY=json.loads((ROOT/'modules/poly8/composition.json').read_text())
# Quantizer's MIDI-safe hook replaces its historical declaration. Keep the
# approved POLY8 source untouched, and share this exact rule with the packager.
QUANTIZER_RULE=json.loads((ROOT/'modules/quantizer/composition.json').read_text())
if QUANTIZER_RULE['moduleId']!='quantizer':raise ValueError('Expected Quantizer composition rule')
POLICY['groups']=[QUANTIZER_RULE if r['moduleId']=='quantizer' else r for r in POLICY['groups']]

def fingerprint(expect):
 return dict(guardLength=len(expect),guardSha256=expect.sha256 if hasattr(expect,'sha256') else hashlib.sha256(expect).hexdigest())
def claim(kind,r):
 if kind=='detours':return dict(address=r.site,**fingerprint(r.expect),unit=r.unit,symbol=r.symbol,target=r.target,kind=r.kind,writeLength=r.pad_to or 6)
 if kind=='refs':return dict(address=r.addr,**fingerprint(r.expect.to_bytes(4,'big')),unit=r.unit,symbol=r.symbol,addend=r.addend)
 if kind=='pokes':return dict(address=r.addr,**fingerprint(r.expect),code=r.write.hex())
 raise ValueError(kind)

def effective_modules(selected):
 selected=list(selected)
 if not any(m.name=='poly8' for m in selected):return selected
 ids={m.name for m in selected};count=5+sum(k in ids for k in POLICY['machineIds'])
 rules={r['moduleId']:r for r in POLICY['groups']};out=[]
 for m in selected:
  if m.name=='poly8':
   pokes=tuple(replace(p,write=p.write[:-1]+bytes([count if len(p.write)==4 else count-1])) if p.addr in POLICY['countSites'] else p for p in m.pokes)
   out.append(replace(m,pokes=pokes));continue
  rule=rules.get(m.name)
  if not rule:out.append(m);continue
  supplied=rule.get('suppliedBy') in ids
  fields={}
  for kind,field in [('detours','detours'),('refs','symbol_refs'),('pokes','pokes')]:
   reviewed={r['address']:r for r in rule['replace'][kind]};kept=[]
   for r in getattr(m,field):
    actual=claim(kind,r);expected=reviewed.get(actual['address'])
    if expected is not None:
     if actual!=expected:raise ValueError(f"POLY8 composition seam drift: {m.name} {kind} {actual['address']:#x}")
    else:kept.append(r)
   fields[field]=tuple(kept)
  units=[]
  for u in m.linked:
   if u.label not in rule['runtimeUnits']:
    units.append(u);continue
   export=rule.get('runtimeExports',{}).get(u.label,{})
   active=not export.get('whenModule') or export['whenModule'] in ids
   units.append(replace(u,dram=True,exports=tuple(export.get('symbols',())) if active else ()))
  fields['linked']=tuple(units)
  if supplied:
   # FM carries its signature-aware upstream quantizer, including the same
   # project controls. Keep unknown claims so they cannot silently disappear.
   expected=rules[m.name].get('supplied',{})
   for field in ('detours','symbol_refs','pokes','tables','linked'):
    original=getattr(m,field)
    if original and module_signature(m)!=expected.get('signature'):
     raise ValueError('POLY8 bundled quantizer declaration drift')
   fields.update(detours=(),symbol_refs=(),pokes=(),tables=(),linked=())
  out.append(replace(m,**fields))
 return out

def module_signature(m):
 value={kind:[claim(kind,r) for r in getattr(m,field)] for kind,field in [('detours','detours'),('refs','symbol_refs'),('pokes','pokes')]}
 value['tables']=[dict(label=t.label,old=t.old,count=t.count,symbols=t.symbols,refs=t.refs,insertAt=t.insert_at) for t in m.tables]
 value['units']=[dict(label=u.label,source="modules/"+u.source.split("modules/",1)[1],dram=u.dram,cave=u.cave_addr) for u in m.linked]
 return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def compose_map(known,keys):
 changed={m.key:m for m in effective_modules(known[k] for k in keys)}
 return {**known,**changed}
