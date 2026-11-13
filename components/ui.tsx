"use client";

import { useEffect, useState, type ReactNode } from "react";
import { animalFor } from "@/lib/animals";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-forest px-5 py-3 font-bold text-paper transition active:scale-[.98] disabled:opacity-50",
  lime: "inline-flex items-center justify-center gap-2 rounded-full bg-lime px-5 py-3 font-bold text-ink transition active:scale-[.98] disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-full border-2 border-ink/15 px-5 py-3 font-bold text-ink transition active:scale-[.98] disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-full border-2 border-red-700/30 px-5 py-3 font-bold text-red-800 transition active:scale-[.98] disabled:opacity-50",
};

export const input =
  "w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-base outline-none focus:border-forest";

export const card = "rounded-3xl bg-white p-5 shadow-[0_1px_0_rgba(20,32,26,.08)]";

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
      className="grid shrink-0 place-items-center rounded-full bg-forest font-extrabold text-lime"
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
      <span
        className={`grid place-items-center rounded-full ${aura ? "bg-lime/70 shadow-[0_0_0_4px_rgba(198,242,78,.35)]" : "bg-ink/5 opacity-60 grayscale"}`}
        style={{ width: size * 1.45, height: size * 1.45, fontSize: size }}
      >
        {a.emoji}
      </span>
      {showName && <span className="text-sm font-bold">{a.name}</span>}
    </span>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value === null || value === undefined) return <span className="text-sm text-muted">noch keine Bewertung</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-amber-500">★</span>
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
          className={`text-3xl leading-none transition ${n <= value ? "text-amber-500" : "text-ink/15"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "lime" | "forest" | "warn" }) {
  const tones = {
    plain: "bg-ink/5 text-ink",
    lime: "bg-lime text-ink",
    forest: "bg-forest text-paper",
    warn: "bg-amber-100 text-amber-900",
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
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-forest border-t-transparent" />
      {label}
    </div>
  );
}
