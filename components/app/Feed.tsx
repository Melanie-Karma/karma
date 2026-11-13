"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { Animal, Avatar, Chip, Spinner, btn, useToast } from "@/components/ui";
import { animalFor } from "@/lib/animals";
import { currentPosition, type LatLng } from "@/lib/geo";
import {
  RECURRENCE_LABEL,
  categoryOf,
  distanceLabel,
  errorText,
  formatMinutes,
  pointsFor,
  timingLabel,
  type FeedItem,
} from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

const RADII = [2, 5, 10, 20];
const RADIUS_KEY = "karma_radius_km";
/** Standard 10 km: passt zu Kleinstadt plus Ortsteilen (Testphase Trebbin) */
const DEFAULT_RADIUS = 10;

export default function Feed() {
  const { profile } = useApp();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [pos, setPos] = useState<{ pos: LatLng; precise: boolean } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [error, setError] = useState<string | null>(null);
  const { toast, toastNode } = useToast();

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(RADIUS_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage gibt es erst im Browser
      if (RADII.includes(stored)) setRadius(stored);
    } catch {
      /* egal */
    }
    void currentPosition().then(setPos);
  }, []);

  const load = useCallback(async () => {
    if (!pos) return;
    setError(null);
    const { data, error: err } = await getSupabase().rpc("nearby_requests", {
      p_lat: pos.pos.lat,
      p_lng: pos.pos.lng,
      p_radius_m: radius * 1000,
    });
    if (err) {
      setError(errorText(err));
      setItems([]);
      return;
    }
    setItems((data ?? []) as FeedItem[]);
  }, [pos, radius]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lädt Daten nach Standortwechsel
    void load();
  }, [load]);

  function changeRadius(r: number) {
    setRadius(r);
    try {
      localStorage.setItem(RADIUS_KEY, String(r));
    } catch {
      /* egal */
    }
  }

  async function decide(item: FeedItem, direction: "left" | "right") {
    setItems((list) => (list ? list.filter((i) => i.id !== item.id) : list));
    const { data, error: err } = await getSupabase().rpc("swipe", {
      p_request_id: item.id,
      p_direction: direction,
    });
    if (err) {
      toast(errorText(err));
      return;
    }
    if (data === "accepted") toast(`Du bist dabei! Schreib ${item.requester_name.split(" ")[0]} im Chat.`);
    else if (data === "offered") toast(`Angebot gesendet. ${item.requester_name.split(" ")[0]} meldet sich.`);
  }

  const animal = animalFor(profile.animal_stage);

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-muted">Hallo {profile.first_name}</p>
          <h1 className="text-2xl font-extrabold text-forest">Wer braucht Hilfe?</h1>
        </div>
        <Link href="/app/profil" className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1" aria-label={`Dein Tier: ${animal.name}, ${profile.karma_points} Karma`}>
          <Animal stage={profile.animal_stage} aura={profile.aura_active} size={18} />
          <span className="text-sm font-extrabold">{profile.karma_points}</span>
        </Link>
      </header>

      <div className="mb-4 flex items-center gap-2 overflow-x-auto text-sm" role="group" aria-label="Umkreis">
        <span className="shrink-0 font-bold text-muted">Umkreis</span>
        {RADII.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => changeRadius(r)}
            aria-pressed={radius === r}
            className={`shrink-0 rounded-full px-3 py-1.5 font-bold ${radius === r ? "bg-forest text-paper" : "bg-white"}`}
          >
            {r} km
          </button>
        ))}
      </div>
      {pos && !pos.precise && (
        <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
          Dein Standort ist nicht freigegeben. Wir zeigen Anfragen rund um Trebbin. Für genauere
          Entfernungen erlaube den Standort in den Browser-Einstellungen.
        </p>
      )}

      {items === null ? (
        <Spinner label="Suche Anfragen in deiner Nähe" />
      ) : items.length === 0 ? (
        <Empty error={error} onReload={load} />
      ) : (
        <Stack items={items} onDecide={decide} />
      )}
      {toastNode}
    </div>
  );
}

function Empty({ error, onReload }: { error: string | null; onReload: () => void }) {
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center">
      <p className="text-5xl">🌱</p>
      <h2 className="mt-3 text-xl font-extrabold">{error ?? "Gerade ist alles erledigt"}</h2>
      <p className="mt-2 text-muted">
        Keine offenen Anfragen in deinem Umkreis. Schau später nochmal rein oder frag selbst etwas an.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href="/app/neu" className={btn.primary}>
          Selbst Hilfe anfragen
        </Link>
        <button type="button" className={btn.ghost} onClick={onReload}>
          Neu laden
        </button>
      </div>
    </div>
  );
}

/** Kartenstapel: oberste Karte lässt sich wischen, Buttons als Alternative */
function Stack({ items, onDecide }: { items: FeedItem[]; onDecide: (i: FeedItem, d: "left" | "right") => void }) {
  const top = items[0];
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  function finish(direction: "left" | "right") {
    setLeaving(direction);
    setTimeout(() => {
      onDecide(top, direction);
      setLeaving(null);
      setDx(0);
    }, 220);
  }

  const offset = leaving === "right" ? 600 : leaving === "left" ? -600 : dx;

  return (
    <div>
      <div className="relative h-[29rem] select-none">
        {items.slice(1, 3).map((item, i) => (
          <div
            key={item.id}
            className="absolute inset-0 rounded-[2rem] bg-white/70"
            style={{ transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.04})`, zIndex: 1 - i }}
            aria-hidden
          />
        ))}
        <article
          key={top.id}
          className="absolute inset-0 z-10 touch-pan-y"
          style={{
            transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
            transition: dragging ? "none" : "transform .22s ease-out",
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("a,button")) return;
            start.current = e.clientX;
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null) setDx(e.clientX - start.current);
          }}
          onPointerUp={() => {
            const d = dx;
            start.current = null;
            setDragging(false);
            if (d > 110) finish("right");
            else if (d < -110) finish("left");
            else setDx(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDx(0);
          }}
        >
          <RequestCard item={top} hint={dx > 40 ? "right" : dx < -40 ? "left" : null} />
        </article>
      </div>
      <div className="mt-5 flex gap-3">
        <button type="button" className={`${btn.ghost} flex-1`} onClick={() => finish("left")}>
          Diesmal nicht
        </button>
        <button type="button" className={`${btn.lime} flex-[1.4]`} onClick={() => finish("right")}>
          Ich helfe
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        Wische nach rechts zum Helfen, nach links zum Überspringen. Noch {items.length} in deiner Nähe.
      </p>
    </div>
  );
}

function RequestCard({ item, hint }: { item: FeedItem; hint: "left" | "right" | null }) {
  const cat = categoryOf(item.category);
  const free = item.helpers_needed - item.helpers_accepted;
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-white p-6 shadow-[0_10px_30px_-12px_rgba(20,32,26,.35)]">
      {hint && (
        <span
          className={`absolute top-6 z-10 rounded-xl border-4 px-3 py-1 text-xl font-extrabold ${hint === "right" ? "right-6 rotate-6 border-forest bg-lime text-forest" : "left-6 -rotate-6 border-ink/40 bg-white text-ink/60"}`}
        >
          {hint === "right" ? "ICH HELFE" : "NICHT JETZT"}
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-paper text-3xl">{cat.emoji}</span>
        <div className="text-sm">
          <p className="font-bold text-muted">{cat.label}</p>
          <p className="font-bold">{distanceLabel(item.distance_m)}</p>
        </div>
      </div>

      <h2 className="mt-5 text-[1.75rem] leading-tight font-extrabold">{item.title}</h2>
      {item.description && <p className="mt-2 line-clamp-4 text-ink/80">{item.description}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone={item.timing === "now" ? "lime" : "plain"}>⏱ {timingLabel(item.timing, item.scheduled_at)}</Chip>
        <Chip>{formatMinutes(item.estimated_minutes)}</Chip>
        {item.recurrence !== "once" && <Chip>🔁 {RECURRENCE_LABEL[item.recurrence]}</Chip>}
        {item.helpers_needed > 1 && <Chip>👥 noch {free} von {item.helpers_needed}</Chip>}
        {item.gender_pref !== "any" && <Chip tone="warn">{item.gender_pref === "female" ? "Nur Frauen" : "Nur Männer"}</Chip>}
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-ink/5 pt-4">
        <Avatar url={item.requester_avatar} name={item.requester_name} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/person/${item.requester_id}`} className="block truncate font-extrabold underline-offset-4 hover:underline">
            {item.requester_org ?? item.requester_name}
          </Link>
          <p className="text-xs text-muted">{item.requester_org ? `${item.requester_name} · Einrichtung` : "fragt an"}</p>
        </div>
        <Animal stage={item.requester_stage} aura={item.requester_aura} size={16} />
        <span className="rounded-full bg-forest px-3 py-1 text-sm font-extrabold text-lime">+{pointsFor(item.estimated_minutes)}</span>
      </div>
    </div>
  );
}
