// SPDX-License-Identifier: MIT
// Read-only CoreMIDI endpoint inventory. No MIDI client, port or message send.
import Foundation
import CoreMIDI
let count = MIDIGetNumberOfDestinations()
print("Sorties MIDI accessibles : \(count)")
for i in 0..<count {
    let endpoint = MIDIGetDestination(i)
    var value: Unmanaged<CFString>?
    if MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &value) == noErr,
       let name = value {
        print("- \(name.takeRetainedValue() as String)")
    }
}
if count == 0 {
    print("Aucune sortie visible ici : vérifier le branchement, le pilote et le Studio MIDI macOS.")
}
print("Diagnostic terminé. Aucun message MIDI envoyé, aucun firmware modifié.")
