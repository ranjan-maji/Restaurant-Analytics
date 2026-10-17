import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

async function seed(app) {
  const now = Date.now();
  const events = [
    { name: 'page_view', timestamp: now - 1000, visitor_id: 'v1', session_id: 's1', path: '/' },
    { name: 'page_view', timestamp: now - 2000, visitor_id: 'v2', path: '/menu' },
    { name: 'page_view', timestamp: now - 3000, visitor_id: 'v3', path: '/' },
    { name: 'add_to_cart', timestamp: now - 4000, visitor_id: 'v1', session_id: 's2', path: '/item/margherita' },
    { name: 'order_created', timestamp: now, visitor_id: 'v1', session_id: 's2', source: 'server', properties: { total: 349, currency: 'INR' } },
  ];
  await request(app).post('/api/collect').set('x-api-key', 'dev-api-key').send(events);
}

describe('stats endpoints', () => {
  it('overview returns correct aggregates', async () => {
    const app = createApp(createDb(':memory:'));
    await seed(app);
    const res = await request(app).get('/api/stats/overview').query({ from: 0, to: Date.now() + 10_000 });
    expect(res.body).toEqual({
      total_events: 5,
      unique_visitors: 3,
      page_views: 3,
      orders: 1,
      revenue: 349,
      average_order_value: 349,
      returning_visitors: 1,
    });
  });

  it('top pages groups by path', async () => {
    const app = createApp(createDb(':memory:'));
    await seed(app);
    const res = await request(app).get('/api/stats/pages').query({ from: 0, to: Date.now() + 10_000 });
    expect(res.body[0]).toEqual({ path: '/', views: 2, visitors: 2 });
  });

  it('date range filters out events', async () => {
    const app = createApp(createDb(':memory:'));
    await seed(app);
    const res = await request(app).get('/api/stats/overview').query({ from: 0, to: 1 });
    expect(res.body.total_events).toBe(0);
    expect(res.body.revenue).toBe(0);
    expect(res.body.average_order_value).toBe(0);
    expect(res.body.returning_visitors).toBe(0);
  });

  it('timeseries buckets events', async () => {
    const app = createApp(createDb(':memory:'));
    await seed(app);
    const res = await request(app).get('/api/stats/timeseries')
      .query({ from: 0, to: Date.now() + 10_000, interval: 'hour' });
    const total = res.body.reduce((s, r) => s + r.events, 0);
    expect(total).toBe(5);
  });

  it('paginates recent events and returns filtered totals', async () => {
    const app = createApp(createDb(':memory:'));
    await seed(app);
    const params = { from: 0, to: Date.now() + 10_000, limit: 2, offset: 1 };
    const page = await request(app).get('/api/stats/recent-page').query(params);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.items[0].timestamp).toBeGreaterThanOrEqual(page.body.items[1].timestamp);

    const filtered = await request(app).get('/api/stats/recent-page').query({
      ...params, search: 'page_view', source: 'client', limit: 10, offset: 0,
    });
    expect(filtered.body.total).toBe(3);
    expect(filtered.body.items).toHaveLength(3);
    expect(filtered.body.items.every((event) => event.name === 'page_view' && event.source === 'client')).toBe(true);
  });

  it('validates recent event pagination and filters', async () => {
    const app = createApp(createDb(':memory:'));
    const limit = await request(app).get('/api/stats/recent-page').query({ limit: 101 });
    expect(limit.status).toBe(400);
    const offset = await request(app).get('/api/stats/recent-page').query({ offset: -1 });
    expect(offset.status).toBe(400);
    const source = await request(app).get('/api/stats/recent-page').query({ source: 'unknown' });
    expect(source.status).toBe(400);
  });

  it('rejects inverted ranges', async () => {
    const app = createApp(createDb(':memory:'));
    const res = await request(app).get('/api/stats/overview').query({ from: 1000, to: 500 });
    expect(res.status).toBe(400);
  });
});