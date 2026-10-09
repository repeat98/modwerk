"""Build the private candidate inside the isolated native container; never publish it."""
import argparse
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, required=True, help='Fresh private SDK staged by apply.py')
    parser.add_argument('--stock-main-os', type=Path, required=True, help='Owned, decoded 1.40C MAIN OS')
    parser.add_argument('--vendor', type=Path, default=Path('/opt/toolchain/vendor'))
    args = parser.parse_args()
    root = args.sdk.resolve()
    document = json.loads((root/'modules/analog-bassdrum/octamod.module.json').read_text())
    if document['version'] != '0.1.6-experimental':
        raise ValueError('Stage this candidate with apply.py first')
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    if sha(args.stock_main_os) != '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e':
        raise ValueError('An owned original 1.40C MAIN OS is required')
    raw = root/'out/raw/section_3_MAIN_OS.bin'
    raw.parent.mkdir(parents=True, exist_ok=True)
    if raw.exists() and sha(raw) != sha(args.stock_main_os):
        raise ValueError('Existing stock image differs')
    if raw.resolve() != args.stock_main_os.resolve():
        shutil.copy2(args.stock_main_os, raw)
    if not (root/'vendor').exists():
        (root/'vendor').symlink_to(args.vendor)
    os.chdir(root)
    sys.path[:0] = [str(root/'tools'), str(root/'tools/build')]
    os.environ.update(REMIX='analog-bd-engine-copy', XBUS='1', SPEC='1', DEV='0',
                      NOROUNDTRIP='0', OCTABAM_STATIC_STOCK='1', OCTABAM_NO_CACHE='1',
                      BUILD='81', OCTAMOD_CORE_LOGGER_PAGES='0', PYTHONDONTWRITEBYTECODE='1')
    from remix import registry, stock
    from remix.schema import Remix
    known = registry.modules()
    keys = {m.menu.fx2_id: m.key for m in known.values() if m.is_stock and m.menu}
    fx1 = tuple(keys[i] for i in stock.fx1_order() if i)
    fx2 = tuple(keys[i] for i in stock._chooser_order(stock.FX2_CHOOSER) if i and keys[i] != 'SPRING REV')
    recipe = Remix(name='analog-bd-engine-copy', doc='Private candidate 0.1.6; hardware untested.',
                   modules=fx2+('ANALOG BD',), fx1=fx1, fallback='NONE', static_stock=True)
    registry.remix = lambda _: recipe
    import build_bus
    build_bus.main()
    print('PASS private complete-image candidate build; no publication or hardware qualification')


if __name__ == '__main__':
    main()
