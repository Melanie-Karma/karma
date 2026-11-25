/** Tierstufen. Schwellen identisch mit public.stage_for_points in der Datenbank. */
export const ANIMALS = [
  { stage: 1, name: "Amöbe", emoji: "🦠", from: 0, c1: "#e6f9d9", c2: "#8fd36b" },
  { stage: 2, name: "Keimling", emoji: "🌱", from: 10, c1: "#eefbd5", c2: "#6cc24a" },
  { stage: 3, name: "Wurm", emoji: "🪱", from: 20, c1: "#ffe1e6", c2: "#f08aa0" },
  { stage: 4, name: "Ameise", emoji: "🐜", from: 40, c1: "#ffe3d1", c2: "#d9774a" },
  { stage: 5, name: "Käfer", emoji: "🐞", from: 60, c1: "#ffd6d6", c2: "#ff5a5a" },
  { stage: 6, name: "Maus", emoji: "🐭", from: 90, c1: "#eceaf2", c2: "#a59fbd" },
  { stage: 7, name: "Igel", emoji: "🦔", from: 130, c1: "#ffe0b8", c2: "#f0a35e" },
  { stage: 8, name: "Hase", emoji: "🐰", from: 180, c1: "#fdf0e6", c2: "#e8b894" },
  { stage: 9, name: "Eichhörnchen", emoji: "🐿️", from: 250, c1: "#ffd2a8", c2: "#ff8a3d" },
  { stage: 10, name: "Fuchs", emoji: "🦊", from: 340, c1: "#ffc4b0", c2: "#ff7a59" },
  { stage: 11, name: "Eule", emoji: "🦉", from: 450, c1: "#c9eef0", c2: "#3aa3ad" },
  { stage: 12, name: "Reh", emoji: "🦌", from: 600, c1: "#f6e2c4", c2: "#c98b4a" },
  { stage: 13, name: "Wolf", emoji: "🐺", from: 800, c1: "#dfe6ee", c2: "#6f8aa6" },
  { stage: 14, name: "Bär", emoji: "🐻", from: 1050, c1: "#f1dcc8", c2: "#9a6440" },
  { stage: 15, name: "Adler", emoji: "🦅", from: 1400, c1: "#fff1c2", c2: "#e8a400" },
  { stage: 16, name: "Drache", emoji: "🐉", from: 1800, c1: "#ffd36e", c2: "#ff4d6d" },
] as const;

export type AnimalInfo = (typeof ANIMALS)[number];

export function animalFor(stage: number): AnimalInfo {
  return ANIMALS[Math.min(Math.max(stage, 1), ANIMALS.length) - 1];
}

/** Fortschritt bis zur nächsten Stufe (0 bis 1) und fehlende Punkte */
export function progressFor(points: number, stage: number) {
  const next = ANIMALS[stage] ?? null;
  if (!next) return { next: null, ratio: 1, missing: 0 };
  const from = animalFor(stage).from;
  const ratio = Math.min(1, Math.max(0, (points - from) / (next.from - from)));
  return { next, ratio, missing: Math.max(0, next.from - points) };
}

/** Montag der aktuellen Woche als YYYY-MM-DD (lokale Zeit) */
function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/**
 * Wochen-Streak. Lebt, solange in dieser oder der letzten Woche geholfen wurde.
 * thisWeek: in dieser Woche schon geholfen (Flamme sicher).
 */
export function streakFor(weeks: number | null | undefined, week: string | null | undefined) {
  if (!weeks || !week) return { weeks: 0, thisWeek: false };
  const now = new Date();
  const thisMonday = mondayOf(now);
  const last = new Date(now);
  last.setDate(last.getDate() - 7);
  const lastMonday = mondayOf(last);
  if (week === thisMonday) return { weeks, thisWeek: true };
  if (week === lastMonday) return { weeks, thisWeek: false };
  return { weeks: 0, thisWeek: false };
}
