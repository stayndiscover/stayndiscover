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
  payNotYet: ['Le paiement par carte sera activé dès que le compte Stripe de StayNdiscover sera relié.', 'Card payment will be enabled as soon as StayNdiscover\'s Stripe account is connected.', 'El pago con tarjeta se activará en cuanto se conecte la cuenta Stripe de StayNdiscover.'],
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
  seoHomeTitle: ['StayNdiscover · Séjours en Martinique, au Belize et au Maroc', 'StayNdiscover · Trips to Martinique, Belize and Morocco', 'StayNdiscover · Viajes a Martinica, Belice y Marruecos'],
  seoHomeDesc: ['Hébergements, excursions et bonnes adresses en Martinique, au Belize et au Maroc. Disponibilités en direct, paiement sécurisé et planning de séjour.', 'Stays, tours and local gems in Martinique, Belize and Morocco. Live availability, secure payment and a ready-made trip itinerary.', 'Alojamientos, excursiones y buenos sitios en Martinica, Belice y Marruecos. Disponibilidad en directo, pago seguro y planning del viaje.'],
  seoDestsDesc: ['Martinique, Belize, Maroc : hébergements, excursions, plages, randonnées et incontournables sélectionnés pour préparer votre voyage.', 'Martinique, Belize, Morocco: hand-picked stays, tours, beaches, hikes and must-sees to plan your trip.', 'Martinica, Belice, Marruecos: alojamientos, excursiones, playas, senderos e imprescindibles para preparar tu viaje.'],
  seoDestTitle: ['{0} : hébergements, excursions et incontournables', '{0}: stays, tours and must-sees', '{0}: alojamientos, excursiones e imprescindibles'],
  seoDestDesc: ['Préparez votre voyage {0} : {1} hébergements, excursions et lieux à découvrir, disponibilités en direct, réservation en ligne et planificateur de séjour.', 'Plan your trip to {0}: {1} stays, tours and places to discover, live availability, online booking and a trip planner.', 'Prepara tu viaje a {0}: {1} alojamientos, excursiones y lugares, disponibilidad en directo, reserva online y planificador.'],
  seoListDesc: ['{0} : comparez les prix, vérifiez les disponibilités en direct et réservez en ligne.', '{0}: compare prices, check live availability and book online.', '{0}: compara precios, consulta la disponibilidad en directo y reserva online.'],
  inDest: ['en {0}', 'in {0}', 'en {0}'],
  seoBookOnline: ['Réservation en ligne', 'Book online', 'Reserva online'],
  seoFree: ['Accès libre', 'Free access', 'Acceso libre'],
  followIg: ['Suivez StayNdiscover sur Instagram', 'Follow StayNdiscover on Instagram', 'Sigue a StayNdiscover en Instagram'],
  pwTitle: ['Continuez à planifier votre séjour', 'Keep planning your trip', 'Sigue planificando tu viaje'],
  pwText: ['L\'essai gratuit vous permet d\'ajouter jusqu\'à {0} activités par séjour. Pour aller plus loin, débloquez le planificateur pour ce séjour :', 'The free trial lets you add up to {0} activities per trip. To go further, unlock the planner for this trip:', 'La prueba gratuita permite añadir hasta {0} actividades por viaje. Para ir más allá, desbloquea el planificador para este viaje:'],
  pwB1: ['Activités, restaurants et lieux en nombre illimité', 'Unlimited activities, restaurants and places', 'Actividades, restaurantes y lugares ilimitados'],
  pwB2: ['Vos journées organisées automatiquement : horaires d\'ouverture, réservations et trajets', 'Your days organised automatically: opening hours, bookings and travel times', 'Tus días organizados automáticamente: horarios, reservas y trayectos'],
  pwB3: ['Votre itinéraire jour par jour, à télécharger en PDF', 'Your day-by-day itinerary, as a PDF download', 'Tu itinerario día a día, en PDF'],
  pwKeep: ['Votre sélection est conservée : rien n\'est perdu.', 'Your selection is kept: nothing is lost.', 'Tu selección se conserva: no se pierde nada.'],
  pwOnce: ['paiement unique pour ce séjour', 'one-off payment for this trip', 'pago único para este viaje'],
  pwBtn: ['Débloquer pour {0}', 'Unlock for {0}', 'Desbloquear por {0}'],
  pwLater: ['Plus tard', 'Later', 'Más tarde'],
  pwPending: ['Votre demande est enregistrée. Le paiement en ligne ouvre très bientôt et votre sélection reste dans votre séjour.', 'Your request is saved. Online payment opens very soon and your selection stays in your trip.', 'Tu solicitud está registrada. El pago online abrirá muy pronto y tu selección sigue en tu viaje.'],
  pwDone: ['Planificateur débloqué pour ce séjour. Bon voyage !', 'Planner unlocked for this trip. Enjoy!', 'Planificador desbloqueado para este viaje. ¡Buen viaje!'],
  trialBadge: ['Essai gratuit : {0}/{1} activités', 'Free trial: {0}/{1} activities', 'Prueba gratuita: {0}/{1} actividades'],
  unlockedBadge: ['Planificateur débloqué', 'Planner unlocked', 'Planificador desbloqueado'],
  planDays: ['Organiser mes journées automatiquement', 'Organise my days automatically', 'Organizar mis días automáticamente'],
  unlockCta: ['Débloquer le planificateur · {0}', 'Unlock the planner · {0}', 'Desbloquear el planificador · {0}'],
  close: ['Fermer', 'Close', 'Cerrar'],
  reset: ['Effacer les filtres', 'Clear filters', 'Borrar filtros'],
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
