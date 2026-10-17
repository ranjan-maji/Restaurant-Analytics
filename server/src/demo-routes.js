import crypto from 'node:crypto';
import { createServerTracker } from './server-tracker.js';
import { API_KEY } from './app.js';

export function addDemoRoutes(app, { publicEndpoint }) {
  const tracker = createServerTracker({ endpoint: publicEndpoint, apiKey: API_KEY });

  app.post('/api/demo/order', async (req, res) => {
    const { items, total, visitor_id, session_id, user_id } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' });
    }
    const order = {
      id: 'ord_' + crypto.randomUUID().slice(0, 8),
      items, total: Number(total) || 0, currency: 'INR', created_at: Date.now(),
    };
    // Fire and don't await — analytics never fails the business request.
    tracker.track('order_created', {
      order_id: order.id,
      item_count: items.length,
      total: order.total,
      currency: order.currency,
      items: items.map((i) => i.name),
    }, { visitor_id, session_id, user_id, path: '/checkout' });
    res.json(order);
  });
}