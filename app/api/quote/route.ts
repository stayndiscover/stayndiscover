import { NextResponse } from 'next/server';
import { withDb, one, dbMessage } from '@/lib/db';

/** Devis d'un séjour, calculé par la base (tarifs saisonniers, séjour minimum, disponibilité réelle). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const unit = u.searchParams.get('unit') ?? '', start = u.searchParams.get('in') ?? '', end = u.searchParams.get('out') ?? '';
  const guests = Math.max(1, Number(u.searchParams.get('g')) || 1);
  if (!/^[0-9a-f-]{36}$/.test(unit) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'dates' }, { status: 400 });
  }
  try {
    const r = await withDb(null, async (db) => {
      const q = await one<{ q: { nights: number; lodging: number; cleaning: number; total: number } }>(db, 'select public.quote_stay($1, $2::date, $3::date, $4) as q', [unit, start, end, guests]);
      const a = await one<{ ok: boolean }>(db, 'select not exists (select 1 from public.get_unit_busy_nights($1, $2::date, $3::date)) as ok', [unit, start, end]);
      return { ...q!.q, available: !!a?.ok };
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: dbMessage(e) }, { status: 422 });
  }
}
