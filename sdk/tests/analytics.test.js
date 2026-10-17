import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Analytics } from '../src/analytics.js';

describe('Analytics', () => {
  afterEach(() => {
    if (Object.hasOwn(navigator, 'sendBeacon')) delete navigator.sendBeacon;
  });

  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 1, rejected: 0, errors: [] }),
    });
  });

  it('initializes and tracks a page view automatically', () => {
    const a = new Analytics();
    a.init({ endpoint: 'http://x', trackPageViews: true });
    expect(a.queue.some((e) => e.name === 'page_view')).toBe(true);
  });

  it('batches and flushes queued events', async () => {
    const a = new Analytics();
    a.init({ endpoint: 'http://x', flushIntervalMs: 60_000 });
    a.queue.length = 0;
    a.track('add_to_cart', { item: 'pizza' });
    a.track('add_to_cart', { item: 'pasta' });
    await a.flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sent).toHaveLength(2);
    expect(sent[0].visitor_id).toBeTruthy();
    expect(sent[0].session_id).toBeTruthy();
    expect(a.queue).toHaveLength(0);
  });

  it('requeues on failure and retries on the next flush', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: 1, rejected: 0, errors: [] }),
      });
    const a = new Analytics();
    a.init({ endpoint: 'http://x', flushIntervalMs: 60_000 });
    a.queue.length = 0;
    a.track('order_placed', {});
    await a.flush();
    expect(a.queue.length).toBe(1);
    await a.flush();
    expect(a.queue.length).toBe(0);
  });

  it('reports events rejected by the collector without retrying them', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 0, rejected: 1, errors: ['invalid name'] }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = new Analytics();
    a.init({ endpoint: 'http://x', flushIntervalMs: 60_000 });
    a.queue.length = 0;
    a.track('invalid event name', {});
    await a.flush();
    expect(a.queue).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith('[analytics] events rejected by collector', ['invalid name']);
  });

  it('falls back to fetch when sendBeacon cannot queue events', async () => {
    const a = new Analytics();
    a.init({ endpoint: 'http://x', flushIntervalMs: 60_000 });
    a.queue.length = 0;
    a.track('add_to_cart', { item: 'pizza' });
    await Promise.resolve();
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    a._beaconFlush();
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(a.queue).toHaveLength(0));
  });

  it('removes events from the queue when sendBeacon accepts them', () => {
    const a = new Analytics();
    a.init({ endpoint: 'http://x', flushIntervalMs: 60_000 });
    a.queue.length = 0;
    a.track('add_to_cart', { item: 'pizza' });
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    a._beaconFlush();
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect(a.queue).toHaveLength(0);
  });

  it('persists identified user for subsequent events', async () => {
    const a = new Analytics();
    a.init({ endpoint: 'http://x', flushIntervalMs: 60_000 });
    a.queue.length = 0;
    a.identify('user-42');
    a.track('purchase', {});
    await a.flush();
    const sent = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sent[0].user_id).toBe('user-42');
  });
});