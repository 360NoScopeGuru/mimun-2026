import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// max: 1 keeps each serverless function instance to a single connection so we
// don't exhaust Postgres' connection limit under concurrent invocations. In
// production, point DATABASE_URL at Neon's pooled (PgBouncer) connection
// string rather than the direct one.
const client = postgres(env.DATABASE_URL, { max: 1 });
export const db = drizzle(client, { schema });
