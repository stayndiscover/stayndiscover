// Illustrations générées (reprises de la maquette), affichées tant qu'une fiche n'a pas encore de photo.
const PAL: Record<string, Record<string, string>> = {
  tropic: { s1: '#78cfe0', s2: '#eaf8f3', sea: '#0e8f98', sea2: '#0a6f78', l1: '#2f7d4a', l2: '#1d5a36', sun: '#ffd477', sand: '#f3e2bd' },
  reef: { s1: '#9ee6df', s2: '#f3fcf8', sea: '#17b5b0', sea2: '#0b8b94', l1: '#3f9152', l2: '#25693b', sun: '#fff0a6', sand: '#f7ecd2' },
  desert: { s1: '#f3b77c', s2: '#fde9cf', sea: '#e0995a', sea2: '#c97842', l1: '#b8603a', l2: '#86402a', sun: '#fff3c9', sand: '#efc48d' },
};
const MOTIF: Record<string, string> = {
  villa: 'house', maison: 'house', appartement: 'city', studio: 'city', riad: 'arch', bungalow: 'palm', 'chambre-hotes': 'house',
  hotel: 'city', 'location-saisonniere': 'house', bateau: 'boat', nautique: 'boat', plongee: 'fish', dauphins: 'fish',
  'randonnee-guidee': 'mountain', 'visite-guidee': 'arch', culture: 'arch', sport: 'mountain', 'experience-locale': 'plate',
  restaurant: 'plate', plage: 'sea', randonnee: 'mountain', 'site-attraction': 'arch', marche: 'market', 'point-de-vue': 'mountain', 'spot-photo': 'sea',
};
const DEST_PAL: Record<string, string> = { martinique: 'tropic', belize: 'reef', maroc: 'desert' };
export const palFor = (destSlug: string, theme?: { pal?: string }) => theme?.pal || DEST_PAL[destSlug] || 'tropic';

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

export function art(palKey: string, catSlug: string, seedStr: string) {
  const motif = MOTIF[catSlug] || 'sea';
  const P = PAL[palKey] || PAL.tropic, h = hash(seedStr || 'x'), r = (n: number) => ((h >> n) & 255) / 255;
  const sx = 60 + r(2) * 280, sy = 50 + r(5) * 40, uid = 'g' + h;
  let s = `<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.s1}"/><stop offset="1" stop-color="${P.s2}"/></linearGradient></defs><rect width="400" height="250" fill="url(#${uid})"/><circle cx="${sx}" cy="${sy}" r="${22 + r(8) * 14}" fill="${P.sun}" opacity=".95"/>`;
  const hill = (y: number, amp: number, c: string, ph: number) => { let d = `M0 ${y}`; for (let x = 0; x <= 400; x += 40) d += ` Q${x + 20} ${y - amp * Math.sin((x + ph) / 60) - amp} ${x + 40} ${y - amp * Math.cos((x + ph) / 80)}`; return `<path d="${d} L400 250 L0 250Z" fill="${c}"/>`; };
  if (palKey === 'desert' && !['arch', 'plate', 'market'].includes(motif)) {
    s += `<path d="M0 150 L70 95 L120 130 L190 70 L260 125 L330 85 L400 130 L400 250 L0 250Z" fill="#c9a08a" opacity=".55"/><path d="M180 78 L190 70 L200 80 Z" fill="#fff"/>`;
    s += hill(185, 14, P.sea, h % 90) + hill(215, 10, P.sea2, h % 70);
  } else if (motif === 'mountain') {
    s += `<path d="M0 170 L90 ${70 + r(3) * 20} L150 130 L230 ${50 + r(6) * 20} L320 140 L400 100 L400 250 L0 250Z" fill="${P.l2}"/><path d="M0 200 L120 140 L210 185 L300 135 L400 190 L400 250 L0 250Z" fill="${P.l1}"/>`;
  } else {
    s += hill(140, 12, P.l2, h % 100) + `<rect y="160" width="400" height="90" fill="${P.sea}"/><rect y="200" width="400" height="50" fill="${P.sea2}"/>`;
    for (let i = 0; i < 5; i++) s += `<path d="M${(i * 90 + (h % 60)) % 400} ${175 + i * 13} q10 -5 20 0 t20 0" stroke="#fff" stroke-opacity=".45" fill="none" stroke-width="2"/>`;
    if (['sea', 'palm', 'house'].includes(motif)) s += `<path d="M0 205 Q120 185 230 210 T400 200 L400 250 L0 250Z" fill="${P.sand}"/>`;
  }
  if (motif === 'palm' || motif === 'sea') { const px = 40 + r(4) * 80; s += `<path d="M${px} 215 Q${px + 8} 160 ${px + 22} 120" stroke="#5a3d22" stroke-width="5" fill="none"/>`; for (let a = 0; a < 6; a++) { const an = a * 1.05; s += `<path d="M${px + 22} 120 q${Math.cos(an) * 30} ${-12 + Math.sin(an) * 14} ${Math.cos(an) * 55} ${8 + Math.sin(an) * 22}" stroke="${P.l2}" stroke-width="6" fill="none" stroke-linecap="round"/>`; } }
  if (motif === 'boat') { const bx = 120 + r(3) * 150; s += `<path d="M${bx} 180 h70 l-12 14 h-48z" fill="#fff"/><path d="M${bx + 34} 178 V110 L${bx + 66} 172Z" fill="#fff" opacity=".95"/><path d="M${bx + 30} 178 V118 L${bx + 6} 172Z" fill="${P.sun}"/>`; }
  if (motif === 'fish') { for (let i = 0; i < 4; i++) { const fx = 60 + i * 80 + r(i) * 20, fy = 205 + (i % 2) * 18; s += `<path d="M${fx} ${fy} q14 -10 28 0 q-14 10 -28 0z M${fx + 28} ${fy} l10 -7 v14z" fill="${i % 2 ? P.sun : '#ff8a65'}"/>`; } s += `<path d="M300 250 q5 -40 -8 -60 M320 250 q-2 -30 14 -48" stroke="#ff7d6e" stroke-width="7" fill="none" stroke-linecap="round"/>`; }
  if (motif === 'house') { const hx = 200 + r(3) * 80; s += `<rect x="${hx}" y="135" width="90" height="55" fill="#fff8ec"/><path d="M${hx - 10} 138 L${hx + 45} 104 L${hx + 100} 138Z" fill="#b5523a"/><rect x="${hx + 36}" y="158" width="18" height="32" fill="${P.l2}"/><rect x="${hx + 10}" y="150" width="16" height="14" fill="${P.sea}"/><rect x="${hx + 64}" y="150" width="16" height="14" fill="${P.sea}"/>`; }
  if (motif === 'city') { for (let i = 0; i < 6; i++) { const bx = 40 + i * 58, bh = 50 + r(i + 2) * 60; s += `<rect x="${bx}" y="${160 - bh}" width="46" height="${bh}" fill="${i % 2 ? '#fff4e4' : '#f6dfc4'}"/><rect x="${bx + 8}" y="${170 - bh}" width="10" height="10" fill="${P.sea2}" opacity=".7"/><rect x="${bx + 26}" y="${170 - bh}" width="10" height="10" fill="${P.sea2}" opacity=".7"/>`; } }
  if (motif === 'arch') { s += `<rect width="400" height="250" fill="${palKey === 'desert' ? '#c8673f' : P.l2}" opacity=".92"/><path d="M120 250 V120 Q120 50 200 40 Q280 50 280 120 V250Z" fill="url(#${uid})"/><path d="M120 250 V120 Q120 50 200 40 Q280 50 280 120 V250" fill="none" stroke="#f6e2c2" stroke-width="10"/><rect x="150" y="190" width="100" height="60" fill="#2f4bd0" opacity=".85"/>`; for (let i = 0; i < 8; i++) s += `<rect x="${i * 50}" y="236" width="25" height="14" fill="${i % 2 ? '#2f4bd0' : '#f6e2c2'}"/>`; }
  if (motif === 'plate') { s += `<rect width="400" height="250" fill="${palKey === 'desert' ? '#7a3b25' : '#2b5d4a'}"/><circle cx="200" cy="125" r="88" fill="#f6efe2"/><circle cx="200" cy="125" r="64" fill="${palKey === 'desert' ? '#d9894a' : '#f1b24a'}"/><circle cx="180" cy="110" r="14" fill="${P.l1}"/><circle cx="222" cy="140" r="12" fill="#c0392b"/><circle cx="210" cy="100" r="9" fill="#fff3c9"/><rect x="310" y="40" width="8" height="170" rx="4" fill="#d9c7a6"/>`; }
  if (motif === 'market') { s += `<rect width="400" height="250" fill="${palKey === 'desert' ? '#a5532f' : '#1f5c48'}"/>`; const cs = ['#e9a23b', '#c0392b', '#2f4bd0', '#1f8a4c', '#f3e2bd']; for (let i = 0; i < 5; i++) { s += `<path d="M${i * 80} 70 h80 l-10 30 h-60z" fill="${cs[i]}"/><rect x="${i * 80 + 12}" y="100" width="56" height="70" fill="#f6e2c2" opacity=".5"/>`; for (let j = 0; j < 4; j++) s += `<circle cx="${i * 80 + 22 + j * 12}" cy="${180 + (j % 2) * 8}" r="7" fill="${cs[(i + j + 1) % 5]}"/>`; } }
  return s + '</svg>';
}
