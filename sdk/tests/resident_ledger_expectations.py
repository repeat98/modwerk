# SPDX-License-Identifier: GPL-3.0-or-later
"""Independent test expectations from the declared ledger, not generated code.

Adding a supported feature must not turn the test's unknown-feature probe into
a valid request. Reset boundaries stay fixed in the driver test; core masks compare hand-written code.
"""
import json
from pathlib import Path

LEDGER=json.loads((Path(__file__).resolve().parents[1]/'machines/octatrack/dsp-sites.json').read_text())
BITS=sorted(f['bit'] for f in LEDGER['features'])
UNKNOWN_FEATURE=max(BITS)<<1
CORE_MASKS={tag:sum(f['bit'] for f in LEDGER['features'] if tag in f['cores']) for tag in ('A','B')}
