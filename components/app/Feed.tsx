"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { Animal, Avatar, Chip, Spinner, StreakFlame, btn, useToast } from "@/components/ui";
import { animalFor, streakFor } from "@/lib/animals";
import { currentPosition, type LatLng } from "@/lib/geo";
import {
  CATEGORIES,
  ORG_CATEGORY_LABEL,
  RECURRENCE_LABEL,
  categoryOf,
  formatDate,
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
const VIEW_KEY = "karma_feed_view";
type View = "cards" | "list";
/** Standard 10 km: passt zu Kleinstadt plus Ortsteilen (Testphase Trebbin) */
const DEFAULT_RADIUS = 10;

export default function Feed() {
  const { profile } = useApp();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [pos, setPos] = useState<{ pos: LatLng; precise: boolean } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [view, setView] = useState<View>("cards");
  const [error, setError] = useState<string | null>(null);
  const { toast, toastNode } = useToast();
  const home = useMemo(
    () => (profile.home_lat != null && profile.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null),
    [profile.home_lat, profile.home_lng],
  );

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(RADIUS_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage gibt es erst im Browser
      if (RADII.includes(stored)) setRadius(stored);
      const storedView = localStorage.getItem(VIEW_KEY);
      if (storedView === "cards" || storedView === "list") setView(storedView);
    } catch {
      /* egal */
    }
    void currentPosition(8000, home).then(setPos);
  }, [home]);

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

  // Beim Zurückkehren in die App automatisch aktualisieren
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void load(), 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [load]);

  // Aufenthaltsort merken: Push-Nachrichten richten sich danach, wo du gerade bist
  useEffect(() => {
    if (!pos?.precise) return;
    void getSupabase().rpc("set_my_location", {
      p_lat: pos.pos.lat,
      p_lng: pos.pos.lng,
      p_radius_m: radius * 1000,
    });
  }, [pos, radius]);

  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* egal */
    }
  }

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
    const name = (item.requester_org ?? item.requester_name).split(" ")[0];
    if (data === "accepted") toast(`Du bist dabei! Schreib ${name} im Chat.`);
    else if (data === "offered")
      toast(item.kind === "offer" ? `Anfrage gesendet. ${name} meldet sich.` : `Zusage gesendet. ${name} meldet sich.`);
  }

  const animal = animalFor(profile.animal_stage);
  const streak = streakFor(profile.streak_weeks, profile.streak_week);

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-muted">Hallo {profile.first_name}</p>
          <h1 className="text-2xl font-extrabold text-brand">Was ist los in deiner Nähe?</h1>
          <Link href="/app/nachbarn" className="mt-1 inline-block text-sm font-bold text-accent underline">
            🏆 Deine Nachbarschaft
          </Link>
        </div>
        <Link href="/app/profil" className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1" aria-label={`Dein Tier: ${animal.name}, ${profile.karma_points} Karma-Punkte`}>
          <Animal stage={profile.animal_stage} aura={profile.aura_active} size={18} />
          <span className="text-sm font-extrabold">{profile.karma_points}</span>
          {streak.weeks > 0 && (
            <span className="flex items-center gap-0.5 text-sm font-extrabold text-accent">
              <StreakFlame weeks={streak.weeks} size={16} />
              {streak.weeks}
            </span>
          )}
        </Link>
      </header>

      {!profile.aura_active && (
        <Link href="/app/profil" className="mb-4 flex items-center gap-3 rounded-2xl bg-ink/5 p-3 text-sm">
          <Animal stage={profile.animal_stage} aura={false} size={18} />
          <span>
            Dein Tier ist müde und grau geworden. <b>Hilf jemandem</b> oder biete etwas an, dann wird es wieder munter.
          </span>
        </Link>
      )}

      <div className="mb-4 flex items-center gap-2 overflow-x-auto text-sm" role="group" aria-label="Umkreis">
        <span className="shrink-0 font-bold text-muted">Umkreis</span>
        {RADII.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => changeRadius(r)}
            aria-pressed={radius === r}
            className={`shrink-0 rounded-full px-3 py-1.5 font-bold transition ${radius === r ? "bg-brand text-paper" : "bg-white"}`}
          >
            {r} km
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 rounded-full bg-white p-1 text-sm" role="group" aria-label="Ansicht">
        {(
          [
            ["cards", "🃏 Karten"],
            ["list", "📋 Liste"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => changeView(v)}
            aria-pressed={view === v}
            className={`rounded-full py-2 font-bold transition ${view === v ? "bg-brand text-paper" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {pos && !pos.precise && (
        <p className="mb-4 rounded-2xl bg-sun/30 p-3 text-xs text-ink">
          Dein Standort ist aus. Wir zeigen Anfragen rund um <b>{profile.home_label ?? "Trebbin"}</b>
          {profile.home_label ? " und schicken dir Nachrichten von dort." : "."}{" "}
          <Link href="/app/profil#zuhause" className="font-bold underline">
            {profile.home_label ? "Heimatort ändern" : "Heimatort festlegen"}
          </Link>
          . Am genauesten wird es, wenn du den Standort freigibst.
        </p>
      )}

      {items === null ? (
        <Spinner label="Suche Anfragen in deiner Nähe" />
      ) : items.length === 0 ? (
        <Empty error={error} />
      ) : (
        view === "list" ? <List items={items} /> : <Stack items={items} onDecide={decide} />
      )}
      {toastNode}
    </div>
  );
}

function Empty({ error }: { error: string | null }) {
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center">
      <p className="text-5xl">🌱</p>
      <h2 className="mt-3 text-xl font-extrabold">{error ?? "Gerade ist alles erledigt"}</h2>
      <p className="mt-2 text-muted">
        Nichts Offenes in deinem Umkreis. Schau später nochmal rein, frag selbst etwas an oder biete an,
        was du kannst.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href="/app/neu" className={btn.primary}>
          Hilfe anfragen
        </Link>
        <Link href="/app/neu?art=angebot" className={btn.accent}>
          Hilfe anbieten
        </Link>
      </div>
    </div>
  );
}

/** Gesamtüberblick: alles im Umkreis als Liste, getrennt nach Gesucht und Geboten */
function List({ items }: { items: FeedItem[] }) {
  const [kind, setKind] = useState<"request" | "offer">("request");
  const [cat, setCat] = useState<string | null>(null);
  const requests = items.filter((i) => i.kind === "request");
  const offers = items.filter((i) => i.kind === "offer");
  const ofKind = kind === "request" ? requests : offers;
  const cats = CATEGORIES.filter((c) => ofKind.some((i) => i.category === c.id));
  const shown = cat ? ofKind.filter((i) => i.category === cat) : ofKind;

  function changeKind(k: "request" | "offer") {
    setKind(k);
    setCat(null);
  }

  return (
    <div>
      <div className="mb-3 flex gap-2" role="tablist" aria-label="Gesucht oder geboten">
        {(
          [
            ["request", `🙋 Gesucht (${requests.length})`],
            ["offer", `🎁 Geboten (${offers.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => changeKind(k)}
            className={`flex-1 rounded-2xl px-3 py-3 font-extrabold transition ${kind === k ? (k === "offer" ? "bg-brand-soft" : "bg-accent") : "bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {cats.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 text-sm" role="group" aria-label="Kategorie">
          <button
            type="button"
            onClick={() => setCat(null)}
            aria-pressed={cat === null}
            className={`shrink-0 rounded-full px-3 py-1.5 font-bold ${cat === null ? "bg-ink text-paper" : "bg-white"}`}
          >
            Alle
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
              className={`shrink-0 rounded-full px-3 py-1.5 font-bold ${cat === c.id ? "bg-ink text-paper" : "bg-white"}`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-3xl bg-white p-6 text-center text-muted">
          {kind === "request" ? "Gerade sucht niemand Hilfe in deinem Umkreis." : "Gerade bietet niemand etwas in deinem Umkreis an."}
          <Link
            href={kind === "request" ? "/app/neu?art=angebot" : "/app/neu"}
            className="mt-3 block font-bold text-accent underline"
          >
            {kind === "request" ? "Selbst etwas anbieten" : "Selbst Hilfe anfragen"}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((item) => (
            <ListRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListRow({ item }: { item: FeedItem }) {
  const c = categoryOf(item.category);
  const isOffer = item.kind === "offer";
  const isOrg = Boolean(item.requester_org);
  const who = (item.requester_org ?? item.requester_name).split(" ")[0];
  return (
    <li>
      <Link
        href={`/app/anfrage/${item.id}`}
        className={`flex items-center gap-3 rounded-3xl bg-white p-3 ${isOrg ? "ring-2 ring-accent/60" : ""}`}
      >
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${isOffer ? "bg-brand-soft" : "bg-accent-soft"}`}
          aria-hidden
        >
          {c.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{item.title}</span>
          <span className="block truncate text-xs text-muted">
            {isOrg && "❤️ "}
            {who} · {timingLabel(item.timing, item.scheduled_at)}
 · {distanceLabel(item.distance_m)}
          </span>
        </span>
        {!isOffer && (
          <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-extrabold text-sun">
            +{pointsFor(item.estimated_minutes, item.category)}
          </span>
        )}
      </Link>
    </li>
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
        <button type="button" className={`${btn.accent} flex-[1.4]`} onClick={() => finish("right")}>
          {top.kind === "offer" ? "Annehmen" : "Ich helfe"}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        Nach rechts wischen zum Zusagen, nach links zum Überspringen. Noch {items.length} in deiner Nähe.
      </p>
    </div>
  );
}

function RequestCard({ item, hint }: { item: FeedItem; hint: "left" | "right" | null }) {
  const cat = categoryOf(item.category);
  const free = item.helpers_needed - item.helpers_accepted;
  const isOffer = item.kind === "offer";
  const isOrg = Boolean(item.requester_org);
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-white p-6 shadow-[0_14px_34px_-16px_rgba(35,32,29,.45)] ${isOrg ? "ring-4 ring-accent/60" : isOffer ? "ring-4 ring-brand-soft" : ""}`}
    >
      {hint && (
        <span
          className={`absolute top-6 z-10 rounded-xl border-4 px-3 py-1 text-xl font-extrabold ${hint === "right" ? "right-6 rotate-6 border-brand bg-accent text-ink" : "left-6 -rotate-6 border-ink/40 bg-white text-ink/60"}`}
        >
          {hint === "right" ? (isOffer ? "NEHME ICH" : "ICH HELFE") : "NICHT JETZT"}
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl ${isOffer ? "bg-brand-soft" : "bg-accent-soft"}`}>
          {cat.emoji}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold text-muted">
            {isOffer ? "Angebot" : "Gesucht"} · {cat.label}
          </p>
          <p className="font-bold">
            {item.place_label ? `📍 ${item.place_label} · ` : ""}
            {distanceLabel(item.distance_m)}
          </p>
        </div>
      </div>

      <h2 className="mt-5 text-[1.75rem] leading-tight font-extrabold">{item.title}</h2>
      {item.description && <p className="mt-2 line-clamp-4 text-ink/80">{item.description}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone={item.timing === "now" ? "accent" : "plain"}>⏱ {timingLabel(item.timing, item.scheduled_at)}</Chip>
        {item.category !== "lend" && <Chip>{formatMinutes(item.estimated_minutes)}</Chip>}
        {item.lend_until && <Chip>↩︎ bis {formatDate(item.lend_until)}</Chip>}
        {item.recurrence !== "once" && <Chip>🔁 {RECURRENCE_LABEL[item.recurrence]}</Chip>}
        {item.helpers_needed > 1 && (
          <Chip>
            👥 noch {free} von {item.helpers_needed}
          </Chip>
        )}
        {item.gender_pref !== "any" && <Chip tone="warn">{item.gender_pref === "female" ? "Nur Frauen" : "Nur Männer"}</Chip>}
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-ink/5 pt-4">
        <Avatar url={item.requester_avatar} name={item.requester_org ?? item.requester_name} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/person/${item.requester_id}`} className="block truncate font-extrabold underline-offset-4 hover:underline">
            {isOrg && <span aria-label="Gemeinnützig">❤️ </span>}
            {item.requester_org ?? item.requester_name}
          </Link>
          <p className="text-xs text-muted">
            {isOrg
              ? `${ORG_CATEGORY_LABEL[item.requester_org_category ?? "other"]} · ${item.requester_name}`
              : isOffer
                ? "bietet an"
                : "fragt an"}
          </p>
        </div>
        <Animal stage={item.requester_stage} aura={item.requester_aura} size={16} />
        {!isOffer && (
          <span className="rounded-full bg-brand px-3 py-1 text-sm font-extrabold text-sun">
            +{pointsFor(item.estimated_minutes, item.category)}
          </span>
        )}
      </div>
    </div>
  );
}
