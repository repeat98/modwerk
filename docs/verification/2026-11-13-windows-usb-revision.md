# Windows and the base's USB revision, 13 November 2026

The owner's Octatrack MKII on the owner's Windows 11 PC, after #1502 merged (base `4e9a87ea…`, `bcdDevice` 0x0101;
the base before it, `57115f8d…`, reports stock's 0x0001). #1476 changed the revision so that Windows sets the vendor
interface up again on computers where it has no `DeviceInterfaceGUIDs`; this is the Windows test that pull request
still owed. Registry and device state were read with PowerShell; the unit was driven with `scripts/device.mjs`
through the USB bridge.

## What was done and seen

The value is `DeviceInterfaceGUIDs` under the interface's `Device Parameters` key
(`HKLM\SYSTEM\CurrentControlSet\Enum\USB\VID_1935&PID_0002&MI_01\<instance>`), `{4DEA1B9D-6B51-400A-93C9-5CFFC5DF8CF1}`
on a working computer. Deleting it needs an administrator.

1. Base `57115f8d` started from RAM: the interface's hardware ID read `…&REV_0001&MI_01`. The value was deleted.
2. The unit was power cycled, so the flashed base `4e9a87ea` arrived: the hardware ID read `…&REV_0101&MI_01`, the
   value was back, the interface was listed for its class and the bridge reached the unit. The interface's install
   date stayed 27 October 2026: Windows wrote the value without a new install.
3. Control, on `4e9a87ea`: the value was deleted again and only the cable was replugged. The value stayed missing,
   and the bridge could no longer open the unit (its program kept exiting; three status reads got no reply).
4. The value was restored from an export taken before step 1, the cable replugged: the bridge reached the unit again.

## What it shows

- A missing value breaks the connection, and a replug at the same revision does not bring it back.
- The unit arriving with another revision does, with nothing for the user to do.
- A computer in that state cannot take the new base over USB, since it cannot connect: its owner installs the new
  base from the card once, as the site's busy line says on Windows.

## Not shown

- The replug between steps 1 and 2 was skipped (the unit was power cycled instead), so the break was not observed
  under revision 0x0001; step 3 observed it under 0x0101.
- The break was made by hand, after one member's browser log. Whether the affected computers are wrong in this way
  and no other is confirmed only when an affected member installs the new base from the card and connects.
- What leaves the value out on those computers in the first place is still unknown.
- The browser was not part of this test: the site's own busy line was not looked at with the value missing.
