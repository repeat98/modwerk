"""Generate one Q15 sine cycle with a duplicated interpolation endpoint."""
import math
values = [round(32767 * math.sin(i * math.tau / 256)) for i in range(257)]
for i in range(0,len(values),12):
    print("    " + ", ".join(map(str, values[i:i+12])) + ",")
