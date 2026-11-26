"""Seq Pos readiness gate (print + Play Modes site-guard lock).

Does not prove audible address-mode, Keep, or catalog readiness.
"""

from __future__ import annotations

import pathlib
import re
import sys

_HERE = pathlib.Path(__file__).resolve().parent
_SDK = _HERE.parents[1]  # …/sdk/drafts/seq-pos → sdk/
_AUDIO_STEP = 0x400A2D6A
_GUARD_LEN = 6
_HASH_RE = re.compile(
    r"stock_guard\(\s*0x400[aA]2[dD]6[aA]\s*,\s*6\s*,\s*"
    r'"([0-9a-f]{64})"',
)


def _guard_hash(path: pathlib.Path) -> str:
    text = path.read_text(encoding="utf-8")
    match = _HASH_RE.search(text)
    if not match:
        raise SystemExit(f"seq-pos: missing stock_guard for 0x{_AUDIO_STEP:x} in {path}")
    return match.group(1)


print(
    "seq-pos: production SPOS@37; symbols "
    "sp_dest_audio_init, sp_audio_step, sp_on_store, sp_map, "
    "sp_level, sp_off, sp_module_key, sp_module_enc, "
    "sp_pos_w, sp_en, sp_len, sp_lfo_pmtr, sp_toast; "
    "USB contributes ot_lfo_pmtr_dest (order 80) + module_key/module_enc; "
    "Detour 0x400a2d6a → sp_audio_step; after_store arms enable; "
    "conflicts with playmodes; not catalog-listed"
)
print("seq-pos: lea-free after MOP-61; base owns 0x4000d042; MOP-73 audio_step")

sp_hash = _guard_hash(_HERE / "manifest.py")
pm_path = _SDK / "octabam" / "modules" / "playmodes" / "manifest.py"
pm_hash = _guard_hash(pm_path)
if sp_hash != pm_hash:
    raise SystemExit(
        "seq-pos: Play Modes conflict site 0x400a2d6a stock_guard drifted "
        f"(seq-pos={sp_hash} playmodes={pm_hash}); "
        "see evidence/playmodes-audio-step-conflict-mop92-2026-11-24.md"
    )
print(
    f"seq-pos: MOP-92 site lock OK — 0x{_AUDIO_STEP:x} len {_GUARD_LEN} "
    f"matches playmodes pm_audio_step ({sp_hash[:12]}…)"
)
print(
    "seq-pos: MOP-102 — base ev_audio_step landed; draft subscribes order 50 "
    "(sp_ev_audio_step); Play Modes order 40 via machine-ports; "
    "Undo dual-install + audible address-mode still open; not catalog-listed; "
    "see evidence/base-ev-audio-step-impl-mop102-2026-11-24.md"
)
print(
    "seq-pos: audible SPOS still open (MOP-110 fixture tip; MOP-83 gate closed; "
    "remapper peeks after MOP-92/101/102)"
)
sys.exit(0)
