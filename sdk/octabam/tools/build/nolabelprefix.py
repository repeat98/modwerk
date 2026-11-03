"""A DSP source where one label is a prefix of another is refused (build_bus.assemble_syms)."""
import re
import sys

LABEL = re.compile(r"^\s*([A-Za-z_]\w*):")


def label_prefix_clashes(src_text):
    """(shorter, longer) pairs of labels defined in src_text where the shorter
    is a proper prefix of the longer."""
    labels = set()
    for line in src_text.split("\n"):
        m = LABEL.match(line.split(";")[0])
        if m:
            labels.add(m.group(1))
    return sorted((name[:i], name) for name in labels for i in range(1, len(name))
                  if name[:i] in labels)


def refuse_label_prefix(src_text, label=""):
    """A DSP source with a label that is a prefix of another label is refused.
    `dsp_asm` substitutes a label's name as a raw substring, so a reference to
    the longer label assembles as the shorter label's address with the leftover
    characters appended (`do #<2,>endb` with `end:` at $101 became `>$102b`), and
    the result is a valid instruction that the disassemble-what-you-assemble
    check decodes as written (docs/contributing/TRAPS.md, "`dsp_asm` resolves
    labels by prefix"). Issue #815, item 5, Zac Kyoti. No shipping DSP source
    has such a pair."""
    clashes = label_prefix_clashes(src_text)
    if clashes:
        pairs = "; ".join(f"{a} / {b}" for a, b in clashes[:6])
        sys.exit(f"label prefix in a DSP source{' (' + label + ')' if label else ''}: {pairs}"
                 " -- dsp_asm would assemble a reference to the longer label as the shorter one's"
                 " address plus the leftover characters; rename one")
