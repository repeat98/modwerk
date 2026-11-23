"""Run at repo root: run.py EMULATOR MAIN CARD METER_PACKAGE OUTPUT [--late]."""
import json
import struct
import subprocess
import sys
import tempfile
from hashlib import sha256
from pathlib import Path

emu, image, card, package, output = map(Path, sys.argv[1:6])
late = sys.argv[6:] == ["--late"]
base = "506d0ecf7c97a17c1906422c25cafafb77b3086d"


def metadata(path):
    return json.loads(subprocess.check_output(["git", "show", f"{base}:{path}"]))


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


assert digest(image) == "08e13819fc8fade5b1c69f4086537b648d0c4b4f60df78119e1b966a3e05af7a"
assert digest(card) == "6a3696904c406ec4fb92e70fdf3dfd646325ed364cb727074dc59f6d54f50822"
binding = metadata("sdk/machines/octatrack/base-binding.json")
symbols = metadata("src/engine/assets/octatrack-base.elemod")["symbols"]
assign = (binding["symbols"]["modwerk_controller_write_begin"]
          - symbols["modwerk_controller_write_begin"][1] + symbols["mw_assign"][1])
banks = (0x400e21e0, 0x1001614e)
part = banks[0] + 0x8ed80


def command(line):
    process.stdin.write(line + "\n")
    process.stdin.flush()
    reply = process.stdout.readline().strip()
    if not reply or reply.startswith("err"):
        raise RuntimeError(reply)
    return reply


def run(ms):
    assert "stop=time" in command(f"run {ms}")


def read(address, size):
    return bytes.fromhex(command(f"peek {address} {size}").split()[1])


def write(address, data):
    command(f"poke {address} {data.hex()}")
    assert read(address, len(data)) == data


def tap(row, mask):
    for value in (mask, 0):
        command(f"key {row} {value}")
        run(60)


def prepare():
    for bank in banks:
        write(bank, bytes(7) + bytes([15]))
        write(bank + 16, bytes(7) + bytes([16]))
        for step, degree in enumerate((78, 79, 79, 78, 79)):
            write(bank + 0x5a + 32 * step, bytes([degree]))


def exercise(sock, trace):
    for line in process.stdout:
        if line.startswith("ready "):
            break
    assert int.from_bytes(read(0x46c82456, 4), "big") == banks[0]
    neighbor = read(part + 90, 30)  # T2 signature and saved controls
    for bank in banks:
        write(bank, bytes(8))
    run(1530)
    for bank in banks:
        write(bank, bytes(7) + bytes([1]))
    if not late:
        prepare()
    tap(0x25, 1)
    run(4300)
    tap(0x24, 128)
    run(500)
    command("pace on")
    subprocess.run(["node", "scripts/device.mjs", "try", package.resolve(),
                    "--emulator", "--socket", sock, "--seconds", "1", "--accept"], check=True)
    command("pace off")
    run(4600)
    for _ in range(300):
        try:
            result = command(f"call {assign:#x} {part} 0 5")
            break
        except RuntimeError as error:
            if "not main's spin" not in str(error):
                raise
            run(1)
    else:
        raise RuntimeError("No idle assignment window")
    assert int(result.split("=")[-1], 0) == 1 and read(part + 60, 3) == b"Cu\x01"
    if late:
        prepare()
    for offset in range(0, 131072, 1024):
        address = binding["pool"] + offset
        hit = read(address, 1032).find(b"CUPCMTES")
        if hit >= 0:
            meter = address + hit
            break
    else:
        raise RuntimeError("Meter missing")
    for attempt in range(2):
        tap(0x25, 1)
        run(1430)
        tap(0x24, 128)
        count = int.from_bytes(read(meter + 8, 4), "big")
        assert count <= 12
        rows = [struct.unpack(">6I", read(meter + 12 + 24*i, 24)) for i in range(count)]
        print(json.dumps(dict(stage="play", attempt=attempt, rows=rows)), file=trace, flush=True)
        write(meter + 8, bytes(4 + 24*12))
    assert read(part + 90, 30) == neighbor


with tempfile.TemporaryDirectory() as temp, output.open("x") as trace:
    socket = str(Path(temp) / "emu.sock")
    print(json.dumps(dict(stage="identity", emulator=digest(emu), package=digest(package),
                          image=digest(image), card=digest(card), late=late)), file=trace)
    process = subprocess.Popen([emu, "--interactive", "--usb-host", socket, "--mkii",
                                "--image", image, "--card", card, "--mount", "--set", "MODWERK",
                                "--project", "QUIET", "--internal-clock", "--load-ms", "20000",
                                "--frame", "--max", "400000000000"], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, text=True)
    try:
        exercise(socket, trace)
    finally:
        process.terminate()
        process.wait()
