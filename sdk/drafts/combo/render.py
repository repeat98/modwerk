#!/usr/bin/env python3
"""Render WAV files through COMBO's assembled DSP in dsp_host.

    python3 render.py IN.wav OUT.wav [GAIN=90 CAB=4 ...]
    python3 render.py --dir IN_DIR OUT_DIR [KNOB=VALUE ...]   (every .wav, names kept)
    python3 render.py --raw IN.raw OUT.raw [KNOB=VALUE ...]   (fx:audit's .raw: int32 words holding 24-bit
                                                            values, mono in, interleaved L R out)

The same code and memory image as verify.py's gate, so a render is the DSP,
bit for bit; not the unit's mixer, AMP page or outputs. A WAV is read as
44.1 kHz PCM (16, 24 or 32 bits, mono or stereo) and written as 24-bit
stereo. Input enters the effect at the file's level (no AMP VOL), so a
0 dBFS peak hits the effect at full scale, hotter than a track usually does.
"""
import pathlib
import struct
import sys
import tempfile
import wave

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference as R  # noqa: E402
import verify as V  # noqa: E402


def read_wav(path):
    with wave.open(str(path)) as w:
        ch, width, rate, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        data = w.readframes(n)
    if rate != 44100:
        sys.exit(f"[FAIL] {path}: {rate} Hz; COMBO runs at 44.1 kHz, resample it first")
    if width not in (2, 3, 4):
        sys.exit(f"[FAIL] {path}: {8 * width}-bit samples; use 16, 24 or 32-bit PCM")
    vals = []
    for i in range(0, len(data), width):
        v = int.from_bytes(data[i:i + width], "little", signed=True)
        vals.append(v << (24 - 8 * width) if width < 3 else v >> (8 * width - 24))
    left = vals[0::ch]
    right = vals[1::ch] if ch > 1 else left
    return left, right


def write_wav(path, left, right):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(44100)
        w.writeframes(b"".join((l & 0xffffff).to_bytes(3, "little") + (r & 0xffffff).to_bytes(3, "little")
                               for l, r in zip(left, right)))


def knobs(args):
    k = {}
    for a in args:
        name, _, val = a.partition("=")
        name = name.upper()
        if name not in R.KNOB_DEFAULTS:
            sys.exit(f"[FAIL] unknown knob {name}; knobs: {', '.join(R.KNOBS)}")
        if name == "CAB" and not val.isdigit():
            val = str(V.T.CAB_NAMES.index(val.upper()))
        k[name] = int(val)
    return k


def render(work, mem, syms, left, right, k):
    (got,), _, _ = V.run(work, mem, syms, [(left, right, {0: k})], tag="render")
    return V.s24(got[0][:len(left)]), V.s24(got[1][:len(right)])


def main():
    argv = sys.argv[1:]
    mode = argv.pop(0) if argv and argv[0] in ("--dir", "--raw") else None
    if len(argv) < 2:
        sys.exit(__doc__)
    src, dst, k = pathlib.Path(argv[0]), pathlib.Path(argv[1]), knobs(argv[2:])
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        blob, syms = V.assemble(work)
        mem = work / "m.mem"
        V.write_mem(blob, mem)
        if mode == "--raw":
            data = src.read_bytes()
            mono = list(struct.unpack(f"<{len(data) // 4}i", data))      # 24-bit values in int32 words
            l, r = render(work, mem, syms, mono, mono, k)
            dst.write_bytes(struct.pack(f"<{2 * len(l)}i", *[s for p in zip(l, r) for s in p]))
            print(f"{src.name} -> {dst} {k}")
            return
        pairs = [(src, dst)] if mode is None else [(f, dst / f.name) for f in sorted(src.glob("*.wav"))]
        if mode == "--dir":
            dst.mkdir(parents=True, exist_ok=True)
        for a, b in pairs:
            l, r = render(work, mem, syms, *read_wav(a), k)
            write_wav(b, l, r)
            peak = max(max(abs(v) for v in l), max(abs(v) for v in r)) / R.Q
            print(f"{a.name} -> {b} {k or 'defaults'} peak {peak:.3f} FS")


if __name__ == "__main__":
    main()
