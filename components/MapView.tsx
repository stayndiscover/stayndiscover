'use client';
import { useEffect, useRef, useState } from 'react';

export type Pt = { lat: number; lng: number; label: string; title: string; href?: string };

declare global {
  interface Window { google?: any; __sdMaps?: Promise<void> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

function loadGoogle(key: string) {
  if (window.google?.maps) return Promise.resolve();
  window.__sdMaps ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('maps'));
    document.head.appendChild(s);
  });
  return window.__sdMaps;
}

const COLS = ['#0b6e63', '#e9a23b', '#b44d7a', '#2f4bd0', '#1f8a4c', '#c0392b', '#7a5af5', '#0e8f98'];

/** Carte Google Maps si une clé est configurée, sinon carte schématique (positions GPS réelles, sans fond de carte). */
export function MapView({ points, label, height = 380 }: { points: Pt[]; label: string; height?: number }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  useEffect(() => {
    if (!key || !ref.current || !pts.length) return;
    let cancelled = false;
    loadGoogle(key).then(() => {
      if (cancelled || !ref.current) return;
      const g = window.google.maps;
      const map = new g.Map(ref.current, { mapTypeControl: false, streetViewControl: false });
      const bounds = new g.LatLngBounds();
      pts.forEach((p) => {
        const m = new g.Marker({ position: { lat: p.lat, lng: p.lng }, map, label: p.label, title: p.title });
        if (p.href) m.addListener('click', () => { window.location.href = p.href!; });
        bounds.extend(m.getPosition());
      });
      if (pts.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(13); } else map.fitBounds(bounds, 40);
    }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [key, JSON.stringify(pts)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pts.length) return null;
  if (key && !failed) return <div ref={ref} className="gmap" style={{ height }} role="region" aria-label={label} />;

  // Carte schématique
  const la = pts.map((p) => p.lat), lo = pts.map((p) => p.lng);
  let mnA = Math.min(...la), mxA = Math.max(...la), mnO = Math.min(...lo), mxO = Math.max(...lo);
  const pad = Math.max(0.02, (mxA - mnA) * 0.15, (mxO - mnO) * 0.15);
  mnA -= pad; mxA += pad; mnO -= pad; mxO += pad;
  const W = 800, H = height, sc = Math.min(W / (mxO - mnO), H / (mxA - mnA));
  const ox = (W - (mxO - mnO) * sc) / 2, oy = (H - (mxA - mnA) * sc) / 2;
  const P = (p: Pt) => [ox + (p.lng - mnO) * sc, oy + (mxA - p.lat) * sc];
  return (
    <div className="mapbox">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <rect width={W} height={H} fill="#d6ebe7" />
        {Array.from({ length: W / 50 }, (_, i) => <path key={'x' + i} d={`M${i * 50} 0V${H}`} stroke="#c4dfda" />)}
        {Array.from({ length: Math.ceil(H / 50) }, (_, i) => <path key={'y' + i} d={`M0 ${i * 50}H${W}`} stroke="#c4dfda" />)}
        {pts.map((p, i) => {
          const [x, y] = P(p);
          const pin = (
            <g>
              <title>{p.title}</title>
              <circle cx={x} cy={y} r={14} fill={COLS[i % COLS.length]} stroke="#fff" strokeWidth={3} />
              <text x={x} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">{p.label}</text>
            </g>
          );
          return p.href ? <a key={i} href={p.href}>{pin}</a> : <g key={i}>{pin}</g>;
        })}
      </svg>
    </div>
  );
}
