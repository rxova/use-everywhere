import { describe, expect, it } from 'vitest';
import { newer } from '../clock.js';

describe('newer', () => {
  it('anything beats undefined', () => {
    expect(newer([0, 'a'], undefined)).toBe(true);
  });

  it('higher counter wins', () => {
    expect(newer([2, 'a'], [1, 'z'])).toBe(true);
    expect(newer([1, 'z'], [2, 'a'])).toBe(false);
  });

  it('equal counters break ties by clientId', () => {
    expect(newer([1, 'b'], [1, 'a'])).toBe(true);
    expect(newer([1, 'a'], [1, 'b'])).toBe(false);
  });

  it('identical versions are not newer', () => {
    expect(newer([1, 'a'], [1, 'a'])).toBe(false);
  });
});
