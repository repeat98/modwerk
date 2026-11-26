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
        record = json.loads((APP / "sdk/imports/core-dt2-source-0df8409.json").read_text())
        self.assertRegex(record["revision"], r"^[0-9a-f]{40}$")
        for item in record["files"]:
            self.assertEqual(sha(APP / item["to"]), item["sha256"], item["to"])
        # Every source mod.json builds, and its header, is in the record.
        imported = {item["to"] for item in record["files"]}
        folder = APP / "sdk/machines/digitakt-ii/elekloader/core-dt2"
        mod = json.loads((folder / "mod.json").read_text())
        for source in mod["sources"]:
            self.assertIn((folder / source).resolve().relative_to(APP).as_posix(), imported, source)
        self.assertIn("sdk/machines/digitakt-ii/include/digitakt-mk2/core.h", imported)

    def test_model_cycles_base_source_is_core_mc_0_3_unchanged(self):
        record = json.loads((APP / "sdk/imports/core-mc-source-f20ffda.json").read_text())
        self.assertRegex(record["revision"], r"^[0-9a-f]{40}$")
        for item in record["files"]:
            self.assertEqual(sha(APP / item["to"]), item["sha256"], item["to"])
        imported = {item["to"] for item in record["files"]}
        folder = APP / "sdk/machines/model-cycles/elekloader/core-mc"
        mod = json.loads((folder / "mod.json").read_text())
        for source in mod["sources"]:
            self.assertIn((folder / source).resolve().relative_to(APP).as_posix(), imported, source)
        self.assertIn("sdk/machines/model-cycles/include/model-cycles/core.h", imported)
        # The three sources the release was built from, by its own build record.
        release = json.loads((APP / "vendor/elekloader/catalog/core-mc-0.3.elemod").read_text())
        hashes = {pathlib.Path(item["from"]).name: item["sha256"] for item in record["files"]}
        self.assertEqual({name: hashes[name] for name in release["build"]["sources"]}, release["build"]["sources"])

    def test_model_cycles_hooks_are_the_sites_the_base_builds(self):
        # events.json is the registry: hooks 0-4 are core-mc's own sites, unchanged, and every later one is a site
        # base.json adds. Each hook's guard is the SHA-256 of the stock bytes its site replaces, and the base declares
        # its collection; the core contract lists the same hooks.
        events = json.loads((APP / "sdk/machines/model-cycles/events.json").read_text())["events"]
        mod = json.loads((APP / "sdk/machines/model-cycles/elekloader/core-mc/mod.json").read_text())
        add = json.loads((APP / "sdk/machines/model-cycles/elekloader/base.json").read_text())["add"]
        guards = {site["addr"]: (len(bytes.fromhex(site["stock"])), hashlib.sha256(bytes.fromhex(site["stock"])).hexdigest())
                  for site in mod["sites"]}
        added = {site["addr"]: (site["len"], site["stockSha256"]) for site in add["sites"]}
        self.assertEqual([event["index"] for event in events], list(range(len(events))))
        self.assertEqual([event["event"] for event in events[:5]], list(mod["collections"]))
        collections = dict(mod["collections"], **add["collections"])
        for event in events:
            site = guards if event["index"] < 5 else added
            self.assertIn(event["site"], site, event["event"])
            self.assertEqual((event["length"], event["guard"]), site[event["site"]], event["event"])
            self.assertIn(event["event"], collections)
            self.assertNotIn("room", event, "a call hook's table takes every subscriber")
        # A collection's number is the entry size in bytes (a handler's address), as in the release.
        self.assertEqual(set(collections.values()), {4})
        interface = json.loads((APP / "sdk/model-cycles/core-profile/interface.json").read_text())
        self.assertEqual([entry["name"] for entry in interface["events"]], [event["event"] for event in events])

    def test_model_cycles_diagnostics_log_is_the_octatrack_layout(self):
        """The site reads the Model:Cycles log with the Octatrack's parser, so its numbers and structs are the
        Octatrack's word for word (base/diag.h)."""
        def layout(path):
            text = path.read_text()
            parts = [re.search(r"#define %s .*" % name, text).group(0) for name in ("DIAG_MAGIC", "DIAG_VERSION", "DIAG_LOADS", "DIAG_INCIDENTS")]
            parts.append(re.search(r"enum diag_kind \{[^}]*\};", text).group(0))
            parts += [re.search(r"struct %s \{.*?\n\};" % name, text, re.S).group(0) for name in ("diag_load", "diag_incident", "diag_log")]
            return [re.sub(r"\s*/\*.*?\*/", "", part) for part in parts]
        cycles = layout(APP / "sdk/machines/model-cycles/elekloader/base/diag.h")
        self.assertEqual(cycles, layout(APP / "sdk/machines/octatrack/elekloader/diag.h"))

    def test_model_cycles_diagnostics_log_on_the_host(self):
        import shutil, subprocess
        cc = shutil.which("cc")
        if not cc:
            self.skipTest("no host C compiler")
        here = APP / "sdk/machines/model-cycles/elekloader/base"
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([cc, "-std=c99", "-Wall", "-Wextra", "-Werror", "-pedantic", "-DMODWERK_HOST", "-I", here,
                            here / "diag.c", here / "test_diag.c", "-o", temp + "/t"], check=True, capture_output=True)
            result = subprocess.run([temp + "/t"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_model_cycles_link_on_the_host(self):
        """A development base's link on the host: RAMBOOT keeps an accepted request's numbers for the copy, and a reply
        goes out whole under stock's USB lock, never while another sender's SysEx is open."""
        import shutil, subprocess
        cc = shutil.which("cc")
        if not cc:
            self.skipTest("no host C compiler")
        here = APP / "sdk/machines/model-cycles/elekloader/base"
        stock = ["-D%s=0" % name for name in ("UI_QUEUE_PTR_AT", "QUEUE_POST_AT", "KEY_INDEX_AT", "KEY_BITS_AT")]
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([cc, "-std=c99", "-Wall", "-Wextra", "-Werror", "-pedantic", "-DMODWERK_HOST",
                            "-DMODWERK_DEV", *stock, "-I", here, here / "link.c", here / "test_link.c", "-o",
                            temp + "/t"], check=True, capture_output=True)
            result = subprocess.run([temp + "/t"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_model_cycles_loader_transport_on_the_host(self):
        """mc_link.py's framing through modules.c's parts into the upload controller and the loader: a module goes on
        trial, and ten quiet seconds of UI ticks put the previous set back."""
        import importlib.util, shutil, struct, subprocess
        cc = shutil.which("cc")
        if not cc:
            self.skipTest("no host C compiler")
        spec = importlib.util.spec_from_file_location("mc_link", APP / "sdk/machines/model-cycles/tools/mc_link.py")
        mc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mc)
        here, loader, upload = (APP / "sdk/machines/model-cycles/elekloader/base", APP / "sdk/runtime/loader",
                                APP / "sdk/runtime/upload")
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([cc, "-std=c99", "-Wall", "-Wextra", "-Werror", "-DMODWERK_HOST", "-DRUNTIME_MODULES=16u",
                            "-DRUNTIME_POOL_BYTES=65536u", "-I", loader, "-I", upload, here / "test_modules.c",
                            here / "modules.c", here / "runtime.c", loader / "loader.c", upload / "upload.c",
                            upload / "wire.c", upload / "sha256.c", "-o", temp + "/t"], check=True, capture_output=True)
            unit = subprocess.Popen([temp + "/t"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

            def ask(line):
                unit.stdin.write(line + "\n")
                unit.stdin.flush()
                return unit.stdout.readline().strip()

            class Host(mc.Link):
                def __init__(self):
                    pass

                def call(self, cmd, body, timeout=5):
                    if cmd == mc.UP_PART:
                        return (0 if int(ask("P %d %s" % (mc.get32(body[:5]), bytes(body[5:]).hex()))) else 4), []
                    answer = ask("R %d" % mc.get32(body[:5]))
                    return (0, mc.pack(bytes.fromhex(answer))) if answer else (4, [])
            try:
                host = Host()
                r = host.frame("hello", 0, bytes(32))
                self.assertEqual(r["base"], hashlib.sha256(bytes.fromhex("12345678")).digest())
                session, t = r["session"], r["last"] + 1
                # ABI 4: a tick hook that returns at once, 4 bytes of image, a 3,000-byte tail of zero bss
                pkg = b"MWRM" + struct.pack(">HHIIIIII", 4, 0, 4, 3000, 0, 1, 0, 0x2CF24DBA) + struct.pack(">I", 0)
                pkg += bytes.fromhex("4e754e71")
                host.must("enter", 0, session)
                host.must("begin", t, session, r["base"] + hashlib.sha256(pkg).digest() + struct.pack(">II", r["generation"], len(pkg)))
                host.must("chunk", t, session, struct.pack(">I", 0) + pkg)
                self.assertEqual(host.must("verify", t, session)["received"], len(pkg))
                host.must("commit", t, session)
                self.assertEqual(mc.PHASES[host.must("leave", t, session)["phase"]], "trial")
                self.assertEqual(ask("T %d" % 299), "0")
                self.assertEqual(ask("T 1"), "1")              # the host fell quiet: the set goes back
                self.assertEqual(mc.PHASES[host.frame("hello", 0, bytes(32))["phase"]], "normal")
                # a frame of several parts with bytes over 0x7f arrives whole: the hash checks out, the loader refuses
                junk = bytes((i * 37 + (i >> 8)) & 0xFF for i in range(5000))
                r = host.frame("hello", 0, bytes(32))
                t = r["last"] + 1
                host.must("enter", 0, session)
                host.must("begin", t, session, r["base"] + hashlib.sha256(junk).digest() + struct.pack(">II", r["generation"], len(junk)))
                for at in range(0, len(junk), mc.CHUNK):
                    host.must("chunk", t, session, struct.pack(">I", at) + junk[at:at + mc.CHUNK])
                self.assertEqual(mc.RESULTS[host.frame("verify", t, session)["result"]], "rejected")
            finally:
                unit.stdin.close()
                unit.wait()

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

    def test_profiles_budget_the_bound_base_footprint(self):
        # The machine page shows machine.json's budgets; one of them is the bound package's .run plus .bss.
        for machine, config in bases():
            binding = binding_of(machine, config)
            if binding is None:
                continue
            footprint = binding["sections"][".run"] + binding["sections"][".bss"]
            budgets = json.loads((APP / "sdk/machines" / machine / "machine.json").read_text())["sdk"]["budgets"]
            self.assertIn(footprint, [budget["value"] for budget in budgets if budget["unit"] == "bytes"], machine)

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
            names = [name for name, _, _ in machine_base.variants(config)]
            binding = binding_of(machine, config)
            if "variants" in config and binding is not None:
                self.assertEqual(list(binding["variants"]), names, machine)
                self.assertEqual(binding["identity"], binding["variants"][names[0]], machine)
            for name, add, leave in machine_base.variants(config):
                with tempfile.TemporaryDirectory() as work:
                    core = machine_base.stage(machine, config, pathlib.Path(work), add=add, leave=leave)
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

    def test_digitakt_ii_kit_data_ends_where_the_project_archive_starts(self):
        # Core's kit data (KIT_PAD, KIT_ROOM) and the base's project archive (the last CHUNK_BYTES + 4 bytes of each
        # kit record) share each serialized kit record. Overlapping, core's save zeroed the archive: with a kit-data
        # module and an archive module together, the archive module's settings came back off after a power cycle.
        config = json.loads((APP / "sdk/machines/digitakt-ii/elekloader/base.json").read_text())
        with tempfile.TemporaryDirectory() as work:
            core = machine_base.stage("digitakt-ii", config, pathlib.Path(work))
            defsym = json.loads((core / "mod.json").read_text())["defsym"]
            store = (core / "store.c").read_text()
        archive = (APP / "sdk/machines/digitakt-ii/elekloader/modwerk/project-archive.c").read_text()
        constant = lambda name: int(re.search(r"\b%s = (0x[0-9a-fA-F]+|\d+)" % name, archive).group(1), 0)
        stride = int(defsym["FW_STARTUP_KIT_STRIDE"], 0)
        self.assertEqual(constant("KIT_RECORD_SIZE"), stride)
        self.assertEqual(constant("KIT_RECORDS"), int(defsym["FW_STARTUP_KITS_OFFSET"], 0))
        kit_end = int(defsym["KIT_PAD"], 0) + int(defsym["KIT_ROOM"], 0)
        archive_start = stride - (constant("CHUNK_BYTES") + 4)
        self.assertLessEqual(kit_end, archive_start, "core's kit data runs into the project archive")
        self.assertLessEqual(int(defsym["KIT_ROOM"], 0), int(re.search(r"#define ROOM_MAX (\d+)", store).group(1)))
        # The copy differs from the imported recipe in the kit-data room alone.
        imported = json.loads(imported_recipe("digitakt-ii", config).read_text())
        copied = json.loads((APP / "sdk/machines/digitakt-ii/elekloader/copies/core-dt2/mod.json").read_text())
        self.assertEqual(dict(copied, defsym=dict(copied["defsym"], KIT_ROOM=None)),
                         dict(imported, defsym=dict(imported["defsym"], KIT_ROOM=None)))

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

    def test_a_variant_leaves_out_of_add_what_its_patterns_name_and_keeps_the_rest_in_order(self):
        add = {"sources": ["a.c", "bus.c", "v.c"], "cflags": ["-DX=1"],
               "sites": [{"addr": "0x10", "target": "bus_gate"}, {"addr": "0x20", "op": "bytes"}, {"addr": "0x30", "target": "v_gate"}],
               "subscribe": [{"event": "ev_tick", "fn": "bus_tick"}, {"event": "ev_tick", "fn": "v_tick"}],
               "contribute": [{"to": "pages", "relocs": [[0, "abs32", "sym:bus_page", 0]]}, {"to": "params", "relocs": [[0, "abs32", "sym:v_params", 0]]}],
               "defsym": {"bus_resume": "0x40"}, "collections": {"bus_fx": 4, "v_list": 4},
               "storage": [{"sym": "bus_send", "scope": "sound", "bits": 7}, {"sym": "v_type", "scope": "sound", "bits": 3}]}
        self.assertEqual(machine_base.leave_out(add, ["bus.c", "bus_*", "0x20"]), {
            "sources": ["a.c", "v.c"], "cflags": ["-DX=1"], "sites": [{"addr": "0x30", "target": "v_gate"}],
            "subscribe": [{"event": "ev_tick", "fn": "v_tick"}], "contribute": [add["contribute"][1]],
            "collections": {"v_list": 4}, "storage": [add["storage"][1]]})
        with self.assertRaises(ValueError):
            machine_base.leave_out(add, ["bus_*", "no_such_*"])
        with self.assertRaises(ValueError):
            machine_base.variants({"variants": {"bad": {"add": False, "leave": ["bus_*"]}}})

    def test_the_rytm_voices_variant_stages_add_without_the_send_bus_or_its_lock_words(self):
        config = json.loads((APP / "sdk/machines/analog-rytm-mkii/elekloader/base.json").read_text())
        variants = {name: (add, leave) for name, add, leave in machine_base.variants(config)}
        staged = {}
        for name in ("send-bus", "voices"):
            with tempfile.TemporaryDirectory() as work:
                add, leave = variants[name]
                core = machine_base.stage("analog-rytm-mkii", config, pathlib.Path(work), add=add, leave=leave)
                staged[name] = json.loads((core / "mod.json").read_text())
        bus, voices = staged["send-bus"], staged["voices"]
        for source in ("../base/locks.c", "../base/locks.s", "../base/clock.c", "../base/sendbus.c", "../base/sendbus.s"):
            self.assertIn(source, bus["sources"])
            self.assertNotIn(source, voices["sources"])
        for source in ("../base/voice.c", "../base/voice.s"):
            self.assertIn(source, voices["sources"])
        names = json.dumps(voices)
        self.assertNotIn("mw_send_", names)
        # the FX track's lock words, which only the send bus writes: their three sites stay on send-bus with it
        targets = {name: [site["target"] for site in machine_base.parts(config, add=variants[name][0], leave=variants[name][1])["sites"] if "target" in site]
                   for name in ("send-bus", "voices")}
        self.assertEqual([t for t in targets["send-bus"] if t.startswith("core_lk_")],
                         ["core_lk_save_one", "core_lk_save_all", "core_lk_load"])
        self.assertEqual([t for t in targets["voices"] if t.startswith("core_lk_")], [])
        self.assertIn("mw_voice_applied_gate", targets["voices"])
        self.assertNotIn("mw_fx", voices["collections"])
        for name in ("mw_voices", "ev_sound_applied"):
            self.assertIn(name, voices["collections"])
        self.assertEqual([field["sym"] for field in voices["storage"]], ["mw_voice_type"])
        # what remains is send-bus's, in send-bus's order
        self.assertEqual([s for s in bus["sources"] if s in voices["sources"]], voices["sources"])
        self.assertEqual([s for s in bus["subscribe"] if s in voices["subscribe"]], voices["subscribe"])

    def test_shared_sources_are_staged_with_the_part_that_names_them(self):
        # sdk/runtime/ sources: common's and add's in every base that takes them (the Model:Cycles' release base
        # needs loader.c, upload.c, wire.c and sha256.c), dev's in development bases only
        checked = 0
        for machine, config in bases():
            for name, add, leave in machine_base.variants(config):
                for dev in ((False, True) if "dev" in config else (False,)):
                    staged = {"common": True, "add": add, "dev": dev}
                    shared = [(pathlib.Path(f).name, folder, staged[part]) for part in staged
                              for folder, files in config.get(part, {}).get("shared", {}).items() for f in files]
                    if not shared:
                        continue
                    with tempfile.TemporaryDirectory() as work:
                        core = machine_base.stage(machine, config, pathlib.Path(work), add=add, dev=dev, leave=leave)
                        self.assertNotIn("shared", json.loads((core / "mod.json").read_text()))
                        for file, folder, expected in shared:
                            self.assertEqual((pathlib.Path(work) / "mods" / folder / file).is_file(), expected,
                                             (machine, name, dev, file))
                            checked += expected
        self.assertGreater(checked, 0)

    def test_development_bases_stage_dev_on_every_variant_and_releases_never_carry_it(self):
        for machine, config in bases():
            if "dev" not in config:
                continue
            for name, add, leave in machine_base.variants(config):
                for dev in (False, True):
                    shared = {pathlib.Path(f).name for part in ("common", "add", "dev")
                              for files in config.get(part, {}).get("shared", {}).values() for f in files}
                    with tempfile.TemporaryDirectory() as work:
                        core = machine_base.stage(machine, config, pathlib.Path(work), add=add, dev=dev, leave=leave)
                        mod = json.loads((core / "mod.json").read_text())
                    for source in config["dev"]["sources"]:
                        (self.assertIn if dev else self.assertNotIn)(source, mod["sources"], (name, dev))
                        self.assertTrue(pathlib.Path(source).name in shared or
                                        (APP / "sdk/machines" / machine / "elekloader/base" / pathlib.Path(source).name).is_file())

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


    def test_carried_devices_match_their_machine_profile(self):
        # A device Modwerk's builder carries names the stock files its machine.json lists, by the same hash.
        carried = machine_base.carried_devices()
        self.assertIn("digitone-mk2", carried)
        for path in sorted((APP / "sdk/machines").glob("*/elekloader/device.json")):
            machine = path.parts[-3]
            facts = json.loads(path.read_text())["device"]
            profile = json.loads((APP / "sdk/machines" / machine / "machine.json").read_text())
            listed = {release["version"]: release["files"][0]["sha256"] for release in profile["firmware"]["releases"] if release["files"]}
            for release in facts["releases"]:
                self.assertEqual(listed.get(release["version"]), release["syx_sha256"], machine)

    def test_carry_device_registers_a_device_the_kit_lacks_once(self):
        class Kit:
            def __init__(self):
                self.known = []
            def devices(self):
                return self.known
            Release = staticmethod(lambda **kw: kw)
            class Device:
                def __init__(self, **kw):
                    self.__dict__.update(kw)
        kit = Kit()
        self.assertFalse(machine_base.carry_device(kit, "no-such-device"))
        self.assertTrue(machine_base.carry_device(kit, "digitone-mk2"))
        self.assertTrue(machine_base.carry_device(kit, "digitone-mk2"))
        self.assertEqual(len(kit.known), 1)
        device = kit.known[0]
        self.assertEqual((device.sysex_id, device.main_load, device.stage), (0x15, 0x40000400, 0x40400000))
        self.assertEqual(device.ddr, (0x47F00000, 0x47F40000))
        self.assertEqual(device.hmac_key_from, (2, b"Multiplier"))
        self.assertEqual(device.releases["1.12"]["main_len"], 3196288)

if __name__ == "__main__":
    unittest.main()
