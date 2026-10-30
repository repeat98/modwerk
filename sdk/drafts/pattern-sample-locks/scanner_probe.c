/* SPDX-License-Identifier: MIT */
/* Test-only compiler probe. No firmware constants or emitted inline assembly.
 * The empty barrier requests three ABI-preserved registers; GCC emits their
 * ordinary save/restore sequence. This file is not part of the module build. */
int scanner_abi_probe(int first, int second)
{
    __asm__ volatile("" : "+d"(first), "+d"(second) : : "d2", "d3", "a2");
    return second - first;
}

/* Plain C control: signed remainder followed by an ordinary global store. */
volatile int scanner_result;
void scanner_modulo_probe(int value)
{
    scanner_result = value % 4;
}
