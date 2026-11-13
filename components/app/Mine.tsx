"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { Chip, Spinner, btn } from "@/components/ui";
import { categoryOf, formatMinutes, relativeTime, timingLabel } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

type MyRequest = {
  id: string;
  category: string;
  title: string;
  status: "open" | "completed" | "cancelled";
  timing: string;
  scheduled_at: string | null;
  estimated_minutes: number;
  final_minutes: number | null;
  helpers_needed: number;
  helper_done_at: string | null;
  created_at: string;
  request_helpers: { status: string }[];
};

type MyHelp = {
  request_id: string;
  title: string;
  category: string;
  status: "open" | "completed" | "cancelled";
  my_status: "offered" | "accepted" | "declined" | "withdrawn";
  estimated_minutes: number;
  timing: string;
  scheduled_at: string | null;
  helper_done_at: string | null;
  points_awarded: number;
  created_at: string;
  requester_name: string;
};

export default function Mine() {
  const { profile } = useApp();
  const [tab, setTab] = useState<"requests" | "helps">("requests");
  const [requests, setRequests] = useState<MyRequest[] | null>(null);
  const [helps, setHelps] = useState<MyHelp[] | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    void supabase
      .from("help_requests")
      .select(
        "id, category, title, status, timing, scheduled_at, estimated_minutes, final_minutes, helpers_needed, helper_done_at, created_at, request_helpers(status)",
      )
      .eq("requester_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setRequests((data ?? []) as MyRequest[]));
    void supabase.rpc("my_helps").then(({ data }) => setHelps((data ?? []) as MyHelp[]));
  }, [profile.id]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold text-forest">Meine</h1>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-white p-1" role="tablist">
        {(
          [
            ["requests", "Meine Anfragen"],
            ["helps", "Meine Hilfen"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            type="button"
            onClick={() => setTab(v)}
            className={`rounded-full py-2.5 font-bold ${tab === v ? "bg-forest text-paper" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "requests" ? (
        requests === null ? (
          <Spinner />
        ) : requests.length === 0 ? (
          <EmptyState text="Du hast noch nichts angefragt." cta="Hilfe anfragen" href="/app/neu" />
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => {
              const offered = r.request_helpers.filter((h) => h.status === "offered").length;
              const accepted = r.request_helpers.filter((h) => h.status === "accepted").length;
              return (
                <li key={r.id}>
                  <Link href={`/app/anfrage/${r.id}`} className="flex items-center gap-3 rounded-3xl bg-white p-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-paper text-2xl">
                      {categoryOf(r.category).emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{r.title}</p>
                      <p className="text-xs text-muted">
                        {timingLabel(r.timing, r.scheduled_at)} · {relativeTime(r.created_at)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.status === "open" && r.helper_done_at && <Chip tone="warn">Bitte bestätigen</Chip>}
                        {r.status === "open" && offered > 0 && <Chip tone="lime">{offered} möchten helfen</Chip>}
                        {r.status === "open" && !r.helper_done_at && (
                          <Chip>
                            {accepted} von {r.helpers_needed} dabei
                          </Chip>
                        )}
                        {r.status === "completed" && <Chip tone="forest">Erledigt · {formatMinutes(r.final_minutes ?? r.estimated_minutes)}</Chip>}
                        {r.status === "cancelled" && <Chip>Zurückgezogen</Chip>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : helps === null ? (
        <Spinner />
      ) : helps.length === 0 ? (
        <EmptyState text="Du hast noch nicht geholfen. Schau, wer in deiner Nähe Hilfe braucht." cta="Anfragen ansehen" href="/app" />
      ) : (
        <ul className="space-y-3">
          {helps.map((h) => (
            <li key={h.request_id}>
              <Link href={`/app/anfrage/${h.request_id}`} className="flex items-center gap-3 rounded-3xl bg-white p-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-paper text-2xl">
                  {categoryOf(h.category).emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{h.title}</p>
                  <p className="text-xs text-muted">
                    für {h.requester_name} · {timingLabel(h.timing, h.scheduled_at)}
                  </p>
                  <div className="mt-1.5">
                    <HelpStatus h={h} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HelpStatus({ h }: { h: MyHelp }) {
  if (h.status === "completed" && h.points_awarded > 0) return <Chip tone="forest">+{h.points_awarded} Karma</Chip>;
  if (h.status === "completed") return <Chip>Abgeschlossen</Chip>;
  if (h.status === "cancelled") return <Chip>Zurückgezogen</Chip>;
  if (h.my_status === "declined") return <Chip>Hat diesmal nicht gepasst</Chip>;
  if (h.my_status === "withdrawn") return <Chip>Von dir abgesagt</Chip>;
  if (h.my_status === "offered") return <Chip tone="warn">Wartet auf Zusage</Chip>;
  if (h.helper_done_at) return <Chip tone="warn">Erledigt, wartet auf Bestätigung</Chip>;
  return <Chip tone="lime">Du bist dabei</Chip>;
}

function EmptyState({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center">
      <p className="text-muted">{text}</p>
      <Link href={href} className={`${btn.primary} mt-4`}>
        {cta}
      </Link>
    </div>
  );
}
