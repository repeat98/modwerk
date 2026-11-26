#!/usr/bin/env python3
"""Build the isolated names-only emulator core, never selected by the site."""
import importlib.util
from pathlib import Path
import tempfile

HERE=Path(__file__).resolve().parent


def main():
    spec=importlib.util.spec_from_file_location('template_runtime_builder',HERE.parent/'build_runtime.py')
    builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
    with tempfile.TemporaryDirectory(prefix='midi-template-source-') as folder:
        staged=Path(folder)
        for path in HERE.parent.iterdir():
            if path.is_file() and path.name!='profile.c':(staged/path.name).symlink_to(path)
        source=(HERE/'profile.c').read_text().replace('#include "../profile.c"','#include "'+str(HERE.parent/'profile.c')+'"')
        (staged/'profile.c').write_text(source)
        builder.HERE=staged
        builder.main()


if __name__=='__main__':main()
