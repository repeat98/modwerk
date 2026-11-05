"""Read asserted stock spans from the user's local image during a build.

Run the module registry from the octabam checkout after its recon step.
No stock data is retained in this module or emitted in diagnostics.
"""

from functools import lru_cache
from pathlib import Path


BASE = 0x40000400
SECTION = Path("out/raw/section_3_MAIN_OS.bin")


@lru_cache(maxsize=1)
def _stock_image():
    try:
        return SECTION.read_bytes()
    except FileNotFoundError:
        raise RuntimeError(
            "stock_guard requires the local MAIN OS section; run the build's recon step first"
        ) from None


def stock_guard(site, length):
    """Return the local image's span; reject absent or out-of-range input."""
    if type(site) is not int or type(length) is not int or length <= 0:
        raise ValueError("stock_guard requires an integer address and positive length")
    image = _stock_image()
    offset = site - BASE
    if offset < 0 or offset + length > len(image):
        raise ValueError(f"stock_guard span outside the MAIN OS section at {site:#010x}")
    return image[offset:offset + length]
