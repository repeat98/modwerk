# Editor menu composition prototype

`editor_menu.c` proposes a base-owned, fixed-storage composition layer. It is
not a hook, exported ABI, runtime contribution table or installed editor UI.
The separate shared-base change still needs owner review, typed package
admission and a proved native loader/editor serialization boundary.

The composer accepts either observed stock variant (six or nine rows), plus
one to four admitted actions. It preserves stock labels, ordering and callback
values, including null callbacks; copies all labels into stable storage; and
sorts contributions by a unique nonzero action key. Each contributed row
contains a module/generation/action identity, never a module function pointer.
All contributed callback slots point to a base-owned trampoline. Labels are
nonempty printable ASCII with at most 31 bytes. Invalid input, duplicate keys,
stale owners or exhaustion leave the menu and output token unchanged.

The caller must validate readable input extents and package ownership before
composition. Inputs and the token output must not alias the destination menu.
Backend code, context, trampoline and the menu storage must remain base-owned
and stable until detached. The composer does not validate arbitrary pointers
or turn an untrusted runtime package into admitted data.

Every call requires the same stable loader/editor lock. Dispatch validates
the exact menu token and current owner generation, then invokes by identity
while that lock stays held. The base backend must resolve the actual handler
under this same ownership boundary. Neither a copied owner tuple nor the
portable state machine pins native module memory. Handlers must return promptly,
must not wait or reenter, and must leave background work in base-owned tokens.

The existing runtime ledger supplies unique per-boot owner generations and
refuses exhaustion (`sdk/runtime/loader/loader.c`). A native admission row must
retain its complete `runtime_owner`; under `modwerk_machine_lock`, resolve the
menu's id/generation and validate that full record with
`modwerk_runtime_owner_valid` and verify that the exact owner still occupies a
current published position before resolving an admitted handler offset.
Matching two integers omits extent/header/digest checks; ledger validity alone
also admits staged candidates and retained rollback predecessors. The proposed
[owner helper](MENU_OWNER.md) exercises this distinction against the real loader
with synthetic host machine glue. Its fixed-lifetime lease retires permanently;
a production registry must retire it before transitions so a replace-and-restore
interval cannot be missed between queries. Typed admission, module-set readiness
and native retirement hooks are still separate requirements, not installed here.
The loader's stable lock deliberately leaves real-time interrupts running.
It can protect loader ownership, but cannot by itself exclude recorder/PCM
writers or serve as the preview backend's coherent-source lock.

Lifecycle:

1. Zero-initialize once; open copies the menu and issues a monotonically unique
   token. The object cannot move while any stock pointer refers to it.
2. Stock selection closes the displayed menu before its callback. The base
   wrapper captures the token and selected row without yielding, then dispatches.
   Close/sample change/owner removal can instead retire the menu before dispatch.
3. During dispatch, retirement, acknowledgement and reentrant dispatch return
   busy. The module cannot be reclaimed during its synchronous callback.
4. Callback success/failure or stale owner leaves the menu retiring. Arrays
   stay intact; another open is refused. Hiding the stock menu is not evidence
   that its pointers or old selection events are detached.
5. Only the trusted adapter can acknowledge actual detachment/quiescence. Then
   a new menu may be composed with a new token. The maximum token can be used
   once; subsequent opens refuse instead of wrapping. Never reset it in place.

The no-argument native trampoline cannot identify an old callback after storage
reuse by itself. This is why detachment is a separate mandatory boundary, not
an automatic side effect of callback return. An implementation that passes the
latest token from a global without excluding old callbacks is unsafe. The
isolated stock fixture forces quiescence between cases; it does not prove a
native detach mechanism, cancellation scheduler or loader removal hook.

The host suite covers 20 composed selections across both stock variants and
one to four contributions, copied labels, deterministic ordering, exact stock
callback retention, stale owners/tokens, retirement, callback failure,
reentrant removal refusal, token exhaustion and malformed inputs. The native
fixture executes real stock menu open, selection and indirect callback dispatch
with UI/drawing/stock action bodies explicitly mocked. No rendered or device UI,
native lock, live package admission, background job cancellation, commit/rollback
or physical persistence is qualified by these tests.

The compiled stock fixture reserves one incoming argument word for selection:
its tail-dispatch overwrites that slot with the chosen callback. Calling it as
`void(void)` corrupted the enclosing caller's saved D2 even though all functional
menu assertions passed. The corrected fixture passes callee-saved register and
stack checks, including each observed stock menu call. This is a test-call ABI
constraint, not a newly assigned native hook signature.


The proposed [full-owner backend](MENU_OWNER_BACKEND.md) connects short menu
identities to admitted full runtime-owner leases. It copies allowed action IDs,
checks current publication at dispatch, and forwards only to trusted base code.
This supplies an adapter between prototypes, not typed package registration,
native callback retirement or an installed USB service.
