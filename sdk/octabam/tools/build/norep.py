"""A DSP source with a `rep` instruction is refused (build_bus.assemble_syms)."""
import re
import sys

REP = re.compile(r"^\s*(?:\w+:\s*)?rep\b", re.I)


def refuse_rep(src_text, label=""):
    """A DSP source with a `rep` instruction is refused. `rep` cannot be
    interrupted (56300 FM section 2.3.2): a long one in an effect's proc
    holds off payload B's host-command vectors (`P:0x10`, `P:0x12`) that
    arm the ColdFire's DMA channels. Two units showed it as crackle on core B
    and then tracks 1-4 silent (docs/contributing/FAILURE_MODES.md "Crackle on
    core B"). `do #n,>label / <insn> / label:` is interruptible and gives
    the same result. Neither stock payload contains a `rep`."""
    hits = [f"line {n}: {l.split(';')[0].strip()}" for n, l in enumerate(src_text.split("\n"), 1)
            if REP.match(l.split(";")[0])]
    if hits:
        sys.exit(f"rep in a DSP source{' (' + label + ')' if label else ''}: " + "; ".join(hits[:4])
                 + " -- use do #n,>label / one instruction / label:")
