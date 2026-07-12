---
'@use-everywhere/core': minor
---

Add a debug seam: observeBus(name, fn) reports every wire crossing a bus in both directions, enableDebug() logs them to the console, and getBusNames() lists the live buses. Outbound wires are the point — a post goes straight to the transport, so until now nothing a client said was observable from inside it. Also exports DEFAULT_NAME and the BusWire/BusEvent types.
