# SPDX-License-Identifier: GPL-3.0-or-later
"""Modwerk's own firmware codec, for every Elektron machine: the section format of OS images (aplib.py packs it,
elz.py depacks it), the .syx wire format of OS updates (transport.py) and ColdFire instruction lengths (coldfire.py).

The Python builders and checks run the pinned Elekloader checkout (`vendor/elekloader/kit/kit.json`) for formats,
linking and patching. They put it on sys.path only through use_elekloader(), which first makes the checkout's codec
and instruction decoder resolve to these modules, so no build or check runs the checkout's own files for them:

    sys.path.insert(0, str(ROOT / 'sdk'))
    import firmware_codec
    firmware_codec.use_elekloader(upstream)
    from elekloader import formats          # formats, syx and elek pack, depack and frame with this package

The same names, functions and results as the modules they stand in for (sdk/tests/test_firmware_codec.py), so
every image, package and .syx stays byte for byte what it was. A recipe that pins the build's inputs names these
files, not the checkout's (inputs()).
"""
import hashlib
import importlib.abc
import importlib.util
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
# What this package serves in the checkout's place: the import name -> its module here.
SERVED = {
    'elekloader.codec.aplib': 'firmware_codec.aplib',
    'elekloader.codec.elz': 'firmware_codec.elz',
    'elekloader.codec.transport': 'firmware_codec.transport',
    'elekloader.isa.coldfire': 'firmware_codec.coldfire',
}
# Their packages: served too (empty), so no file of the checkout's codec/ and isa/ folders runs at all.
PACKAGES = ('elekloader.codec', 'elekloader.isa')
REPLACED = tuple(sorted({name.split('.')[1] for name in SERVED}))  # the checkout folders: codec, isa


class _Served(importlib.abc.Loader):
    """Hands the import system this package's already imported module under the checkout's name."""

    def __init__(self, module):
        self.module, self.own = module, module.__spec__

    def create_module(self, spec):
        return self.module

    def exec_module(self, module):
        # module_from_spec set the checkout's spec on it; it keeps its own, it is the same module object
        module.__spec__ = self.own


class _Package(importlib.abc.Loader):
    def create_module(self, spec):
        return None

    def exec_module(self, module):
        module.__path__ = []  # finds no file: its modules come only from _Finder
        module.__doc__ = 'Served by firmware_codec in place of the checkout\'s folder.'


class _Finder(importlib.abc.MetaPathFinder):
    """First on sys.meta_path: answers for SERVED and PACKAGES before any path finder looks in the checkout."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname in PACKAGES:
            return importlib.util.spec_from_loader(fullname, _Package(), is_package=True)
        if fullname in SERVED:
            module = importlib.import_module(SERVED[fullname])
            return importlib.util.spec_from_loader(fullname, _Served(module), origin=module.__spec__.origin)
        return None


def _ours(module):
    spec = getattr(module, '__spec__', None)
    return getattr(module, '__name__', '') in SERVED.values() or isinstance(spec and spec.loader, _Package)


def install_in_elekloader():
    """Make elekloader.codec.{aplib,elz,transport} and elekloader.isa.coldfire this package's modules.

    Idempotent. Refuses, rather than mix two codecs in one process, when a module of the checkout's codec/ or isa/
    was imported before this ran."""
    early = [name for name in (*PACKAGES, *SERVED) if name in sys.modules and not _ours(sys.modules[name])]
    if early:
        raise ImportError('Elekloader\'s %s was imported before firmware_codec.install_in_elekloader(): put the '
                          'checkout on sys.path with firmware_codec.use_elekloader().' % ', '.join(early))
    if not any(isinstance(finder, _Finder) for finder in sys.meta_path):
        sys.meta_path.insert(0, _Finder())
    if HERE.parent.as_posix() not in [Path(p).resolve().as_posix() for p in sys.path if p]:
        sys.path.append(str(HERE.parent))  # firmware_codec itself importable by name, for _Finder


def use_elekloader(checkout):
    """Put the pinned Elekloader checkout first on sys.path, with its codec and decoder served by this package.

    The only way Modwerk's Python puts the checkout on sys.path (sdk/tests/test_firmware_codec.py checks every
    script). `checkout` is used as given, after expanding ~."""
    install_in_elekloader()
    sys.path.insert(0, str(Path(checkout).expanduser()))


def elekloader_inputs(checkout):
    """The checkout's Python files a build that called use_elekloader() can run: all but its codec/ and isa/."""
    root = Path(checkout) / 'elekloader'
    return [path for path in root.rglob('*.py') if path.relative_to(root).parts[0] not in REPLACED]


def sources():
    """This package's files, which stand in for the checkout's codec/ and isa/ as a build's inputs."""
    return sorted(HERE.glob('*.py'))


def inputs(checkout):
    """{name: SHA-256} of the Python a build runs from the checkout and from this package: the checkout's files as
    'upstream/elekloader/...', this package's as 'sdk/firmware_codec/...'. Recipes that pin a build's inputs name these."""
    checkout = Path(checkout)
    found = {'upstream/' + path.relative_to(checkout).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
             for path in elekloader_inputs(checkout)}
    found.update({'sdk/firmware_codec/' + path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sources()})
    return found
