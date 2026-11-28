# SPDX-License-Identifier: GPL-3.0-or-later
"""Modwerk's own firmware codec, for every Elektron machine: the section format of OS images (aplib.py packs it,
elz.py depacks it), the .syx wire format of OS updates (transport.py) and ColdFire instruction lengths (coldfire.py).

The Python builders and checks run Modwerk's firmware builder (sdk/firmware_builder: formats, linking, patching and
the SDK's build) under the package name their imports use. use_elekloader() serves that name from
sdk/firmware_builder, whose codec and instruction decoder are these modules:

    sys.path.insert(0, str(ROOT / 'sdk'))
    import firmware_codec
    firmware_codec.use_elekloader(upstream)   # `upstream` is no longer read
    from elekloader import formats          # sdk/firmware_builder/formats.py

A recipe that pins the build's inputs names the builder's and this package's files (inputs()).
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


BUILDER = HERE.parent / 'firmware_builder'
NAME = 'elekloader'  # the package name the tools import the builder by


class _Builder(importlib.abc.MetaPathFinder):
    """Answers NAME and NAME.* with sdk/firmware_builder's module of the same path: the same module objects."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname != NAME and not fullname.startswith(NAME + '.'):
            return None
        module = importlib.import_module('firmware_builder' + fullname[len(NAME):])
        spec = importlib.util.spec_from_loader(fullname, _Served(module), origin=module.__spec__.origin,
                                               is_package=hasattr(module, '__path__'))
        return spec


def use_elekloader(checkout=None):
    """Make the builder's package name resolve to sdk/firmware_builder. Idempotent; `checkout` is not read."""
    if HERE.parent.as_posix() not in [Path(p).resolve().as_posix() for p in sys.path if p]:
        sys.path.append(str(HERE.parent))
    if not any(isinstance(finder, _Builder) for finder in sys.meta_path):
        sys.meta_path.insert(0, _Builder())


def use_reference_checkout(checkout):
    """Tests only: the reference checkout on sys.path, with its codec and decoder served by this package, to compare
    sdk/firmware_builder against while it exists (sdk/tests/test_own_builder_*.py). No tool calls this."""
    install_in_elekloader()
    sys.path.insert(0, str(Path(checkout).expanduser()))


def builder_inputs():
    """The builder's Python files a build runs."""
    return sorted(BUILDER.rglob('*.py'))


def sources():
    """This package's files, which stand in for the checkout's codec/ and isa/ as a build's inputs."""
    return sorted(HERE.glob('*.py'))


def inputs(checkout=None):
    """{name: SHA-256} of the Python a build runs: the builder's files as 'sdk/firmware_builder/...', this package's as
    'sdk/firmware_codec/...'. Recipes that pin a build's inputs name these. `checkout` is not read."""
    found = {'sdk/firmware_builder/' + path.relative_to(BUILDER).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
             for path in builder_inputs()}
    found.update({'sdk/firmware_codec/' + path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sources()})
    return found
