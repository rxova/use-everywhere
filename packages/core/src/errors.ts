/** The opened window closed before delivering a result. */
export class WindowClosedError extends Error {
  constructor(message = 'window closed before a result was delivered') {
    super(message);
    this.name = 'WindowClosedError';
  }
}

/** The ready/ready-ack handshake never completed. */
export class HandshakeTimeoutError extends Error {
  constructor(message = 'handshake with the other window timed out') {
    super(message);
    this.name = 'HandshakeTimeoutError';
  }
}
