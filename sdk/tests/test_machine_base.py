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

    def test_digitakt_ii_base_source_is_core_dt2_1_1_unchanged(self):
        record = json.loads((APP / "sdk/imports/core-dt2-source-3d7c2e3.json").read_text())
        self.assertRegex(record["revision"], r"^[0-9a-f]{40}$")
        for item in record["files"]:
            self.assertEqual(sha(APP / item["to"]), item["sha256"], item["to"])
        # Every source mod.json builds, and its header, is in the record.
        imported = {item["to"] for item in record["files"]}
        folder = APP / "sdk/machines/digitakt-ii/elekloader/core-dt2"
        mod = json.loads((folder / "mod.json").read_text())
        for source in mod["sources"]:
            self.assertIn((folder / source).resolve().relative_to(APP).as_posix(), imported, source)
        self.assertIn("sdk/machines/digitakt-ii/include/mk2/core.h", imported)

    def test_digitakt_ii_proposed_hooks_name_the_sites_the_source_patches(self):
        interface = json.loads((APP / "sdk/digitakt-ii/core-profile/interface.json").read_text())
        mod = json.loads((APP / "sdk/machines/digitakt-ii/elekloader/core-dt2/mod.json").read_text())
        stock = {site["addr"]: bytes.fromhex(site["stock"]) for site in mod["sites"]}
        proposed = [entry for key in ("events", "tables") for entry in interface[key] if entry.get("since")]
        self.assertTrue(proposed)
        for entry in proposed:
            for site in [entry["site"]] if "site" in entry else entry.get("sites", []):
                self.assertIn(site["address"], stock, entry["name"])
                self.assertEqual(site["sha256"], hashlib.sha256(stock[site["address"]]).hexdigest(), entry["name"])
                self.assertIn(site["os"], mod["os"], entry["name"])
        for name in ("ev_frame_params", "ev_key_leds", "core_projdata", "core_kitdata"):
            self.assertIn(name, mod["collections"])
            self.assertIn(name, {entry["name"] for entry in proposed})

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

    def test_staging_adds_modwerk_sources_and_leaves_the_imported_recipe_exact(self):
        for machine, config in bases():
            imported = (APP / "sdk/machines" / machine / "elekloader" / config["core"] / "mod.json").read_bytes()
            with tempfile.TemporaryDirectory() as work:
                core = machine_base.stage(machine, config, pathlib.Path(work))
                mod = json.loads((core / "mod.json").read_text())
                for source in config.get("add", {}).get("sources", []):
                    self.assertIn(source, mod["sources"])
            self.assertEqual((APP / "sdk/machines" / machine / "elekloader" / config["core"] / "mod.json").read_bytes(), imported)

    def test_variants_stage_with_or_without_add_and_bindings_record_each(self):
        for machine, config in bases():
            names = [name for name, _ in machine_base.variants(config)]
            binding = json.loads((APP / "sdk/machines" / machine / "base-binding.json").read_text())
            if "variants" in config:
                self.assertEqual(list(binding["variants"]), names, machine)
                self.assertEqual(binding["identity"], binding["variants"][names[0]], machine)
            for name, add in machine_base.variants(config):
                with tempfile.TemporaryDirectory() as work:
                    core = machine_base.stage(machine, config, pathlib.Path(work), add=add)
                    staged = (core / "mod.json").read_bytes()
                imported = (APP / "sdk/machines" / machine / "elekloader" / config["core"] / "mod.json").read_bytes()
                if add:
                    self.assertNotEqual(staged, imported, name)
                else:
                    self.assertEqual(staged, imported, name)

    def test_every_added_site_is_guarded_by_a_hash_not_stock_bytes(self):
        for machine, config in bases():
            for site in config.get("add", {}).get("sites", []):
                self.assertNotIn("stock", site, site["addr"])
                self.assertRegex(site["stockSha256"], r"^[0-9a-f]{64}$")
                if site.get("kind") == "data":
                    self.assertEqual(len(site["new"]), 2 * site["len"], site["addr"])
                else:
                    self.assertTrue(site["len"] >= 6 and site["len"] % 2 == 0, site["addr"])

    def test_merge_extends_lists_and_refuses_a_redefined_name(self):
        mod = {"sources": ["a.s"], "defsym": {"X": "1"}}
        merged = machine_base.merge(dict(mod), {"sources": ["../base/b.c"], "cflags": ["-DY_AT=0x1"], "defsym": {"Y": "2"},
                                                "sites": [{"a": 1}]}, [{"b": 2}])
        self.assertEqual(merged["sources"], ["a.s", "../base/b.c"])
        self.assertEqual(merged["cflags"], ["-DY_AT=0x1"])
        self.assertEqual(merged["defsym"], {"X": "1", "Y": "2"})
        self.assertEqual(merged["sites"], [{"b": 2}])
        with self.assertRaises(ValueError):
            machine_base.merge(dict(mod), {"defsym": {"X": "3"}}, [])
        with self.assertRaises(ValueError):
            machine_base.merge(dict(mod), {"description": "no"}, [])

    def test_keeps_wants_every_item_of_the_release_and_allows_additions(self):
        reference = {"id": "core", "sites": [1, 2], "build": {"sources": {"x": "1"}}}
        built = {"id": "core", "sites": [1, 2, 3], "build": {"sources": {"x": "1", "y": "2"}}}
        self.assertEqual(machine_base.keeps(built, reference, ["id", "sites", "build"]), [])
        self.assertEqual(machine_base.keeps({"id": "core", "sites": [1], "build": {"sources": {"x": "9"}}}, reference,
                                            ["id", "sites", "build"]), ["sites", "build"])

    def test_rytm_send_effect_ids_are_unique_and_in_range(self):
        ids = json.loads((APP / "sdk/machines/analog-rytm-mkii/fx-ids.json").read_text())["ids"]
        self.assertTrue(all(1 <= int(n) <= 63 for n in ids), ids)
        self.assertEqual(len(set(ids.values())), len(ids), ids)


if __name__ == "__main__":
    unittest.main()
