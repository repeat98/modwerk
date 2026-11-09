# Private volatile trial client

`src/dev/volatile-batch-session.ts` prepares one serial MWVB/MWVS transaction
for the proposed feature64 service. It has no real USB adapter and no public
site or MCP import. The published caps7 base remains unchanged. Synthetic
transport fixtures establish host behavior only; board source trust, owned
allocations, DSP acknowledgments, save inhibition, rollback and hardware
qualification must independently pass before integration.

The client copies and validates the complete bundle before writing, then
rechecks the exact idle baseline. A state read never grants ownership. Only
the acknowledged engine Begin result supplies fresh board transaction and
generation values bound to that baseline and offer. Queued mailbox results
remain unowned. There are no intermediate accepts or persistent commands.

Whole transfers are serialized. Each command has one submit followed by
bounded cached-result reads. A lost submit or result, malformed reply,
unexpected sequence/identity, changed limits, refusal or uncertain publication
permanently blocks further commands on that client. Lost Begin is never
adopted, repeated or released. Late replies cannot revive a poisoned client.
Independent device expiry must retain/restore its journal; the host cannot
declare that unknown work was unchanged or rolled back.

Positive asynchronous results retain the exact offer until complete stopped
publication. Starting the trial is explicit and does not play the sequencer.
Touch is manual, at most once per second, and only for a visible active trial.
Hidden or expired trials request rollback instead of renewal. The maximum
absolute trial duration is two minutes and cannot be extended by Touch. No
read renews ownership. A future UI/MCP integration must provide actual
visibility/disconnect handling and explicitly close its owned trial.

Rollback/untouched Abort is complete only after an exact result confirms Idle,
cleared journal/latch/counters, the same owned tokens and the full baseline
digest. Cached Idle with consumed tokens cannot be adopted by a new client.
If confirmation is lost, commands stop and recovery remains unverified.
Staging cancellation is checked between positively acknowledged transfers;
an untouched acknowledged transaction may then be explicitly aborted.

The adapter must preserve fixed requests34/35/36, serialize complete EP0
transfers, and reject late canceled replies. Feature64 and exact boot-session
identity are required. Timeouts stay below the proposed independent ten-second
owner lease; neither an advertised capability nor these host fixtures qualify
actual board memory, execution time, audio or physical persistence.
