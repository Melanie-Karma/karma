"use client";

import { useEffect, useState, type ReactNode } from "react";
import { animalFor, type AnimalInfo } from "@/lib/animals";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-bold text-paper shadow-[0_6px_16px_-8px_rgba(29,78,92,.7)] transition active:scale-[.98] disabled:opacity-50",
  accent:
    "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 font-extrabold text-ink shadow-[0_6px_16px_-8px_rgba(255,122,89,.9)] transition active:scale-[.98] disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-full border-2 border-ink/15 px-5 py-3 font-bold text-ink transition active:scale-[.98] disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-full border-2 border-red-700/30 px-5 py-3 font-bold text-red-800 transition active:scale-[.98] disabled:opacity-50",
};

export const input =
  "w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-base outline-none focus:border-brand";

export const card = "rounded-3xl bg-white p-5 shadow-[0_2px_12px_-6px_rgba(35,32,29,.18)]";

export function Avatar({
  url,
  name,
  size = 44,
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: number;
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Supabase-Storage, keine Bildoptimierung nötig
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand font-extrabold text-sun"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

/** Tier mit Aura. Ohne Aura wirkt es blass und müde, steigt aber nie ab. */
export function Animal({
  stage,
  aura,
  size = 28,
  showName = false,
}: {
  stage: number;
  aura: boolean;
  size?: number;
  showName?: boolean;
}) {
  const a = animalFor(stage);
  return (
    <span className="inline-flex items-center gap-1.5" title={`${a.name}${aura ? ", leuchtet" : ", ruht gerade"}`}>
      <AnimalBubble animal={a} aura={aura} size={size} />
      {showName && <span className="text-sm font-bold">{a.name}</span>}
    </span>
  );
}

/** Farbige, lebendige Tier-Blase. Mit Aura wippt sie und leuchtet. */
export function AnimalBubble({
  animal,
  aura = true,
  size = 28,
  dim = false,
}: {
  animal: AnimalInfo;
  aura?: boolean;
  size?: number;
  dim?: boolean;
}) {
  const live = aura && !dim;
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full ${live ? "animate-bob" : "opacity-50 grayscale"}`}
      style={{
        width: size * 1.5,
        height: size * 1.5,
        fontSize: size,
        background: `radial-gradient(circle at 30% 25%, ${animal.c1}, ${animal.c2})`,
        boxShadow: live ? `0 0 0 3px rgba(255,255,255,.7), 0 6px 18px -4px ${animal.c2}` : undefined,
      }}
    >
      <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,.18)]">{animal.emoji}</span>
    </span>
  );
}

/** Wochen-Streak als Flamme. Je länger, desto größer und wilder. */
export function StreakFlame({ weeks, size = 22 }: { weeks: number; size?: number }) {
  if (weeks <= 0) {
    return (
      <span className="grayscale opacity-40" style={{ fontSize: size }} aria-hidden>
        🔥
      </span>
    );
  }
  const scale = weeks >= 10 ? 1.5 : weeks >= 6 ? 1.3 : weeks >= 3 ? 1.15 : 1;
  const wild = weeks >= 3;
  return (
    <span className="relative inline-grid place-items-center" aria-hidden style={{ fontSize: size * scale }}>
      {wild && (
        <span
          className="absolute inset-[-30%] rounded-full blur-md animate-glow"
          style={{ background: "radial-gradient(circle, rgba(255,160,40,.75), rgba(255,77,109,0) 70%)" }}
        />
      )}
      <span className={`relative ${wild ? "animate-flicker" : ""}`}>🔥</span>
      {weeks >= 10 && <span className="absolute -right-2 bottom-0 text-[0.55em] animate-flicker [animation-delay:.3s]">🔥</span>}
    </span>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value === null || value === undefined) return <span className="text-sm text-muted">noch keine Bewertung</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-sun-deep">★</span>
      <b>{Number(value).toFixed(1).replace(".", ",")}</b>
      {count !== undefined && <span className="text-muted">({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Sterne">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} Sterne`}
          onClick={() => onChange(n)}
          className={`text-3xl leading-none transition ${n <= value ? "text-sun-deep" : "text-ink/15"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" | "brand" | "warn" }) {
  const tones = {
    plain: "bg-ink/5 text-ink",
    accent: "bg-accent text-ink",
    brand: "bg-brand text-paper",
    warn: "bg-sun/50 text-ink",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

/** Bottom Sheet für Dialoge (Melden, Abschluss, Bestätigungen) */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-paper p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink/15" />
        <h2 className="mb-4 text-xl font-extrabold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Kleine Einblendung unten, verschwindet nach 3,5 s */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-5">
      <div className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper shadow-lg">{msg}</div>
    </div>
  ) : null;
  return { toast: setMsg, toastNode: node };
}

export function Spinner({ label = "Lädt" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  );
}
