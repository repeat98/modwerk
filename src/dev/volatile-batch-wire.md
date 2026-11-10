# Private volatile batch framing

`src/dev/volatile-batch-wire.ts` prepares the proposed MWVB v1 commands and MWBT
v1 bundle. It makes no device calls and is not imported by the public site or MCP.
The existing caps7 base and normal upload protocol remain unchanged. Feature64
must remain closed until its actual board service and physical lifecycle are
qualified. There is no Keep or persistent command in this protocol.

Frames use explicit big-endian offsets and zero reserved bytes. The maximum
host chunk is3995 bytes; complete control data stages stay below4096 bytes and
avoid multiples of64. Bundles copy inputs before asynchronous SHA256 checks,
require unique encoded module identities and nonoverlapping canonical
module IDs as full unsigned32-bit values, with at most20 participants, and
respect explicit stage/count limits. The2MiB host
allocation bound does not establish board memory, DSP resources or safe fit.

MWRM header identity and encoded SHA checks here are outer framing checks only.
The board must independently reconstruct packages and verify trusted exact
source/package participant associations, removal packages, whole owned extents,
monotonic generations, actual per-core ACKs, current and paused roots, and complete
resource/retirement journals. Host participant lists grant no authority.

The cached status parser requires feature64, the exact observed base and boot
session, supported enums, zero reserved bytes and consistent phase/digest/core
facts. It keeps cumulative touched cores separate from current-operation ACKs.
A queued Begin stays unowned; confirmed rollback Idle may retain consumed
transaction tokens only with equal baseline/current digests and cleared offer,
counts, masks and latch. Parsing a status never establishes ownership.

Sequence allocation, transaction ownership,
bounded visible Touch renewal, lost-ACK handling and confirmed rollback are
separate work. These encoders cannot establish ownership or start a trial.
