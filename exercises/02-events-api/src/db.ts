import { randomUUID } from 'node:crypto';
import { INDEXES } from './indexes.js';

// In-memory stand-in for the subset of the MongoDB driver this service uses.
// Prod runs on MongoDB with the indexes in indexes.ts; unique indexes are enforced here too.

export class DuplicateKeyError extends Error {
  code = 11000;
}

type Filter<T> = Partial<T>;
type Update<T> = { $set?: Partial<T>; $inc?: Partial<Record<keyof T, number>> };

export class Collection<T extends { _id: string }> {
  private docs = new Map<string, T>();
  private uniqueKeys: (keyof T)[][] = [];

  addUniqueIndex(keys: (keyof T)[]) {
    this.uniqueKeys.push(keys);
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    for (const doc of this.docs.values()) if (matches(doc, filter)) return structuredClone(doc);
    return null;
  }

  find(filter: Filter<T> = {}) {
    const docs = [...this.docs.values()].filter((d) => matches(d, filter));
    return { toArray: async () => docs.map((d) => structuredClone(d)) };
  }

  async countDocuments(filter: Filter<T> = {}): Promise<number> {
    return (await this.find(filter).toArray()).length;
  }

  async insertOne(input: Omit<T, '_id'> & { _id?: string }): Promise<{ insertedId: string }> {
    const doc = { ...input, _id: input._id ?? randomUUID() } as T;
    for (const keys of this.uniqueKeys) {
      const probe = Object.fromEntries(keys.map((k) => [k, doc[k]])) as Filter<T>;
      if (await this.findOne(probe)) throw new DuplicateKeyError(`duplicate key on ${keys.join(', ')}`);
    }
    this.docs.set(doc._id, structuredClone(doc));
    return { insertedId: doc._id };
  }

  async updateOne(filter: Filter<T>, update: Update<T>): Promise<{ matchedCount: number }> {
    const doc = [...this.docs.values()].find((d) => matches(d, filter));
    if (!doc) return { matchedCount: 0 };
    Object.assign(doc, update.$set);
    for (const [k, by] of Object.entries(update.$inc ?? {})) {
      const key = k as keyof T;
      (doc[key] as number) = ((doc[key] as number) ?? 0) + (by as number);
    }
    return { matchedCount: 1 };
  }
}

function matches<T>(doc: T, filter: Filter<T>): boolean {
  return Object.entries(filter).every(([k, v]) => doc[k as keyof T] === v);
}

export interface User {
  _id: string;
  displayName: string;
  email: string;
  points: number;
}

export interface Session {
  _id: string;
  token: string;
  userId: string;
}

export interface Post {
  _id: string;
  authorId: string;
  body: string;
  likeCount: number;
  shareCount: number;
  createdAt: Date;
}

export interface Like {
  _id: string;
  userId: string;
  postId: string;
  createdAt: Date;
}

export interface LedgerEntry {
  _id: string;
  userId: string;
  reason: string;
  sourceId: string;
  amount: number;
  day?: string;
  createdAt: Date;
}

export interface Db {
  users: Collection<User>;
  sessions: Collection<Session>;
  posts: Collection<Post>;
  likes: Collection<Like>;
  pointsLedger: Collection<LedgerEntry>;
}

export function createDb(): Db {
  const db: Db = {
    users: new Collection(),
    sessions: new Collection(),
    posts: new Collection(),
    likes: new Collection(),
    pointsLedger: new Collection(),
  };
  for (const index of INDEXES) {
    if (!index.unique) continue;
    const collection = db[index.collection] as unknown as Collection<{ _id: string }>;
    collection.addUniqueIndex(Object.keys(index.keys) as never[]);
  }
  return db;
}
