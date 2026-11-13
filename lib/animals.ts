/** Tierstufen. Schwellen identisch mit public.stage_for_points in der Datenbank. */
export const ANIMALS = [
  { stage: 1, name: "Amöbe", emoji: "🦠", from: 0 },
  { stage: 2, name: "Ameise", emoji: "🐜", from: 20 },
  { stage: 3, name: "Regenwurm", emoji: "🪱", from: 60 },
  { stage: 4, name: "Schmetterling", emoji: "🦋", from: 150 },
  { stage: 5, name: "Singvogel", emoji: "🐦", from: 300 },
  { stage: 6, name: "Falke", emoji: "🦅", from: 600 },
  { stage: 7, name: "Phönix", emoji: "🔥", from: 1000 },
] as const;

export function animalFor(stage: number) {
  return ANIMALS[Math.min(Math.max(stage, 1), 7) - 1];
}

/** Fortschritt bis zur nächsten Stufe (0 bis 1) und fehlende Punkte */
export function progressFor(points: number, stage: number) {
  const next = ANIMALS[stage] ?? null;
  if (!next) return { next: null, ratio: 1, missing: 0 };
  const from = animalFor(stage).from;
  const ratio = Math.min(1, Math.max(0, (points - from) / (next.from - from)));
  return { next, ratio, missing: Math.max(0, next.from - points) };
}
