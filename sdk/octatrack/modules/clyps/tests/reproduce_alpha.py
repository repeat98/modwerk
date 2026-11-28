"""Run the late EOF on source exported from the immutable Hardware Alpha 1 commit."""
from pathlib import Path
import subprocess
import tarfile
import tempfile

root = Path(__file__).resolve().parents[4]
with tempfile.TemporaryDirectory() as tmp:
    export = Path(tmp) / "alpha.tar"
    with export.open("wb") as output:
        subprocess.run(["git", "archive", "7f3432005785619af213957c03062cd9968d3b6a",
                        "sdk/drafts/clyps", "sdk/runtime/loader"], cwd=root, stdout=output, check=True)
    with tarfile.open(export) as archive:
        archive.extractall(tmp, filter="data")
    sdk = Path(tmp) / "sdk"
    tests = sdk / "drafts/clyps/tests"
    probe = tests / "before.c"
    fixture = (tests / "performance_host.c").read_text().split("int main(void)")[0]
    probe.write_text(fixture + """
#include <stdio.h>
int main(void)
{
    tap(ARR); tap(ARR); tap(6); tap(ARR);
    for (unsigned i = 0; i < 3; ++i) tap(DOWN);
    tap(PAGE_KEY); tap(YES); tap(3);
    assert(defined == 8 && rows[3] == 6 && playing == 6);
    clyps_bank_load(2, 0); clyps_bank_loaded();
    assert(defined == 8 && rows[3] == 6);
    FILE *file = tmpfile(); assert(file);
    clyps_project_init(); clyps_bank_load(1, 0);
    assert(fgetc(file) == EOF && feof(file)); clyps_bank_loaded();
    printf("after late EOF: mask=%u R04=%u playing=%u\\n", defined, rows[3], playing);
    assert(defined == 0 && rows[3] == 6 && playing == 0);
    return fclose(file);
}
""")
    exe = Path(tmp) / "before"
    subprocess.run(["cc", "-I", sdk / "runtime/loader", probe, "-o", exe], check=True)
    subprocess.run([exe], check=True)
