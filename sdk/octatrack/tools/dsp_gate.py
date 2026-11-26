# SPDX-License-Identifier: GPL-3.0-or-later
"""Host tests for Octatrack DSP effects: assemble a module, run it in dsp_host, hold it to a model.

A module's verify.py or perf.py imports this instead of carrying its own copy of the harness (Resonator's
verify.py was copied into TapeHead, Vibrato, Lo-Fi 2, Airwindows Chorus and Mackity). The module's folder is
mirrored into sdk/octabam/modules and gates run from there, so a script finds this file by walking up to the
checkout (sdk/templates/dsp-port/verify.py shows how):

    import dsp_gate as G
    G.require_tools()                                   # or @unittest.skipUnless(G.tools_present(), ...)
    asm = G.assemble(HERE / "engine.asm", work)         # P:0x2000, with its symbols
    G.trap_problems(asm)                                # the assembler traps of sdk/octabam/docs/TRAPS.md
    r = G.run(asm, [G.Instance(left, right, knobs=(64, 0))], split=5)
    r.outputs[0]                                        # (left, right), 24-bit signed
    r.meter                                             # executed instructions a sample, the worst core
    G.render_fx_audit(asm, plan_dir, renders, knobs)    # npm run fx:audit -- plan's signals, for -- check

What it offers:
  tools         find_tool(), tool(), tools_present(), require_tools(): dsp_asm, dsp_host and the disassembler,
                built in octabam's vendor tree (npm run upstream:tools, then make setup in that checkout), or the
                paths in $DSP_ASM, $DSP_HOST and $DSP_DISASM.
  assemble()    the source at P:0x2000 (-sym); listing() is dsp_asm -list, disassemble() the disassembler.
  Image         the synthetic memory image dsp_host boots (write_image): the code, the dispatcher's X words
                (0x415, 0x416, 0x419, 0x208, 0x20a, 0x20c-0x20e, 0x213) and the allocator's 16 entries at
                X:0x256, as every gate since Resonator's has written them; extra records for a table or garbage.
  run()         one dsp_host render of one to eight instances, stereo, 16-frame blocks, contexts 40, 41, 42:
                knobs (-params), automation (-paramfile), -pword, -split, -core with -memB/-ctxB, -dirty,
                -guard. Returns every instance's output, the meters and the guard's counts.
  checks        trap_problems(): every instruction decodes as written, no mpysu/macsu, no rep, every product
                the signed form the module chose (x0,y1 by default; TRAPS.md: x0,y1 and y0,x0 encode
                signed, other orders became mpysu); state_offsets(): the X:(r7+$nn) words a source uses.
  Gates         [PASS]/[FAIL] lines, a bit-for-bit comparison that names the first difference, and the exit.

No firmware is read: the image is synthetic. What a render here cannot see: the composed image, the real
dispatcher, the panel and the sound on a unit.

A known harness word: in an eight-instance run (four a core), the instance at core 1 position 2 receives one
non-zero word a block from dsp_host itself, even from a module whose init and proc only return. Judge that
instance's output with Render.harness_word(k) in mind; its silence is not the module's.

This file is not module source: changing it moves no module's package or native fingerprint. A module's
TESTING.md records its own files' hashes; provenance() gives this file's and the tools' for the same table.
"""
import dataclasses
import hashlib
import json
import math
import os
import pathlib
import random
import re
import struct
import subprocess
import sys
import tempfile
from typing import Mapping, Sequence

HERE = pathlib.Path(__file__).resolve().parent
ORG = 0x2000
Q = 1 << 23
FS = 44100
FRAMES = 16
SLOTS = 12
P, X, Y = 0, 1, 2
CTX = (0x40, 0x41, 0x42)
TOOLS = {"dsp_asm": "dsp_host/dsp_asm", "dsp_host": "dsp_host/dsp_host",
         "dsp_disasm": "disassemble/dsp56kDisassemble"}
# The dispatcher's words a call reads, and the allocator's table: what every gate since Resonator's wrote.
DISPATCH_X = {0x415: 0x700, 0x416: 0x700, 0x419: 0, 0x208: 0x500, 0x20a: 0x6000,
              0x20c: 0, 0x20d: 16, 0x20e: 0, 0x213: 0x256}
ALLOC_AT, ALLOC_ENTRIES, ALLOC_WORD = 0x256, 16, 0x4000
# (core, position) of the instance that gets dsp_host's own word in an eight-instance run (see above).
HARNESS_WORD = (1, 2)


class ToolMissing(RuntimeError):
    """A DSP tool is not built here."""


class HostError(RuntimeError):
    """dsp_asm or dsp_host refused or failed."""


# ---- tools -------------------------------------------------------------------

def find_tool(name, near=None):
    """The path of dsp_asm, dsp_host or dsp_disasm, or None. $DSP_ASM / $DSP_HOST / $DSP_DISASM win; then
    octabam's vendor tree beside `near` or this file or any folder above them, then ~/.cache/modwerk-upstream."""
    env = os.environ.get(name.upper())
    if env:
        return pathlib.Path(env) if pathlib.Path(env).exists() else None
    starts = []
    for start in (near, HERE):
        if start is not None:
            start = pathlib.Path(start).resolve()
            starts += [start, *start.parents]
    starts.append(pathlib.Path.home() / ".cache/modwerk-upstream")
    for base in starts:
        for root in (base, base / "sdk" / "octabam", base / "octabam"):
            path = root / "vendor/dsp56300/build/source" / TOOLS[name]
            if path.exists():
                return path
    return None


def tool(name, near=None):
    path = find_tool(name, near)
    if path is None:
        raise ToolMissing(f"{TOOLS[name]} not found: npm run upstream:tools, then make setup in that octabam "
                          f"checkout, or set {name.upper()}")
    return path


def tools_present(near=None):
    return all(find_tool(name, near) for name in TOOLS)


def require_tools(near=None):
    """For a gate script: exit with the fix when a tool is missing."""
    try:
        for name in TOOLS:
            tool(name, near)
    except ToolMissing as error:
        sys.exit(f"[FAIL] {error}")


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def provenance(near=None):
    """This library's SHA-256 and the tools' paths, for a TESTING.md table."""
    return {"dsp_gate.py": sha256(__file__), **{name: str(find_tool(name, near)) for name in TOOLS}}


# ---- assembling ----------------------------------------------------------------

@dataclasses.dataclass
class Line:
    addr: int
    mnemonic: str
    operands: str
    text: str


@dataclasses.dataclass
class Assembly:
    source: pathlib.Path      # the text as assembled, in the work folder
    blob: pathlib.Path
    words: list
    syms: dict
    org: int
    work: pathlib.Path
    _images: dict = dataclasses.field(default_factory=dict, repr=False)

    def image(self, extra=(), x=None, name=None):
        """The synthetic image for this code (written once per distinct extra/x); see write_image."""
        key = (tuple((s, a, tuple(w)) for s, a, w in extra), tuple(sorted((x or {}).items())))
        if key not in self._images:
            path = self.work / (name or f"{self.blob.stem}.{len(self._images)}.mem")
            self._images[key] = write_image(self.words, path, org=self.org, extra=extra, x=x)
        return self._images[key]


def assemble(source, work, org=ORG, replace=None, name="m"):
    """Assemble `source` (a path, or the text itself) at `org`. `replace` maps strings to substitute first (a
    table address the build fills in, say). Returns an Assembly with the words and the symbols."""
    work = pathlib.Path(work)
    text = source.read_text() if isinstance(source, pathlib.Path) else str(source)
    for old, new in (replace or {}).items():
        text = text.replace(old, new)
    asm, blob, sym = work / f"{name}.asm", work / f"{name}.bin", work / f"{name}.sym"
    asm.write_text(text)
    r = subprocess.run([str(tool("dsp_asm")), "-in", str(asm), "-org", f"{org:x}", "-out", str(blob),
                        "-sym", str(sym)], capture_output=True, text=True)
    if r.returncode:
        raise HostError(f"dsp_asm: {r.stdout}{r.stderr}")
    syms = {k: int(v, 16) for k, v in (l.split() for l in sym.read_text().splitlines() if l.strip())}
    code = blob.read_bytes()
    words = [int.from_bytes(code[i:i + 3], "little") for i in range(0, len(code), 3)]
    return Assembly(asm, blob, words, syms, org, work)


_LINE = re.compile(r"^([0-9a-f]{6}):\s+(\S+)\s*([^;]*?)\s*(?:;.*)?$")


def _lines(text):
    return [Line(int(m.group(1), 16), m.group(2), m.group(3), l) for m, l in
            ((_LINE.match(l), l) for l in text.splitlines()) if m]


def disassemble(asm):
    """What the code decodes to: [Line(addr, mnemonic, operands, text)]."""
    r = subprocess.run([str(tool("dsp_disasm")), "-in", str(asm.blob), "-pc", f"{asm.org:x}", "-le"],
                       capture_output=True, text=True)
    return _lines(r.stdout)


def listing(asm):
    """What dsp_asm meant to write: {addr: Line}."""
    r = subprocess.run([str(tool("dsp_asm")), "-in", str(asm.source), "-org", f"{asm.org:x}", "-list"],
                       capture_output=True, text=True)
    return {line.addr: line for line in _lines(r.stdout)}


# ---- the assembler traps (sdk/octabam/docs/TRAPS.md) -----------------------------

_PRODUCT = re.compile(r"^(mpy|mac)\w*$")


def source_products(text):
    """How many multiply instructions the source writes (comments and labels aside)."""
    count = 0
    for line in text.splitlines():
        body = re.sub(r"^\s*\w+:", "", line.split(";")[0]).strip()
        if body and _PRODUCT.match(body.split()[0].lower()):
            count += 1
    return count


def trap_problems(asm, forms=("x0,y1",), dis=None):
    """Every way the assembled code is not what the source says, as sentences; empty when it is:
    an address whose mnemonic differs between dsp_asm's listing and the disassembly, any mpysu/macsu, any
    rep, a product not in the signed form `forms` (operand pairs, a leading - allowed), and a product count
    that differs from the source's. forms=None skips the form check."""
    dis = disassemble(asm) if dis is None else dis
    wrote = listing(asm)
    problems = [f"P:{l.addr:04x} written {wrote[l.addr].mnemonic}, decodes {l.mnemonic}"
                for l in dis if l.addr in wrote and wrote[l.addr].mnemonic != l.mnemonic]
    problems += [f"P:{l.addr:04x} {l.mnemonic} (an unsigned product)" for l in dis if l.mnemonic in ("mpysu", "macsu")]
    problems += [f"P:{l.addr:04x} rep (cannot be interrupted)" for l in dis if l.mnemonic == "rep"]
    products = [l for l in dis if _PRODUCT.match(l.mnemonic)]
    if forms is not None:
        signed = re.compile(r"^[-+]?(" + "|".join(re.escape(f) for f in forms) + r"),[ab]\b")
        problems += [f"P:{l.addr:04x} {l.mnemonic} {l.operands} is not {' or '.join(forms)}" for l in products
                     if l.mnemonic not in ("mpysu", "macsu") and not (l.mnemonic in ("mpy", "mac", "mpyr", "macr")
                                                                      and signed.match(l.operands))]
    wanted = source_products(asm.source.read_text())
    if len(products) != wanted:
        problems.append(f"{len(products)} products in the disassembly, {wanted} in the source")
    return problems


def state_offsets(text, register="r7"):
    """The displacements of X:(r7+$nn) the source uses, sorted (empty when none)."""
    return sorted({int(m, 16) for m in re.findall(r"\(" + register + r"\+\$([0-9a-fA-F]+)\)", text)})


# ---- the synthetic image ---------------------------------------------------------

def record(space, addr, words):
    """One image record: space P (0), X (1) or Y (2), a start address and its 24-bit words."""
    return struct.pack("<BII", space, addr, len(words)) + struct.pack(f"<{len(words)}I", *words)


def write_image(words, path, org=ORG, extra=(), x=None):
    """dsp_host's -mem file: the code at `org`, four zero words at P:0x40, `extra` records
    [(space, addr, words)] (a table at P:0x3000, garbage in an r7 block), the dispatcher's X words
    (DISPATCH_X, updated by `x`) and the allocator's entries."""
    body = record(P, org, list(words)) + record(P, 0x40, [0, 0, 0, 0])
    for space, addr, block in extra:
        body += record(space, addr, list(block))
    xs = {**DISPATCH_X, **{ALLOC_AT + i: ALLOC_WORD for i in range(ALLOC_ENTRIES)}, **(x or {})}
    for addr, value in xs.items():
        body += record(X, addr, [value])
    path = pathlib.Path(path)
    path.write_bytes(body + struct.pack("<BII", 0xff, 0, 0))
    return path


# ---- running dsp_host ------------------------------------------------------------

@dataclasses.dataclass
class Instance:
    """One instance in a render. knobs: the twelve slot values (0-127; fewer are padded with 0), each arriving
    as value << 16. rows: block -> knobs from that block on (-paramfile). split: frames before a trig split,
    this instance only. core: 0, or 1 to run it on the second core."""
    left: Sequence[int]
    right: Sequence[int] = None
    knobs: Sequence[int] = ()
    rows: Mapping[int, Sequence[int]] = None
    split: int = None
    core: int = 0


@dataclasses.dataclass
class Render:
    outputs: list            # [(left, right)] per instance, 24-bit signed, as long as the longest input
    meters: dict             # core -> executed instructions a sample, the worst block
    means: dict              # core -> the same, the mean block
    layout: list             # [(core, position)] per instance
    per_instance: list       # executed instructions a sample, per instance
    nonzero: list            # non-zero output samples, per instance
    stray: list              # stray write regions per instance (-guard)
    clobbers: list           # writes over a loaded module per instance (-guard)
    returncode: int
    stdout: str
    command: list

    @property
    def meter(self):
        return max(self.meters.values()) if self.meters else None

    def harness_word(self, k):
        """Whether instance k is the one dsp_host itself writes a word a block into (eight instances)."""
        return len(self.layout) == 8 and self.layout[k] == HARNESS_WORD


def knob_row(knobs):
    row = list(knobs)[:SLOTS]
    return row + [0] * (SLOTS - len(row))


def s24(values):
    return [((v & 0xffffff) ^ 0x800000) - 0x800000 for v in values]


def _pwords(spec):
    if spec is None or isinstance(spec, str):
        return spec
    return ",".join(f"{inst}:{slot:x}={word & 0xffffff:x}" for inst, slot, word in spec)


def run(asm, instances, *, image=None, image_b=None, frames=FRAMES, ctx=CTX, ctx_b=None, split=None,
        pwords=None, dirty=None, guard=False, extra=(), tag="r", timeout=900, check=True):
    """Render `instances` (Instance, or (left, right, knobs) tuples) through `asm` in one dsp_host run.

    image: the -mem file (default asm.image()); image_b and ctx_b: core 1's, when an instance runs there
    (default: the same). split: frames before a trig split, every instance (an Instance's own split wins).
    pwords: "inst:slot=word,..." or [(inst, slot, word)], whole 24-bit knob words (an LFO's fraction bits).
    dirty: the word init's state block holds before init. guard: True, or the words to guard. extra: more
    dsp_host arguments. check: raise HostError on a non-zero exit (a guard clobber exits 3)."""
    insts = [i if isinstance(i, Instance) else Instance(*i) for i in instances]
    if not 1 <= len(insts) <= 8:
        raise ValueError("dsp_host runs one to eight instances")
    work = asm.work
    image = image or asm.image()
    n = max(len(i.left) for i in insts)
    cmd = [str(tool("dsp_host")), "-mem", str(image), "-init", f"{asm.syms['init']:x}",
           "-proc", f"{asm.syms['proc']:x}", "-ctx", ",".join(f"{c:x}" for c in ctx), "-frames", str(frames),
           "-blocks", str((n + frames - 1) // frames), "-inst", str(len(insts)), "-stereo"]
    if any(i.core for i in insts):
        cmd += ["-memB", str(image_b or image), "-ctxB", ",".join(f"{c:x}" for c in (ctx_b or ctx)),
                "-core", ",".join(str(i.core) for i in insts)]
    if any(i.split is not None for i in insts):
        cmd += ["-split", ",".join(str((split or 0) if i.split is None else i.split) for i in insts)]
    elif split:
        cmd += ["-split", str(split)]
    ins = []
    for k, inst in enumerate(insts):
        left = list(inst.left) + [0] * (n - len(inst.left))
        right = left if inst.right is None else list(inst.right) + [0] * (n - len(inst.right))
        path = work / f"{tag}{k}.in"
        path.write_bytes(struct.pack(f"<{2 * n}i", *[s for pair in zip(left, right) for s in pair]))
        ins.append(str(path))
        rows = dict(inst.rows or {})
        knobs = inst.knobs if len(inst.knobs) or not rows else rows[min(rows)]
        cmd += ["-params", ",".join(map(str, knob_row(knobs)))]
        if rows:
            pf = work / f"{tag}{k}.params"
            pf.write_text("".join(f"{b},{','.join(map(str, knob_row(v)))}\n" for b, v in sorted(rows.items())))
            cmd += ["-paramfile", str(pf)]
    out = work / f"{tag}.out"
    for k in range(len(insts)):
        pathlib.Path(f"{out}.i{k}" if k else out).unlink(missing_ok=True)
    cmd += ["-in", ",".join(ins), "-out", str(out)]
    if pwords:
        cmd += ["-pword", _pwords(pwords)]
    if dirty is not None:
        cmd += ["-dirty", hex(dirty)]
    if guard:
        cmd += ["-guard"] + ([] if guard is True else [str(guard)])
    cmd += [str(a) for a in extra]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode:
        raise HostError(f"dsp_host exit {r.returncode}:\n{r.stdout[-2000:]}{r.stderr}")
    outputs = []
    for k in range(len(insts)):
        path = pathlib.Path(f"{out}.i{k}" if k else out)
        data = path.read_bytes() if path.exists() else b""
        o = s24(struct.unpack(f"<{len(data) // 4}i", data))
        outputs.append((o[0::2][:n], o[1::2][:n]))
    return _parse(r.stdout, len(insts), outputs, r.returncode, cmd)


def _parse(stdout, count, outputs, returncode, cmd):
    meters, means = {}, {}
    for m in re.finditer(r"core (\d+) meter: .*?\(([\d.]+)/sample max, ([\d.]+)/sample mean", stdout):
        meters[int(m.group(1))], means[int(m.group(1))] = float(m.group(2)), float(m.group(3))
    layout = [None] * count
    for m in re.finditer(r"^instance (\d+): core (\d+) pos (\d+)", stdout, re.M):
        if int(m.group(1)) < count:
            layout[int(m.group(1))] = (int(m.group(2)), int(m.group(3)))
    per, nonzero, stray, clobbers = [None] * count, [None] * count, [0] * count, [0] * count
    for m in re.finditer(r"instance (\d+): ([\d.]+) instructions/sample", stdout):
        per[int(m.group(1))] = float(m.group(2))
    for m in re.finditer(r"instance (\d+): (\d+) non-zero output samples(?:, (\d+) stray write regions, (\d+) CLOBBERING)?",
                         stdout):
        k = int(m.group(1))
        nonzero[k] = int(m.group(2))
        if m.group(3):
            stray[k], clobbers[k] = int(m.group(3)), int(m.group(4))
    return Render(outputs, meters, means, layout, per, nonzero, stray, clobbers, returncode, stdout, cmd)


# ---- signals -----------------------------------------------------------------------

def noise(n, amp, seed):
    rnd = random.Random(seed)
    return [round(amp * Q * (rnd.random() * 2 - 1)) for _ in range(n)]


def tone(hz, amp, n):
    return [round(amp * Q * math.sin(2 * math.pi * hz * i / FS)) for i in range(n)]


def burst(frames, n, amp=0.5, seed=3):
    """`frames` of noise, then silence to `n`."""
    return noise(frames, amp, seed) + [0] * (n - frames)


# ---- fx:audit ----------------------------------------------------------------------

def render_fx_audit(asm, plan_dir, renders, knobs, *, image=None, frames=FRAMES, timeout=1800):
    """Render every signal `npm run fx:audit -- plan <plan_dir>` wrote (mono int32 .raw) through one instance at
    `knobs`, both channels, into `renders`/<same name>.raw (interleaved L R int32), for
    `npm run fx:audit -- check <plan_dir> <renders>`. Returns the files written. Keep renders out of Git."""
    plan_dir, renders = pathlib.Path(plan_dir), pathlib.Path(renders)
    plan = json.loads((plan_dir / "plan.json").read_text())
    names = [t["file"] for t in plan["tones"]] + [plan["idle"]["file"], plan["noise"]["file"]]
    renders.mkdir(parents=True, exist_ok=True)
    written = []
    for name in names:
        raw = (plan_dir / f"{name}.raw").read_bytes()
        x = list(struct.unpack(f"<{len(raw) // 4}i", raw))
        (l, r), = run(asm, [Instance(x, x, knobs=knobs)], image=image, frames=frames, tag="audit",
                      timeout=timeout).outputs
        path = renders / f"{name}.raw"
        path.write_bytes(struct.pack(f"<{2 * len(x)}i", *(v for pair in zip(l, r) for v in pair)))
        written.append(path)
    return written


# ---- gate output ---------------------------------------------------------------------

class Gates:
    """[PASS]/[FAIL] lines; finish() exits 1 naming the failures."""

    def __init__(self, name):
        self.name, self.failures = name, []

    def __call__(self, name, ok, detail=""):
        print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}".rstrip(), flush=True)
        if not ok:
            self.failures.append(name)
        return ok

    def same(self, name, got, want):
        """got, want: (left, right). Bit for bit over want's length; the first difference named."""
        (gl, gr), (wl, wr) = got, want
        bad = next((i for i in range(len(wl)) if i >= len(gl) or (gl[i], gr[i]) != (wl[i], wr[i])), None)
        return self(name, bad is None, "" if bad is None else
                    f"first difference at frame {bad} (block {bad // FRAMES}): "
                    f"{(gl[bad], gr[bad]) if bad < len(gl) else 'missing'} vs model {(wl[bad], wr[bad])}")

    def finish(self):
        if self.failures:
            sys.exit(f"[FAIL] {len(self.failures)}: {', '.join(self.failures)}")
        print(f"[PASS] {self.name}")


def workdir(prefix="dsp-gate-"):
    """A temporary folder for one gate run (a context manager)."""
    return tempfile.TemporaryDirectory(prefix=prefix)
