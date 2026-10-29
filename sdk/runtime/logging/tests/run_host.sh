#!/bin/sh
# Firmware-free tests only. Run unreviewed revisions in a sandbox.
set -eu
root=$(dirname "$(dirname "$0")")
out=$(mktemp -d "${TMPDIR:-/tmp}/octamod-log-host.XXXXXX")
trap 'rm -rf "$out"' EXIT HUP INT TERM
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -DOCTAMOD_LOG_HOST -I"$root" "$root/tests/host_test.c" "$root/octamod_log.c" -o "$out/ring"
"$out/ring" "$root/tests/expected.log"
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -DOCTAMOD_LOG_HOST -I"$root" "$root/tests/firmware_test.c" "$root/octamod_log.c" "$root/octamod_log_firmware.c" -o "$out/controller"
"$out/controller"
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -DOCTAMOD_LOG_HOST -I"$root" "$root/tests/port_test.c" "$root/stock_140c.c" -o "$out/port"
"$out/port"
"${CC:-cc}" -std=c99 -Wall -Wextra -Werror -I"$root" "$root/tests/guard_test.c" -o "$out/guard"
"$out/guard"
