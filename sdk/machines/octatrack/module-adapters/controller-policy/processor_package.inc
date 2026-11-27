/* SPDX-License-Identifier: MIT
 * PREPARE runs before the loader owns native DSP words. Decode its already
 * bounded wire fields into Base scratch; PREPARE never retains these pointers.
 * The loader replaces them with pool-owned words before publishing a module.
 */
#include "processor_contract.h"
#define TP_CONTAINER_WORDS (TP_PACKAGE_HEADER+TP_CODE_WORDS+256u+1024u)
static uint32_t tp_admission_words[TP_CONTAINER_WORDS];
static uint16_t tp_admission_relocations[256];
int modwerk_machine_dsp_engine_data_admit(struct runtime_dsp *d,const uint8_t *words,const uint8_t *relocations)
{
    if(!(d->requires&TP_FEATURE))return modwerk_machine_dsp_engine_admit(d);
    if(!words || d->engine_count>TP_CONTAINER_WORDS || d->engine_relocation_count>256u ||
       (d->engine_relocation_count && !relocations))return RUNTIME_MALFORMED;
    for(unsigned i=0;i<d->engine_count;++i){const uint8_t *p=words+4u*i;
        tp_admission_words[i]=(uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
    for(unsigned i=0;i<d->engine_relocation_count;++i){const uint8_t *p=relocations+2u*i;
        tp_admission_relocations[i]=(uint16_t)((unsigned)p[0]<<8|p[1]);}
    d->engine=tp_admission_words;d->engine_relocations=tp_admission_relocations;
    return modwerk_machine_dsp_engine_admit(d);
}
