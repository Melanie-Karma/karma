"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { btn } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

type Notice = { id: string; kind: string; points: number; message: string };

const BITS = ["🎉", "✨", "💛", "🎊", "⭐", "✨", "🎉", "💛"];

/** Einmaliger Feier-Moment beim Öffnen der App, z. B. für Punkte aus Einladungen */
export default function Celebration({ onDone }: { onDone: () => void }) {
  const { reloadProfile } = useApp();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSupabase()
      .rpc("my_notices")
      .then(({ data }) => {
        const list = ((data ?? []) as Notice[]).slice(0, 10);
        setNotices(list);
        if (list.length === 0) onDone();
      });
  }, [onDone]);

  if (notices.length === 0) return null;
  const points = notices.reduce((s, n) => s + n.points, 0);
  // Reine Info (z. B. Absage, verfallene Zusage): ohne Konfetti
  const festive = points > 0 || notices.some((n) => n.kind === "referral");

  async function close() {
    setBusy(true);
    const supabase = getSupabase();
    await Promise.all(notices.map((n) => supabase.rpc("dismiss_notice", { p_id: n.id })));
    setBusy(false);
    setNotices([]);
    onDone();
    await reloadProfile();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24">
          {festive && BITS.map((b, i) => (
            <span
              key={i}
              className="animate-confetti absolute text-2xl"
              style={{ left: `${8 + i * 11}%`, animationDelay: `${i * 0.12}s` }}
            >
              {b}
            </span>
          ))}
        </div>
        <p className="mt-8 text-5xl" aria-hidden>
          {festive ? "🎉" : "💬"}
        </p>
        <h2 id="celebration-title" className="mt-3 text-2xl font-extrabold text-brand">
          {points > 0 ? `+${points} Karma-Punkte für dich!` : festive ? "Schön, dass du dabei bist!" : "Kurz zur Info"}
        </h2>
        <ul className="mt-3 space-y-1 text-muted">
          {notices.map((n) => (
            <li key={n.id}>{n.message}</li>
          ))}
        </ul>
        {notices.some((n) => n.kind === "referral") && (
          <p className="mt-3 text-sm">Danke, dass du Karma weitererzählst. So wächst deine Nachbarschaft.</p>
        )}
        <button type="button" className={`${btn.accent} mt-5 w-full`} disabled={busy} onClick={close}>
          {festive ? "Juhu!" : "Alles klar"}
        </button>
      </div>
    </div>
  );
}
