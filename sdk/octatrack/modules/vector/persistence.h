/* VECTOR's reserved source slots must survive stock Part validation. */
#ifndef VECTOR_PERSISTENCE_H
#define VECTOR_PERSISTENCE_H
#include <stdint.h>
int vector_signed_track(const volatile uint8_t *part, unsigned track);
int vector_validate_part(uint8_t *part, int (*stock_validate)(uint8_t *));
#endif
