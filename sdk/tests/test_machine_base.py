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


def imported_recipe(machine, config):
    """The core's mod.json as imported: in the machine's own folder, or in the one its base names as source."""
    return APP / "sdk/machines" / config.get("source", machine) / "elekloader" / config["core"] / "mod.json"


def binding_of(machine, config):
    """The machine's base-binding.json, or None while its base.json says why it cannot be built yet."""
    path = APP / "sdk/machines" / machine / "base-binding.json"
    if not path.exists() and config.get("pending"):
        return None
    return json.loads(path.read_text())


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
            binding = binding_of(machine, config)
            self.assertEqual(sha(APP / config["reference"]["file"]), config["reference"]["sha256"], machine)
            if binding is None:
                continue
            self.assertRegex(binding["identity"], r"^[0-9a-f]{64}$")
            self.assertEqual(binding["built"]["toolchain"], config["toolchain"], machine)
            self.assertEqual(binding["built"]["stock"], machine_base.stock_sha(machine, config["os"]), machine)

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
            imported = imported_recipe(machine, config).read_bytes()
            with tempfile.TemporaryDirectory() as work:
                core = machine_base.stage(machine, config, pathlib.Path(work))
                mod = json.loads((core / "mod.json").read_text())
                for source in config.get("add", {}).get("sources", []) + config.get("recipe", {}).get("sources", []):
                    self.assertIn(source, mod["sources"])
            self.assertEqual(imported_recipe(machine, config).read_bytes(), imported)

    def test_variants_stage_with_or_without_add_and_bindings_record_each(self):
        for machine, config in bases():
            names = [name for name, _ in machine_base.variants(config)]
            binding = binding_of(machine, config)
            if "variants" in config and binding is not None:
                self.assertEqual(list(binding["variants"]), names, machine)
                self.assertEqual(binding["identity"], binding["variants"][names[0]], machine)
            for name, add in machine_base.variants(config):
                with tempfile.TemporaryDirectory() as work:
                    core = machine_base.stage(machine, config, pathlib.Path(work), add=add)
                    staged = (core / "mod.json").read_bytes()
                imported = imported_recipe(machine, config).read_bytes()
                if "recipe" in config:
                    mod = json.loads(staged)
                    self.assertEqual(mod["device"], config["recipe"]["device"], name)
                    self.assertEqual(mod["defsym"], config["recipe"]["defsym"], name)
                elif add:
                    self.assertNotEqual(staged, imported, name)
                elif config.get("common"):
                    # common alone: the imported recipe with common's parts, and none of add's
                    mod = json.loads(staged)
                    for source in config["common"].get("sources", []):
                        self.assertIn(source, mod["sources"], name)
                    for source in config.get("add", {}).get("sources", []):
                        self.assertNotIn(source, mod["sources"], name)
                else:
                    self.assertEqual(staged, imported, name)

    def test_every_added_site_is_guarded_by_a_hash_not_stock_bytes(self):
        for machine, config in bases():
            sites = [site for part in ("common", "add", "dev") for site in config.get(part, {}).get("sites", [])]
            for site in sites + config.get("recipe", {}).get("sites", []):
                self.assertNotIn("stock", site, site["addr"])
                self.assertRegex(site["stockSha256"], r"^[0-9a-f]{64}$")
                if site["op"] == "bytes":
                    self.assertEqual(len(site["new"]), 2 * site["len"], site["addr"])
                else:
                    self.assertTrue(site["len"] >= 6 and site["len"] % 2 == 0, site["addr"])

    def test_copies_name_an_unchanged_original_and_refuse_a_changed_one(self):
        for machine, config in bases():
            source = APP / "sdk/machines" / config.get("source", machine) / "elekloader"
            for copy in config.get("copies", []):
                self.assertEqual(sha(source / copy["from"]), copy["sha256"], copy["path"])
                self.assertTrue((APP / "sdk/machines" / machine / "elekloader/copies" / copy["path"]).is_file(), copy["path"])
            if config.get("copies"):
                stale = dict(config, copies=[dict(config["copies"][0], sha256="0" * 64)])
                with tempfile.TemporaryDirectory() as work, self.assertRaisesRegex(ValueError, "redo the copy"):
                    machine_base.stage(machine, stale, pathlib.Path(work))

    def test_retarget_replaces_the_recipe_and_refuses_anything_else(self):
        mod = {"device": "a", "defsym": {"X": "1"}, "sites": [{"a": 1}], "sources": ["a.s"]}
        out = machine_base.retarget(dict(mod), {"device": "b", "defsym": {"Y": "2"}, "sites": [], "sources": ["b.s"]}, [{"b": 2}])
        self.assertEqual(out, {"device": "b", "defsym": {"Y": "2"}, "sites": [{"b": 2}], "sources": ["a.s", "b.s"]})
        with self.assertRaises(ValueError):
            machine_base.retarget(dict(mod), {"exports": []}, [])

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

    def test_parts_put_common_before_add_and_refuse_a_name_in_both(self):
        config = {"common": {"sources": ["c.c"], "collections": {"t": 4}}, "add": {"sources": ["a.c"], "collections": {"u": 4}}}
        self.assertEqual(machine_base.parts(config), {"sources": ["c.c", "a.c"], "collections": {"t": 4, "u": 4}})
        self.assertEqual(machine_base.parts(config, add=False), {"sources": ["c.c"], "collections": {"t": 4}})
        self.assertEqual(machine_base.parts({"add": {"sources": ["a.c"]}}, add=False), {})
        with self.assertRaises(ValueError):
            machine_base.parts({"common": {"collections": {"t": 4}}, "add": {"collections": {"t": 4}}})

    def test_parts_put_dev_last_and_only_for_a_development_base(self):
        config = {"common": {"sources": ["c.c"]}, "add": {"sources": ["a.c"]},
                  "dev": {"about": "text", "sources": ["d.c"], "defsym": {"D": "1"}}}
        self.assertEqual(machine_base.parts(config), {"sources": ["c.c", "a.c"]})
        self.assertEqual(machine_base.parts(config, dev=True), {"sources": ["c.c", "a.c", "d.c"], "defsym": {"D": "1"}})
        self.assertEqual(machine_base.parts(config, add=False, dev=True), {"sources": ["c.c", "d.c"], "defsym": {"D": "1"}})
        with self.assertRaises(ValueError):
            machine_base.parts({"add": {"defsym": {"D": "1"}}, "dev": {"defsym": {"D": "1"}}}, dev=True)

    def test_development_bases_stage_dev_on_every_variant_and_releases_never_carry_it(self):
        for machine, config in bases():
            if "dev" not in config:
                continue
            for name, add in machine_base.variants(config):
                for dev in (False, True):
                    with tempfile.TemporaryDirectory() as work:
                        core = machine_base.stage(machine, config, pathlib.Path(work), add=add, dev=dev)
                        mod = json.loads((core / "mod.json").read_text())
                    for source in config["dev"]["sources"]:
                        (self.assertIn if dev else self.assertNotIn)(source, mod["sources"], (name, dev))
                        self.assertTrue((APP / "sdk/machines" / machine / "elekloader/base" / pathlib.Path(source).name).is_file())

    def test_dev_sites_take_no_bytes_a_release_site_or_the_core_takes(self):
        for machine, config in bases():
            spans = lambda part: [(int(s["addr"], 16), int(s["addr"], 16) + s["len"], s["addr"])
                                  for s in config.get(part, {}).get("sites", [])]
            core = json.loads(imported_recipe(machine, config).read_text()).get("sites", [])
            release = spans("common") + spans("add") + spans("recipe") + [
                (int(s["addr"], 16), int(s["addr"], 16) + len(s["stock"]) // 2, s["addr"]) for s in core]
            for start, end, addr in spans("dev"):
                for other_start, other_end, other in release:
                    self.assertFalse(start < other_end and other_start < end, (machine, addr, other))

    def test_dev_cflags_that_repeat_a_release_define_give_it_the_same_value(self):
        for machine, config in bases():
            defined = lambda part: dict(f[2:].split("=", 1) for f in config.get(part, {}).get("cflags", [])
                                        if f.startswith("-D") and "=" in f)
            release = dict(defined("common"), **defined("add"))
            for name, value in defined("dev").items():
                if name in release:
                    self.assertEqual(value, release[name], (machine, name))

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
