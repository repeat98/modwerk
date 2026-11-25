/* SPDX-License-Identifier: MIT
 * Count the track-owner resolutions made by an ordinary UI charge pass. Eight FLEX
 * tracks with two installed machines walk the whole descriptor list on every miss. */
#define main registry_fixture_main
#include "test_machine_registry.c"
#undef main

static int measuring;
static unsigned lookups;

__attribute__((no_instrument_function))
void __cyg_profile_func_enter(void *function, void *caller)
{
    (void)caller;
    if (measuring && function == (void *)owner) ++lookups;
}

__attribute__((no_instrument_function))
void __cyg_profile_func_exit(void *function, void *caller)
{
    (void)function;
    (void)caller;
}

int main(void)
{
    const Machine *installed[] = {&A, &P};
    put_u32(BANK, 0x46000000u);
    for (unsigned t = 0; t < 8; ++t) part0()[0x22 + t] = 1;

    measuring = 1;
    charge(installed, 2);
    measuring = 0;

    if (lookups > 8) fprintf(stderr, "%u owner lookups for eight tracks\n", lookups);
    CHECK(lookups <= 8);
    CHECK(!mw_cpu_booked && !mw_cpu_refused);
    return failures != 0;
}
