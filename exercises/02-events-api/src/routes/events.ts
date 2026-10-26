import { Hono } from 'hono';
import { requireUser, type AppEnv } from '../auth.js';
import type { Db } from '../db.js';

type ActivityType = 'share' | 'like' | 'view';

interface ActivityEvent {
  type: ActivityType;
  postId: string;
  count?: number; // the app collapses repeated actions on the same post into one event
  occurredAt: string; // ISO timestamp from the device
}

const ACTIVITY_POINTS: Record<ActivityType, number> = {
  share: 5,
  like: 1,
  view: 0.1,
};

const DAILY_CAP = 50;

// The app queues activity while the driver is offline and flushes it here in batches.
export function eventsRoutes(db: Db) {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(db));

  app.post('/batch', async (c) => {
    const user = c.get('user');
    const { events } = (await c.req.json()) as { events: ActivityEvent[] };
    console.log(`[events] batch from ${user._id} <${user.email}>: ${events.length} events`);

    let awarded = 0;
    for (const event of events) {
      const day = event.occurredAt.slice(0, 10);
      const earnedToday = (await db.pointsLedger.find({ userId: user._id, day }).toArray()).reduce(
        (sum, e) => sum + e.amount,
        0,
      );
      if (earnedToday >= DAILY_CAP) continue;

      const amount = ACTIVITY_POINTS[event.type] * (event.count ?? 1);
      await db.pointsLedger.insertOne({
        userId: user._id,
        reason: event.type,
        sourceId: event.postId,
        amount,
        day,
        createdAt: new Date(),
      });
      if (event.type === 'share') {
        await db.posts.updateOne({ _id: event.postId }, { $inc: { shareCount: event.count ?? 1 } });
      }
      awarded += amount;
    }

    try {
      await db.users.updateOne({ _id: user._id }, { $inc: { points: awarded } });
    } catch (err) {
      console.error(err);
    }

    return c.json({ ok: true, awarded });
  });

  return app;
}
