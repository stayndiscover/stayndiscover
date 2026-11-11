import { withDb, one } from '@/lib/db';

/** Calendrier d'un logement au format iCal, à coller dans Airbnb ou Booking (« importer un calendrier »). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clean)) return new Response('Not found', { status: 404 });
  const r = await withDb(null, (db) => one<{ v: string | null }>(db, 'select public.ical_feed($1) as v', [clean]));
  if (!r?.v) return new Response('Not found', { status: 404 });
  return new Response(r.v, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } });
}
