/** The opened window closed before delivering a result. */
export class WindowClosedError extends Error {
  constructor(message = 'window closed before a result was delivered') {
    super(message);
    this.name = 'WindowClosedError';
  }
}
