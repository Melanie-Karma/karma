"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Celebration from "@/components/app/Celebration";
import PushPrompt from "@/components/app/PushPrompt";
import { Spinner } from "@/components/ui";
import { registerServiceWorker, syncPushSubscription } from "@/lib/push";
import type { OwnProfile } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

type Ctx = {
  profile: OwnProfile;
  reloadProfile: () => Promise<void>;
  /** Anzahl Dinge, die auf mich warten (Angebote, Bestätigungen) */
  pending: number;
  refreshPending: () => void;
};

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp nur innerhalb von AppShell verwenden");
  return ctx;
}

const NAV = [
  { href: "/app", label: "Helfen", icon: "👋" },
  { href: "/app/neu", label: "Neu", icon: "＋" },
  { href: "/app/meine", label: "Meine", icon: "📋" },
  { href: "/app/profil", label: "Profil", icon: "🙂" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [pending, setPending] = useState(0);
  // Erst feiern, dann nach Push fragen, nie beides gleichzeitig
  const [celebrated, setCelebrated] = useState(false);
  const celebrationDone = useCallback(() => setCelebrated(true), []);

  const reloadProfile = useCallback(async () => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.replace("/?login=1");
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
    if (data) setProfile(data as OwnProfile);
  }, [router]);

  const refreshPending = useCallback(async () => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    // Offene Zusagen auf meine Anfragen und Angebote, plus Bestätigungen, die ich geben soll
    const [{ data }, { data: helps }] = await Promise.all([
      supabase
        .from("help_requests")
        .select("id, kind, helper_done_at, request_helpers(status)")
        .eq("requester_id", auth.user.id)
        .eq("status", "open"),
      supabase.rpc("my_helps"),
    ]);
    let n = 0;
    for (const r of (data ?? []) as {
      kind: string;
      helper_done_at: string | null;
      request_helpers: { status: string }[];
    }[]) {
      if (r.helper_done_at && r.kind === "request") n += 1;
      n += r.request_helpers.filter((h) => h.status === "offered").length;
    }
    // Angebote, die ich angenommen habe und die als erledigt gemeldet sind
    for (const h of (helps ?? []) as { kind: string; status: string; my_status: string; helper_done_at: string | null }[]) {
      if (h.kind === "offer" && h.status === "open" && h.my_status === "accepted" && h.helper_done_at) n += 1;
    }
    setPending(n);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sitzung und Profil gibt es erst im Browser
    void reloadProfile();
    void refreshPending();
    void registerServiceWorker().then(() => syncPushSubscription());
    const supabase = getSupabase();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/");
    });
    // Änderungen an Angeboten (RLS filtert auf meine) aktualisieren den Zähler
    const channel = supabase
      .channel("pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "request_helpers" }, () => {
        void refreshPending();
      })
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [reloadProfile, refreshPending, router]);

  // Unvollständiges Profil: zuerst Willkommen-Seite
  const incomplete = profile && (!profile.first_name || !profile.accepted_terms_at);
  useEffect(() => {
    if (incomplete && pathname !== "/app/willkommen") router.replace("/app/willkommen");
  }, [incomplete, pathname, router]);

  if (!profile || (incomplete && pathname !== "/app/willkommen")) {
    return <Spinner label="Karma wird geladen" />;
  }

  const showNav = pathname !== "/app/willkommen";

  return (
    <AppContext.Provider value={{ profile, reloadProfile, pending, refreshPending }}>
      <div className={`mx-auto w-full max-w-xl px-4 pt-4 ${showNav ? "pb-28" : "pb-10"}`}>
        {children}
      </div>
      {showNav && <Celebration onDone={celebrationDone} />}
      {showNav && <PushPrompt ready={celebrated} />}
      {showNav && (
        <nav
          aria-label="Hauptmenü"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <ul className="mx-auto flex max-w-xl">
            {NAV.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex flex-col items-center gap-0.5 py-3 text-xs font-bold ${active ? "text-brand" : "text-muted"}`}
                  >
                    <span
                      className={`grid h-8 w-12 place-items-center rounded-full text-lg ${active ? "bg-accent" : ""}`}
                      aria-hidden
                    >
                      {item.icon}
                    </span>
                    {item.label}
                    {item.href === "/app/meine" && pending > 0 && (
                      <span className="absolute top-2 right-[calc(50%-1.6rem)] grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] text-white">
                        {pending}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </AppContext.Provider>
  );
}
