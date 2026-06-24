import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Pool size per instance. max:1 serializes every query on one connection, which
// makes the room's parallel state queries (and any request that lands mid-poll)
// crawl. We use Neon's pooled (PgBouncer) connection in production, which
// multiplexes thousands of client connections, so a real pool here is safe and
// lets Promise.all queries actually run in parallel.
// idle_timeout recycles idle connections so serverless instances don't hold them.
const client = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
export const db = drizzle(client, { schema });
