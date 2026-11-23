"""Build a local runtime package with the SDK. Takes one output pathname."""
import json
import os
from pathlib import Path
import subprocess
import sys

here = Path(__file__).resolve().parent
sdk = here.parents[1]
environment = os.environ.copy()
include = str(sdk / "machines/octatrack/include")
environment["CPATH"] = os.pathsep.join(filter(None, (include, environment.get("CPATH"))))
args = []
for row in json.loads((here / "runtime.json").read_text())["contribute"]:
    args.extend(["--subscribe", "{to}:{data}:{order}".format(**row)])
subprocess.run([sys.executable, sdk / "runtime/loader/build.py",
                here / "machine.c", here / "mono.c", here / "fixture.c",
                *args, "-o", sys.argv[1]], check=True, env=environment)
