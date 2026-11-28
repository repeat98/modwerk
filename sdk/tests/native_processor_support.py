# SPDX-License-Identifier: MIT
"""Link inputs for legacy native fixtures after returning processors land.

The real processor metadata validator is linked. These fixtures admit no
returning processors: budget facts fail closed for every nonzero request.
The actual budget/publication implementation has its own native regressions.
No production code or assertion is replaced here.
"""
from pathlib import Path


def support_sources(work, adapters):
    contract = Path(adapters) / 'controller-policy/processor_contract.c'
    if not contract.is_file():
        return []  # earlier Base has no returning API or dependency
    facts = Path(work) / 'legacy-processor-budget.c'
    facts.write_text('''#include <stdint.h>
uint32_t modwerk_dsp_track_price(unsigned cycles,unsigned kind)
{(void)cycles;(void)kind;return 0;}
void modwerk_dsp_track_tick(void){}
int modwerk_dsp_track_fits(uint32_t module,unsigned cycles,unsigned kind)
{(void)module;(void)kind;return cycles==0;}
int modwerk_dsp_track_charge(uint32_t module,unsigned cycles,unsigned kind,int on)
{(void)module;(void)kind;(void)on;return cycles==0;}
''')
    return [contract, facts]
