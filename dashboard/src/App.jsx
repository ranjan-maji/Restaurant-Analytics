import { useCallback, useEffect, useState } from 'react';
import {
  Bar, BarChart, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchStats } from './api';
import './styles.css';

const RANGES = [
  { label: '24 hours', short: '24h', ms: 24 * 3600 * 1000, interval: 'hour' },
  { label: '7 days', short: '7d', ms: 7 * 24 * 3600 * 1000, interval: 'hour' },
  { label: '30 days', short: '30d', ms: 30 * 24 * 3600 * 1000, interval: 'day' },
];

const fmtTime = (ms) => new Date(Number(ms)).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

const fmtNumber = (value) => Number(value || 0).toLocaleString();
const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value || 0);

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function App() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [recentPage, setRecentPage] = useState(null);
  const [recentPageKey, setRecentPageKey] = useState(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [copiedEventId, setCopiedEventId] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const range = RANGES[rangeIdx];
  const recentRequestKey = [range.ms, pageIndex, pageSize, search.trim(), sourceFilter].join('|');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const to = Date.now();
      const from = to - range.ms;
      const params = { from, to, interval: range.interval };
      const previousParams = { from: from - range.ms, to: from };
      const [overview, previousOverview, timeseries, pages, events] = await Promise.all([
        fetchStats('overview', params),
        fetchStats('overview', previousParams),
        fetchStats('timeseries', params),
        fetchStats('pages', params),
        fetchStats('events', params),
      ]);
      setData({ overview, previousOverview, timeseries, pages, events });
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || 'Unable to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range.ms, range.interval]);

  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const to = Date.now();
    const params = {
      from: to - range.ms,
      to,
      limit: pageSize,
      offset: pageIndex * pageSize,
      search: search.trim(),
      source: sourceFilter,
    };
    const requestKey = [range.ms, pageIndex, pageSize, search.trim(), sourceFilter].join('|');
    setRecentLoading(true);
    setRecentError(null);
    fetchStats('recent-page', params)
      .then((result) => {
        if (active) {
          setRecentPage(result);
          setRecentPageKey(requestKey);
          setRecentError(null);
        }
      })
      .catch((err) => {
        if (active) setRecentError(err.message || 'Unable to load recent activity');
      })
      .finally(() => {
        if (active) setRecentLoading(false);
      });
    return () => { active = false; };
  }, [range.ms, pageIndex, pageSize, search, sourceFilter, tick]);

  const currentRecentPage = recentPageKey === recentRequestKey ? recentPage : null;
  const displayRecentPage = currentRecentPage || recentPage;
  const recentItems = displayRecentPage?.items || [];
  const totalRecent = displayRecentPage?.total || 0;
  const displayPageSize = displayRecentPage?.limit || pageSize;
  const displayPageIndex = displayRecentPage ? Math.floor(displayRecentPage.offset / displayPageSize) : pageIndex;
  const pageCount = Math.ceil(totalRecent / displayPageSize);
  const firstVisible = totalRecent ? displayRecentPage.offset + 1 : 0;
  const lastVisible = totalRecent ? Math.min(displayRecentPage.offset + recentItems.length, totalRecent) : 0;

  useEffect(() => {
    if (!currentRecentPage) return;
    if (pageCount > 0 && pageIndex >= pageCount) setPageIndex(pageCount - 1);
    if (pageCount === 0 && pageIndex !== 0) setPageIndex(0);
  }, [currentRecentPage, pageCount, pageIndex]);

  useEffect(() => {
    if (!selectedEvent) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedEvent(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEvent]);

  const exportCsv = () => {
    if (!currentRecentPage || !recentItems.length) return;
    const rows = [
      ['Time', 'Event', 'Source', 'Path', 'Visitor'],
      ...recentItems.map((event) => [
        fmtTime(event.timestamp), event.name, event.source, event.path || '',
        event.visitor_id || '',
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `restaurant-events-${range.short}-page-${pageIndex + 1}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyEventId = async () => {
    if (!selectedEvent) return;
    try {
      await navigator.clipboard.writeText(selectedEvent.id);
      setCopiedEventId(true);
      window.setTimeout(() => setCopiedEventId(false), 1600);
    } catch (err) {
      setRecentError(`Could not copy event ID: ${err.message}`);
    }
  };

  const conversion = data?.overview.page_views
    ? (data.overview.orders / data.overview.page_views) * 100
    : 0;
  const returningShare = data?.overview.unique_visitors
    ? (data.overview.returning_visitors / data.overview.unique_visitors) * 100
    : 0;

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Restaurant analytics home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="brand-name">Service <span>Signals</span></span>
        </a>
        <div className="topbar-right">
          <span className="live-status"><i /> Auto-updating</span>
          <span className="topbar-divider" />
          <span className="workspace-name">Mario's Trattoria</span>
        </div>
      </header>

      <div className={loading && data ? 'content dashboard-content is-refreshing' : 'content dashboard-content'} aria-busy={loading}>
        <section className="page-heading">
          <div>
            <p className="eyebrow">RESTAURANT OVERVIEW</p>
            <h1>Your restaurant, at a glance.</h1>
            <p className="subtitle">Understand what guests love and what brings them back.</p>
          </div>
          <div className="toolbar">
            <div className="range-switch" aria-label="Date range">
              {RANGES.map((item, index) => (
                <button
                  key={item.short}
                  className={index === rangeIdx ? 'range-button active' : 'range-button'}
                  onClick={() => { setRangeIdx(index); setPageIndex(0); }}
                  aria-pressed={index === rangeIdx}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button className="button button-refresh" onClick={() => setTick((value) => value + 1)} disabled={loading} aria-label={loading ? 'Refreshing analytics' : 'Refresh analytics'}>
              <span className={loading ? 'refresh-icon spinning' : 'refresh-icon'}>↻</span>
              <span>Refresh</span>
            </button>
          </div>
        </section>
        {loading && data && (
          <div className="refresh-status" role="status" aria-live="polite">
            <span className="mini-spinner" /> Refreshing your insights
          </div>
        )}

        <div className="updated-note">
          <span className="live-dot" /> Auto-refreshes every 15 seconds
          {lastUpdated && <span> · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span>We couldn't refresh your analytics: {error}</span>
            <button onClick={() => setTick((value) => value + 1)}>Try again</button>
          </div>
        )}
        {loading && !data && <DashboardLoader />}

        {data && (
          <>
            <section className="kpi-grid" aria-label="Key metrics">
              <KPI label="Total events" value={data.overview.total_events} icon="✳" tone="lavender" note="Guest activity tracked" current={data.overview.total_events} previous={data.previousOverview.total_events} />
              <KPI label="Unique visitors" value={data.overview.unique_visitors} icon="◎" tone="mint" note="Distinct guests" current={data.overview.unique_visitors} previous={data.previousOverview.unique_visitors} />
              <KPI label="Menu views" value={data.overview.page_views} icon="▤" tone="peach" note="Pages viewed" current={data.overview.page_views} previous={data.previousOverview.page_views} />
              <KPI label="Orders" value={data.overview.orders} icon="↗" tone="yellow" note={`${conversion.toFixed(1)}% view-to-order rate`} current={data.overview.orders} previous={data.previousOverview.orders} />
              <KPI label="Sales" value={data.overview.revenue} icon="₹" tone="mint" note={`Avg. order ${money(data.overview.average_order_value)}`} current={data.overview.revenue} previous={data.previousOverview.revenue} currency />
              <KPI label="Returning guests" value={data.overview.returning_visitors} icon="↺" tone="peach" note={`${returningShare.toFixed(1)}% of visitors came back`} current={data.overview.returning_visitors} previous={data.previousOverview.returning_visitors} />
            </section>
            <p className="comparison-caption"><span className="comparison-arrow">↗</span> Metrics compared with the previous {range.label.toLowerCase()}</p>
            <section className="panel traffic-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">GUEST ACTIVITY</p>
                  <h2>Traffic over time</h2>
                </div>
                <div className="chart-legend">
                  <span><i className="legend-events" /> Events</span>
                  <span><i className="legend-visitors" /> Visitors</span>
                </div>
              </div>
              <div className="chart-wrap">
                {data.timeseries.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.timeseries} margin={{ top: 10, right: 14, bottom: 0, left: -15 }}>
                      <CartesianGrid stroke="#eef0ed" vertical={false} />
                      <XAxis dataKey="bucket" tickFormatter={(value) => new Date(Number(value)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                      <Tooltip labelFormatter={fmtTime} contentStyle={{ borderRadius: 12, border: '1px solid #e7e9e4', boxShadow: '0 8px 24px #17241a14' }} />
                      <Line type="monotone" dataKey="events" name="Events" stroke="#283d31" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="visitors" name="Visitors" stroke="#e1a653" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty message="No activity in this time range yet." />}
              </div>
            </section>

            <section className="panel event-chart-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">WHAT GUESTS DO</p>
                  <h2>Most popular actions</h2>
                </div>
                <span className="panel-hint">Top event types · {range.label}</span>
              </div>
              <div className="event-chart-wrap">
                {data.events.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.events.slice(0, 8).map((event) => ({
                        ...event,
                        label: event.name.replaceAll('_', ' '),
                      }))}
                      layout="vertical"
                      margin={{ top: 5, right: 26, bottom: 5, left: 6 }}
                    >
                      <CartesianGrid stroke="#edf1eb" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} fontSize={10} />
                      <YAxis type="category" dataKey="label" width={142} tickLine={false} axisLine={false} fontSize={10} />
                      <Tooltip
                        cursor={{ fill: '#f3f6f1' }}
                        formatter={(value) => [fmtNumber(value), 'Events']}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e1e8df', boxShadow: '0 8px 24px #17241a14' }}
                      />
                      <Bar dataKey="count" name="Events" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {data.events.slice(0, 8).map((event, index) => (
                          <Cell key={event.name} fill={['#416c4b', '#73916b', '#d5a85f', '#9bb68e', '#b7a07a', '#658879', '#c2cead', '#a77a54'][index % 8]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty message="Guest actions will appear as activity is recorded." />}
              </div>
            </section>

            <div className="insights-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div><p className="eyebrow">WHAT GUESTS EXPLORE</p><h2>Top pages</h2></div>
                  <span className="panel-hint">By menu views</span>
                </div>
                {data.pages.length ? (
                  <div className="page-list">
                    {data.pages.slice(0, 6).map((page) => {
                      const max = data.pages[0]?.views || 1;
                      return (
                        <div className="page-row" key={page.path}>
                          <div className="page-row-label"><span title={page.path}>{page.path}</span><strong>{fmtNumber(page.views)}</strong></div>
                          <div className="progress-track"><span style={{ width: `${Math.max(4, (page.views / max) * 100)}%` }} /></div>
                          <small>{fmtNumber(page.visitors)} visitors</small>
                        </div>
                      );
                    })}
                  </div>
                ) : <Empty message="Your most-viewed pages will show up here." />}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><p className="eyebrow">THE DETAILS</p><h2>Events breakdown</h2></div>
                </div>
                {data.events.length ? (
                  <div className="event-list">
                    {data.events.slice(0, 7).map((event, index) => (
                      <div className="event-row" key={event.name}>
                        <span className="event-index">{String(index + 1).padStart(2, '0')}</span>
                        <span className="event-name">{event.name.replaceAll('_', ' ')}</span>
                        <strong>{fmtNumber(event.count)}</strong>
                      </div>
                    ))}
                  </div>
                ) : <Empty message="Events will appear as guests explore." />}
              </section>
            </div>

            <section className="panel recent-panel">
              <div className="panel-heading recent-heading">
                <div><p className="eyebrow">THE LATEST</p><h2>Recent activity</h2></div>
                <div className="recent-actions">
                  <label className="search-box">
                    <span aria-hidden="true">⌕</span>
                    <input value={search} onChange={(event) => { setSearch(event.target.value); setPageIndex(0); }} placeholder="Search events…" aria-label="Search recent events" />
                  </label>
                  <label className="source-filter-label">
                    <span>Source</span>
                    <select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPageIndex(0); }} aria-label="Filter events by source">
                      <option value="all">All sources</option>
                      <option value="client">Browser</option>
                      <option value="server">Server</option>
                    </select>
                  </label>
                  <button className="button button-export" onClick={exportCsv} disabled={!currentRecentPage || !recentItems.length || recentLoading}>↓ <span>Export page</span></button>
                </div>
              </div>
              <div className={recentLoading && displayRecentPage ? 'table-scroll is-loading' : 'table-scroll'}>
                {recentLoading && displayRecentPage && <div className="table-refresh-indicator"><span className="mini-spinner" /> Refreshing events</div>}
                <table>
                  <thead><tr><th>Event</th><th>Source</th><th>Page</th><th>Visitor</th><th>Time</th></tr></thead>
                  <tbody>
                    {recentError ? (
                      <tr><td className="empty-cell" colSpan="5">{recentError} <button className="inline-retry" onClick={() => setTick((value) => value + 1)}>Try again</button></td></tr>
                    ) : recentLoading && !displayRecentPage ? (
                      <tr><td className="empty-cell" colSpan="5">Loading recent activity…</td></tr>
                    ) : recentItems.length ? recentItems.map((event) => (
                      <tr key={event.id}>
                        <td><button className="event-name-button" onClick={() => { setSelectedEvent(event); setCopiedEventId(false); }}><span className="table-event-dot" />{event.name.replaceAll('_', ' ')}<span className="details-hint">Details</span></button></td>
                        <td><span className={`source-pill ${event.source === 'server' ? 'source-server' : ''}`}>{event.source || 'client'}</span></td>
                        <td className="muted-cell">{event.path || '—'}</td>
                        <td className="visitor-cell">{(event.visitor_id || '').slice(0, 8) || '—'}</td>
                        <td className="muted-cell">{fmtTime(event.timestamp)}</td>
                      </tr>
                    )) : <tr><td className="empty-cell" colSpan="5">{search || sourceFilter !== 'all' ? 'No events match these filters.' : 'No events recorded in this period yet.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="pagination-bar" aria-busy={recentLoading}>
                <div className="pagination-meta">
                  <span>Showing <strong>{firstVisible}–{lastVisible}</strong> of <strong>{fmtNumber(totalRecent)}</strong> events</span>
                  <label>Rows
                    <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageIndex(0); }} aria-label="Rows per page">
                      {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                </div>
                <div className="pagination-controls" aria-label="Recent activity pages">
                  <button className="page-button" onClick={() => setPageIndex((page) => Math.max(0, page - 1))} disabled={displayPageIndex === 0 || recentLoading} aria-label="Previous page">← <span>Previous</span></button>
                  <span className="page-indicator">Page <strong>{pageCount ? displayPageIndex + 1 : 0}</strong> of <strong>{pageCount}</strong></span>
                  <button className="page-button" onClick={() => setPageIndex((page) => Math.min(pageCount - 1, page + 1))} disabled={!pageCount || displayPageIndex >= pageCount - 1 || recentLoading} aria-label="Next page"><span>Next</span> →</button>
                </div>
              </div>
            </section>
            <footer className="footer-note">A little more insight for every service. <span>Made for hospitality.</span></footer>
          </>
        )}
      </div>
      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onCopy={copyEventId}
          copied={copiedEventId}
        />
      )}
    </main>
  );
}

function KPI({ label, value, icon, tone, note, current, previous, currency = false }) {
  const delta = previous === 0
    ? (current === 0 ? 0 : null)
    : ((current - previous) / previous) * 100;
  const trend = delta === null
    ? { className: 'trend-new', label: 'New this period' }
    : {
      className: delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat',
      label: `${delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} ${Math.abs(delta).toFixed(1)}%`,
    };

  return (
    <article className="kpi-card">
      <div className={`kpi-icon ${tone}`}>{icon}</div>
      <p>{label}</p>
      <strong>{currency ? money(value) : fmtNumber(value)}</strong>
      <div className="kpi-meta">
        <span className="kpi-note">{note}</span>
        <span className={`kpi-trend ${trend.className}`} title="Compared with the previous period">{trend.label}</span>
      </div>
    </article>
  );
}

function Empty({ message }) {
  return <div className="empty-state">{message}</div>;
}

function DashboardLoader() {
  return (
    <section className="dashboard-loader" role="status" aria-live="polite">
      <div className="loader-orbit" aria-hidden="true"><span /><i /><i /></div>
      <div className="loader-copy">
        <strong>Gathering customer insights</strong>
        <span>Bringing guest activity and sales into focus…</span>
      </div>
      <div className="loader-skeletons" aria-hidden="true"><i /><i /><i /><i /></div>
    </section>
  );
}

function EventDetails({ event, onClose, onCopy, copied }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <div className="modal-heading">
          <div><p className="eyebrow">EVENT INSPECTOR</p><h2 id="event-modal-title">{event.name.replaceAll('_', ' ')}</h2></div>
          <button className="modal-close" onClick={onClose} aria-label="Close event details">×</button>
        </div>
        <div className="event-detail-grid">
          <Detail label="Timestamp" value={fmtTime(event.timestamp)} />
          <Detail label="Source" value={event.source || 'client'} />
          <Detail label="Path" value={event.path || '—'} />
          <Detail label="Visitor ID" value={event.visitor_id || '—'} />
          <Detail label="Session ID" value={event.session_id || '—'} />
          <Detail label="User ID" value={event.user_id || '—'} />
          <Detail label="Event ID" value={event.id} wide />
        </div>
        <div className="properties-heading"><h3>Event properties</h3><span>{Object.keys(event.properties || {}).length} fields</span></div>
        <pre className="properties-view">{JSON.stringify(event.properties || {}, null, 2)}</pre>
        <div className="modal-footer">
          <button className="button button-copy" onClick={onCopy}>{copied ? '✓ Copied event ID' : 'Copy event ID'}</button>
          <button className="button button-done" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value, wide }) {
  return <div className={wide ? 'detail-field detail-wide' : 'detail-field'}><span>{label}</span><strong title={value}>{value}</strong></div>;
}
