import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap"><div className="empty-state" style={{ minHeight: '50vh', justifyContent: 'center' }}>
      <h1>Page introuvable · Page not found</h1>
      <Link className="btn" href="/">Accueil · Home</Link>
    </div></div>
  );
}
