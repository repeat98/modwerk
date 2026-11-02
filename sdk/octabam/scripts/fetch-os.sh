#!/usr/bin/env bash
# Download and unpack the official Octatrack OS from Elektron's support site.
#
# Nothing Elektron ships is redistributed by this repository -- you fetch your
# own copy here, and every build is derived reproducibly from it. Note the
# SHA256 this prints: it is what makes a build claim checkable by someone else.
set -euo pipefail
cd "$(dirname "$0")/.."

OS_VER="1.40C"
ZIP_URL="https://www.elektron.se/wp-content/uploads/2025/03/OCTATRACK_OS${OS_VER}_dist.zip"
README_URL="https://www.elektron.se/wp-content/uploads/2025/03/OCTATRACK_OS${OS_VER}_readme.pdf"
DL=downloads
ZIP="$DL/OCTATRACK_OS${OS_VER}_dist.zip"

mkdir -p "$DL"

echo "[fetch] downloading OS $OS_VER ..."
curl -fL --retry 3 --max-time 120 -o "$ZIP" "$ZIP_URL"
curl -fL --retry 3 --max-time 120 -o "$DL/OCTATRACK_OS${OS_VER}_readme.pdf" "$README_URL"

echo "[fetch] ZIP hash (for the record; the firmware files below are what is pinned):"
shasum -a 256 "$ZIP"

echo "[fetch] extracting ..."
rm -rf "$DL/extracted"
unzip -o "$ZIP" -d "$DL/extracted"

# The hashes of the firmware every result in this repo was derived from. The
# zip itself is not pinned: since 28 Oct 2026 Elektron's site adds an
# "Elektron EULA.txt" stamped at download time, so the zip's hash moves while
# the firmware in it does not (the zip of record was 370c55a3...).
# A mismatch here means the base image differs from the one the patches were
# verified on.
check_pin() {  # file, expected sha256
  local got
  got=$(shasum -a 256 "$1" | awk '{print $1}')
  if [ "$got" != "$2" ]; then
    echo
    echo "[fetch] *** WARNING: $(basename "$1") differs from the one this repo was built against ***"
    echo "[fetch]   expected $2"
    echo "[fetch]   got      $got"
    if [ "${OS_HASH_STRICT:-}" = "1" ]; then
      echo "[fetch]   OS_HASH_STRICT=1: refusing." >&2
      exit 1
    fi
    echo "[fetch]   Proceeding, but verify 'make recon' output before trusting a build."
  fi
}
check_pin "$DL/extracted/OCTATRACK_OS${OS_VER}.bin" "34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad"
check_pin "$DL/extracted/OCTATRACK_OS${OS_VER}.syx" "0a8d2d2b35c2cc78fa338576adc1af0cbc094cef973255103165c73edd87f2b6"

echo "[fetch] firmware artifacts found:"
find "$DL/extracted" -type f \( -iname '*.bin' -o -iname '*.syx' \) -exec ls -la {} \;

echo
echo "[fetch] done. Next:  make recon   (or scripts/analyze.sh)"
