# Toolchain preparation has network access. The module compilation run does not.
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS node-runtime
# Multi-architecture index digest of ubuntu:24.04, resolved 1 October 2026.
FROM ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3
ENV DEBIAN_FRONTEND=noninteractive
RUN printf 'Acquire::http::Pipeline-Depth "0";\nAcquire::Retries "5";\nAcquire::Queue-Mode "access";\nAcquire::http::No-Cache "true";\n' > /etc/apt/apt.conf.d/99local
RUN apt-get update && apt-get install -y --no-install-recommends python3 git cmake make g++ curl xz-utils ca-certificates libgmp-dev libmpfr-dev libmpc-dev && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
# The same GNU binutils release and m68k-elf target as the toolchain that produced the committed,
# parity-verified packages. Distribution cross-binutils are older and target m68k-linux-gnu.
ARG BINUTILS_VERSION=2.47
ARG BINUTILS_SHA256=154ab23b60070e8f27013c22977f1129425d67d1e8acd6e13010e617811e4cff
RUN curl -fsSLo /tmp/binutils.tar.xz "https://ftp.gnu.org/gnu/binutils/binutils-$BINUTILS_VERSION.tar.xz" \
 && echo "$BINUTILS_SHA256  /tmp/binutils.tar.xz" | sha256sum -c - \
 && mkdir /tmp/binutils && tar -xJf /tmp/binutils.tar.xz -C /tmp/binutils --strip-components=1 \
 && cd /tmp/binutils && ./configure --target=m68k-elf --prefix=/usr/local --disable-nls --disable-werror --disable-gprofng --disable-gdb --disable-sim \
 && make -j"$(nproc)" && make install && cd / && rm -rf /tmp/binutils /tmp/binutils.tar.xz
# Freestanding ColdFire C compiler, pinned to GNU's release archive checksum.
ARG GCC_VERSION=16.2.0
ARG GCC_SHA512=c51c30ca7422d0cbecf504b2e0f33c3aca31e0f90a76b65217f465163fa6fa17b3f5de39e145c47e5bab90ac0ce7fff3b03c8d553ae36e01faaea5a50f8648d1
RUN curl -fsSLo /tmp/gcc.tar.xz "https://gcc.gnu.org/pub/gcc/releases/gcc-$GCC_VERSION/gcc-$GCC_VERSION.tar.xz" \
 && echo "$GCC_SHA512  /tmp/gcc.tar.xz" | sha512sum -c - \
 && mkdir /tmp/gcc /tmp/gcc-build && tar -xJf /tmp/gcc.tar.xz -C /tmp/gcc --strip-components=1 \
 && cd /tmp/gcc-build && /tmp/gcc/configure --target=m68k-elf --prefix=/usr/local --enable-languages=c --without-headers --disable-bootstrap --disable-multilib --disable-nls --disable-shared --disable-threads \
 && make -j"$(nproc)" all-gcc && make install-gcc && cd / && rm -rf /tmp/gcc /tmp/gcc-build /tmp/gcc.tar.xz
WORKDIR /opt/toolchain
COPY sdk/octabam/scripts/vendor.sh scripts/vendor.sh
COPY sdk/octabam/tools/patches/dsp56300.patch tools/patches/dsp56300.patch
COPY sdk/octabam/tools/harness/dsp_host/ tools/harness/dsp_host/
RUN bash scripts/vendor.sh dsp56300 && cmake -S vendor/dsp56300 -B vendor/dsp56300/build -DCMAKE_BUILD_TYPE=Release -DDSP56300_DEBUGGER=OFF && cmake --build vendor/dsp56300/build --target dsp_asm dsp56kDisassemble --parallel "$(nproc)"
RUN /usr/local/bin/m68k-elf-as --version && /usr/local/bin/m68k-elf-gcc --version && node --version && git -C vendor/dsp56300 rev-parse HEAD
WORKDIR /source
# Runtime always overrides these mounts with clean source and an empty output.
CMD ["python3","-B","scripts/build-module-packages.py","--vendor","/opt/toolchain/vendor","--output","/output/packages"]
