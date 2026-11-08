import 'server-only';
import { Pool, type PoolClient } from 'pg';

// Connexion directe à la base Supabase (chaîne « Transaction pooler » dans Supabase > Connect).
// Chaque requête s'exécute dans une transaction avec l'identité de la personne connectée,
// exactement comme l'API de Supabase : les règles de sécurité (RLS) s'appliquent donc à tout.
declare global {
  // eslint-disable-next-line no-var
  var __sdPool: Pool | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant : ajoute-le dans les réglages Vercel (voir le guide).');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
  });
}
const pool = () => (globalThis.__sdPool ??= makePool());

export type Db = PoolClient;

/** Exécute fn en tant que visiteur (userId = null) ou utilisateur connecté, avec la RLS. */
export async function withDb<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const role = userId ? 'authenticated' : 'anon';
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true),
              set_config('request.jwt.claims', $3, true)`,
      [userId ?? '', role, JSON.stringify(userId ? { sub: userId, role } : { role })],
    );
    await client.query(`set local role ${role}`);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function rows<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as T[];
}
export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) {
  return ((await db.query(sql, params)).rows[0] ?? null) as T | null;
}

/** Message lisible d'une erreur métier levée par la base (« UNAVAILABLE: … », « INVALID: … »). */
export function dbMessage(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^(UNAVAILABLE|INVALID|FORBIDDEN)(:[0-9a-f-]{36})?:\s*/, '');
}
