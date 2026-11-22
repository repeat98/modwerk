# USB Audio trial reconnect

Changing the Octatrack’s USB Audio configuration makes its USB interface disappear and return. A tester saw a trial disconnect and the previous set return. The recorded sequence leaves open which part of the reconnect failed.

In the host link test, a simulated Octatrack returns with the original trial open, and the first request to claim its interface fails. The installer used to enter its ordinary busy state immediately. That ended the page’s wait and released its lock on the trial.

The installer now retries the claim under the trial’s existing lock and deadline. The host tests cover a successful Keep after the interface becomes available and expiry while it stays busy. An opted-in report can identify a failed claim during the trial from its phase. A physical Windows reconnect remains to be verified.
