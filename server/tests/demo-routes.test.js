import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { addDemoRoutes } from '../src/demo-routes.js';

describe('demo order route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an INR order and tracks its currency in the server event', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 1, rejected: 0, errors: [] }),
    });
    vi.stubGlobal('fetch', fetch);
    const app = createApp(createDb(':memory:'));
    addDemoRoutes(app, { publicEndpoint: 'http://analytics.test' });

    const response = await request(app).post('/api/demo/order').send({
      items: [{ id: 'margherita', name: 'Margherita Pizza', price: 349 }],
      total: 349,
      currency: 'INR',
      visitor_id: 'visitor-1',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 349, currency: 'INR' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const event = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(event.properties).toMatchObject({ total: 349, currency: 'INR' });
  });
});
