# Restaurant Analytics

Restaurant Analytics is a small, full-stack project that shows how product
analytics can work from end to end. A guest browses a restaurant menu, performs
actions, and places a demo order. The browser and server send events to an API,
the API stores them in SQLite, and the Service Signals dashboard turns those
events into useful summaries.

The project is intended for learning, local demos, and trying out an analytics
workflow. It is not a production ordering, payments, or analytics service.

## What you can do

### Try the restaurant demo

The Mario's Trattoria demo lets you search and browse the menu, filter by
category or vegetarian options, sort by price, save favorite dishes, and add
items to a bag. You can continue through a simulated checkout and see an order
confirmation. Menu prices and sales figures use Indian rupees (INR).

Your bag and favorites are stored in your browser's local storage, so they
remain available after a refresh on that device. There are no customer accounts,
real payments, kitchen fulfilment, or server-side cart records.

### Explore Service Signals

The dashboard gives you a quick view of guest activity and demo sales. Choose a
24-hour, 7-day, or 30-day range to see:

- Total events, unique visitors, menu views, orders, sales, and returning
  guests.
- Changes against the previous period of the same length.
- Traffic over time and a bar chart of the most popular event types.
- Popular pages and an event-name breakdown.
- Searchable recent activity, with client/server source filters, page-size
  controls, and pagination.
- An event inspector with event properties and a copy-event-ID action.
- CSV export for the currently displayed page of recent activity.

The dashboard refreshes automatically every 15 seconds. Refreshing data keeps
the current dashboard visible while the new results load.

## Get started

### Requirements

- Node.js and npm.
- A modern browser for the demo and dashboard.

### Install and run

From the project root, install the workspace dependencies, run the tests, and
start the API and both web apps:

```sh
npm run setup
npm test
npm run dev
```

Once the development servers have started, open:

| App or endpoint | Address |
| --- | --- |
| Restaurant demo | <http://localhost:5173> |
| Service Signals dashboard | <http://localhost:5174> |
| API health check | <http://localhost:4000/api/health> |

The Vite apps forward `/api` requests to the API server on port 4000. The server
creates `server/data.db` on its first start. The root development command runs
the API and both Vite apps together; press `Ctrl+C` in that terminal to stop
them.

### Build the web apps

The dashboard and restaurant demo each have their own production build:

```sh
npm --workspace dashboard run build
npm --workspace demo run build
```

The generated files are written to each app's `dist` directory. These commands
build the frontends; they do not configure or deploy a production API.

## How an event gets to the dashboard

Here is the full journey demonstrated by the project:

1. When the restaurant demo starts, the browser SDK creates or reuses a
   visitor ID and session ID. It automatically records the initial page view
   and watches for changes to the page path in the browser history.
2. Browsing the menu, changing filters, favoriting a dish, and adding an item
   to the bag record custom events such as `menu_item_view`, `menu_favorite_toggled`,
   and `add_to_cart`.
3. When a guest places a demo order, the API returns an INR order confirmation.
   The server tracker independently sends an `order_created` event. Analytics
   is best-effort and does not hold up the order response.
4. The collector validates events, checks the server API key for events marked
   as server-side, adds receipt metadata, and stores accepted events in SQLite.
5. The dashboard requests aggregates and recent events for its selected date
   range and displays the results.

The order route is a demonstration only. It does not process payments or
provide production-grade order validation.

## Project map

| Path | Purpose |
| --- | --- |
| `sdk/` | Reusable browser analytics SDK and its tests. |
| `server/` | Express API, SQLite schema, server-side tracker, demo order route, and API tests. |
| `demo/` | Mario's Trattoria React application. Tailwind CSS utilities are used alongside its custom styles. |
| `dashboard/` | Service Signals React dashboard, charts, filters, and activity inspector. |
| `package.json` | npm workspace scripts for setup, development, and tests. |

## Integrating the browser SDK

The browser SDK is available in this repository as the `@analytics/sdk`
workspace package. Initialize it once in your application's entry point:

```js
import analytics from '@analytics/sdk';

analytics.init({
  endpoint: window.location.origin,
  debug: true,
});
```

Use a base URL that serves or proxies the analytics API. In the local Vite
setup, the apps proxy `/api` to the API server. Then record actions from your
application:

```js
analytics.track('add_to_cart', {
  item_id: 'margherita',
  price: 349,
  currency: 'INR',
});
```

The SDK also supports associating an application-owned user ID with future
events:

```js
analytics.identify('customer-123');
```

`identify` is an analytics association, not authentication. The SDK keeps this
ID in local storage. Do not pass sensitive information as an event property.

By default, the SDK tracks page views, batches events, retries failed network
requests, and attempts to send queued events with `sendBeacon` when the page is
hidden or closing. Events are held in memory until they are sent; there is no
durable offline queue. Set `debug: false` outside local development if you do
not want diagnostic messages in the browser console.

## Integrating the server tracker

The server helper sends events to the same collector and includes the API key
in a server-side request. A simplified example:

```js
import { createServerTracker } from './server-tracker.js';

const tracker = createServerTracker({
  endpoint: process.env.PUBLIC_ENDPOINT || 'http://localhost:4000',
  apiKey: process.env.API_KEY,
});

const accepted = await tracker.track(
  'order_created',
  { order_id: 'order-123', total: 349, currency: 'INR' },
  { visitor_id: 'visitor-id', session_id: 'session-id', path: '/checkout' },
);
```

The identity context is optional. The helper has a request timeout, logs
delivery failures, and returns `false` if the collector does not accept the
event. Keep `API_KEY` on the server; never put it in browser code. The demo
intentionally does not wait for this analytics request before returning its
order response.

## Event and identity model

An event has a unique `id`, a `name`, a millisecond Unix `timestamp`, a `source`
(`client` or `server`), and an object of custom `properties`. It can also carry
`visitor_id`, `session_id`, `user_id`, `url`, `path`, and `referrer`.

The collector adds `received_at`, the request user agent, and a truncated
SHA-256 hash of the request IP address. It does not store the raw IP address.
Event IDs are primary keys in SQLite, so duplicate IDs cannot create duplicate
rows.

The browser SDK uses a first-party cookie for the visitor ID and
`sessionStorage` for the session ID. When the SDK is initialized, it creates a
new session if more than 30 minutes have passed since the previous
initialization in that tab. Calling `identify(userId)` associates later events
with an application-provided user ID. There is no account directory, login
system, or automatic identity matching between devices. Server events can be
joined to browser activity when the application supplies the matching
identity context.

## API reference

All statistics endpoints accept optional `from` and `to` query parameters as
millisecond Unix timestamps. If they are omitted, the API uses the last seven
days. Requests with non-numeric or inverted ranges are rejected.

| Method and path | What it does |
| --- | --- |
| `POST /api/collect` | Accepts one event or a batch of up to 100 events. Returns `202` with accepted/rejected counts and validation errors. A batch can be partially accepted. |
| `GET /api/stats/overview` | Returns total events, unique visitors, page views, order-event count, server-confirmed revenue, average order value, and returning visitors. |
| `GET /api/stats/timeseries` | Returns event and visitor counts grouped by hour. Set `interval=day` for daily buckets. |
| `GET /api/stats/pages` | Returns popular page paths with view and visitor counts. |
| `GET /api/stats/events` | Returns counts grouped by event name. |
| `GET /api/stats/recent` | Returns the most recent events, up to the endpoint's default limit. |
| `GET /api/stats/recent-page` | Returns a page of recent events with `limit`, `offset`, `search`, and `source` filters, plus a matching total. |
| `GET /api/health` | Returns `{ "ok": true }` when the API is available. |
| `POST /api/demo/order` | Creates a demo order and starts best-effort server-side order tracking. |

`recent-page` defaults to 10 rows and accepts a `limit` from 1 to 100, a
non-negative `offset`, a search string of up to 200 characters, and a `source`
of `all`, `client`, or `server`. The dashboard's CSV action exports the
currently displayed page, not every matching event.

## Storage and delivery choices

SQLite keeps the project easy to run locally without provisioning a separate
database. The database uses write-ahead logging and indexes the timestamp,
event name, visitor, and path fields used by common queries. Dashboard
statistics are computed from the stored events; sales are counted only from
server-source `order_created` events.

The browser SDK batches requests and retries failed HTTP deliveries by putting
the batch back at the front of its in-memory queue. Events rejected by
validation are reported to the browser console and are not retried. On
visibility change or page exit, the SDK attempts `sendBeacon` and falls back
to `fetch` if the browser cannot queue that request. A browser that closes
before delivery, or remains offline, can still lose events.

## Configuration

The API reads these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port used by the API server. |
| `DB_PATH` | `server/data.db` | SQLite database file location. |
| `API_KEY` | `dev-api-key` | Key required to ingest events with `source: "server"`. |
| `IP_SALT` | `dev-salt` | Secret salt used to hash request IP addresses. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Comma-separated list of permitted browser origins. |
| `PUBLIC_ENDPOINT` | `http://localhost:<PORT>` | Collector base URL used by the server tracker. |

For example, in PowerShell you can use a separate database file and run only
the API:

```powershell
$env:DB_PATH = 'D:\data\restaurant-analytics.db'
npm --workspace server run dev
```

The environment variables apply to that PowerShell session. Open a new
terminal or unset them if you want to return to the defaults.

## Tests

Run the test suites from the project root:

```sh
npm test
```

The SDK tests cover automatic page views, event batching, retry behavior,
collector rejections, the `sendBeacon` fallback, and identified users. The
server tests cover event validation and ingestion, duplicate IDs, server-event
authorization, date ranges, aggregates, page and time-series reporting, and
recent-event filtering and pagination. Server-tracker tests verify its
handling of accepted and rejected events.

The server tests use an in-memory SQLite database and do not require the web
apps or a separate database server to be running.

## Before using this beyond a local demo

The defaults are for local development, not a public deployment. Before
exposing the system, review and implement the protections appropriate for your
application:

- Replace the default `API_KEY` and `IP_SALT` with securely managed secrets.
- Add authentication and authorization for statistics and dashboard access.
  The current statistics endpoints are not authenticated.
- Add production-grade rate limiting. The included limiter is in-memory and
  allows up to 120 collection requests per minute per IP by default; it does
  not coordinate across multiple server processes.
- Add a consent experience, data-retention and deletion policies, monitoring,
  and an operational plan for database backups and growth.
- Validate order contents and totals on the server, and integrate a real
  payment provider before accepting real orders.
- Decide how to handle browser privacy controls, blocked cookies, offline
  delivery, and cross-device identity.
- Keep personal, payment, and other sensitive information out of event
  properties.

Hashing IP addresses is pseudonymization, not anonymization. A development
salt does not provide production-grade protection. Client-side events and
identity values are supplied by the browser and must be treated as untrusted.
This project does not include multi-tenant data separation, durable offline
delivery, user consent management, or a retention job.
