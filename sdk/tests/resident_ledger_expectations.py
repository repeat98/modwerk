# SPDX-License-Identifier: GPL-3.0-or-later
"""Independent test expectations from the declared ledger, not generated code.

Adding a supported feature must not turn the test's unknown-feature probe into
a valid request. Keep exact reset boundaries and per-core masks checked.
"""
import json
from pathlib import Path

LEDGER=json.loads((Path(__file__).resolve().parents[1]/'machines/octatrack/dsp-sites.json').read_text())
BITS=sorted(f['bit'] for f in LEDGER['features'])
UNKNOWN_FEATURE=max(BITS)<<1
CORE_MASKS={tag:sum(f['bit'] for f in LEDGER['features'] if tag in f['cores']) for tag in ('A','B')}

def reset_end_expression():
    cases=[]
    for bit in BITS:
        lengths=[int(r['words'],0) for r in LEDGER['regions'] if r['feature']==bit]
        if not lengths:continue
        ends=[];total=0
        for n in lengths:total+=n;ends.append(total)
        expr=' : '.join('offset < %du ? %du'%(n,n) for n in ends[:-1])
        expr=(expr+' : ' if expr else '')+str(total)+'u'
        if len(ends)>1:expr='('+expr+')'
        cases.append('feature == %du ? %s'%(bit,expr))
    return '('+' : '.join(cases)+' : 0u)'
