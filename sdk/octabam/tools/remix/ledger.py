"""Cross-module resource collisions, caught before a byte is written.

The build refuses to start when two selected modules claim the same
resource, and says which two.

Checked, and how it knows:

  fx2 ids            declared. Two modules on one id would overwrite each
                     other's descriptor and dispatch.
  ColdFire caves     declared. Overlapping machine code is silent and fatal.
  hook sites         declared. Two modules hooking one instruction: the
                     second overwrites the first's jsr and the first never
                     runs.
  detours, pokes,    declared. Fixed-address rewrites, checked against every
  table refs,        cave, hook site and emit poke; a runtime's recipe
  runtime writes     writes are claims of the same kind.
  overrides          a bridge's claim stands in for the overridden module's
                     at that site; a bridge naming a module the remix does
                     not carry is refused.
  DSP hook sites     declared (DspSection.hooks). Two sections hooking one
                     stock P word on one payload: the second jsr overwrites
                     the first.
  on-chip SRAM       declared (Claims.sram). A DMA engine's descriptors and
                     buffers there; two modules on one window corrupt each
                     other's transfers.
  core-private Y     derived by scanning the module's source for `y:>$09xx`.
                     Low Y is per core, not per instance, so every effect
                     sharing a core shares these words.
  DSP data ranges    declared (Claims.dsp_ranges), per payload. Two modules
                     whose ranges overlap, in one core's private X/Y or in
                     the shared window, which both cores see as one memory.
  data literals      derived: an absolute `x:`/`y:` literal in one module's
                     source that falls inside another module's declared
                     range. A bus client's `$9xx` scratch reads are taken
                     where the build puts them (the shared window under
                     XBUS=1, `build_bus.py`'s `xbus`), so a client that the
                     build moves away from a private claim is not refused.
  stock buffers      declared (Claims.stock_instance_buffer). A stock effect
                     that takes an instance buffer from the host's bump
                     allocator gets a per-track base -- the addresses
                     BusVerb and BusDelay hardcode -- and the chooser
                     is one list for all eight tracks, so the build cannot
                     know which track it lands on. Refused beside any module
                     with fixed Y buffers.
  appended runtimes  one per image (the end of the OS and the loader's
                     window).
  arena reserves     the total must leave the unit sample memory.

Derived beats declared where possible: a scan cannot go stale. Its limit is
that it sees only what the code references, so a word a module means to
reserve but does not yet touch is declared (Claims.reserved_private_y).

Not checked: the shared 64K window (Y:0x30000-0x3FFFF); the two servers'
buffer extents there are not established well enough to write down. The P
donor region is not here either: placement refuses to overrun it, exactly.
"""

from __future__ import annotations

import os
import pathlib
import re

from remix.schema import SHARED_WINDOW, YBase

ROOT = pathlib.Path(__file__).resolve().parents[2]

_PRIVATE_Y = re.compile(r"y:>\$(09[0-9a-f]{2})\b", re.I)


def private_y(m) -> set[int]:
    """Core-private Y words this module touches, scanned from its source."""
    words: set[int] = set()
    if m.dsp is not None:
        src = ROOT / m.dsp.asm
        if src.exists():
            words |= {int(h, 16) for h in _PRIVATE_Y.findall(src.read_text())}
    if getattr(m, "claims", None) is not None:
        words |= set(m.claims.reserved_private_y)
    return words


# What stock firmware itself keeps in the shared window (Y:0x30000-0x3FFFF, where X, Y and P alias), measured
# in the stock payloads: payload A's per-frame parameter staging (payload B reads X:0x30000-0x30045 and writes
# X:0x30044), and the 16-word cross-core mailbox that payload B fills and payload A reads (it sits at 0x38000
# in this base; newer octabam moves it to 0x37F00 in every build, for BusDelay's line). A declared range that
# meets either is refused. A stock FX2 effect's buffer lies in its 16,384-word track slot but is written no
# further than slot + 0x3DA2, so a claim in the last 0x25E words of a slot (Sidechain's key window) is clear.
STOCK_SHARED_TENANTS = ((0x30000, 0x30048, "payload A's per-frame parameter staging"),
                        (0x38000, 0x38010, "the stock cross-core mailbox"))


def _payloads(m) -> frozenset:
    """The payloads a module's DSP code runs on. A module without a DspSection
    or with no payload set counts as on both."""
    p = getattr(getattr(m, "dsp", None), "payloads", None)
    return frozenset(p) if p else frozenset({"A", "B"})


# An absolute data address in code, as `y:>$7f0` or `x:<$20`. Register-relative
# forms (`y:(r1+$10)`) address from a base only the running code knows and are
# not read here: a module that reaches a claimed word that way declares its own
# range instead.
_ABS_ADDR = re.compile(r"\b([xy]):[<>]?\$([0-9a-f]+)\b", re.I)
# The bus scratch literals the build relocates under XBUS (build_bus.py `xbus`).
_BUS_SCRATCH = re.compile(r"9[0-9a-f]{2}", re.I)


def data_literals(m, xbus: bool) -> set[tuple[str, int]]:
    """(space, address) for every absolute X/Y literal in the module's own
    source, as the build will emit it. Under XBUS a bus client's `$9xx` scratch
    literals move to XBUS_BASE + 0x9xx; any other module's stay where they
    are. Comments are not read."""
    if m.dsp is None:
        return set()
    src = ROOT / m.dsp.asm
    if not src.exists():
        return set()
    code = "\n".join(l.split(";", 1)[0] for l in src.read_text().splitlines())
    harness = getattr(m, "harness", None)
    client = bool(xbus and harness is not None and harness.bus_client)
    base = int(os.environ.get("XBUS_BASE", "36000"), 16)
    found: set[tuple[str, int]] = set()
    for space, digits in _ABS_ADDR.findall(code):
        addr = int(digits, 16)
        if addr == 0x30000 and m.dsp.ybase is not YBase.NEVER:
            continue                    # the per-payload Y base the build substitutes, not an absolute word
        if client and _BUS_SCRATCH.fullmatch(digits):
            addr = base + int(digits[1:], 16)
        found.add((space.lower(), addr))
    return found


# An X-space reference by literal: absolute, register-relative with a
# displacement, or an immediate into an address/offset register.
_X_ADDR = re.compile(r"x:>\$([0-9a-f]{1,6})\b|x:\(r[0-7]\+\$([0-9a-f]{1,6})\)"
                     r"|#>\$([0-9a-f]{1,6}),[rn][0-7]\b", re.I)


def curve_bank_claims(selected) -> tuple[list[str], list[str]]:
    """(names of modules whose table the build may park in the stock curve
    bank, names of modules whose source addresses that record itself),
    both scanned from the modules' sources -- see check() for the rule."""
    from remix import stock
    lo, hi = stock.CURVE_BANK[0], stock.CURVE_BANK[0] + stock.CURVE_BANK[1]
    tables, hard = [], []
    for m in selected:
        if m.dsp is None:
            continue
        src = ROOT / m.dsp.asm
        code = ""
        if src.exists():
            code = "\n".join(l.split(";", 1)[0]
                             for l in src.read_text().splitlines())
        if m.dsp.ptable or "$facade" in code:
            tables.append(m.name)
        for g in _X_ADDR.findall(code):
            if lo <= int(next(h for h in g if h), 16) < hi:
                hard.append(m.name)
                break
    return tables, hard


def _overlap(a_start, a_len, b_start, b_len) -> bool:
    return a_start < b_start + b_len and b_start < a_start + a_len


def runtime_write_spans(m) -> list[tuple[int, int, str]]:
    """(vaddr, length, patch name) for every sparse write a runtime's recipe
    makes into the OS image -- its fixed-address claims, read from the
    recipe itself so a claim cannot drift from what the build writes."""
    import json
    spec = json.loads((ROOT / m.runtime.recipe).read_text())
    base = spec["format"]["os_load_address"]
    return [(base + w["offset"], len(bytes.fromhex(w["data"])), p["name"])
            for p in spec["patches"] for w in p["writes"]]


def check(selected) -> list[str]:
    """Return a list of collisions among these modules. Empty means clean."""
    problems: list[str] = []

    def clash(what, owner_a, owner_b, detail):
        problems.append(f"{what}: {owner_a} and {owner_b} both claim {detail}")

    # ---- FX2 ids ----------------------------------------------------------
    ids: dict[int, str] = {}
    for m in selected:
        if m.menu is None:
            continue
        if m.menu.fx2_id in ids:
            clash("fx2 id", ids[m.menu.fx2_id], m.name,
                  f"0x{m.menu.fx2_id:02x}")
        ids[m.menu.fx2_id] = m.name

    # ---- bridges: what they stand in for must be there ---------------------
    keys = {m.key for m in selected}
    for m in selected:
        for need in getattr(m, "requires", ()):
            if need not in keys:
                problems.append(f"{m.name} requires {need} in the remix (its overrides "
                                f"leave a site with nothing at it otherwise)")

    seen_conflicts = set()
    for m in selected:
        for other, reason in m.conflicts:
            pair = frozenset((m.key, other))
            if other in keys and pair not in seen_conflicts:
                seen_conflicts.add(pair)
                problems.append(f"{m.name} conflicts with {other}: {reason}")
    dram_owner = {}
    for m in selected:
        for region in m.dram_regions:
            if region.symbol in dram_owner:
                clash("DRAM region", dram_owner[region.symbol], m.name, f"the symbol {region.symbol}")
            dram_owner[region.symbol] = m.name

    # ---- Part-window bytes (Claims.part_window) -----------------------------
    regions: list[tuple[int, int, str, str]] = []
    for m in selected:
        for off, length, what in (m.claims.part_window if m.claims else ()):
            for o2, l2, owner, w2 in regions:
                if _overlap(o2, l2, off, length):
                    clash("Part window", f"{owner}'s {w2}", f"{m.name}'s {what}",
                          f"bytes +0x{max(o2, off):05x}.. of every Part")
            regions.append((off, length, m.name, what))

    # ---- DSP hook sites (DspSection.hooks), per payload ---------------------
    dsp_hooks: dict[tuple[str, int], str] = {}
    for m in selected:
        for h in (m.dsp.hooks if m.dsp is not None else ()):
            for pl in sorted(m.dsp.payloads):
                site = h.site_on(pl)
                if any((pl, word) in dsp_hooks for word in (site, site + 1)):
                    clash("DSP hook site", next(dsp_hooks[(pl, word)] for word in (site, site + 1) if (pl, word) in dsp_hooks), m.name,
                          f"P:0x{site:05x} on payload {pl} -- the second jsr "
                          f"overwrites the first, so the first section never runs")
                dsp_hooks[(pl, site)] = m.name
                dsp_hooks[(pl, site + 1)] = m.name

    # ---- on-chip SRAM windows (Claims.sram) --------------------------------
    sram: list[tuple[int, int, str, str]] = []
    for m in selected:
        for base, length, what in (m.claims.sram if m.claims else ()):
            for b2, l2, owner, w2 in sram:
                if _overlap(b2, l2, base, length):
                    clash("on-chip SRAM", f"{owner}'s {w2}", f"{m.name}'s {what}",
                          f"0x{max(b2, base):08x}..")
            sram.append((base, length, m.name, what))

    # ---- ColdFire caves and hook sites ------------------------------------
    caves: list[tuple[int, int, str, str]] = []
    hooks: dict[int, str] = {}
    for m in selected:
        for c in m.cf_patches:
            if c.cave_addr is None:      # floating: the build allocates
                continue                 # it after everything pinned
            for start, length, owner, label in caves:
                if _overlap(start, length, c.cave_addr, c.claim_len):
                    clash("ColdFire cave", f"{owner}'s {label}",
                          f"{m.name}'s {c.label}",
                          f"0x{max(start, c.cave_addr):08x}")
            caves.append((c.cave_addr, c.claim_len, m.name, c.label))
            if c.hook_addr is not None:
                if c.hook_addr in hooks:
                    clash("hook site", hooks[c.hook_addr], m.name,
                          f"0x{c.hook_addr:08x} -- the second jsr overwrites "
                          f"the first, so the first module never runs")
                hooks[c.hook_addr] = m.name

    # ---- emit() pokes of PINNED caves ---------------------------------------
    # ---- linker-backed units, detours, grown tables, plain pokes -----------
    # A PINNED Linked unit is a cave whose length is only known after the
    # link, so it is claimed here as a 6-byte marker at its address (the
    # build's own free-space check covers the real extent); a floating one
    # is skipped like a floating cave. Detour sites are hook sites. Table
    # refs and Pokes are fixed rewrites, checked as pokes below.
    # ---- overrides (schema.Override): a bridge's claim stands in ---------
    # The overridden module's detour or recipe write at that site is not a
    # claim any more; the bridge's own detour is. A bridge naming a module
    # the remix does not carry is refused: there is nothing to bridge.
    keys = {m.key for m in selected}
    overridden_detours: set[tuple[int, str]] = set()      # (site, module key)
    overridden_writes: set[tuple[str, str]] = set()       # (module key, write name)
    for m in selected:
        for o in getattr(m, "overrides", ()):
            if o.module not in keys:
                clash("override", m.name, f"(no {o.module})",
                      f"0x{o.site:08x} -- it bridges {o.module}, which this remix "
                      f"does not carry")
            if o.write is None:
                overridden_detours.add((o.site, o.module))
            else:
                overridden_writes.add((o.module, o.write))

    for m in selected:
        for u in getattr(m, "linked", ()):
            if u.cave_addr is None:
                continue
            for start, length, owner, label in caves:
                if _overlap(start, length, u.cave_addr, 6):
                    clash("ColdFire cave", f"{owner}'s {label}",
                          f"{m.name}'s linked unit {u.label}",
                          f"0x{u.cave_addr:08x}")
            caves.append((u.cave_addr, 6, m.name, f"linked unit {u.label}"))
        for d in getattr(m, "detours", ()):
            if (d.site, m.key) in overridden_detours:
                continue                 # a bridge's stub stands in for it
            if d.site in hooks:
                clash("hook site", hooks[d.site], m.name,
                      f"0x{d.site:08x} -- the second jmp overwrites the first")
            hooks[d.site] = m.name
    pokes: list[tuple[int, int, str, str]] = []
    for m in selected:
        for t in getattr(m, "tables", ()):
            for addr, _old in t.refs:
                pokes.append((addr, 4, m.name, f"table ref ({t.label})"))
        for r in getattr(m, "symbol_refs", ()):
            pokes.append((r.addr, 4, m.name,
                          f"symbol ref {r.unit}:{r.symbol} ({r.note or hex(r.addr)})"))
        for p in getattr(m, "pokes", ()):
            pokes.append((p.addr, max(len(p.expect),len(p.write)), m.name, f"poke {p.note or hex(p.addr)}"))
    # A FLOATING emit cave's poke ADDRESSES do not depend on where the cave
    # lands -- only the values written do -- so it is evaluated at a probe
    # address purely to learn its sites. Until it was skipped,
    # and the matrix said Octakit and CC MAP compose while the build
    # refused them: both rewrite the MIDI control-parameter dispatch entry
    # at 0x400d64a0 (her seven midi-control-parameter writes, its repoint).
    emit_spans = []
    PROBE_ADDR = 0x400D7000
    for m in selected:
        for c in m.cf_patches:
            if c.emit is None:
                continue
            _, cpokes = c.emit(c.cave_addr if c.cave_addr is not None else PROBE_ADDR)
            for pa, expect, _write in cpokes:
                span = (pa, max(len(expect),len(_write)), m.name, c.label)
                for start, length, owner, label in caves:
                    if owner != m.name and _overlap(start, length, pa, max(len(expect),len(_write))):
                        clash("ColdFire cave", f"{owner}'s {label}",
                              f"{m.name}'s poke at 0x{pa:08x} ({c.label})",
                              f"0x{max(start, pa):08x}")
                for haddr, owner in hooks.items():
                    if owner != m.name and _overlap(haddr, 6, pa, max(len(expect),len(_write))):
                        clash("hook site", owner, f"{m.name}'s poke ({c.label})",
                              f"0x{haddr:08x} -- both rewrite the same instruction")
                for ostart, olength, oowner, olabel in pokes:
                    if oowner != m.name and _overlap(ostart, olength, pa, max(len(expect),len(_write))):
                        clash("poke site", f"{oowner} ({olabel})", f"{m.name} ({c.label})",
                              f"0x{max(ostart, pa):08x} -- both rewrite the same bytes")
                pokes.append(span)
                emit_spans.append(("emit poke", pa, max(len(expect), len(_write)), m.name, c.label))

    # ---- pinned return addresses (schema.Runtime.pinned_returns) ----------
    # A runtime's replacement routine may validate its CALLER: Octakit's
    # part reload reads the return address off the stack and traps on any
    # but the two stock sites' own. A detour of that `jsr` whose stub
    # returns the callee through its own continuation (Detour.subst_return
    # -- midisc's `reload`) trips it, and no byte overlaps: OKMS1 ran until
    # the first Part Reload (14 Sep 2026, VEC:04 in her report_fatal with
    # D0 = his rel_after). Refused by name unless a bridge overrides the
    # detour (modules/kits-reload).
    for r in selected:
        pins = getattr(getattr(r, "runtime", None), "pinned_returns", ())
        if not pins:
            continue
        for m in selected:
            if m is r:
                continue
            for d in getattr(m, "detours", ()):
                if not d.subst_return or (d.site, m.key) in overridden_detours:
                    continue
                span = d.pad_to or len(d.expect)
                for ret in pins:
                    if d.site < ret <= d.site + span:
                        clash("pinned return", r.name, m.name,
                              f"0x{ret:08x} -- {r.name}'s callee validates the return "
                              f"address of the jsr at 0x{d.site:08x} and traps on any "
                              f"other; {m.name}'s stub ({d.note or d.symbol}) returns it "
                              f"through its own -- bridge the site")

    # ---- loader-appended runtimes (schema.Runtime) ------------------------
    # The append sits at the end of the OS image and its loader owns one
    # DRAM window, so an image carries at most one. Its recipe's sparse
    # writes are fixed-address byte claims like any pinned cave, so they are
    # checked against every pinned cave, hook site and emit poke above --
    # the apply_part entry (0x40009094) is a real three-way conflict between
    # midi-scenes, octamax and octakit, and this is where it is refused.
    runtimes = [m for m in selected if getattr(m, "runtime", None) is not None]
    hosts = {m.key for m in runtimes}
    for i, a in enumerate(runtimes):
        for b in runtimes[i + 1:]:
            clash("appended runtime", a.name, b.name,
                  "the end of the OS image and the loader's DRAM window -- "
                  "one runtime per image")
    # ---- the audio page arena (schema.ArenaReserve) -----------------------
    # Every reservation is stacked by the build; the one thing to refuse
    # here is a total that leaves the unit too little for samples and
    # recorders. The platform's own pages count whenever DRAM units exist.
    from remix import arena
    reservations = [(m.name, m.arena.where, m.arena.pages)
                    for m in selected if getattr(m, "arena", None) is not None]
    if any(u.dram for m in selected for u in getattr(m, "linked", ())):
        reservations.append(("octabam platform", "bottom", arena.PLATFORM_PAGES))
    if reservations:
        try:
            arena.layout(reservations)
        except SystemExit as e:
            problems.append(str(e))

    for m in runtimes:
        skip = set(getattr(getattr(m, "arena", None), "recipe_writes", ()))
        skip |= {w for k, w in overridden_writes if k == m.key}
        for start, length, label in runtime_write_spans(m):
            if label in skip:
                continue                 # computed by the build (arena geometry), or bridged
            for cstart, clength, owner, clabel in caves:
                if _overlap(cstart, clength, start, length):
                    clash("ColdFire cave", f"{owner}'s {clabel}",
                          f"{m.name}'s runtime write {label}",
                          f"0x{max(cstart, start):08x}")
            for haddr, owner in hooks.items():
                if _overlap(haddr, 6, start, length):
                    clash("hook site", owner, f"{m.name} (runtime write {label})",
                          f"0x{haddr:08x} -- both rewrite the same instruction")
            for pstart, plength, powner, plabel in pokes:
                if _overlap(pstart, plength, start, length):
                    clash("poke site", f"{powner} ({plabel})",
                          f"{m.name} (runtime write {label})",
                          f"0x{max(pstart, start):08x} -- both rewrite the same bytes")

    # ---- every fixed-address span against every other module's -------------
    # The passes above compare emit pokes with everything,
    # caves with caves and hooks by their first address. This one compares
    # the rest by the bytes each claim actually writes: plain pokes, table
    # and symbol refs against each other and against caves and hooks, and
    # hooks and detours by their whole span (hook_stock, pad_to). A pair the
    # passes above already reported is not reported twice.
    spans: list[tuple[str, int, int, str, str]] = []          # (kind, start, length, owner, label)
    for m in selected:
        for kind, start, length, label in m.write_spans():
            if kind == "detour" and (start, m.key) in overridden_detours:
                continue
            spans.append((kind, start, length, m.name, label))
        for u in getattr(m, "linked", ()):
            if u.cave_addr is not None:
                spans.append(("cave", u.cave_addr, 6, m.name, f"linked unit {u.label}"))
    spans += emit_spans

    _HOOKS = ("hook", "detour")
    _POKES = ("poke", "table ref", "symbol ref", "emit poke")

    def _reported(a, b) -> bool:
        """Did a pass above already report this overlapping pair?"""
        ka, kb = a[0], b[0]
        if ka == "cave" and kb == "cave":
            return True
        if ka in _HOOKS and kb in _HOOKS and a[1] == b[1]:
            return True
        for x, y in ((a, b), (b, a)):
            if x[0] == "emit poke":
                if y[0] == "cave" or y[0] in _POKES:
                    return True
                if y[0] in _HOOKS:
                    return _overlap(y[1], 6, x[1], x[2])
        return False

    for i, a in enumerate(spans):
        for b in spans[i + 1:]:
            if a[3] == b[3] or not _overlap(a[1], a[2], b[1], b[2]) or _reported(a, b):
                continue
            at = f"0x{max(a[1], b[1]):08x}"
            if "cave" in (a[0], b[0]):
                clash("ColdFire cave", f"{a[3]}'s {a[0]} {a[4]}", f"{b[3]}'s {b[0]} {b[4]}", at)
            elif a[0] in _HOOKS or b[0] in _HOOKS:
                clash("hook site", f"{a[3]} ({a[0]} {a[4]})", f"{b[3]} ({b[0]} {b[4]})",
                      f"{at} -- both rewrite the same instruction")
            else:
                clash("poke site", f"{a[3]} ({a[0]} {a[4]})", f"{b[3]} ({b[0]} {b[4]})",
                      f"{at} -- both rewrite the same bytes")

    # ---- kept bytes (Module.keeps) -----------------------------------------
    kept = [(k.addr, k.expect, m.name, k.note or f"kept bytes at 0x{k.addr:08x}")
            for m in selected for k in getattr(m, "keeps", ())]
    for i, (ka, kexp, kowner, knote) in enumerate(kept):
        for oa, oexp, oowner, onote in kept[i + 1:]:
            if oowner == kowner or not _overlap(ka, len(kexp), oa, len(oexp)):
                continue
            lo, hi = max(ka, oa), min(ka + len(kexp), oa + len(oexp))
            if kexp[lo - ka:hi - ka] != oexp[lo - oa:hi - oa]:
                clash("kept bytes", f"{kowner}'s {knote}", f"{oowner}'s {onote}",
                      f"0x{lo:08x} -- they expect different stock bytes there, "
                      f"so one of them is wrong about 1.40C")
        for kind, start, length, owner, label in spans:
            if owner != kowner and _overlap(ka, len(kexp), start, length):
                clash("kept bytes", f"{kowner}'s {knote}", f"{owner} ({kind} {label})",
                      f"0x{max(ka, start):08x} -- {kowner} relies on these bytes "
                      f"staying stock")

    # ---- grown tables (TableGrow) ------------------------------------------
    grown: list[tuple[int, int, str, str]] = []
    for m in selected:
        for t in getattr(m, "tables", ()):
            for start, length, owner, label in grown:
                if owner != m.name and _overlap(start, length, t.old, 4 * t.count):
                    clash("grown table", f"{owner}'s {label}", f"{m.name}'s {t.label}",
                          f"stock array 0x{max(start, t.old):08x} -- each would relocate "
                          f"its own copy and repoint different refs")
            grown.append((t.old, 4 * t.count, m.name, t.label))

    # ---- the per-core FX2 instance buffer region --------------------------
    # Y:0x4000-0xBFFF is TWO FX2 instance slots of 16,384 words, per core and
    # not per instance in any sense a module can rely on: BusVerb hardcodes
    # its tank there, and a second module with fixed buffers there writes
    # over it. Each works perfectly alone.
    # Declared rather than scanned -- see Claims.owns_fx2_buffers for why a
    # scan cannot tell an address from a mask.
    # Per CORE: two owners on DIFFERENT payloads never meet (BusVerb's tank
    # on A, BusDelay's LineR on B under SPEC). A module without a DspSection
    # or with no payload set counts as on both.
    buf = [m for m in selected
           if getattr(m, "claims", None) is not None
           and m.claims.owns_fx2_buffers]

    for i, a in enumerate(buf):
        for b in buf[i + 1:]:
            if not (_payloads(a) & _payloads(b)):
                continue
            clash("FX2 instance buffers", a.name, b.name,
                  "Y:0x4000-0xBFFF -- that region is per CORE, so only one "
                  "of them can be hosted on a given core; each works alone")

    # ---- stock effects that allocate an instance buffer -------------------
    # The allocator's bases are per TRACK SLOT, and this is MEASURED -- read
    # from X:0x255 in BOTH payloads of the pristine image (the
    # words are little-endian, which only shows above 0x10000, and reading
    # them big-endian gives a plausible 0x00003 instead of 0x30000):
    #
    #   core 0 FX2:  0x4000  0x8000  0x30000  0x34000
    #   core 1 FX2:  0x4000  0x8000  0x38000  0x3c000
    #
    # ⚠️ AND THE SLOTS ARE ONE PER TRACK, not a pool: each track allocates
    # FX1 then FX2, so track k's FX2 effect always gets entry 1+2k
    # (docs/firmware/DSP.md, "the allocator's instance model"). Nothing is first-come.
    #
    #   BusVerb   all four of its core's -- tank in tracks 1-2's slots,
    #              relocated buffers in tracks 3-4's. No track on that core
    #              can host an allocating stock effect.
    #   BusDelay  tracks 3-4's (its lines are based at 0x38000/0x3c000), so
    #              on ITS core an allocating stock effect is safe on tracks
    #              1-2 and collides on 3-4.
    #
    # THAT IS STILL A REFUSAL, because the chooser is ONE LIST for all eight
    # tracks: the image cannot say "FLANGER, but only on tracks 1-2". Each
    # works perfectly alone, which is the worst shape a defect can have.
    fixed = [m for m in selected
             if (getattr(m, "claims", None) is not None
                 and m.claims.owns_fx2_buffers)
             or (m.dsp is not None and m.dsp.ybase is not YBase.NEVER)]
    # An FX1-ONLY allocator reader (Claims.fx1_only) is exempt: on an FX2
    # slot it writes nothing, and on FX1 the allocator tops out at 0x3fff,
    # below every buffer a module of ours pins. Its render gate proves
    # the dry FX2 pass; the ledger takes the declaration.
    stocked = [m for m in selected
               if getattr(m, "claims", None) is not None
               and m.claims.stock_instance_buffer
               and not m.claims.fx1_only]
    # ⚠️ THIS REFUSES AN FX2 CHOOSER ROW, NOT THE EFFECT. A stock effect left
    # out of a remix keeps its code, descriptor and dispatch, so the four
    # dual-menu ones are still on FX1 and still work -- and the collision
    # cannot follow them there, because the allocator keeps SEPARATE tables
    # and an FX1 slot tops out at 0x3fff while every FX2 buffer a module of
    # ours pins starts at 0x4000 or in the shared window.
    for a in stocked:
        for b in fixed:
            clash("stock instance buffer", a.name, b.name,
                  "the allocator's per-track FX2 buffer slots -- the stock "
                  "effect's buffer lands on whichever track hosts it and "
                  "that is where the module's fixed buffers are; the chooser "
                  "cannot keep them on different cores. Its FX2 ROW is what "
                  "is refused: on FX1 it keeps working, out of reach")

    # ---- the stock curve bank, X:0x4840 (4,096 words) ----------------------
    # Since the build parks the modules' P tables (a
    # DspSection.ptable, the reverb's LFOTAB) in this stock data record
    # instead of the donor region, whenever no stock effect that reads it
    # survives in the image (stock.curve_bank_readers; the build keeps the
    # tables in P otherwise, and says so). That makes the record a resource
    # with claimants, all DERIVED:
    #   * a module with a table (ptable, or a `$facade` literal in its source);
    #   * a module that ADDRESSES the record itself -- an X-space literal in
    #     its source inside the range: `x:>$`, `x:(rN+$`, or an immediate
    #     loaded into an address register. (An immediate into an
    #     accumulator is not one: the reverb's `#>$5000,a` is a Y line base.)
    # Tables are packed by the build and cannot overlap each other; a table
    # beside a module that addresses the record is a collision, because the
    # build would write the table under that module's reference. A kept
    # stock reader beside a table is NOT refused here: the build falls back
    # to P placement for it.
    tables, hard = curve_bank_claims(selected)
    for h in hard:
        for t in tables:
            clash("X:0x4840 curve bank", t, h,
                  "the stock curve bank X:0x4840 -- the build parks the "
                  "first's table there and the second addresses it directly")

    # ---- core-private Y ---------------------------------------------------
    # Low Y is per CORE. Two effects that can share a core share these words,
    # so this is checked across every selected module, not per payload.
    owner: dict[int, str] = {}
    for m in selected:
        for w in sorted(private_y(m)):
            if w in owner:
                clash("core-private Y", owner[w], m.name,
                      f"y:$0{w:03x} -- low Y is per core, so effects sharing "
                      f"a core share this word")
            owner[w] = m.name

    # ---- DSP data ranges (Claims.dsp_ranges) --------------------------------
    # Each range is resolved on every payload its module runs on: a core-private
    # range lives in "<payload>:<space>", so only a module on the SAME core can
    # meet it; a range in the shared window is one memory for both cores and
    # for X, Y and P alike. A half-relative range resolves to a different
    # address per payload, so one module never meets itself across cores.
    claimed: list[tuple[str, int, int, str, str]] = [
        ("shared", start, end, "stock firmware", what) for start, end, what in STOCK_SHARED_TENANTS]
    reported: set[tuple] = set()

    def report(what, a, b, detail, key):
        if key not in reported:
            reported.add(key)
            clash(what, a, b, detail)

    for m in selected:
        for r in (m.claims.dsp_ranges if getattr(m, "claims", None) else ()):
            for pl in sorted(_payloads(m)):
                domain, start, end = r.resolve(pl)
                for d2, s2, e2, owner2, what2 in claimed:
                    if owner2 != m.name and d2 == domain and s2 < end and start < e2:
                        lo, hi = max(s2, start), min(e2, end) - 1
                        report("DSP data range overlap", f"{owner2}'s {what2}",
                               f"{m.name}'s {r.what}",
                               f"{domain} 0x{lo:05x}..0x{hi:05x} (payload {pl}) -- the "
                               f"words overlap, so each corrupts the other's state",
                               (domain, lo, hi, *sorted((owner2, m.name))))
                claimed.append((domain, start, end, m.name, r.what))

    # Declarations must also respect derived FX2 buffers, private Y and bus scratch.
    from remix.dsp_ranges import owners
    owned = owners(selected)
    for a in (r for r in owned if r.declared):
        for b in (r for r in owned if not r.declared):
            if a.owner == b.owner or a.domain != b.domain or not (a.start < b.end and b.start < a.end):
                continue
            if b.bus_shared and a.bus_member:
                continue
            lo, hi = max(a.start, b.start), min(a.end, b.end) - 1
            report("DSP data range overlap", f"{a.owner}'s {a.what}", f"{b.owner}'s {b.what}",
                   f"{a.domain} 0x{lo:05x}..0x{hi:05x}",
                   (a.domain, lo, hi, *sorted((a.owner, b.owner))))

    # ---- one module's data literals inside another's declared range ---------
    # Derived, so a module that reads or writes a word another claims is caught
    # without it declaring anything. Taken where the build puts the literal:
    # XBUS=1 moves a bus client's `$9xx` scratch into the shared window.
    xbus = os.environ.get("XBUS") == "1"
    for m in selected:
        harness = getattr(m, "harness", None)
        unmoved_client = not xbus and harness is not None and harness.bus_client
        for space, addr in sorted(data_literals(m, xbus)):
            for pl in sorted(_payloads(m)):
                domain = "shared" if addr >= SHARED_WINDOW[0] else f"{pl}:{space}"
                for d2, s2, e2, owner2, what2 in claimed:
                    if owner2 != m.name and d2 == domain and s2 <= addr < e2:
                        report("DSP data range reference", f"{owner2}'s {what2}",
                               f"{m.name}'s {space}:${addr:x} literal",
                               f"{domain} 0x{addr:05x} (payload {pl}) -- the source "
                               f"addresses a word the other module reserves"
                               + ("; under XBUS=1 this bus client's `$9xx` scratch "
                                  "moves to the shared window" if unmoved_client else ""),
                               (domain, addr, *sorted((owner2, m.name))))

    return problems
