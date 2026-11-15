Syntakt on OS 1.42: at startup Modwerk copies 84 bytes of its boot stub to the gap above the lowered stack. Nothing runs that copy, and no module is available yet. The instrument still boots into the factory system.
A Syntakt has cleared and reloaded every sample slot on this build, played all 64 from one track, and returned to stock 1.42. A 40-second recording of that track cancelled the same pattern recorded on stock.
Known issue: those 84 bytes were not read back on the unit.
