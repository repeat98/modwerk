# Tonverk OS 1.4.1 research report

Stage-1 (format) research on the developer's own download of the Tonverk OS 1.4.1 update, kept outside the repository. It records what the update container shows, what public research adds and what stays unknown, and it ends with what this means for the machine's five steps. Everything here is static inspection of the update file: it never proves runtime behaviour, and nothing was run on a unit for this report.

Tags: **[OBS]** seen in the file, **[INF]** inference from what was seen, **[PUB]** public research, **[UNK]** unknown. Names, sizes, addresses and SHA-256 identities only; no firmware bytes, code or tables.

## 0. Inputs and tooling ledger

| Input | Identity |
| --- | --- |
| `Tonverk-OS-1.4.1.swu` | 116,683,264 bytes, SHA-256 `66bb80cf02a11f92a6cea2e02c401cf725fbf37fd0f3a4f114e18c5b0ead9391`, from Elektron's Tonverk downloads page, in a zip with an HTML install readme (SHA-256 `2c9d4da7afbc0e20ce1ed5fb948221b34b0d8d0b9888fb0f81dd7a35db614b02`) |

Tools: macOS `bsdtar` (cpio listing and extraction), `file`, `xxd`, `strings`, `openssl asn1parse`, and a short original Python script measuring the Shannon entropy of 64 KiB samples at a file's head, middle and tail. No firmware ran and no disassembler was needed: every payload except the boot script is opaque (§3). The stock file stays on the developer's computer; only identities and structure are recorded here.

Public research consulted [PUB]: Elektron's Tonverk release notes and downloads page (update procedure, version history, downgrade policy), the [SWUpdate](https://github.com/sbabic/swupdate) project (the `.swu` container convention), and [U-Boot's FIT documentation](https://docs.u-boot.org/en/latest/usage/fit/index.html) (the boot-script image format).

## 1. Findings ledger

Evidence classes: *archive* (cpio headers and entry list), *image* (bytes of a named entry), *public*.

| # | Claim | Evidence | Class | Confidence |
| --- | --- | --- | --- | --- |
| L1 | The update ships as a zip holding an HTML install readme and one `.swu`; install is USB disk mode, copy to the SD card root, SETTINGS > SYSTEM > OS UPGRADE; downgrading is unsupported | file set + Elektron release notes | archive + public | certain [OBS]/[PUB] |
| L2 | The `.swu` is an uncompressed cpio archive (SVR4 "newc with CRC") with 11 entries, all regular files | archive | certain [OBS] |
| L3 | Every entry has uid/gid 1000/1000 and mtime 2025-07-20, fourteen months before the 1.4.1 release date (2026-09-23): the build pins timestamps, so byte-exact repacking is plausible | archive | high [OBS]; "reproducible build" is [INF] |
| L4 | `sw-description` (5,792 bytes) is not the plaintext libconfig manifest stock SWUpdate uses: no readable text, entropy 7.93–7.97 bits/byte — an encrypted or encapsulated manifest | image | high [OBS]; "encrypted" is [INF], the scheme is [UNK] |
| L5 | `sw-description.sig` (384 bytes) is a raw signature, not ASN.1/CMS; 384 bytes is the RSA-3072 modulus size, and the boot script's own signature node names sha256,rsa3072 | image | high [OBS]+[INF] |
| L6 | The two SquashFS filesystems and the two large FIT images carry no `hsqs` or `d00dfeed` magic and measure 7.997+ bits/byte at head, middle and tail — encrypted payloads; the demo archive (7.6–7.8) and the update script (ASCII) are plaintext | image | high [OBS]; "encrypted" is [INF] |
| L7 | `bootscript-release.fit` is a readable FDT v17 FIT image (U-Boot 2025.04 `mkimage`) whose script node carries an RSA-3072/SHA-256 signature | image | certain [OBS] |
| L8 | Boot architecture (§4): eMMC `mmc 2`; a rescue root on partition 1; main roots as A/B directories on partition 3; one `fitImage` per root; rollback after a failed update boot; rescue on repeated boot failure, after an interrupted update, or on user request | image | high [OBS] for what the script encodes; runtime behaviour [UNK] |
| L9 | `flash.bin-esp5-mb-mb0/mb1.signed` (937,984 bytes each) begin with an NXP AHAB container header (`d1 00 20 41`) — signed i.MX-class boot containers; the exact SoC, and whether the device's fuses enforce them, are [UNK] | image | magic [OBS]; SoC family and enforcement [INF]/[UNK] |
| L10 | `esp5-update.sh` is a plaintext SWUpdate preinst/postinst script; postinst unpacks a demo project into `/data/factory/projects`, so a writable `/data` partition exists | image | certain [OBS] |
| L11 | No checksum, hash or version rule is readable anywhere in the container: the verification contract lives inside the encrypted manifest (L4) | image, whole file | certain as a negative [OBS] |
| L12 | The codename `esp5` runs through every image name, the device-tree config name and the update script | archive | certain [OBS] |

## 2. Container inventory

11 entries; payload bytes sum to 116,681,174, leaving 2,090 bytes of cpio headers, trailer and padding in the 116,683,264-byte archive [OBS].

| Entry | Bytes | SHA-256 | Role |
| --- | --- | --- | --- |
| `sw-description` | 5,792 | `11a37b69b00477bd2fff8fc6b927d6907888116f76cb40c8a844bd1235db6abf` | Encrypted update manifest (L4) |
| `sw-description.sig` | 384 | `0d79da49131d0f9cb491860a21e2a4c75bad68527060b453bb35248b153599f2` | Raw RSA-3072 signature over it (L5) |
| `mb-image-release-esp5-mb.rootfs-rootfs.squashfs` | 49,897,488 | `e34f33f8d92b2e3d521712150633af2ad76775756976636e4a68c328fb597ab8` | Main OS root filesystem, encrypted (L6) |
| `mb-image-release-esp5-mb.rootfs.fit` | 22,001,232 | `f70cce8c0f11b4d03db0c3cb930ef4d4d618aeb039887b54eea85a6303998ec5` | Kernel/FIT image of the main roots, encrypted (L6) |
| `mb-image-release-esp5-mb.rootfs-apps.squashfs` | 15,380,496 | `324adfb104da13c9bfd872181f98463a7b0be78a345c9b9746ee0f3abc61b435` | A separate applications filesystem, encrypted (L6) |
| `mb-image-release-esp5-mb.rootfs-rescue.fit` | 27,428,704 | `5fcf4c9659305b3973f76978d3c5a08263ab464acaec829410b5dbadacb6e535` | The rescue system, encrypted (L6) |
| `bootscript-release.fit` | 3,771 | `847822335bb2f751e79f72e328e9222c234b3ee1937e476e509d4ae5c4ceaf3d` | Signed U-Boot boot script, readable (L7) |
| `flash.bin-esp5-mb-mb0.signed` | 937,984 | `907b54ce47f2b912cbcbde2909bee1a651e1222b62d7ec31b5f7e8f7e9b2c56e` | Signed bootloader container (L9) |
| `flash.bin-esp5-mb-mb1.signed` | 937,984 | `99e075fb07fc5f6ec218b652bbabf87d883d3db815b1fe4c29c346f100d05e7a` | Second signed bootloader container (L9) |
| `DEMO.tar.gz` | 86,856 | `e8ff1ade6768119dfe711cb65af0ecca8388dedc55f51b82911ef89b8e2a92fb` | Demo project content, plaintext |
| `esp5-update.sh` | 483 | `31938d306cc8ef01498767286fcb03a3b865c68b4aef9ceb5ee187753ac110e2` | SWUpdate preinst/postinst hooks (L10) |

## 3. Verification and encryption chain

What the file itself shows, outermost first:

1. **Bootloader.** Two AHAB-format signed containers (L9). NXP boot ROMs verify such containers against key hashes held in fuses [PUB]; whether this device's fuses are programmed (a closed boot) is [UNK].
2. **U-Boot boot script.** The FIT script node is signed RSA-3072/SHA-256 (L7), and U-Boot verifies signed boot scripts before running them [PUB].
3. **Update manifest.** A raw RSA-3072 signature over an encrypted `sw-description` (L4, L5). Stock SWUpdate verifies the manifest signature and reads each artifact's hash, decryption key material and version rules from the manifest [PUB]; here all of that is unreadable off-device.
4. **Artifacts.** All four filesystem/kernel payloads are opaque, uniform-entropy blobs (L6): verified — and presumably decrypted — at install time with device-held material.

Consequences [INF]: the stock `.swu` can be taken apart and repacked exactly from its own contents (Stage 2), but nothing inside it can be modified and re-signed. The manifest is encrypted, its signature is checked, and every payload hash sits inside the manifest. Every trust anchor is device-held.

## 4. Boot and recovery architecture (from the signed boot script)

Paraphrased; the script text stays out of the repository.

- The device boots from eMMC (`mmc 2`). Partition 1 holds a rescue root; partition 3 holds the main roots as named directories, one active and one used to stage an update; the remaining partition layout (a `/data` partition, L10, is the likely third entry) is [INF]/[UNK].
- Each root directory carries its own `fitImage` (kernel and device tree), loaded at 0x43800000.
- Update flow: a boot counter guards the first boot from the staging root; if it fails, the script rolls back to the previous active root and records the failure for the OS to report.
- Rescue is entered when the active image fails to boot repeatedly, after an interrupted update, or on user request (the script reads UI heartbeat flags), with the reason passed to the rescue system in the kernel arguments.
- Kernel arguments include `rcutree.kthread_prio=95` (a real-time kernel configuration [INF]), `conf=esp5`, and a board revision taken from a hardware BOM variable.

None of this was observed on a unit [UNK]: what the rescue system presents, whether an interrupted install always recovers, and whether the OS UPGRADE menu re-accepts the same version are Stage-3 questions.

## 5. What this means for the five steps

- **format** — started, with this report. The container, packing and entry roles are documented; the step's "checksums documented" cannot be met from the file alone because the manifest is encrypted (L11). The remaining path is unit-side observation.
- **rebuild** — a byte-exact repack of the stock file from its own entries looks feasible (L3, plain cpio, ~2 KB of framing); Stage 2 will prove it with `cmp`. A *modified* rebuild is closed (§3).
- **boot** — the step's "a changed OS starts" has no route through the update container on this evidence: modified payloads fail the encrypted manifest, and the manifest cannot be re-signed or re-encrypted without Elektron's keys. This is the report's central negative result. Whether the stock system offers any other execution surface — anything it loads from the writable `/data` partition, an official add-on mechanism — is [UNK] and the honest open question for on-unit research. If none exists, the machine cannot take OS-image mods at all, and any module path needs an owner-level platform decision, as the Zoom pedals' separate-contract model did.
- **core, mods** — no route is proposed yet; the machine stays locked for modules.
- **Safety** — the stock recovery design (rescue root, A/B rollback, user-requested rescue) is unusually strong, which lowers the risk of read-only on-unit research. Recorded as design intent [OBS], not as tested behaviour.

## 6. Next steps

Stage 2 (rebuild): repack the stock `.swu` from its own entries with original tooling, prove byte equality with `cmp`, and mark the step from the evidence.

Stage 3 preparation (needs a unit over USB; read-only first):

- whether SETTINGS > SYSTEM > OS UPGRADE re-accepts the same 1.4.1 file (reinstall as the recovery path);
- what the user-requested rescue system presents and whether it can reflash;
- what the device enumerates as over USB (identifiers and interfaces) for the later link work;
- whether `/data` or the SD card carries anything the stock system executes — the one open door §5 names — inspected read-only.

Everything stays labelled until observed; "not tested" is the default.
