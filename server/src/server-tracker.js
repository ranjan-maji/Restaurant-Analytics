import crypto from 'node:crypto';

export function createServerTracker({ endpoint, apiKey, timeoutMs = 2_000, logger = console } = {}) {
  async function track(name, properties = {}, context = {}) {
    const event = {
      id: crypto.randomUUID(),
      name,
      timestamp: Date.now(),
      source: 'server',
      properties,
      visitor_id: context.visitor_id ?? null,
      session_id: context.session_id ?? null,
      user_id: context.user_id ?? null,
      path: context.path ?? null,
    };
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify([event]),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) logger.warn('[server-tracker] collect failed', res.status);
      if (!res.ok) return false;
      const result = await res.json();
      if (result.rejected > 0 || result.accepted !== 1) {
        logger.warn('[server-tracker] event rejected by collector', result.errors);
        return false;
      }
      return true;
    } catch (err) {
      logger.warn('[server-tracker] collect error', err.message);
      return false;
    }
  }
  return { track };
}