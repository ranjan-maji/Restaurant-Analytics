import crypto from 'node:crypto';

export function hashIp(ip, salt) {
  return crypto.createHash('sha256').update(`${ip}|${salt}`).digest('hex').slice(0, 16);
}

export function createIngest(db) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, name, timestamp, received_at, visitor_id, session_id, user_id,
       source, url, path, referrer, user_agent, ip_hash, properties)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((events) => {
    for (const e of events) {
      stmt.run(
        e.id, e.name, e.timestamp, e.received_at,
        e.visitor_id, e.session_id, e.user_id, e.source,
        e.url, e.path, e.referrer, e.user_agent, e.ip_hash,
        e.properties
      );
    }
  });

  return { insertMany };
}