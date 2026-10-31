Removing a machine clears its previous START refusal, so a replacement reusing its memory can sound before its first accepted START. Unrelated module changes retain a live machine's refusal.

The SDK rejects START callbacks aimed at data, the middle of a function or a non-relocated address during package building, using linked ELF function metadata. The package and START record formats are unchanged; installation retains its existing image-bound checks.
