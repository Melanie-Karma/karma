"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { AnimalBubble, Avatar, Spinner, StreakFlame, card } from "@/components/ui";
import { animalFor } from "@/lib/animals";
import { currentPosition } from "@/lib/geo";
import { getSupabase } from "@/lib/supabase";

type Row = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  animal_stage: number;
  aura_active: boolean;
  karma_points: number;
  week_points: number;
  streak_weeks: number;
  is_me: boolean;
  total_nearby: number;
};

const RADIUS_KEY = "karma_radius_km";
const MEDALS = ["🥇", "🥈", "🥉"];

/** Nachbarn im Umkreis mit Tier und Punkten. Wochenwertung, damit auch Neue vorne mitspielen. */
export default function Neighbors() {
  const { profile } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"week" | "total">("week");
  const [radius, setRadius] = useState(10);
  const home = useMemo(
    () => (profile.home_lat != null && profile.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null),
    [profile.home_lat, profile.home_lng],
  );

  const load = useCallback(async () => {
    let r = 10;
    try {
      const stored = Number(localStorage.getItem(RADIUS_KEY));
      if (stored >= 1 && stored <= 20) r = stored;
    } catch {
      /* egal */
    }
    setRadius(r);
    const { pos } = await currentPosition(8000, home);
    const { data } = await getSupabase().rpc("neighbors_board", {
      p_lat: pos.lat,
      p_lng: pos.lng,
      p_radius_m: r * 1000,
    });
    setRows((data ?? []) as Row[]);
  }, [home]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lädt beim Öffnen
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const key = tab === "week" ? "week_points" : "karma_points";
    return [...rows].sort((a, b) => b[key] - a[key]);
  }, [rows, tab]);

  if (!rows) return <Spinner label="Suche deine Nachbarn" />;

  const total = rows[0]?.total_nearby ?? 0;
  const others = Math.max(0, total - 1);
  const key = tab === "week" ? "week_points" : "karma_points";
  const myIdx = sorted.findIndex((r) => r.is_me);
  const me = sorted[myIdx];
  const ahead = myIdx > 0 ? sorted[myIdx - 1] : null;
  const gap = me && ahead ? ahead[key] - me[key] + 1 : 0;

  return (
    <div className="space-y-4">
      <header>
        <Link href="/app" className="text-sm font-bold text-muted">
          ← Zurück
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold text-brand">Deine Nachbarschaft</h1>
        <p className="mt-1 text-muted">
          <b className="text-ink">{others}</b> {others === 1 ? "Nachbar" : "Nachbarn"} im Umkreis von {radius} km
          {others === 0 ? ". Lade jemanden ein und fang an!" : " machen schon mit."}
        </p>
      </header>

      {me && (
        <section className="rounded-3xl bg-brand p-5 text-paper">
          <div className="flex items-center gap-4">
            <span className="text-4xl font-extrabold text-sun">{myIdx + 1}.</span>
            <div className="flex-1">
              <p className="text-sm text-paper/70">Dein Platz {tab === "week" ? "diese Woche" : "insgesamt"}</p>
              <p className="text-lg font-extrabold">
                {me[key]} Karma-Punkte
              </p>
            </div>
            <AnimalBubble animal={animalFor(me.animal_stage)} aura={me.aura_active} size={30} />
          </div>
          {ahead ? (
            <p className="mt-3 text-sm">
              Noch <b className="text-sun">{gap} Karma-Punkte</b>, dann überholst du {ahead.display_name}.
            </p>
          ) : sorted.length > 1 ? (
            <p className="mt-3 text-sm">Du führst! Halte deinen Vorsprung.</p>
          ) : null}
        </section>
      )}

      <div className="flex gap-2" role="tablist">
        {(
          [
            ["week", "Diese Woche"],
            ["total", "Insgesamt"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-full py-2 text-sm font-extrabold ${tab === id ? "bg-brand text-paper" : "bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className={`${card} divide-y divide-ink/5 p-0`}>
        {sorted.map((r, i) => (
          <li key={r.user_id} className={`flex items-center gap-3 px-4 py-3 ${r.is_me ? "bg-sun/25" : ""}`}>
            <span className="w-7 text-center text-lg font-extrabold">{MEDALS[i] ?? `${i + 1}.`}</span>
            <Avatar url={r.avatar_url} name={r.display_name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">
                {r.is_me ? "Du" : (
                  <Link href={`/app/person/${r.user_id}`} className="hover:underline">
                    {r.display_name}
                  </Link>
                )}
              </p>
              <p className="text-xs text-muted">{animalFor(r.animal_stage).name}</p>
            </div>
            {r.streak_weeks > 0 && (
              <span className="flex items-center text-sm font-extrabold text-accent">
                <StreakFlame weeks={r.streak_weeks} size={14} />
                {r.streak_weeks}
              </span>
            )}
            <AnimalBubble animal={animalFor(r.animal_stage)} aura={r.aura_active} size={16} />
            <span className="w-12 text-right font-extrabold">{r[key]}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs text-muted">
        Die Wochenwertung startet jeden Montag neu. Du willst hier nicht auftauchen? Das stellst du im Profil ein.
      </p>
    </div>
  );
}
