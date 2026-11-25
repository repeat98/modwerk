# Midi Mode 2 project storage lessons

**A valid saved name does not prove a project-wide channel update committed.**
Names can save before an initialization attempt that later rolls back. Inspect
the checked intent/terminal journal and native bank checksums before blaming a
UI cache or retrying. Preserve a stage/bank failure code, yield between bank
pairs, allow cancellation at safe boundaries, and restore a live failed attempt
in place when only channel fields changed. Reserve a full native reload for
boot recovery that may have loaded damaged unrelated bank data. A long stopped
engine operation with every key consumed looks like a frozen instrument even
when its storage verification is still running.

For an explicit repeat, keep the previous initialized checkpoint as the
rollback baseline; do not clear its marker to bypass a first-run guard. A
completed old marker is not proof that the new transaction committed: compare
the journal's target generation. Exercise interrupted repeats as well as first
initialization, and require a fresh confirmation key press before replacing
independent bank edits.

**Valid working and stored banks can have different channel maps.** A reported
save loop had identical non-channel bytes and valid checksums in both copies,
but one working MIDI channel was 3 and its stored channel was OFF. Do not
require both channel maps to equal RAM. Check the working map against the live
project, record each disk map separately and restore each original on rollback;
retain the checksum and non-channel fingerprint checks. Exercise real divergent
copies, including torn-peer recovery, rather than only identical saved twins.

When a journal gains recovery data old readers cannot interpret, an unknown
tag alone may fall through their legacy path. Use a version they reject and
retire both old journal peers before mutation. A compatible terminal record
can permit old readers again after complete commit/rollback. Test the actual
old reader, and require the recovery-capable module to be kept before starting.

**A Save to New destination may contain only working banks.** A reported new
project had all sixteen valid `.work` files and no `.strd` files. A copied name
checkpoint and initialized marker did not mean the stored bank set existed.
Native full SAVE PROJECT created all stored copies, after which initialization
and fresh-process restoration passed. Tell the player to complete SAVE PROJECT
in the destination after Save to New, and distinguish missing peers from channel
mismatches before recommending another save.

**Buffered write-mode close uses the logical end recorded in its file object.**
An in-place bank edit must preserve the original logical length on every error
path as well as success; a failed seek or partial update must not make close
truncate the bank. Use complete aligned sectors, preserve neighboring bytes,
and verify the full file afterward. A channel-only journal cannot recover
unrelated data lost by a whole-bank rewrite. Keep a verified saved peer and
fingerprints of all non-channel bytes before changing either bank copy.
Host fault tests should model close-time truncation and torn neighboring data,
not just a failed channel-byte write.
