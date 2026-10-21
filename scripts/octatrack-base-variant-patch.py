#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The line patch that turns the committed base package into one USB Audio layout's: [line, removed, added lines]
hunks against the default package, in order (src/engine/elekloader/base-variants.ts applies them and checks the
result's SHA-256). Usage: octatrack-base-variant-patch.py DEFAULT.elemod VARIANT.elemod > patch.json"""
import difflib
import json
import sys

old, new = (open(path, encoding='utf-8').read().split('\n') for path in sys.argv[1:3])
hunks = [[i1, i2 - i1, new[j1:j2]] for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes()
         if tag != 'equal']
json.dump(hunks, sys.stdout, separators=(',', ':'))
