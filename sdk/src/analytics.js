const VISITOR_COOKIE = 'an_visitor_id';
const SESSION_KEY = 'an_session_id';
const SESSION_TS = 'an_session_ts';
const USER_KEY = 'an_user_id';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(name, value, days) {
  const exp = new Date(Date.now() + days * 86_400_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}
function getVisitorId() {
  let id = getCookie(VISITOR_COOKIE);
  if (!id) { id = uuid(); setCookie(VISITOR_COOKIE, id, 365); }
  return id;
}
function getSessionId() {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(SESSION_TS) || 0);
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid || now - last > SESSION_TIMEOUT_MS) {
      sid = uuid();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    sessionStorage.setItem(SESSION_TS, String(now));
    return sid;
  } catch { return uuid(); }
}

export class Analytics {
  constructor() {
    this.config = null;
    this.queue = [];
    this.timer = null;
    this.flushing = false;
    this.userId = null;
    this.visitorId = null;
    this.sessionId = null;
    this._lastPath = null;
    this._origPush = null;
    this._origReplace = null;
  }

  init(config = {}) {
    if (this.config) return this;
    this.config = {
      endpoint: '',
      batchSize: 10,
      flushIntervalMs: 5_000,
      debug: false,
      trackPageViews: true,
      ...config,
    };
    this.visitorId = getVisitorId();
    this.sessionId = getSessionId();
    try { this.userId = localStorage.getItem(USER_KEY) || null; } catch {}

    if (this.config.trackPageViews) {
      this._lastPath = window.location.pathname;
      this._hookHistory();
      this.pageView();
    }

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this._beaconFlush();
    });
    window.addEventListener('pagehide', () => this._beaconFlush());
    return this;
  }

  identify(userId) {
    this.userId = userId;
    try { localStorage.setItem(USER_KEY, userId); } catch {}
  }

  pageView(extra = {}) {
    this.track('page_view', {
      ...extra,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer,
    });
  }

  track(name, properties = {}) {
    if (!this.config) { console.warn('[analytics] not initialized'); return; }
    this.queue.push({
      id: uuid(),
      name,
      timestamp: Date.now(),
      visitor_id: this.visitorId,
      session_id: this.sessionId,
      user_id: this.userId,
      source: 'client',
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer,
      properties,
    });
    if (this.config.debug) console.debug('[analytics] track', name, properties);
    if (this.queue.length >= this.config.batchSize) this.flush();
    else this._schedule();
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.flushing = true;
    const batch = this.queue.splice(0, this.config.batchSize);
    try {
      const res = await fetch(`${this.config.endpoint}/api/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const result = await res.json();
      if (result.rejected > 0) {
        console.warn('[analytics] events rejected by collector', result.errors);
      }
      if (this.config.debug) console.debug('[analytics] flushed', batch.length);
    } catch (err) {
      this.queue.unshift(...batch);           // requeue at front, keep order
      if (this.config.debug) console.debug('[analytics] flush failed', err.message);
      this._schedule();
    } finally {
      this.flushing = false;
      if (this.queue.length >= this.config.batchSize) this.flush();
    }
  }

  _schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.config.flushIntervalMs);
  }

  _beaconFlush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.slice();
    const body = JSON.stringify(batch);
    if (navigator.sendBeacon?.(`${this.config.endpoint}/api/collect`, new Blob([body], { type: 'application/json' }))) {
      this.queue.splice(0, batch.length);
    } else {
      this.flush();
    }
  }

  _hookHistory() {
    const onNav = () => {
      if (window.location.pathname === this._lastPath) return;
      this._lastPath = window.location.pathname;
      this.pageView();
    };
    const wrap = (orig) => function (...args) { const r = orig.apply(this, args); onNav(); return r; };
    this._origPush = history.pushState;
    this._origReplace = history.replaceState;
    history.pushState = wrap(this._origPush);
    history.replaceState = wrap(this._origReplace);
    window.addEventListener('popstate', onNav);
  }
}

export const analytics = new Analytics();
export default analytics;