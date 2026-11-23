import re, os
O = os.path.expanduser("~/.cache/modwerk-local/ot/rel-08/restcheck")


def hexbytes(s):
    return bytes.fromhex(re.sub(r"[^0-9a-fA-F]", "", s))


def payload(line):
    # "<key...> <device reply>": the reply may echo the request (mem:0x...:N) before the hex
    s = line.split(" ", 1)[1] if " " in line else ""
    s = re.sub(r"mem:0x[0-9a-fA-F]+:\d+", "", s)
    s = re.sub(r"0x[0-9a-fA-F]{8}:?", "", s)
    return s


def sites(name):
    p = f"{O}/{name}.txt"
    if not os.path.exists(p):
        return {}
    out = {}
    for line in open(p):
        if line.strip():
            out[line.split()[0]] = re.sub(r"[^0-9a-f]", "", payload(line).lower())
    return out


names = {"0x4000d562:6": "euclid frame_hook (rests)", "0x4009c3d4:6": "euclid start_hook (rests)",
         "0x4009c4d4:6": "euclid resume_hook (rests)", "0x4000406a:8": "repitch rate_gate (rests)",
         "0x4000409e:8": "repitch pitch_gate (rests)", "0x40004100:8": "ev_play_increment site",
         "0x40007d96:6": "repitch tstr_resolve (stays)"}
cols = ["stock", "euclid-t0", "euclid-t6", "euclid-t12", "euclid-stopped",
        "repitch-t0", "repitch-t6", "repitch-t12", "repitch-stopped", "after"]
data = {c: sites(c) for c in cols}
st = data["stock"]
for s, n in names.items():
    print(f"{n:32} stock {st.get(s, '?')}")
    for c in cols[1:]:
        v = data[c].get(s, "?")
        print(f"   {c:16} {v}  {'= stock' if v == st.get(s) else 'DIFFERS'}")

fm = {}
for line in open(f"{O}/fxmap.txt"):
    fm[line.split()[0]] = line
live = hexbytes(payload(fm["live"]))
m = hexbytes(payload(fm["map"]))
print("live FX (FX1 T1-8, FX2 T1-8):", live.hex(" "))
print("map magic", m[:4], "gen", m[4:8].hex(), "len", len(m))
handles = {}
for k in range(32):
    e = m[8 + 24 * k: 8 + 24 * (k + 1)]
    if len(e) < 24:
        break
    mod = int.from_bytes(e[:4], "big")
    nm = e[8:24].split(b"\0")[0].decode("latin1")
    if mod:
        handles[k] = nm
        print(f"  handle {k:#04x} module {mod:08x} {nm}")

named, repitch, head = {}, [], b""
for line in open(f"{O}/parts.txt"):
    b, p, kind, rest = line.split(" ", 3)
    b, p = int(b), int(p)
    d = hexbytes(payload("x " + rest))
    where = f"bank {b} {'working' if p < 4 else 'saved'} Part {p % 4 + 1}"
    if kind == "head":
        head = d
        for i, v in enumerate(d[:16]):
            if v in handles:
                named.setdefault(handles[v], []).append(f"{where} {'FX1' if i < 8 else 'FX2'} T{i % 8 + 1}")
    else:
        for t in range(8):
            ty = head[0x22 + t] if len(head) > 0x22 + t else 9
            if ty <= 1 and len(d) > 30 * t + 6 * ty + 4 and d[30 * t + 6 * ty + 4] == 4:
                repitch.append(f"{where} T{t + 1} {'FLEX' if ty else 'STATIC'}")
print("project names module effects:")
for k, v in named.items():
    print(" ", k, len(v), v[:8])
print("TSTR = REPITCH in:", len(repitch), repitch[:10])
