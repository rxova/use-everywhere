# @use-everywhere/core

## 0.3.0

### Minor Changes

- ad7f986: Add a debug seam: observeBus(name, fn) reports every wire crossing a bus in both directions, enableDebug() logs them to the console, and getBusNames() lists the live buses. Outbound wires are the point — a post goes straight to the transport, so until now nothing a client said was observable from inside it. Also exports DEFAULT_NAME and the BusWire/BusEvent types.
- 1ce8824: Add createLeader(name, options): opt-in leader election so exactly one tab owns the socket, the polling loop, or the token refresh. Lease-and-claim with a sticky incumbent — a new tab adopts the current leader instead of stealing the seat, a closing tab hands it over immediately, and a crashed one is replaced after the lease. Terms reuse the same newer() clock as the store, so crossing claims resolve deterministically. Leadership is advisory, not a distributed lock.
- 0bf735a: Add opt-in persistence. createSharedStore accepts a persist option; localStorageAdapter, sessionStorageAdapter, and webStorageAdapter store the state together with its version clocks, so a reopened tab re-enters the last-writer-wins race with its real term rather than a fresh zero. A restored value beats a staler live tab and loses to a newer one, and either way all tabs converge. Blocked storage, corrupt JSON, and a full quota degrade to a silent no-op. Stores also expose getVersions().
