# Diagnosing an unconfirmed USB write

The browser can throw during an Octatrack USB OUT transfer even if the instrument received the frame. The site reads the device's result before deciding what to do. If the matching sequence is pending or ready, the transfer can continue. If receipt is uncertain, the session stops.

On the previous site, a thrown browser error followed by an unconfirmed result reached the diagnostics collector as a generic vendor transport error. A read of the USB counters can show a device refusal or a bus reset, but it cannot recover the browser error type after the transport discards it.

The scripted USB device in `upload-usb.test.ts` reproduces both outcomes of a thrown write. The sync tests in `octatrack-link.test.ts` check that a browser error reaches the existing diagnostic category and that a device refusal keeps its own category. Only the error type goes into the report. These tests establish how to interpret future reports. The cause of earlier Windows staging failures remains open.
