"use client";

import { useEffect, useState } from "react";
import { Animal, Avatar, Chip, Stars, card } from "@/components/ui";
import { animalFor } from "@/lib/animals";
import { relativeTime, type PublicProfile } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

type Rating = { id: number; stars: number; comment: string | null; created_at: string; rater_name: string };

const LEVEL_LABEL: Record<number, string> = {
  1: "E-Mail bestätigt",
  2: "Von einer Einrichtung bestätigt",
  3: "Ausweis geprüft",
};

/** Öffentliche Profilansicht. Zeigt nie Adresse, Telefon, vollen Nachnamen oder Geburtsdatum. */
export default function ProfileView({ p, hideAnimal = false }: { p: PublicProfile; hideAnimal?: boolean }) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const animal = animalFor(p.animal_stage);

  useEffect(() => {
    void getSupabase()
      .from("public_ratings")
      .select("id, stars, comment, created_at, rater_name")
      .eq("helper_id", p.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setRatings((data ?? []) as Rating[]));
  }, [p.id]);

  const hours = Math.round((p.minutes_total / 60) * 10) / 10;
  const since = new Date(p.created_at).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <section className={`${card} text-center`}>
        <div className="flex justify-center">
          <Avatar url={p.avatar_url} name={p.display_name} size={88} />
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">{p.organization_name ?? p.display_name}</h1>
        {p.organization_name && <p className="text-sm text-muted">{p.display_name} · Einrichtung</p>}
        <p className="text-sm text-muted">
          {[p.district, p.age_group ? `${p.age_group} Jahre` : null, `dabei seit ${since}`].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Chip tone={p.verification_level >= 2 ? "brand" : "plain"}>✓ {LEVEL_LABEL[p.verification_level]}</Chip>
          {p.languages.length > 0 && <Chip>🗣 {p.languages.join(", ")}</Chip>}
        </div>
      </section>

      {!hideAnimal && (
      <section className={`${card} flex items-center gap-4`}>
        <Animal stage={p.animal_stage} aura={p.aura_active} size={34} />
        <div>
          <p className="text-lg font-extrabold">{animal.name}</p>
          <p className="text-sm text-muted">
            {p.karma_points} Karma · {p.aura_active ? "leuchtet gerade" : "ruht gerade"}
          </p>
        </div>
      </section>
      )}

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat value={String(p.helps_count)} label="Hilfen" />
        <Stat value={hours.toLocaleString("de-DE")} label="Stunden" />
        <Stat value={String(p.people_helped)} label="Menschen" />
      </section>

      {(p.about || p.skills.length > 0 || p.availability) && (
        <section className={`${card} space-y-3`}>
          {p.about && <p className="whitespace-pre-wrap">{p.about}</p>}
          {p.skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.skills.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </div>
          )}
          {p.availability && <p className="text-sm text-muted">🕐 {p.availability}</p>}
        </section>
      )}

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Bewertungen</h2>
          <Stars value={p.avg_stars} count={p.ratings_count} />
        </div>
        {ratings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Noch keine Bewertungen.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {ratings.map((r) => (
              <li key={r.id} className="border-t border-ink/5 pt-3">
                <p className="text-sm">
                  <span className="text-sun-deep">{"★".repeat(r.stars)}</span>
                  <span className="text-ink/15">{"★".repeat(5 - r.stars)}</span>
                  <span className="ml-2 font-bold">{r.rater_name}</span>
                  <span className="ml-2 text-xs text-muted">{relativeTime(r.created_at)}</span>
                </p>
                {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-3xl bg-white p-4">
      <p className="text-2xl font-extrabold text-brand">{value}</p>
      <p className="text-xs font-bold text-muted">{label}</p>
    </div>
  );
}
