"""Machine bases built from source (scripts/machine-base.py): what holds without firmware, a toolchain or a device."""
import hashlib
import importlib.util
import json
import pathlib
import re
import tempfile
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("machine_base", APP / "scripts/machine-base.py")
machine_base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(machine_base)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bases():
    for path in sorted((APP / "sdk/machines").glob("*/elekloader/base.json")):
        yield path.parts[-3], json.loads(path.read_text())


class MachineBases(unittest.TestCase):
    def test_rytm_base_is_core_ar2_0_7_source_unchanged(self):
        record = json.loads((APP / "sdk/imports/core-ar2-source-fb58292.json").read_text())
        for item in record["files"]:
            self.assertEqual(sha(APP / item["to"]), item["sha256"], item["to"])
        # The ten sources the release was built from, by its own build record.
        release = json.loads((APP / "vendor/elekloader/catalog/core-ar2-0.7.elemod").read_text())
        imported = {pathlib.Path(item["from"]).name: item["sha256"] for item in record["files"]}
        self.assertEqual({name: imported[name] for name in release["build"]["sources"]}, release["build"]["sources"])

    def test_bases_use_the_reviewed_toolchain(self):
        dockerfile = (APP / "sdk/build/Dockerfile").read_text()
        reviewed = {key: re.search(r"^ARG %s_VERSION=(\S+)$" % key.upper(), dockerfile, re.M).group(1) for key in ("gcc", "binutils")}
        for machine, config in bases():
            self.assertEqual(config["toolchain"]["cross"], "m68k-elf-", machine)
            self.assertEqual({key: config["toolchain"][key] for key in reviewed}, reviewed, machine)

    def test_bindings_name_what_they_were_built_from(self):
        for machine, config in bases():
            binding = json.loads((APP / "sdk/machines" / machine / "base-binding.json").read_text())
            self.assertRegex(binding["identity"], r"^[0-9a-f]{64}$")
            self.assertEqual(binding["built"]["toolchain"], config["toolchain"], machine)
            self.assertEqual(binding["built"]["stock"], machine_base.stock_sha(machine, config["os"]), machine)
            self.assertEqual(sha(APP / config["reference"]["file"]), config["reference"]["sha256"], machine)

    def test_staging_lays_out_every_source_and_header_mod_json_names(self):
        for machine, config in bases():
            with tempfile.TemporaryDirectory() as work:
                core = machine_base.stage(machine, config, pathlib.Path(work))
                mod = json.loads((core / "mod.json").read_text())
                for source in mod["sources"]:
                    self.assertTrue((core / source).is_file(), source)
                for header in (APP / config["include"]).rglob("*.h"):
                    self.assertTrue((core / header.relative_to(APP / config["include"])).is_file(), header.name)

    def test_compare_names_only_the_fields_that_differ(self):
        built = {"sites": [1], "exports": ["a"], "build": {"sources": {"x": "1"}}}
        reference = {"sites": [1], "exports": ["b"], "build": {"sources": {"x": "1"}}}
        self.assertEqual(machine_base.compare(built, reference, ["sites", "exports", "build"]), ["exports"])
        self.assertEqual(machine_base.compare(built, built, ["sites", "exports", "build"]), [])


if __name__ == "__main__":
    unittest.main()
