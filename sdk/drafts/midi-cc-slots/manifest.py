"""Local draft; standalone card candidate is separate from the USB listing.

The original runtime adapter is compiled by build_runtime.py. Presentation
and local catalogue metadata live in local-module.json. The private card builder
does not register a public card recipe. Local card installation uses the standard
USB base plus saved sets; build_resident.py remains the historical C15 adapter.
"""

MODULE_ID = 'midi-cc-slots'
VERSION = '0.0.20-experimental'
USB_TRIAL_VERSION = '0.0.20-experimental'
LEGACY_USB_TRIAL_VERSION = '0.0.13-experimental'
RUNTIME_BUILDER = 'build_runtime.py'
CARD_BUILDER = 'build_usb_installer.mjs'
STANDALONE_CARD_BUILDER = 'build_card.py'
LOCAL_COMBINED_CARD_BUILDER = 'build_resident.py'
STANDALONE_CARD_SUPPORTED = True
LOCAL_COMBINED_CARD_SUPPORTED = True
NATIVE_CARD_SUPPORTED = False

USB_CARD_INSTALLER_BUILDER = 'build_usb_installer.mjs'

# The upstream event experiment is separate from historical local-site pins.
SHARED_BANK_BUILD = 'shared-bank-build.json'
