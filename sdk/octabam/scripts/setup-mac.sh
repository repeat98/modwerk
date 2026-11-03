#!/usr/bin/env bash
# macOS: install the system tools with Homebrew, then run scripts/setup.sh.
# Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v brew >/dev/null 2>&1 \
  || { echo "setup-mac: Homebrew not found (https://brew.sh); the Xcode Command Line Tools are also needed (xcode-select --install)" >&2; exit 1; }

# macOS ships lsof in /usr/sbin; gates need it to check card handles.
command -v lsof >/dev/null 2>&1 \
  || { echo "setup-mac: lsof is required; include /usr/sbin in PATH" >&2; exit 1; }

need=()
command -v binwalk      >/dev/null 2>&1 || need+=(binwalk)
command -v radare2      >/dev/null 2>&1 || need+=(radare2)
# DRAM runtimes and units are compiled from source at build time, and every
# pinned ColdFire cave with a `.s` source is re-assembled and compared
# against its bytes.
command -v m68k-elf-gcc >/dev/null 2>&1 || need+=(m68k-elf-gcc)
command -v cmake        >/dev/null 2>&1 || need+=(cmake)
command -v uv           >/dev/null 2>&1 || need+=(uv)
if [ "${#need[@]}" -gt 0 ]; then
  echo "== installing: ${need[*]}"
  brew install "${need[@]}"
fi

exec scripts/setup.sh
