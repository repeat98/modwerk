#!/usr/bin/env bash
# Build the bare-metal m68k-elf cross-compiler from source: binutils 2.47 and
# gcc 16.2.0 (C only), the versions the generated sources and the pinned
# ColdFire bytes were produced with. Configure flags follow Homebrew's
# m68k-elf-gcc formula.
#
#   scripts/m68k-toolchain.sh [PREFIX]    # default $HOME/.local/m68k-elf
#   scripts/m68k-toolchain.sh --check [PREFIX]   # exit 0 when PREFIX has a working gcc of this version
#   scripts/m68k-toolchain.sh --versions         # print binutils-<v>-gcc-<v> (the CI cache key)
#
# Needs: a C/C++ compiler, make, curl, xz, and the gmp, mpfr, mpc, isl, zstd
# and zlib development packages (Debian/Ubuntu: build-essential libgmp-dev
# libmpfr-dev libmpc-dev libisl-dev libzstd-dev zlib1g-dev). Add
# PREFIX/bin to PATH afterwards. Idempotent: exits at once when PREFIX
# already has this gcc.
set -euo pipefail

BINUTILS_VER=2.47
BINUTILS_SHA256=154ab23b60070e8f27013c22977f1129425d67d1e8acd6e13010e617811e4cff
GCC_VER=16.2.0
GCC_SHA256=e6738e29597f733270731aa90600f37ffdc045079dfc27ec7e8192cc81085c3e

[ "${1:-}" = "--versions" ] && { echo "binutils-$BINUTILS_VER-gcc-$GCC_VER"; exit 0; }
CHECK=0
[ "${1:-}" = "--check" ] && { CHECK=1; shift; }
PREFIX="${1:-$HOME/.local/m68k-elf}"
[ "$CHECK" = 1 ] || PREFIX=$(mkdir -p "$PREFIX" && cd "$PREFIX" && pwd)
TARGET=m68k-elf
JOBS=$( (nproc || sysctl -n hw.ncpu) 2>/dev/null || echo 2)

# the compile runs cc1, which needs the gmp, mpfr, mpc and isl runtime libraries
if [ -x "$PREFIX/bin/$TARGET-gcc" ] && [ "$("$PREFIX/bin/$TARGET-gcc" -dumpfullversion)" = "$GCC_VER" ] \
   && [ -x "$PREFIX/bin/$TARGET-as" ] \
   && echo 'int x;' | "$PREFIX/bin/$TARGET-gcc" -x c -c -o /dev/null - 2>/dev/null; then
  [ "$CHECK" = 1 ] || echo "[m68k] $TARGET-gcc $GCC_VER already in $PREFIX"
  exit 0
fi
[ "$CHECK" = 0 ] || exit 1

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export PATH="$PREFIX/bin:$PATH"

fetch() {  # url sha256 file
  curl -fL --retry 3 -o "$WORK/$3" "$1"
  [ "$( (sha256sum "$WORK/$3" || shasum -a 256 "$WORK/$3") | cut -d" " -f1)" = "$2" ] \
    || { echo "[m68k] $3: sha256 mismatch" >&2; exit 1; }
}

echo "[m68k] binutils $BINUTILS_VER"
fetch "https://ftp.gnu.org/gnu/binutils/binutils-$BINUTILS_VER.tar.xz" "$BINUTILS_SHA256" binutils.tar.xz
mkdir "$WORK/binutils-src" "$WORK/binutils-build"
tar -xf "$WORK/binutils.tar.xz" -C "$WORK/binutils-src" --strip-components=1
(cd "$WORK/binutils-build" \
  && ../binutils-src/configure --target=$TARGET --prefix="$PREFIX" --disable-nls \
       --with-system-zlib --with-zstd \
  && make -j"$JOBS" && make install)

echo "[m68k] gcc $GCC_VER"
fetch "https://ftp.gnu.org/gnu/gcc/gcc-$GCC_VER/gcc-$GCC_VER.tar.xz" "$GCC_SHA256" gcc.tar.xz
mkdir "$WORK/gcc-src" "$WORK/gcc-build"
tar -xf "$WORK/gcc.tar.xz" -C "$WORK/gcc-src" --strip-components=1
(cd "$WORK/gcc-build" \
  && ../gcc-src/configure --target=$TARGET --prefix="$PREFIX" --disable-nls --without-headers \
       --with-as="$PREFIX/bin/$TARGET-as" --with-ld="$PREFIX/bin/$TARGET-ld" \
       --enable-languages=c --enable-lto --with-system-zlib --with-zstd \
  && make -j"$JOBS" all-gcc && make install-gcc \
  && make -j"$JOBS" all-target-libgcc && make install-target-libgcc)

"$PREFIX/bin/$TARGET-gcc" --version | head -1
