// SPDX-License-Identifier: GPL-3.0-or-later
// The site's builder worker: the vendored kit's worker, with the devices Modwerk's builder carries added to the kit's
// device list (carried-devices.ts). The kit's worker reads no device until a call arrives, and this module's body runs
// before the first message, so every call sees the carried devices.
import '../../../vendor/elekloader/kit/src/kit/worker.ts'
import { carryDevices } from './carried-devices'

carryDevices()
