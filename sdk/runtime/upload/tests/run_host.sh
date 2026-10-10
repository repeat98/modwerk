#!/bin/sh
# Firmware-free fault tests. No device, card, network or fixture firmware.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
out=$(mktemp -d "${TMPDIR:-/tmp}/modwerk-upload-host.XXXXXX")
trap 'rm -rf "$out"' EXIT HUP INT TERM
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -pedantic -I"$root" "$root/tests/host_test.c" "$root/upload.c" "$root/sha256.c" "$root/wire.c" -o "$out/controller"
"$out/controller"
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -pedantic -I"$root" "$root/tests/hash_probe.c" "$root/sha256.c" -o "$out/hash"
python3 - "$out/hash" <<'PY'
import hashlib, random, subprocess, sys
rng = random.Random(2718)
sizes = sorted(set([0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 4095, 4096, 4097, 1048576] + [rng.randrange(8192) for _ in range(100)]))
for n in sizes:
    data = rng.randbytes(n)
    result = subprocess.run([sys.argv[1]], input=data, capture_output=True, check=True)
    assert result.stdout.decode().strip() == hashlib.sha256(data).hexdigest(), n
print(f'SHA-256: {len(sizes)} Python-reference vectors passed, including the protocol maximum.')
PY
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -pedantic -I"$root" "$root/tests/wire_probe.c" "$root/upload.c" "$root/sha256.c" "$root/wire.c" -o "$out/wire-probe"
node "$root/../../../scripts/verify-upload-wire.mjs" "$out/wire-probe"
# EP0 vendor transport: its controller calls are renamed to counters so every
# execution is observed, then the browser transport runs against the C peer.
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -pedantic -I"$root" -Dmu_request=counted_request -Dmu_disconnect=counted_disconnect -c "$root/vendor.c" -o "$out/vendor-counted.o"
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -pedantic -I"$root" "$root/tests/vendor_test.c" "$out/vendor-counted.o" "$root/upload.c" "$root/sha256.c" "$root/wire.c" -o "$out/vendor-test"
"$out/vendor-test"
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -pedantic -I"$root" "$root/tests/vendor_probe.c" "$root/vendor.c" "$root/upload.c" "$root/sha256.c" "$root/wire.c" -o "$out/vendor-probe"
node "$root/../../../scripts/verify-upload-usb.mjs" "$out/vendor-probe"
