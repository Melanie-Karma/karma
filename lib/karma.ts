// Gemeinsame Konstanten, Typen und Helfer für die App (Stufe 2)

export type Gender = "female" | "male";
export type CategoryId =
  | "shopping"
  | "carrying"
  | "tech"
  | "home"
  | "company"
  | "escort"
  | "pets"
  | "tools"
  | "lend"
  | "ride"
  | "community"
  | "other";

export type Kind = "request" | "offer";

export type Category = {
  id: CategoryId;
  label: string;
  emoji: string;
  /** Textvorlagen für Anfragen */
  templates: string[];
  /** Textvorlagen für Angebote */
  offerTemplates?: string[];
  /** Geht auch per Telefon oder Video */
  remoteOk: boolean;
  /** Hinweis zum Schlüssel anzeigen */
  keyHint?: boolean;
  /** Kurzer Pflichthinweis im Formular und im Detail */
  note?: string;
};

export const CATEGORIES: Category[] = [
  {
    id: "shopping",
    label: "Einkauf & Besorgung",
    emoji: "🛒",
    templates: ["Einkauf erledigen", "Medikamente in der Apotheke abholen", "Paket abholen"],
    offerTemplates: ["Ich nehme Einkäufe mit", "Ich hole Pakete ab"],
    remoteOk: false,
  },
  {
    id: "carrying",
    label: "Tragen & Umzug",
    emoji: "📦",
    templates: ["Umzug: helfende Hände gesucht", "Möbel tragen", "Getränkekisten hochtragen"],
    offerTemplates: ["Ich helfe beim Tragen", "Ich habe einen Transporter"],
    remoteOk: false,
  },
  {
    id: "ride",
    label: "Mitfahren",
    emoji: "🚗",
    templates: ["Mitfahrt zum Arzt", "Mitfahrt zum Bahnhof", "Mitfahrt zum Einkaufen"],
    offerTemplates: ["Ich fahre nach Potsdam, ein Platz ist frei", "Ich nehme dich zum Einkaufen mit"],
    remoteOk: false,
    note: "Mitfahren ist kostenlos wie alles bei Karma. Über die App fließt kein Geld. Was ihr privat untereinander ausmacht, ist eure Sache.",
  },
  {
    id: "lend",
    label: "Leihen & Verleihen",
    emoji: "🪚",
    templates: ["Säge ausleihen", "Leiter ausleihen", "Anhänger ausleihen", "Bohrmaschine ausleihen"],
    offerTemplates: ["Ich verleihe meine Bohrmaschine", "Ich verleihe einen Anhänger", "Ich verleihe meine Leiter"],
    remoteOk: false,
    note: "Verleihen gibt halbe Punkte. Schäden oder Verluste klärt ihr untereinander, Karma übernimmt keine Haftung.",
  },
  {
    id: "community",
    label: "Gemeinsam anpacken",
    emoji: "🤝",
    templates: ["Aufräumaktion im Ort", "Sammelaktion", "Helfende für ein Fest", "Spielplatz verschönern"],
    offerTemplates: ["Ich packe bei Aktionen mit an"],
    remoteOk: false,
  },
  {
    id: "tech",
    label: "Technik",
    emoji: "📱",
    templates: ["Handy einrichten", "Fernseher einrichten", "Drucker einrichten", "Videoanruf einrichten"],
    offerTemplates: ["Ich erkläre das Handy", "Ich richte Technik ein"],
    remoteOk: true,
  },
  {
    id: "home",
    label: "Haus & Garten",
    emoji: "🌿",
    templates: ["Pflanzen gießen", "Briefkasten leeren", "Laub fegen", "Schnee schippen"],
    offerTemplates: ["Ich gieße Pflanzen im Urlaub", "Ich helfe im Garten"],
    remoteOk: false,
    keyHint: true,
  },
  {
    id: "tools",
    label: "Kleine Reparaturen",
    emoji: "🔧",
    templates: ["Regal aufbauen", "Lampe anbringen", "Fahrrad reparieren"],
    offerTemplates: ["Ich repariere Fahrräder", "Ich baue Möbel auf"],
    remoteOk: false,
  },
  {
    id: "company",
    label: "Zeit & Gesellschaft",
    emoji: "☕",
    templates: ["Vorlesen", "Zusammen spazieren gehen", "Kaffee trinken und erzählen", "Telefonieren"],
    offerTemplates: ["Ich lese gern vor", "Ich gehe gern spazieren", "Ich telefoniere gern"],
    remoteOk: true,
  },
  {
    id: "escort",
    label: "Begleitung",
    emoji: "🚶",
    templates: ["Begleitung zu einem Termin", "Begleitung beim Einkaufen"],
    offerTemplates: ["Ich begleite zu Terminen"],
    remoteOk: false,
  },
  {
    id: "pets",
    label: "Tiere",
    emoji: "🐕",
    templates: ["Gassi gehen", "Haustier füttern"],
    offerTemplates: ["Ich gehe gern mit Hunden raus"],
    remoteOk: false,
    keyHint: true,
  },
  { id: "other", label: "Sonstiges", emoji: "✨", templates: [], remoteOk: true },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export const FINAL_MINUTE_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];

/** Höchstdauer je Kategorie (gleich wie public.max_minutes_for in der Datenbank) */
const MAX_MINUTES: Record<string, number> = {
  shopping: 60,
  pets: 60,
  ride: 60,
  tech: 90,
  escort: 120,
  company: 120,
  tools: 120,
  other: 120,
  carrying: 240,
  home: 240,
  community: 240,
};

export function maxMinutesFor(category?: string | null): number {
  return (category && MAX_MINUTES[category]) || 120;
}

/** Auswahl für die Schätzung beim Anlegen */
export function estimateOptions(category?: string | null): number[] {
  return MINUTE_OPTIONS.filter((m) => m <= maxMinutesFor(category));
}

/** Auswahl für die tatsächliche Zeit beim Bestätigen */
export function finalOptions(category?: string | null): number[] {
  return FINAL_MINUTE_OPTIONS.filter((m) => m <= maxMinutesFor(category));
}

/** Ohne aktive Bestätigung zählen höchstens so viele Minuten */
export const AUTO_MAX_MINUTES = 30;

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `${time} Uhr`;
  return `${d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}, ${time} Uhr`;
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} Std. ${rest} Min.` : `${h} Std.`;
}

/** 10 Punkte je angefangene Viertelstunde (Briefing 5.9), Verleihen einmalig 5 (5.18) */
export function pointsFor(minutes: number, category?: string): number {
  if (category === "lend") return 5;
  return 10 * Math.ceil(minutes / 15);
}

export const ORG_CATEGORY_LABEL: Record<string, string> = {
  animal_welfare: "Tierschutz",
  social: "Soziales",
  other: "Gemeinnützig",
};

export function formatDate(d: string): string {
  return new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export const RECURRENCE_LABEL: Record<string, string> = {
  once: "einmalig",
  weekly: "jede Woche",
  biweekly: "alle zwei Wochen",
  monthly: "jeden Monat",
};

export const GENDER_PREF_LABEL: Record<string, string> = {
  any: "Alle dürfen helfen",
  female: "Nur Frauen",
  male: "Nur Männer",
};

export const AGE_GROUPS = ["18-29", "30-44", "45-59", "60-74", "75+"] as const;

export function timingLabel(timing: string, scheduledAt: string | null): string {
  if (timing === "now") return "Jetzt gleich";
  if (timing === "always") return "Dauerhaft";
  if (timing === "today") return "Heute";
  if (!scheduledAt) return "Termin";
  const d = new Date(scheduledAt);
  return d.toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function distanceLabel(m: number | null): string {
  if (m === null) return "Telefon oder Video";
  if (m < 1000) return `ca. ${Math.max(m, 50)} m entfernt`;
  return `ca. ${(m / 1000).toFixed(1).replace(".", ",")} km entfernt`;
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "gerade eben";
  if (diff < 60) return `vor ${Math.round(diff)} Min.`;
  if (diff < 60 * 24) return `vor ${Math.round(diff / 60)} Std.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------
// Typen der Datenbank-Antworten
// ---------------------------------------------------------------------
export type OwnProfile = {
  id: string;
  first_name: string | null;
  last_initial: string | null;
  avatar_url: string | null;
  gender: Gender | null;
  age_group: string | null;
  languages: string[];
  about: string | null;
  skills: string[];
  availability: string | null;
  district: string | null;
  accepted_terms_at: string | null;
  karma_points: number;
  animal_stage: number;
  aura_active: boolean;
  last_helped_at: string | null;
  verification_level: number;
  account_type: "person" | "organization";
  is_verified_org: boolean;
  organization_name: string | null;
  is_admin: boolean;
  created_at: string;
  org_category: string | null;
  push_enabled: boolean;
  push_per_day: number;
  streak_weeks: number;
  streak_week: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
  show_in_board: boolean;
};

export type PublicProfile = {
  id: string;
  display_name: string;
  first_name: string;
  avatar_url: string | null;
  gender: Gender | null;
  age_group: string | null;
  languages: string[];
  about: string | null;
  skills: string[];
  availability: string | null;
  district: string | null;
  animal_stage: number;
  aura_active: boolean;
  karma_points: number;
  verification_level: number;
  account_type: string;
  organization_name: string | null;
  is_verified_org: boolean;
  created_at: string;
  helps_count: number;
  minutes_total: number;
  people_helped: number;
  avg_stars: number | null;
  ratings_count: number;
  org_category: string | null;
};

export type FeedItem = {
  id: string;
  kind: Kind;
  category: CategoryId;
  title: string;
  description: string | null;
  estimated_minutes: number;
  timing: string;
  scheduled_at: string | null;
  recurrence: string;
  mode: "in_person" | "remote";
  helpers_needed: number;
  helpers_accepted: number;
  gender_pref: string;
  is_org_request: boolean;
  distance_m: number | null;
  created_at: string;
  requester_id: string;
  requester_name: string;
  requester_avatar: string | null;
  requester_stage: number;
  requester_aura: boolean;
  requester_org: string | null;
  requester_org_category: string | null;
  lend_until: string | null;
  place_label: string | null;
};

export type HelperEntry = {
  helper_id: string;
  status: "offered" | "accepted";
  expires_at?: string | null;
  attended: boolean | null;
  points_awarded: number;
  profile: PublicProfile;
};

export type RequestDetail = {
  id: string;
  kind: Kind;
  place_label: string | null;
  lend_until: string | null;
  creator_points: number | null;
  category: CategoryId;
  title: string;
  description: string | null;
  estimated_minutes: number;
  timing: string;
  scheduled_at: string | null;
  recurrence: string;
  mode: "in_person" | "remote";
  helpers_needed: number;
  auto_accept: boolean;
  gender_pref: string;
  status: "open" | "completed" | "cancelled";
  helper_done_at: string | null;
  final_minutes: number | null;
  completed_at: string | null;
  auto_completed: boolean;
  created_at: string;
  is_org_request: boolean;
  my_role: "requester" | "helper" | "viewer";
  my_status: "offered" | "accepted" | "declined" | "withdrawn" | "completed" | "expired" | null;
  my_expires_at?: string | null;
  requester: PublicProfile;
  address_note?: string | null;
  lat?: number | null;
  lng?: number | null;
  helpers: HelperEntry[];
};

// ---------------------------------------------------------------------
// Fehlertexte der RPCs
// ---------------------------------------------------------------------
const ERRORS: Record<string, string> = {
  profile_incomplete: "Bitte vervollständige zuerst dein Profil.",
  not_authenticated: "Bitte melde dich erneut an.",
  request_full: "Hier sind schon genug Helfende dabei.",
  request_not_open: "Diese Anfrage ist nicht mehr offen.",
  not_eligible: "Diese Anfrage ist leider nicht für dich freigegeben.",
  own_request: "Das ist deine eigene Anfrage.",
  rate_limited: "Für heute ist das Limit erreicht. Morgen geht es weiter.",
  location_required: "Bitte gib einen Ort an oder wähle Telefon oder Video.",
  date_in_past: "Der Termin liegt in der Vergangenheit.",
  no_helpers: "Es ist noch niemand angenommen.",
  no_offer: "Dieses Angebot gibt es nicht mehr.",
  invalid_minutes: "Bitte wähle eine Zeit zwischen 15 Minuten und 4 Stunden.",
  invalid_stars: "Bitte vergib 1 bis 5 Sterne.",
  not_found: "Nicht gefunden oder keine Berechtigung.",
  invalid_endpoint: "Benachrichtigungen konnten nicht eingerichtet werden.",
  invalid_timing: "Dauerhaft geht nur bei Angeboten.",
};

export function errorText(err: unknown): string {
  const msg =
    typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "";
  for (const key of Object.keys(ERRORS)) {
    if (msg.includes(key)) return ERRORS[key];
  }
  if (msg.toLowerCase().includes("fetch")) return "Keine Verbindung. Bitte versuch es gleich nochmal.";
  return "Das hat nicht geklappt. Bitte versuch es nochmal.";
}

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: "safety", label: "Ich fühle mich nicht sicher" },
  { id: "inappropriate", label: "Unangemessenes Verhalten" },
  { id: "no_show", label: "Ist nicht erschienen" },
  { id: "spam", label: "Werbung oder Spam" },
  { id: "other", label: "Etwas anderes" },
];
