import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedRequest } from './request';

afterEach(() => vi.useRealTimers());
describe('bounded requests', () => {
  it('rejects a request that ignores abort', async () => {
    vi.useFakeTimers();
    const result = boundedRequest(() => new Promise(() => {}), 100, 'Zeit abgelaufen');
    const check = expect(result).rejects.toThrow('Zeit abgelaufen');
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a stuck request immediately and removes its timeout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = boundedRequest(() => new Promise(() => {}), 1000, 'Zeit abgelaufen', controller.signal);
    const check = expect(result).rejects.toThrow();
    controller.abort();
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });
});
