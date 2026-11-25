/* Native Flex selection used by the overview and metadata fixtures. */
int og_source(unsigned track,OgSource *s) {
    uintptr_t bank=U32(0x46c82456);
    if (track>=8 || bank<0x400e21e0 || bank>=0x40a955e0) return 0;
    uintptr_t part=bank+0x8ed80+(U8(0x100b14cf)&3u)*6322u;
    if (U8(part+0x22+track)!=1) return 0;
    /* Part sample-slot rows are STATIC, FLEX, THRU, NEIGHBOR, PICKUP.
     * The native publisher resolves the same row before note preparation. */
    /* The serialized PART chunk has a nine-byte header absent in RAM. */
    unsigned slot=U8(part+0x2ca+track*5u+1u);
    return og_describe(slot,s);
}
