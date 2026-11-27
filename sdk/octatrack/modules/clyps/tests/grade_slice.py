"""Compare independent stock and SRC traces from the same pinned emulator base."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('candidate', type=Path)
parser.add_argument('stock', type=Path)
args = parser.parse_args()
candidate, stock = (json.loads(path.read_text()) for path in (args.candidate, args.stock))
for trace in (candidate, stock):
    if not trace['events'] or not trace['writes'] or len(trace['wraps']) != 1:
        raise SystemExit('Incomplete trace')
    if trace['initial_pool'] != trace['final_pool']:
        raise SystemExit('Retired extent remains allocated')
for key in stock:
    if candidate.get(key) != stock[key]:
        raise SystemExit(f'{key} differs from stock')
print(f"Wrap {stock['wraps'][0]}, {len(stock['events'])} ordered calls, "
      f"{len(stock['writes'])} relative timestamp writes, pool {stock['final_pool']}.")
