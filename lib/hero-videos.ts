import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Vidéo de la bannière d'accueil pour une destination : il suffit de déposer
 * public/videos/<destination>.mp4 (par exemple public/videos/maroc.mp4) pour qu'elle remplace
 * l'animation de la photo. Sans fichier, la photo animée reste affichée.
 */
export function heroVideo(slug: string) {
  const file = path.join(process.cwd(), 'public', 'videos', `${slug}.mp4`);
  return existsSync(file) ? `/videos/${slug}.mp4` : null;
}
