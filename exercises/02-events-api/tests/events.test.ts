import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db.js';
import { createSeededDb } from '../src/seed.js';

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await createSeededDb();
  app = createApp(db);
});

const postBatch = (userId: string, events: unknown[]) =>
  app.request('/events/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userId}-token`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });

describe('POST /events/batch', () => {
  it('requires auth', async () => {
    const res = await app.request('/events/batch', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('awards points for activity', async () => {
    const now = new Date().toISOString();
    const res = await postBatch('u_bob', [
      { type: 'share', postId: 'p_1', occurredAt: now },
      { type: 'like', postId: 'p_1', occurredAt: now },
    ]);

    expect(await res.json()).toEqual({ ok: true, awarded: 6 });
    expect((await db.users.findOne({ _id: 'u_bob' }))?.points).toBe(6);
    expect((await db.posts.findOne({ _id: 'p_1' }))?.shareCount).toBe(1);
  });
});
