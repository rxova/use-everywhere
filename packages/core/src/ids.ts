export function newClientId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function newMsgId(): string {
  return Math.random().toString(36).slice(2, 10);
}
