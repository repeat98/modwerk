# SPDX-License-Identifier: GPL-3.0-or-later
"""firmware_codec.coldfire, the very same module object, under this package's name."""
import os
import sys

try:
    from firmware_codec import coldfire as _module
except ImportError:  # imported under another top-level name: firmware_codec sits beside this package in sdk/
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from firmware_codec import coldfire as _module

sys.modules[__name__] = _module
