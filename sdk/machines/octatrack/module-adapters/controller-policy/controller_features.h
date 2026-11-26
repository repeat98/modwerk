/* SPDX-License-Identifier: MIT */
#ifndef MW_CONTROLLER_FEATURES_H
#define MW_CONTROLLER_FEATURES_H
#include "dsp_ledger.h"
static inline unsigned mw_controller_cores(unsigned f) {
    return f == MW_DSP_KEYBUS ? 0u : MW_DSP_CORES(f);
}
static inline unsigned mw_controller_allowed(unsigned core) {
    unsigned mask=0;
    for(unsigned f=1u;f<=MW_DSP_FEATURES;f<<=1u)
        if(MW_DSP_CORES(f)&(1u<<core))mask|=f;
    return mask;
}
#endif
