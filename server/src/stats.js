export function createStats(db) {
  const overview = db.prepare(`
    SELECT
      COUNT(*)                                                            AS total_events,
      COUNT(DISTINCT visitor_id)                                          AS unique_visitors,
      COALESCE(SUM(CASE WHEN name='page_view'     THEN 1 ELSE 0 END), 0)  AS page_views,
      COALESCE(SUM(CASE WHEN name='order_created' THEN 1 ELSE 0 END), 0)  AS orders
    FROM events WHERE timestamp BETWEEN ? AND ?
  `);

  const commerce = db.prepare(`
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(
        CASE WHEN json_type(properties, '$.total') IN ('integer', 'real')
          THEN CAST(json_extract(properties, '$.total') AS REAL)
          ELSE 0
        END
      ), 0) AS revenue
    FROM events
    WHERE name='order_created' AND source='server' AND timestamp BETWEEN ? AND ?
  `);

  const returningVisitors = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT visitor_id
      FROM events
      WHERE timestamp BETWEEN ? AND ? AND visitor_id IS NOT NULL
      GROUP BY visitor_id
      HAVING COUNT(DISTINCT session_id) > 1
    )
  `);

  const topPages = db.prepare(`
    SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM events
    WHERE name='page_view' AND path IS NOT NULL AND timestamp BETWEEN ? AND ?
    GROUP BY path ORDER BY views DESC LIMIT ?
  `);

  const breakdown = db.prepare(`
    SELECT name, COUNT(*) AS count
    FROM events WHERE timestamp BETWEEN ? AND ?
    GROUP BY name ORDER BY count DESC LIMIT ?
  `);

  const recent = db.prepare(`
    SELECT id, name, timestamp, visitor_id, session_id, user_id, source, path, properties
    FROM events WHERE timestamp BETWEEN ? AND ?
    ORDER BY timestamp DESC LIMIT ?
  `);

  const recentPage = db.prepare(`
    SELECT id, name, timestamp, visitor_id, session_id, user_id, source, path, properties
    FROM events
    WHERE timestamp BETWEEN ? AND ?
      AND (? = '' OR instr(lower(name), lower(?)) > 0
        OR instr(lower(source), lower(?)) > 0
        OR instr(lower(path), lower(?)) > 0
        OR instr(lower(visitor_id), lower(?)) > 0)
      AND (? = 'all' OR source = ?)
    ORDER BY timestamp DESC, id DESC
    LIMIT ? OFFSET ?
  `);

  const recentPageCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM events
    WHERE timestamp BETWEEN ? AND ?
      AND (? = '' OR instr(lower(name), lower(?)) > 0
        OR instr(lower(source), lower(?)) > 0
        OR instr(lower(path), lower(?)) > 0
        OR instr(lower(visitor_id), lower(?)) > 0)
      AND (? = 'all' OR source = ?)
  `);

  const timeseries = db.prepare(`
    SELECT (CAST(timestamp / ? AS INTEGER)) * ? AS bucket,
           COUNT(*) AS events,
           COUNT(DISTINCT visitor_id) AS visitors
    FROM events WHERE timestamp BETWEEN ? AND ?
    GROUP BY bucket ORDER BY bucket ASC
  `);

  return {
    overview: (from, to) => {
      const summary = overview.get(from, to);
      const sales = commerce.get(from, to);
      return {
        ...summary,
        revenue: sales.revenue,
        average_order_value: sales.orders ? sales.revenue / sales.orders : 0,
        returning_visitors: returningVisitors.get(from, to).count,
      };
    },
    topPages: (from, to, limit = 10) => topPages.all(from, to, limit),
    breakdown: (from, to, limit = 20) => breakdown.all(from, to, limit),
    recent: (from, to, limit = 50) => recent.all(from, to, limit).map((e) => ({
      ...e,
      properties: e.properties ? JSON.parse(e.properties) : {},
    })),
    recentPage: (from, to, { limit, offset, search = '', source = 'all' }) => {
      const params = [from, to, search, search, search, search, search, source, source];
      const total = recentPageCount.get(...params).total;
      const items = recentPage.all(...params, limit, offset).map((e) => ({
        ...e,
        properties: e.properties ? JSON.parse(e.properties) : {},
      }));
      return { items, total, limit, offset };
    },
    timeseries: (from, to, bucketMs) => timeseries.all(bucketMs, bucketMs, from, to),
  };
}