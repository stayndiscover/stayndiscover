import fs from 'node:fs';
import path from 'node:path';
// Doublure locale de Supabase Auth, UNIQUEMENT pour les tests sur un ordinateur sans Supabase.
// Elle répond aux mêmes adresses que Supabase Auth (/auth/v1/...) pour que le site
// utilise exactement le même code qu'en production. Jamais déployée.
// Usage : DATABASE_URL=postgres://... AUTH_PORT=54321 JWT_SECRET=... node scripts/local-auth.mjs
import http from 'node:http';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { SignJWT, jwtVerify } from 'jose';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'local-test-secret-local-test-secret');
const port = Number(process.env.AUTH_PORT || 54321);
const refresh = new Map(); // refresh_token -> user id

await pool.query(`create table if not exists auth.local_passwords (user_id uuid primary key references auth.users(id) on delete cascade, hash text not null)`);

const hash = (p) => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(p, salt, 32).toString('hex'); };
const check = (p, h) => { const [salt, k] = h.split(':'); return timingSafeEqual(Buffer.from(k, 'hex'), scryptSync(p, salt, 32)); };

const userJson = (r) => ({
  id: r.id, aud: 'authenticated', role: 'authenticated', email: r.email, email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: r.raw_user_meta_data || {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_anonymous: false,
});
async function session(r) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = await new SignJWT({ sub: r.id, role: 'authenticated', aud: 'authenticated', email: r.email, session_id: randomUUID() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setExpirationTime(exp).setIssuedAt().sign(secret);
  const refresh_token = randomBytes(24).toString('hex');
  refresh.set(refresh_token, r.id);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token, user: userJson(r) };
}
const getUser = async (id) => (await pool.query('select id, email, raw_user_meta_data from auth.users where id = $1', [id])).rows[0];
async function fromBearer(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer /i, '');
  try { const { payload } = await jwtVerify(tok, secret); return await getUser(payload.sub); } catch { return null; }
}
const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const err = (res, code, msg, error_code) => send(res, code, { code, error_code, msg, message: msg });

const STORE = '/tmp/sd-storage';
async function storage(req, res, url) {
  const rest = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
  if (req.method === 'GET' && rest.startsWith('public/')) {
    const f = path.join(STORE, rest.slice(7));
    if (!f.startsWith(STORE) || !fs.existsSync(f)) return err(res, 404, 'not found');
    const ext = path.extname(f).slice(1);
    res.writeHead(200, { 'content-type': ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    return res.end(fs.readFileSync(f));
  }
  const u = await fromBearer(req);
  if (!u) return err(res, 403, 'invalid JWT', 'bad_jwt');
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const [bucket, ...parts] = rest.split('/');
  // mêmes règles que les politiques SQL de la migration 8
  const allowed = async (name) => {
    if (bucket !== 'listing-media' && bucket !== 'avatars') return true;
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [u.id]);
      await c.query('set local role authenticated');
      return (await c.query(`select public.${bucket === 'avatars' ? 'logo' : 'media'}_path_editable($1) as ok`, [name])).rows[0].ok;
    } finally { await c.query('rollback'); c.release(); }
  };
  if (req.method === 'POST' || req.method === 'PUT') {
    const name = parts.join('/');
    if (!(await allowed(name))) return err(res, 403, 'new row violates row-level security policy', 'Unauthorized');
    let data = raw;
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('multipart/form-data')) {
      const boundary = '--' + ct.split('boundary=')[1].replace(/;.*$/, '');
      const part = raw.toString('latin1').split(boundary).find((x) => /filename="/.test(x.slice(0, 400))) ?? '';
      data = Buffer.from(part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''), 'latin1');
    }
    const f = path.join(STORE, bucket, name);
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data);
    return send(res, 200, { Key: `${bucket}/${name}`, Id: randomUUID() });
  }
  if (req.method === 'DELETE') {
    const b = JSON.parse(raw.toString() || '{}');
    for (const name of b.prefixes || []) { if (await allowed(name)) fs.rmSync(path.join(STORE, bucket, name), { force: true }); }
    return send(res, 200, []);
  }
  return err(res, 404, 'not found');
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x');
  // ——— Stockage (imitation minimale de Supabase Storage, pour tester l'envoi de photos en local)
  if (url.pathname.startsWith('/storage/v1/object/')) {
    try { return await storage(req, res, url); } catch (e) { console.error(e); return err(res, 500, String(e.message || e)); }
  }
  let body = {};
  try { const chunks = []; for await (const c of req) chunks.push(c); if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
  try {
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || String(body.password || '').length < 6) return err(res, 422, 'Password should be at least 6 characters.', 'weak_password');
      if ((await pool.query('select 1 from auth.users where lower(email) = $1', [email])).rowCount) return err(res, 422, 'User already registered', 'user_already_exists');
      const id = randomUUID();
      await pool.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, body.data || {}]);
      await pool.query('insert into auth.local_passwords values ($1, $2)', [id, hash(body.password)]);
      return send(res, 200, await session(await getUser(id)));
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      if (url.searchParams.get('grant_type') === 'password') {
        const r = (await pool.query('select u.id, u.email, u.raw_user_meta_data, p.hash from auth.users u join auth.local_passwords p on p.user_id = u.id where lower(u.email) = $1',
          [String(body.email || '').trim().toLowerCase()])).rows[0];
        if (!r || !check(String(body.password || ''), r.hash)) return err(res, 400, 'Invalid login credentials', 'invalid_credentials');
        return send(res, 200, await session(r));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const id = refresh.get(body.refresh_token);
        if (!id) return err(res, 400, 'Invalid Refresh Token', 'refresh_token_not_found');
        refresh.delete(body.refresh_token);
        return send(res, 200, await session(await getUser(id)));
      }
    }
    if (url.pathname === '/auth/v1/user') {
      const u = await fromBearer(req);
      if (!u) return err(res, 403, 'invalid JWT', 'bad_jwt');
      if (req.method === 'PUT') {
        if (body.password) await pool.query('update auth.local_passwords set hash = $2 where user_id = $1', [u.id, hash(body.password)]);
        if (body.data) await pool.query('update auth.users set raw_user_meta_data = raw_user_meta_data || $2 where id = $1', [u.id, body.data]);
        return send(res, 200, userJson(await getUser(u.id)));
      }
      return send(res, 200, userJson(u));
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);
    if (url.pathname === '/auth/v1/recover') return send(res, 200, {});
    err(res, 404, 'not found');
  } catch (e) { console.error(e); err(res, 500, String(e.message || e)); }
}).listen(port, () => console.log('local auth on', port));
