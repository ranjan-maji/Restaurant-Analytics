import crypto from 'node:crypto';

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,99}$/;
const MAX_PROPERTIES = 10_000;
const MAX_STRING = 2_000;

export function validateEvent(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['event must be an object'] };
  }

  const event = {
    id: typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 100
      ? raw.id : crypto.randomUUID(),
    name: raw.name,
    timestamp: raw.timestamp,
    visitor_id: raw.visitor_id ?? null,
    session_id: raw.session_id ?? null,
    user_id: raw.user_id ?? null,
    source: raw.source ?? 'client',
    url: raw.url ?? null,
    path: raw.path ?? null,
    referrer: raw.referrer ?? null,
    properties: raw.properties ?? {},
  };

  if (typeof event.name !== 'string' || !NAME_RE.test(event.name)) errors.push('invalid name');
  if (!Number.isFinite(event.timestamp) || event.timestamp < 0) errors.push('invalid timestamp');
  if (!['client', 'server'].includes(event.source)) errors.push('invalid source');

  if (typeof event.properties !== 'object' || event.properties === null || Array.isArray(event.properties)) {
    errors.push('properties must be an object');
  } else if (JSON.stringify(event.properties).length > MAX_PROPERTIES) {
    errors.push('properties too large');
  }

  for (const k of ['url', 'path', 'referrer', 'user_id', 'visitor_id', 'session_id']) {
    const v = event[k];
    if (v !== null && typeof v !== 'string') errors.push(`${k} must be a string`);
    else if (typeof v === 'string' && v.length > MAX_STRING) errors.push(`${k} too long`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, event };
}