"""Host success must never masquerade as native qualification."""
raise SystemExit(
    "[FAIL] Beat Slicer is a host-tested planning draft, not installable firmware. "
    "Editor event/adapter, verified playback fades, stock save/reload, native/browser "
    "parity, USB lifecycle and actual MKII results are pending. "
    "Run test_planner.py separately for portable-core regressions."
)
