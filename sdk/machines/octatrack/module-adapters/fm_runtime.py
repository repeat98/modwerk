# SPDX-License-Identifier: GPL-3.0-or-later
"""Relocatable FM Synth source variants for the runtime machine owner.

The imported engine remains exact. Only the fixed page/mailbox/accessor and
renderer-helper references are replaced in private assembly inputs. TableGrow
and stock-site declarations are deliberately retained for the package builder.
Nothing here emits a package or changes the published inventory.
"""
import dataclasses
import re
from pathlib import Path


def replace_exact(text, old, new, count, name):
    if text.count(old) != count:
        raise ValueError(f'{name}: source contract changed for {old!r}')
    return text.replace(old, new)


def source_variant(name, text, *, composition=False):
    """Guarded changes to one imported/authored input; instruction widths stay fixed."""
    if name == 'poly.s':
        text = replace_exact(text, '.set    KEYS_AT, 0x400d2cb0',
                             '.set    KEYS_AT, qz_pkey', 1, name)
        text = replace_exact(text, '.set    SCALE_AT, 0x400d2ca8',
                             '.set    SCALE_AT, qz_scale_at', 1, name)
    elif name == 'quantizer.s':
        text = replace_exact(text, '.set    KEYS_AT, 0x400d2cb0',
                             '.set    KEYS_AT, qz_pkey', 1, name)
        text = replace_exact(text, '.set    SCALE_AT, 0x400d2ca8',
                             '.set    SCALE_AT, qz_scale_at', 1, name)
        for symbol in ('qz_pkey', 'qz_pmask', 'qz_clock', 'qz_oct'):
            pattern = rf'^ *\.set +{symbol}, KEYS_AT[^\n]*\n'
            text, count = re.subn(pattern, '', text, flags=re.M)
            if count != 1:
                raise ValueError(f'{name}: mailbox alias {symbol} changed')
        # The helper block belongs to this engine, even when the shared owner
        # places its own dispatcher in the stock kind table.
        for register, count in (('%a0', 4), ('%a1', 2)):
            text = replace_exact(text, 'movea.l KIND_FLEX,' + register,
                                 'lea     sy_render,' + register, count, name)
    elif name == 'page.s':
        text = replace_exact(text, 'moveal  KIND_FLEX,%a0',
                             'lea     sy_render,%a0', 2, name)
    elif name == 'registration.s':
        # The absolute form this adapter always emitted: the package image stays the one its recipe binds.
        text = replace_exact(text, 'jra fm_descriptor', 'jmp fm_descriptor', 1, name)
        if composition:
            # The shared owner resolves descriptors through its private PB table.
            # A pointer written into stock data would survive package removal.
            text = replace_exact(text, '\tmove.l %d0,1074618188\n', '', 1, name)
    return text


def port(module, sdk_root, work, *, composition=False):
    """Return an effective manifest whose sources can share one runtime extent.

    Apply after the reviewed machine composition has removed shared detours and
    deduplicated the bundled quantizer. External hooks and tables keep their exact
    guards. composition=True requires a reviewed shared descriptor owner and
    refuses manifests retaining FM's standalone descriptor hooks. The caller owns
    the lifetime of work and the package's whole extent. Standalone's mutable stock
    descriptor write remains a runtime lifetime gate; this adapter does not admit it.
    """
    if module.name != 'synth':
        raise ValueError('FM runtime port requires the synth effective module')
    if composition and any(d.symbol in ('fm_tick_hook', 'fm_resolve_pb') for d in module.detours):
        raise ValueError('FM composition must own both descriptor tick and PB resolver')
    sdk_root, work = Path(sdk_root), Path(work)
    work.mkdir(parents=True, exist_ok=True)
    units = []
    for unit in module.linked:
        original = sdk_root / unit.source
        source = work / (unit.label + '.s')
        source.write_text(source_variant(original.name, original.read_text(), composition=composition))
        units.append(dataclasses.replace(unit, source=str(source), cave_addr=None, dram=True))
    return dataclasses.replace(module, linked=tuple(units))
