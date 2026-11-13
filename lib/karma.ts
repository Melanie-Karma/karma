// Gemeinsame Konstanten, Typen und Helfer für die App (Stufe 1)

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
  | "other";

export type Category = {
  id: CategoryId;
  label: string;
  emoji: string;
  /** Textvorlagen; die erste passende wird als Titel übernommen */
  templates: string[];
  /** Geht auch per Telefon oder Video */
  remoteOk: boolean;
  /** Hinweis zum Schlüssel anzeigen */
  keyHint?: boolean;
};

export const CATEGORIES: Category[] = [
  {
    id: "shopping",
    label: "Einkauf & Besorgung",
    emoji: "🛒",
    templates: ["Einkauf erledigen", "Medikamente in der Apotheke abholen", "Paket abholen"],
    remoteOk: false,
  },
  {
    id: "carrying",
    label: "Tragen & Transport",
    emoji: "📦",
    templates: ["Möbel tragen", "Getränkekisten hochtragen", "Etwas mit dem Auto transportieren"],
    remoteOk: false,
  },
  {
    id: "tech",
    label: "Technik",
    emoji: "📱",
    templates: [
      "Handy einrichten",
      "Fernseher einrichten",
      "Drucker einrichten",
      "Videoanruf einrichten",
    ],
    remoteOk: true,
  },
  {
    id: "home",
    label: "Haus & Garten",
    emoji: "🌿",
    templates: [
      "Pflanzen gießen",
      "Briefkasten leeren",
      "Kleine Reparatur",
      "Laub fegen",
      "Schnee schippen",
    ],
    remoteOk: false,
    keyHint: true,
  },
  {
    id: "company",
    label: "Zeit & Gesellschaft",
    emoji: "☕",
    templates: ["Vorlesen", "Zusammen spazieren gehen", "Kaffee trinken und erzählen", "Telefonieren"],
    remoteOk: true,
  },
  {
    id: "escort",
    label: "Begleitung",
    emoji: "🚶",
    templates: ["Begleitung zu einem Termin", "Begleitung beim Einkaufen"],
    remoteOk: false,
  },
  {
    id: "pets",
    label: "Tiere",
    emoji: "🐕",
    templates: ["Gassi gehen", "Haustier füttern"],
    remoteOk: false,
    keyHint: true,
  },
  {
    id: "tools",
    label: "Werkzeug & Leihen",
    emoji: "🔧",
    templates: ["Werkzeug leihen", "Leiter leihen"],
    remoteOk: false,
  },
  { id: "other", label: "Sonstiges", emoji: "✨", templates: [], remoteOk: true },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export const FINAL_MINUTE_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} Std. ${rest} Min.` : `${h} Std.`;
}

/** 10 Punkte je angefangene Viertelstunde (Briefing 5.9) */
export function pointsFor(minutes: number): number {
  return 10 * Math.ceil(minutes / 15);
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
};

export type FeedItem = {
  id: string;
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
};

export type HelperEntry = {
  helper_id: string;
  status: "offered" | "accepted";
  attended: boolean | null;
  points_awarded: number;
  profile: PublicProfile;
};

export type RequestDetail = {
  id: string;
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
  my_status: "offered" | "accepted" | "declined" | "withdrawn" | null;
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
