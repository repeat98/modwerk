// SPDX-License-Identifier: GPL-3.0-or-later
// The site's builder worker, with the machines carried-devices.ts adds. The worker reads no machine until a call
// arrives, and this module's body runs before the first message, so every call sees them.
import '../elektron/builder-worker.ts'
import { carryDevices } from './carried-devices'

carryDevices()
