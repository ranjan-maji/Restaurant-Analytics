import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

const fresh = () => createApp(createDb(':memory:'));

describe('POST /api/collect', () => {
  it('accepts a valid client event', async () => {
    const app = fresh();
    const res = await request(app).post('/api/collect').send([{
      name: 'page_view', timestamp: Date.now(), visitor_id: 'v1', path: '/',
    }]);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ accepted: 1, rejected: 0 });
  });

  it('rejects malformed events but keeps the valid ones', async () => {
    const app = fresh();
    const res = await request(app).post('/api/collect').send([
      { name: 'ok_event', timestamp: Date.now() },
      { name: '', timestamp: -1 },
    ]);
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toBe(1);
  });

  it('deduplicates on event id', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const ev = { id: 'abc', name: 'test', timestamp: Date.now() };
    await request(app).post('/api/collect').send([ev]);
    await request(app).post('/api/collect').send([ev]);
    expect(db.prepare('SELECT COUNT(*) AS c FROM events').get().c).toBe(1);
  });

  it('requires api key for server-source events', async () => {
    const app = fresh();
    const res = await request(app).post('/api/collect').send([{
      name: 'order_created', timestamp: Date.now(), source: 'server',
    }]);
    expect(res.body.accepted).toBe(0);
    expect(res.body.rejected).toBe(1);
  });

  it('accepts server-source events with the api key', async () => {
    const app = fresh();
    const res = await request(app)
      .post('/api/collect')
      .set('x-api-key', 'dev-api-key')
      .send([{ name: 'order_created', timestamp: Date.now(), source: 'server' }]);
    expect(res.body.accepted).toBe(1);
  });
});