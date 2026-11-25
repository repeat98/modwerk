# Taking turns on the unit

Every agent session and terminal of one user on one computer shares the one unit on its USB. Since 20 November 2026 the
device commands take turns on it by themselves (`scripts/unit-queue.mjs`), so nobody asks whether it is free:

- **These wait in line,** in the order they came, and go ahead by themselves when their turn comes: `npm run device:test`,
  `device:qualify` and `device:price` (the whole run is one turn), `scripts/octatrack-bootsoak.mjs` (the whole batch),
  the `npm run device` commands that drive (`try`, `set`, `remove`, `recover`, `lifecycle`, `boot`, `flash`, `status`,
  `key`, `enc`, `fader`, `probe`, `meter`, and `do` with any step but the reads below), `scripts/device-send.py` lines
  that drive, and the frontend MCP's `device_trial` until its Keep or Undo. A waiting command prints who has the unit and
  its place in line; run it in the background. The commands a turn starts (the trial `device:test` runs) are inside it.
- **Reads go beside another session's turn:** `screen`, `ui`, `state`, `mem`, `stats`, `loader`, `report`, `missing`, and
  `do` or `device-send.py` lines made only of `ui`, `screen`, `png:`, `mem:`, `state`, `stats`, `report`, `loader`,
  `missing`, `inventory`, `crash`, `stall`, `diaglog`, `saved`, `memory`, `dspmap` and at most a second of `w`. `status`
  is not a read: its HELLO moves on the upload session another process may be in ([one uploader owner](OCTATRACK_DRIVING.md)). Nor are
  `guard`, `cpu` and `gap`, which restart another run's measurement window. The MCP takes the turn for the moment it
  opens its link, since an opening link rolls back a transaction it finds left open; reads through an open link need none.
- **`serve` takes no turn:** it is the shared link. Its sender gates a line (`device-send.py`); a client that writes to
  its socket by other means is not queued.
- **By hand:** `npm run unit -- status` shows who has the unit, doing what, since when and until when, and who waits.
  `npm run unit -- hold --note "…" [--for 30m]` keeps it across several commands, or while the owner plays it: commands
  from the same checkout go ahead inside the hold, everyone else's wait. `release` gives it back, `hold` again extends
  it, and `npm run unit -- run --note "…" [--expect 15m] -- COMMAND` puts any other command in a turn.
- **Several runs in one session** (a release's `test:procedure`, its rerun, the screenshots, the put-back): keep the turn
  between them, or another session takes the unit in the seconds between two commands (25 November 2026, twice in one
  release). `run --keep 10m` keeps the turn this checkout's for that long after its command ends, and
  `MODWERK_UNIT_KEEP=10m` does the same for every command that takes the turn (`device:test`, `device:price`, the
  `npm run device` commands, and `test:procedure`'s unit steps:
  `MODWERK_UNIT_KEEP=10m npm run test:procedure -- …`). The checkout's next command goes ahead inside the kept turn and
  keeps it again; `release` gives it back sooner. A kept turn has no grace: past its time, with nothing of its own
  running, the next in line takes over. For a session you know will be long, `hold --for 1h` up front does the same.
- **Priority, the owner's call:** `run --priority "why"` (or `hold --priority "why"`) puts that command first in line,
  ahead of everyone who waited before it, behind earlier priority waiters; each one it overtakes is told who and why.
  Whoever has the unit is asked, never forced: `status` shows "ASKED TO GIVE IT BACK", `status --json` gives
  `priority`, and a `run` or device command holding the turn prints it once. A long script gives the unit back at its
  next safe point (between steps, after a rollback); nothing ends a live turn. A kept turn with nothing of its own
  running gives way at once, and a run does not keep its turn while a priority waiter is first. Use it when the owner
  says a release goes first ("release this before the long pricing run"), not to skip a line you find slow.
- **A holder that is gone or late:** a turn whose processes are gone (a crash, a kill) ends, and the next in line is
  told to check the unit first: a trial the dead holder started may still run (`do inventory`, then `recover`). A live
  turn five minutes past its expected end is reported to `status` and to the waiters, never taken over, since that
  would end its trial; `release --force` is the owner's call for one that is stuck. A hold ten minutes past its time,
  with nothing of its own running, ends once someone waits.
- **Emulators need no turn:** `--emulator`, or `MODWERK_UNIT=emulator` for the scripts. The queue lives per user
  (Linux `~/.local/state/modwerk/unit-queue`, macOS `~/Library/Application Support/modwerk/unit-queue`, Windows
  `%LOCALAPPDATA%\modwerk\unit-queue`; `MODWERK_UNIT_DIR` moves it), shared by every clone and worktree. Sessions in WSL
  and on its Windows host keep separate queues.
- The queue replaces only asking whether the unit is free. What runs on the developer's unit still needs their OK (on
  the owner's computer it stands, [OWNER_OPERATIONS.md](OWNER_OPERATIONS.md)), and power cycles, flashing and Keeps stay
  as [driving the Octatrack](OCTATRACK_DRIVING.md) says.
