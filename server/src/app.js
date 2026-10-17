import express from 'express';
import cors from 'cors';
import { validateEvent } from './validate.js';
import { hashIp, createIngest } from './ingest.js';
import { createStats } from './stats.js';

const API_KEY = process.env.API_KEY || 'dev-api-key';
const IP_SALT = process.env.IP_SALT || 'dev-salt';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'http://localhost:5173,http://localhost:5174').split(',');

function rateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip) ?? { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    if (++entry.count > max) { hits.set(req.ip, entry); return res.status(429).json({ error: 'rate limited' }); }
    hits.set(req.ip, entry);
    next();
  };
}

function parseRange(req) {
  const to = req.query.to ? Number(req.query.to) : Date.now();
  const from = req.query.from ? Number(req.query.from) : to - 7 * 24 * 3600 * 1000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null;
  return { from, to };
}

export function createApp(db) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '100kb' }));
  app.use(cors({ origin: ALLOWED_ORIGINS }));

  const ingest = createIngest(db);
  const stats = createStats(db);
  const limit = rateLimiter();

  app.post('/api/collect', limit, (req, res) => {
    const raw = Array.isArray(req.body) ? req.body : [req.body];
    if (raw.length === 0) return res.status(400).json({ error: 'no events' });
    if (raw.length > 100) return res.status(400).json({ error: 'batch too large (>100)' });

    const now = Date.now();
    const ip = req.ip || 'unknown';
    const ipHash = hashIp(ip, IP_SALT);
    const userAgent = req.get('user-agent') || null;
    const accepted = [];
    const rejected = [];

    for (const rawEvent of raw) {
      const v = validateEvent(rawEvent);
      if (!v.ok) { rejected.push({ name: rawEvent?.name ?? null, errors: v.errors }); continue; }
      const e = v.event;

      if (e.source === 'server' && req.get('x-api-key') !== API_KEY) {
        rejected.push({ name: e.name, errors: ['invalid api key for server-source event'] });
        continue;
      }

      accepted.push({
        ...e,
        received_at: now,
        user_agent: userAgent,
        ip_hash: ipHash,
        properties: JSON.stringify(e.properties),
      });
    }

    if (accepted.length) ingest.insertMany(accepted);
    res.status(202).json({ accepted: accepted.length, rejected: rejected.length, errors: rejected });
  });

  app.get('/api/stats/overview', (req, res) => {
    const r = parseRange(req); if (!r) return res.status(400).json({ error: 'invalid range' });
    res.json(stats.overview(r.from, r.to));
  });
  app.get('/api/stats/timeseries', (req, res) => {
    const r = parseRange(req); if (!r) return res.status(400).json({ error: 'invalid range' });
    const bucketMs = req.query.interval === 'day' ? 86_400_000 : 3_600_000;
    res.json(stats.timeseries(r.from, r.to, bucketMs));
  });
  app.get('/api/stats/pages', (req, res) => {
    const r = parseRange(req); if (!r) return res.status(400).json({ error: 'invalid range' });
    res.json(stats.topPages(r.from, r.to));
  });
  app.get('/api/stats/events', (req, res) => {
    const r = parseRange(req); if (!r) return res.status(400).json({ error: 'invalid range' });
    res.json(stats.breakdown(r.from, r.to));
  });
  app.get('/api/stats/recent', (req, res) => {
    const r = parseRange(req); if (!r) return res.status(400).json({ error: 'invalid range' });
    res.json(stats.recent(r.from, r.to));
  });
  app.get('/api/stats/recent-page', (req, res) => {
    const r = parseRange(req); if (!r) return res.status(400).json({ error: 'invalid range' });
    const limit = req.query.limit == null ? 10 : Number(req.query.limit);
    const offset = req.query.offset == null ? 0 : Number(req.query.offset);
    const search = req.query.search == null ? '' : String(req.query.search);
    const source = req.query.source == null ? 'all' : String(req.query.source);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }
    if (search.length > 200) return res.status(400).json({ error: 'search is too long' });
    if (!['all', 'client', 'server'].includes(source)) {
      return res.status(400).json({ error: 'invalid source' });
    }
    res.json(stats.recentPage(r.from, r.to, { limit, offset, search, source }));
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}

export { API_KEY };