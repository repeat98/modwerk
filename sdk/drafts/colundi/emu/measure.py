"""Read local emulator trace rows and validate the two PLAY captures."""
import json
import sys
from pathlib import Path

plays = [row for line in Path(sys.argv[1]).read_text().splitlines()
         if (row := json.loads(line))["stage"] == "play"]
assert len(plays) == 2
for play in plays:
    readings = []
    for degree, samples, first, last, crossings, previous in play["rows"]:
        hz = (crossings - 1) * 44100 * 4096 / (last - first) if crossings >= 2 else None
        if degree in (78, 79):
            assert abs(hz - (440 + degree - 78)) < 0.005
        else:
            assert crossings == 0
        readings.append({"degree": degree, "pcm_hz": hz})
    print(json.dumps({"play": play["attempt"], "readings": readings}))
    assert [row["degree"] for row in readings] == [78, 79, 79, 78], "first PLAY or restart mismatch"
