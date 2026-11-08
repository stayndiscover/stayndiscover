import { BASE } from './dict-base';

export const LANGS = ['fr', 'en', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: string): v is Lang => (LANGS as readonly string[]).includes(v);
const IDX: Record<Lang, number> = { fr: 0, en: 1, es: 2 };

// Textes ajoutés pour la vraie application (en plus de ceux de la maquette)
const EXTRA: Record<string, [string, string, string]> = {
  signup: ['Créer un compte', 'Create an account', 'Crear una cuenta'],
  haveAccount: ['J\'ai déjà un compte', 'I already have an account', 'Ya tengo una cuenta'],
  email: ['Adresse e-mail', 'Email address', 'Correo electrónico'],
  accTraveller: ['Voyageur', 'Traveller', 'Viajero'],
  accProvider: ['Prestataire (hébergeur, excursions…)', 'Partner (host, tours…)', 'Proveedor (alojamiento, excursiones…)'],
  pwdHint: ['8 caractères minimum', 'At least 8 characters', 'Mínimo 8 caracteres'],
  errLogin: ['E-mail ou mot de passe incorrect.', 'Wrong email or password.', 'Correo o contraseña incorrectos.'],
  errExists: ['Un compte existe déjà avec cet e-mail.', 'An account already exists with this email.', 'Ya existe una cuenta con este correo.'],
  errPwd: ['Le mot de passe doit faire au moins 8 caractères.', 'Password must be at least 8 characters.', 'La contraseña debe tener al menos 8 caracteres.'],
  errGeneric: ['Une erreur est survenue. Réessayez.', 'Something went wrong. Please try again.', 'Ha ocurrido un error. Inténtalo de nuevo.'],
  checkEmail: ['Compte créé : ouvrez l\'e-mail de confirmation que nous venons de vous envoyer.', 'Account created: open the confirmation email we just sent you.', 'Cuenta creada: abre el correo de confirmación que te enviamos.'],
  forgot: ['Mot de passe oublié ?', 'Forgot your password?', '¿Olvidaste tu contraseña?'],
  resetSent: ['Si un compte existe, un lien de réinitialisation a été envoyé.', 'If an account exists, a reset link has been sent.', 'Si existe una cuenta, se ha enviado un enlace.'],
  removeFav: ['Retirer des favoris', 'Remove from favourites', 'Quitar de favoritos'],
  inStayAlready: ['Déjà dans ce séjour', 'Already in this trip', 'Ya en este viaje'],
  chooseTrip: ['Séjour', 'Trip', 'Viaje'],
  favForTrip: ['Vos favoris pour ce séjour', 'Your favourites for this trip', 'Tus favoritos para este viaje'],
  otherFavs: ['Autres destinations', 'Other destinations', 'Otros destinos'],
  plannerSoon: ['Le planificateur automatique (calendrier, trajets, PDF) arrive à l\'étape suivante.', 'The automatic planner (calendar, travel times, PDF) comes in the next step.', 'El planificador automático (calendario, trayectos, PDF) llega en la siguiente etapa.'],
  payNotYet: ['Le paiement par carte sera activé dès que le compte Stripe de StaynDiscover sera relié.', 'Card payment will be enabled as soon as StaynDiscover\'s Stripe account is connected.', 'El pago con tarjeta se activará en cuanto se conecte la cuenta Stripe de StaynDiscover.'],
  recheck: ['Les disponibilités sont vérifiées à nouveau au moment du paiement.', 'Availability is checked again at payment time.', 'La disponibilidad se vuelve a comprobar al pagar.'],
  subtotal: ['Sous-total', 'Subtotal', 'Subtotal'],
  cleaning: ['Ménage', 'Cleaning', 'Limpieza'],
  adults: ['Adultes', 'Adults', 'Adultos'],
  children: ['Enfants', 'Children', 'Niños'],
  childPrice: ['enfant', 'child', 'niño'],
  noSlots: ['Aucun départ disponible ce jour-là.', 'No departure available that day.', 'No hay salidas ese día.'],
  pickDate: ['Choisissez une date', 'Pick a date', 'Elige una fecha'],
  busyNights: ['Nuits indisponibles', 'Unavailable nights', 'Noches no disponibles'],
  next60: ['sur les 60 prochains jours', 'over the next 60 days', 'en los próximos 60 días'],
  allFree: ['Toutes les nuits sont libres sur les 60 prochains jours.', 'Every night is free over the next 60 days.', 'Todas las noches están libres en los próximos 60 días.'],
  calChecked: ['Calendrier vérifié en direct', 'Calendar checked live', 'Calendario comprobado en directo'],
  seeOnMap: ['Voir sur la carte', 'See on the map', 'Ver en el mapa'],
  provider: ['Prestataire', 'Partner', 'Proveedor'],
  account: ['Mon compte', 'My account', 'Mi cuenta'],
  roleIs: ['Type de compte', 'Account type', 'Tipo de cuenta'],
  proSoon: ['L\'espace prestataire complet (annonces, calendriers, finances) arrive à l\'étape 4.', 'The full partner area (listings, calendars, finances) comes in step 4.', 'El área de proveedor completa llega en la etapa 4.'],
  adminSoon: ['Le tableau de bord d\'administration arrive à l\'étape 4.', 'The admin dashboard comes in step 4.', 'El panel de administración llega en la etapa 4.'],
  noBookings: ['Aucune réservation pour le moment.', 'No bookings yet.', 'Aún no hay reservas.'],
  invalidEmail: ['Adresse e-mail invalide.', 'Invalid email address.', 'Correo no válido.'],
  legalTitle: ['Informations légales', 'Legal information', 'Información legal'],
  remove: ['Retirer', 'Remove', 'Quitar'],
  tripSaved: ['Séjour enregistré', 'Trip saved', 'Viaje guardado'],
  startPlanning: ['Commencer avec mes favoris', 'Start with my favourites', 'Empezar con mis favoritos'],
  nights: ['nuits', 'nights', 'noches'],
  from: ['dès', 'from', 'desde'],
  perNightShort: ['nuit', 'night', 'noche'],
  min: ['min', 'min', 'min'],
  stepWord: ['Étape', 'Step', 'Etapa'],
  sendLink: ['Recevoir le lien', 'Send me the link', 'Recibir el enlace'],
  tripsOf: ['Séjours', 'Trips', 'Viajes'],
  noTripYet: ['Créez un séjour pour organiser vos favoris par destination et par dates.', 'Create a trip to organise your favourites by destination and dates.', 'Crea un viaje para organizar tus favoritos por destino y fechas.'],
  inThisTrip: ['Dans ce séjour', 'In this trip', 'En este viaje'],
  addThis: ['Ajouter au séjour', 'Add to trip', 'Añadir al viaje'],
  nothingAvailable: ['Plus disponible', 'No longer available', 'Ya no disponible'],
  stillAvailable: ['Disponible', 'Available', 'Disponible'],
  skip: ['Aller au contenu', 'Skip to content', 'Ir al contenido'],
  loginToSave: ['Connectez-vous pour enregistrer vos favoris.', 'Sign in to save favourites.', 'Inicia sesión para guardar favoritos.'],
  adultsShort: ['adulte(s)', 'adult(s)', 'adulto(s)'],
  childrenShort: ['enfant(s)', 'child(ren)', 'niño(s)'],
};

const DICT = { ...BASE, ...EXTRA };

export function t(lang: Lang, key: string, ...args: (string | number)[]) {
  const v = DICT[key];
  let s = v ? v[IDX[lang]] || v[0] : key;
  args.forEach((a, i) => (s = s.replace(`{${i}}`, String(a))));
  return s;
}
export const translator = (lang: Lang) => (key: string, ...args: (string | number)[]) => t(lang, key, ...args);

// Champ multilingue stocké en base : {"fr": "...", "en": "...", "es": "..."}
export type I18n = Partial<Record<Lang, string>> | null | undefined;
export const tr = (o: I18n, lang: Lang) => (o ? o[lang] || o.fr || '' : '');

export const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
export const money = (v: number | string | null | undefined, lang: Lang, currency = 'EUR') =>
  new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency, maximumFractionDigits: Number(v) % 1 ? 2 : 0 }).format(Number(v || 0));
export const fDate = (iso: string, lang: Lang, o?: Intl.DateTimeFormatOptions) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(LOCALE[lang], o || { weekday: 'short', day: 'numeric', month: 'short' });
export const durL = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
