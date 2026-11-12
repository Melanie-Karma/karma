export const ANIMALS = [
  { stage: 1, name: "Amöbe", emoji: "🦠" },
  { stage: 2, name: "Ameise", emoji: "🐜" },
  { stage: 3, name: "Regenwurm", emoji: "🪱" },
  { stage: 4, name: "Schmetterling", emoji: "🦋" },
  { stage: 5, name: "Singvogel", emoji: "🐦" },
  { stage: 6, name: "Falke", emoji: "🦅" },
  { stage: 7, name: "Phönix", emoji: "🔥" },
] as const;

export function animalFor(stage: number) {
  return ANIMALS[Math.min(Math.max(stage, 1), 7) - 1];
}
