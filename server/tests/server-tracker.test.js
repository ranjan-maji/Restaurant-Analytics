import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerTracker } from '../src/server-tracker.js';

describe('server tracker', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('sends a server event and reports successful acceptance', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 1, rejected: 0, errors: [] }),
    });
    const tracker = createServerTracker({
      endpoint: 'http://localhost:4000/',
      apiKey: 'test-key',
      logger: { warn: vi.fn() },
    });

    const accepted = await tracker.track(
      'order_created',
      { order_id: 'ord-1' },
      { visitor_id: 'visitor-1', path: '/checkout' },
    );

    expect(accepted).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/collect',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }),
        signal: expect.any(AbortSignal),
      }),
    );
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body[0]).toMatchObject({
      name: 'order_created',
      source: 'server',
      visitor_id: 'visitor-1',
      path: '/checkout',
      properties: { order_id: 'ord-1' },
    });
  });

  it('reports a 202 response that rejected the event as a failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 0, rejected: 1, errors: ['invalid event'] }),
    });
    const logger = { warn: vi.fn() };
    const tracker = createServerTracker({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      logger,
    });

    await expect(tracker.track('order_created')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      '[server-tracker] event rejected by collector',
      ['invalid event'],
    );
  });
});
