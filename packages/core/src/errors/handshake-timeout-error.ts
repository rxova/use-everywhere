/** The ready/ready-ack handshake never completed. */
export class HandshakeTimeoutError extends Error {
  constructor(message = 'handshake with the other window timed out') {
    super(message);
    this.name = 'HandshakeTimeoutError';
  }
}
