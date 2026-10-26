import { Hono } from 'hono';
import type { Db } from './db.js';
import { eventsRoutes } from './routes/events.js';
import { meRoutes } from './routes/me.js';
import { postsRoutes } from './routes/posts.js';

export function createApp(db: Db) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/events', eventsRoutes(db));
  app.route('/me', meRoutes(db));
  app.route('/posts', postsRoutes(db));
  return app;
}
