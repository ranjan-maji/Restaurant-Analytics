import { createDb } from './db.js';
import { createApp } from './app.js';
import { addDemoRoutes } from './demo-routes.js';

const PORT = Number(process.env.PORT || 4000);
const PUBLIC_ENDPOINT = process.env.PUBLIC_ENDPOINT || `http://localhost:${PORT}`;

const db = createDb();
const app = createApp(db);
addDemoRoutes(app, { publicEndpoint: PUBLIC_ENDPOINT });

app.listen(PORT, () => console.log(`[server] analytics on :${PORT}`));