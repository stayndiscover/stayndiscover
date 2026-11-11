import Link from 'next/link';
import { translator, tr, fDate, money, type I18n, type Lang } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';
import { WEEK, publicHref, type FullListing } from '@/lib/back';
import {
  saveListing, moderateListing, submitListing, deleteListing, uploadMedia, addVideo, deleteMedia, coverMedia,
  saveUnit, deleteUnit, addRate, deleteRate, addBlock, deleteBlock, saveSchedule, deleteSchedule, generateSlots, toggleSlot,
} from '@/app/back-actions';
import { ActionForm, statusPill } from './BackShell';

type Detail = FullListing & {
  media: { id: string; kind: string; storage_path: string; sort_order: number }[];
  units: { id: string; name: I18n; max_guests: number; base_price_night: string; cleaning_fee: string; min_nights: number; check_in_time: string; check_out_time: string; ical_export_token: string | null }[];
  rates: { id: string; unit_id: string; first: string; last: string; price_night: string; min_nights: number | null }[];
  blocks: { id: string; unit_id: string; first: string; last: string; source: string; note: string | null }[];
  schedules: { id: string; weekdays: number[]; start_time: string; duration_min: number; capacity: number; price_adult: string; price_child: string | null;
    child_max_age: number | null; meeting_point: string | null; valid_from: string | null; valid_to: string | null }[];
  slots: { id: string; starts_at: string; capacity: number; seats_reserved: number; status: string }[];
};
type Opts = { dests: { id: string; slug: string; name: I18n }[]; cats: { id: string; slug: string; type: string; name: I18n; parent_id: string | null }[];
  providers: { id: string; trade_name: string }[] };

const LANGS = [['fr', 'Français'], ['en', 'English'], ['es', 'Español']] as const;

/** Champs FR / EN / ES : le français est ouvert, les traductions repliées. */
function I18nField({ name, label, value, area = false, rows = 4, required = false }: { name: string; label: string; value?: I18n | Record<string, string[]>; area?: boolean; rows?: number; required?: boolean }) {
  const get = (l: string) => { const v = (value as Record<string, unknown> | undefined)?.[l]; return Array.isArray(v) ? v.join('\n') : (v as string | undefined) ?? ''; };
  return (
    <div className="i18n-field">
      <span className="lbl">{label}</span>
      {LANGS.map(([l, n]) => (
        <label key={l} className="f i18n-line"><span className="lang-tag">{l.toUpperCase()}</span>
          {area ? <textarea name={`${name}_${l}`} rows={rows} defaultValue={get(l)} aria-label={`${label} (${n})`} required={required && l === 'fr'} />
            : <input type="text" name={`${name}_${l}`} defaultValue={get(l)} aria-label={`${label} (${n})`} required={required && l === 'fr'} />}
        </label>
      ))}
    </div>
  );
}

export function ListingEditor({ lang, area, l, opts, path, me }: { lang: Lang; area: 'admin' | 'pro'; l: Detail | null; opts: Opts; path: string; me: { role: string } }) {
  const t = translator(lang);
  const admin = area === 'admin';
  const type = l?.type ?? '';
  const H = (d: string) => (l?.opening_hours?.[d] ?? []).map((r) => r.join('-')).join(', ');
  const cancel = (l?.cancellation_policy ?? {}) as unknown as { free_until_hours?: number; refund_pct_after?: number };
  const catOpts = (ty: string) => opts.cats.filter((c) => c.type === ty);
  const base = { lang, path };

  return (
    <div className="stack" style={{ gap: 22 }}>
      {/* ——— Statut et validation */}
      {l && (
        <section className="panel stack" id="statut">
          <div className="row between">
            <h2 style={{ fontSize: '1.2rem' }}>{t('mod_title')}</h2>
            <div className="row" style={{ gap: 8 }}>
              <span className={`pill ${statusPill(l.status)}`}>{t(`st_${l.status}`)}</span>
              {l.status === 'published' && <Link className="btn ghost sm" href={publicHref(lang, l)} target="_blank">{t('bo_view')} ↗</Link>}
            </div>
          </div>
          {l.moderation_note && <div className="notice"><b>{t('mod_lastNote')} :</b><br />{l.moderation_note.split('\n').map((x, i) => <span key={i}>{x}<br /></span>)}</div>}
          {admin ? (
            <form action={moderateListing} className="stack" style={{ gap: 10 }}>
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} /><input type="hidden" name="id" value={l.id} />
              <input type="hidden" name="anchor" value="statut" />
              <label className="f">{t('mod_note')}<textarea name="note" rows={2} /></label>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm" name="status" value="published">✓ {t('mod_publish')}</button>
                <button className="btn ghost sm" name="status" value="changes_requested">{t('mod_changes')}</button>
                <button className="btn ghost sm" name="status" value="refused">{t('mod_refuse')}</button>
                {l.status === 'published' && <button className="btn ghost sm" name="status" value="archived">{t('mod_archive')}</button>}
              </div>
            </form>
          ) : (l.status !== 'published' && l.status !== 'pending' && (
            <ActionForm action={submitListing} {...base} fields={{ id: l.id }} anchor="statut">
              <button className="btn sun">{t('pro_submit')}</button>
            </ActionForm>
          ))}
          {admin && (
            <div className="row" style={{ gap: 8 }}>
              <ActionForm action={moderateListing} {...base} fields={{ id: l.id, status: 'changes_requested', preset: 'mod_photosMsg' }} anchor="statut">
                <button className="btn ghost sm">📷 {t('mod_photos')}</button>
              </ActionForm>
              <ActionForm action={moderateListing} {...base} fields={{ id: l.id, status: l.status === 'published' ? 'published' : 'changes_requested', preset: 'mod_photoOfferMsg' }} anchor="statut">
                <button className="btn ghost sm">📸 {t('mod_photoOffer')}</button>
              </ActionForm>
            </div>
          )}
        </section>
      )}

      {/* ——— Fiche */}
      <form action={saveListing} className="panel stack" id="fiche" style={{ gap: 18 }}>
        <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
        <input type="hidden" name="id" value={l?.id ?? ''} />
        <h2 style={{ fontSize: '1.2rem' }}>{t('ed_general')}</h2>
        <div className="form">
          {!l && (
            <label className="f">{t('bo_type')}<select name="type" required defaultValue="">
              <option value="" disabled>—</option>
              <option value="hebergement">{t('bo_typeHeb')}</option><option value="excursion">{t('bo_typeExc')}</option>
              {admin && <option value="lieu">{t('bo_typeLieu')}</option>}
            </select></label>
          )}
          <label className="f">{t('bo_dests').replace(/s$/, '')}<select name="destination_id" required defaultValue={l?.destination_id ?? ''}>
            <option value="" disabled>—</option>
            {opts.dests.map((d) => <option key={d.id} value={d.id}>{tr(d.name, lang)}</option>)}
          </select></label>
          <label className="f">{t('bo_cats').replace(/s$/, '').replace(/ías$/, 'ía')}<select name="category_id" required defaultValue={l?.category_id ?? ''}>
            <option value="" disabled>—</option>
            {(l ? [type] : admin ? ['hebergement', 'excursion', 'lieu'] : ['hebergement', 'excursion']).map((ty) => (
              <optgroup key={ty} label={t(ty === 'hebergement' ? 'bo_typeHeb' : ty === 'excursion' ? 'bo_typeExc' : 'bo_typeLieu')}>
                {catOpts(ty).map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{tr(c.name, lang)}</option>)}
              </optgroup>
            ))}
          </select></label>
          {admin && (
            <label className="f">{t('bo_provider')}<select name="provider_id" defaultValue={l?.provider_id ?? ''}>
              <option value="">{t('bo_noProvider')}</option>
              {opts.providers.map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
            </select></label>
          )}
        </div>
        <I18nField name="title" label={t('ed_title')} value={l?.title} required />
        <I18nField name="summary" label={t('ed_summary')} value={l?.summary} area rows={2} />
        <I18nField name="description" label={t('ed_desc')} value={l?.description} area rows={6} />
        <label className="f">{t('ed_slug')}<input type="text" name="slug" defaultValue={l?.slug ?? ''} pattern="[a-z0-9-]*" /></label>

        <h2 style={{ fontSize: '1.2rem' }} id="localisation">{t('ed_location')}</h2>
        <p className="small muted">{t('ed_locHelp')}</p>
        <div className="form">
          <label className="f" style={{ gridColumn: '1 / -1' }}>{t('ed_address')}<input type="text" name="address" defaultValue={l?.address ?? ''} /></label>
          <label className="f">{t('ed_lat')}<input type="text" inputMode="decimal" name="lat" defaultValue={l?.lat ?? ''} placeholder="14.4697" /></label>
          <label className="f">{t('ed_lng')}<input type="text" inputMode="decimal" name="lng" defaultValue={l?.lng ?? ''} placeholder="-60.8653" /></label>
          <label className="f">{t('ed_gmaps')}<input type="url" name="google_maps_url" defaultValue={l?.google_maps_url ?? ''} placeholder="https://maps.google.com/…" /></label>
          <label className="f">{t('ed_place')}<input type="text" name="google_place_id" defaultValue={l?.google_place_id ?? ''} /></label>
        </div>

        <h2 style={{ fontSize: '1.2rem' }}>{t('ed_practical')}</h2>
        <div className="form">
          <label className="f">{t('ed_price')}<input type="number" step="0.01" min="0" name="price_from" defaultValue={l?.price_from ?? ''} /></label>
          <label className="f">{t('ed_minutes')}<input type="number" min="0" name="visit_minutes" defaultValue={l?.visit_minutes ?? ''} /></label>
          <label className="f">{t('ed_access')}<input type="text" name="accessibility" defaultValue={l?.accessibility ?? ''} /></label>
          <label className="row small" style={{ gap: 8, alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" name="booking_required" defaultChecked={l?.booking_required ?? false} /> {t('ed_bookReq')}</label>
        </div>
        <I18nField name="best_period" label={t('ed_best')} value={l?.best_period} />
        <I18nField name="tips" label={t('ed_tips')} value={l?.tips} area rows={2} />
        <I18nField name="highlights" label={t('ed_highlights')} value={l?.highlights} area rows={3} />
        {(type !== 'lieu' || !l) && (
          <>
            <I18nField name="conditions" label={t('ed_conditions')} value={l?.conditions} area rows={2} />
            <fieldset className="form" style={{ border: 0, padding: 0 }}>
              <legend className="lbl">{t('ed_cancel')}</legend>
              <label className="f">{lang === 'fr' ? 'Annulation gratuite jusqu\'à (heures avant)' : lang === 'es' ? 'Cancelación gratuita hasta (horas antes)' : 'Free cancellation until (hours before)'}
                <input type="number" min="0" name="cancel_free_hours" defaultValue={cancel.free_until_hours ?? ''} /></label>
              <label className="f">{lang === 'fr' ? 'Remboursement après ce délai (%)' : lang === 'es' ? 'Reembolso después (%)' : 'Refund after that (%)'}
                <input type="number" min="0" max="100" name="cancel_refund_pct" defaultValue={cancel.refund_pct_after ?? ''} /></label>
            </fieldset>
          </>
        )}
        <fieldset className="stack" style={{ border: 0, padding: 0, gap: 8 }}>
          <legend className="lbl">{t('ed_hours')} <span className="small muted">({t('ed_hoursHelp')})</span></legend>
          <div className="hours-grid">
            {WEEK.map((d, i) => (
              <label key={d} className="f">{t(`wd_${(i + 1) % 7}`)}<input type="text" name={`h_${d}`} defaultValue={H(d)} placeholder="09:00-17:00" /></label>
            ))}
          </div>
        </fieldset>
        <button className="btn" style={{ alignSelf: 'flex-start' }}>{t('bo_save')}</button>
      </form>

      {!l && <p className="small muted">{t('ed_saveFirst')}</p>}

      {/* ——— Photos et vidéos */}
      {l && (
        <section className="panel stack" id="photos">
          <h2 style={{ fontSize: '1.2rem' }}>{t('ed_media')}</h2>
          <p className="small muted">{t('ed_mediaHelp')}</p>
          {l.media.length > 0 && (
            <ul className="media-grid">
              {l.media.map((m, i) => (
                <li key={m.id}>
                  {m.kind === 'photo'
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={storageUrl('listing-media', m.storage_path)} alt="" loading="lazy" />
                    : <a href={m.storage_path} target="_blank" rel="noreferrer" className="media-video">▶ {m.storage_path.replace(/^https:\/\//, '').slice(0, 40)}</a>}
                  <div className="row" style={{ gap: 6 }}>
                    {i === 0 && m.kind === 'photo' ? <span className="pill">★</span>
                      : m.kind === 'photo' && <ActionForm action={coverMedia} {...base} fields={{ id: l.id, media: m.id }} anchor="photos"><button className="btn ghost sm">{t('ed_first')}</button></ActionForm>}
                    <ActionForm action={deleteMedia} {...base} fields={{ id: l.id, media: m.id }} anchor="photos"><button className="btn ghost sm" aria-label={t('bo_delete')}>✕</button></ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form action={uploadMedia} className="row" style={{ gap: 10 }}>
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} /><input type="hidden" name="id" value={l.id} />
            <input type="hidden" name="anchor" value="photos" />
            <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required aria-label={t('ed_upload')} />
            <button className="btn sm">{t('ed_upload')}</button>
          </form>
          <ActionForm action={addVideo} {...base} fields={{ id: l.id }} anchor="photos" className="row">
            <input type="url" name="url" placeholder="https://youtu.be/…" aria-label={t('ed_video')} required style={{ maxWidth: 360 }} />
            <button className="btn ghost sm">{t('ed_addVideo')}</button>
          </ActionForm>
        </section>
      )}

      {/* ——— Hébergement : logements, tarifs, fermetures */}
      {l && type === 'hebergement' && (
        <section className="panel stack" id="logements">
          <h2 style={{ fontSize: '1.2rem' }}>{t('ed_units')}</h2>
          {[...l.units, null].map((u) => (
            <div key={u?.id ?? 'new'} className="unit-box stack" style={{ gap: 12 }}>
              <ActionForm action={saveUnit} {...base} fields={{ id: l.id, unit: u?.id ?? '' }} anchor="logements" className="stack">
                {!u && <h3 style={{ fontSize: '1rem' }}>+ {t('ed_addUnit')}</h3>}
                <div className="form">
                  {LANGS.map(([lg]) => <label key={lg} className="f">{t('ed_unitName')} ({lg.toUpperCase()})<input type="text" name={`uname_${lg}`} defaultValue={(u?.name as Record<string, string> | undefined)?.[lg] ?? ''} required={lg === 'fr'} /></label>)}
                  <label className="f">{t('ed_maxGuests')}<input type="number" min="1" name="max_guests" defaultValue={u?.max_guests ?? 2} /></label>
                  <label className="f">{t('ed_night')}<input type="number" step="0.01" min="0" name="base_price_night" defaultValue={u?.base_price_night ?? ''} required /></label>
                  <label className="f">{t('ed_cleaning')}<input type="number" step="0.01" min="0" name="cleaning_fee" defaultValue={u?.cleaning_fee ?? 0} /></label>
                  <label className="f">{t('ed_minNights')}<input type="number" min="1" name="min_nights" defaultValue={u?.min_nights ?? 1} /></label>
                  <label className="f">{t('ed_checkin')}<input type="time" name="check_in_time" defaultValue={u?.check_in_time ?? '16:00'} /></label>
                  <label className="f">{t('ed_checkout')}<input type="time" name="check_out_time" defaultValue={u?.check_out_time ?? '11:00'} /></label>
                </div>
                <div className="row"><button className="btn sm">{u ? t('bo_save') : t('bo_add')}</button></div>
              </ActionForm>
              {u && (
                <>
                  {u.ical_export_token && <p className="small muted">{t('ed_ical')} : <code className="copy">{`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/ical/${u.ical_export_token}.ics`}</code></p>}
                  <details>
                    <summary className="small"><b>{t('ed_season')}</b> ({l.rates.filter((r) => r.unit_id === u.id).length})</summary>
                    <ul className="plain small">{l.rates.filter((r) => r.unit_id === u.id).map((r) => (
                      <li key={r.id} className="row" style={{ gap: 8 }}>{fDate(r.first, lang)} → {fDate(r.last, lang)} · {money(r.price_night, lang)}{r.min_nights ? ` · ${r.min_nights} n. min.` : ''}
                        <ActionForm action={deleteRate} {...base} fields={{ rate: r.id }} anchor="logements"><button className="btn ghost sm" aria-label={t('bo_delete')}>✕</button></ActionForm></li>))}
                    </ul>
                    <ActionForm action={addRate} {...base} fields={{ unit: u.id }} anchor="logements" className="row">
                      <label className="f">{t('ed_from')}<input type="date" name="from" required /></label>
                      <label className="f">{t('ed_to')}<input type="date" name="to" required /></label>
                      <label className="f">{t('ed_night')}<input type="number" step="0.01" min="0" name="price_night" required /></label>
                      <label className="f">{t('ed_minNights')}<input type="number" min="1" name="rate_min_nights" /></label>
                      <button className="btn ghost sm" style={{ alignSelf: 'end' }}>{t('bo_add')}</button>
                    </ActionForm>
                  </details>
                  <details open={l.blocks.some((b) => b.unit_id === u.id)}>
                    <summary className="small"><b>{t('ed_closures')}</b> ({l.blocks.filter((b) => b.unit_id === u.id).length})</summary>
                    <ul className="plain small">{l.blocks.filter((b) => b.unit_id === u.id).map((b) => (
                      <li key={b.id} className="row" style={{ gap: 8 }}>{fDate(b.first, lang)} → {fDate(b.last, lang)} <span className="pill grey">{b.source}</span> {b.note}
                        {b.source === 'manual' && <ActionForm action={deleteBlock} {...base} fields={{ block: b.id }} anchor="logements"><button className="btn ghost sm" aria-label={t('bo_delete')}>✕</button></ActionForm>}</li>))}
                    </ul>
                    <ActionForm action={addBlock} {...base} fields={{ unit: u.id }} anchor="logements" className="row">
                      <label className="f">{t('ed_from')}<input type="date" name="from" required /></label>
                      <label className="f">{t('ed_to')}<input type="date" name="to" required /></label>
                      <label className="f">{t('ed_note')}<input type="text" name="note" /></label>
                      <button className="btn ghost sm" style={{ alignSelf: 'end' }}>{t('ed_closeDates')}</button>
                    </ActionForm>
                  </details>
                  <ActionForm action={deleteUnit} {...base} fields={{ unit: u.id }} anchor="logements" confirm={t('bo_confirmDel')} className="row">
                    <button className="btn ghost sm">{t('bo_delete')}</button>
                  </ActionForm>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ——— Excursion : horaires et départs */}
      {l && type === 'excursion' && (
        <section className="panel stack" id="horaires">
          <h2 style={{ fontSize: '1.2rem' }}>{t('ed_schedules')}</h2>
          {l.schedules.length > 0 && (
            <div className="tablewrap"><table><thead><tr><th>{t('ed_days')}</th><th>{t('ed_start')}</th><th>{t('ed_duration')}</th><th>{t('ed_capacity')}</th>
              <th>{t('ed_adult')}</th><th>{t('ed_child')}</th><th>{t('ed_meeting')}</th><th /></tr></thead>
              <tbody>{l.schedules.map((s) => (
                <tr key={s.id}><td>{s.weekdays.map((d) => t(`wd_${d}`)).join(' ')}</td><td>{s.start_time}</td><td>{s.duration_min}</td><td>{s.capacity}</td>
                  <td className="num">{money(s.price_adult, lang)}</td><td className="num">{s.price_child ? money(s.price_child, lang) : '—'}</td><td>{s.meeting_point}</td>
                  <td><ActionForm action={deleteSchedule} {...base} fields={{ schedule: s.id }} anchor="horaires"><button className="btn ghost sm" aria-label={t('bo_delete')}>✕</button></ActionForm></td></tr>))}
              </tbody></table></div>
          )}
          <ActionForm action={saveSchedule} {...base} fields={{ id: l.id }} anchor="horaires" className="stack">
            <h3 style={{ fontSize: '1rem' }}>+ {t('ed_addSchedule')}</h3>
            <div className="chips" role="group" aria-label={t('ed_days')}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <label key={d} className="chip"><input type="checkbox" name="weekdays" value={d} defaultChecked={d !== 0} /> {t(`wd_${d}`)}</label>)}
            </div>
            <div className="form">
              <label className="f">{t('ed_start')}<input type="time" name="start_time" required defaultValue="09:00" /></label>
              <label className="f">{t('ed_duration')}<input type="number" min="15" name="duration_min" defaultValue={180} /></label>
              <label className="f">{t('ed_capacity')}<input type="number" min="1" name="capacity" defaultValue={12} /></label>
              <label className="f">{t('ed_adult')}<input type="number" step="0.01" min="0" name="price_adult" required /></label>
              <label className="f">{t('ed_child')}<input type="number" step="0.01" min="0" name="price_child" /></label>
              <label className="f">{t('ed_childAge')}<input type="number" min="0" max="17" name="child_max_age" defaultValue={11} /></label>
              <label className="f" style={{ gridColumn: '1 / -1' }}>{t('ed_meeting')}<input type="text" name="meeting_point" /></label>
              <label className="f">{t('ed_validFrom')}<input type="date" name="valid_from" /></label>
              <label className="f">{t('ed_validTo')}<input type="date" name="valid_to" /></label>
            </div>
            <div className="row"><button className="btn sm">{t('bo_add')}</button></div>
          </ActionForm>
          <div className="row between">
            <h3 style={{ fontSize: '1rem' }}>{t('ed_slots')}</h3>
            {l.schedules.length > 0 && <ActionForm action={generateSlots} {...base} fields={{ id: l.id }} anchor="horaires"><button className="btn ghost sm">{t('ed_genSlots')}</button></ActionForm>}
          </div>
          {l.slots.length ? (
            <ul className="plain small slots-list">{l.slots.map((s) => (
              <li key={s.id} className="row" style={{ gap: 8 }}>
                <span>{fDate(s.starts_at, lang)} {s.starts_at.slice(11)}</span>
                <span className="muted">{s.capacity - s.seats_reserved}/{s.capacity} {t('ed_left')}</span>
                {s.status !== 'open' && <span className="pill grey">{s.status}</span>}
                <ActionForm action={toggleSlot} {...base} fields={{ slot: s.id, to: s.status === 'open' ? 'closed' : 'open' }} anchor="horaires">
                  <button className="btn ghost sm">{s.status === 'open' ? t('ed_close') : t('ed_reopen')}</button></ActionForm>
              </li>))}
            </ul>
          ) : <p className="small muted">{t('bo_none')}</p>}
        </section>
      )}

      {/* ——— Suppression (administration) */}
      {l && admin && me.role === 'admin' && (
        <section className="panel stack">
          <ActionForm action={deleteListing} {...base} fields={{ id: l.id }} confirm={t('bo_confirmDel')} className="row">
            <button className="btn danger sm">{t('bo_delete')}</button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
