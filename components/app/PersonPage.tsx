"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import ProfileView from "@/components/app/ProfileView";
import ReportSheet from "@/components/app/ReportSheet";
import { Spinner, btn, useToast } from "@/components/ui";
import type { PublicProfile } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

export default function PersonPage({ id }: { id: string }) {
  const router = useRouter();
  const { profile } = useApp();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [blocked, setBlocked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { toast, toastNode } = useToast();

  useEffect(() => {
    if (id === profile.id) {
      router.replace("/app/profil");
      return;
    }
    const supabase = getSupabase();
    void supabase
      .from("public_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setP((data as PublicProfile) ?? null));
    void supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocked_id", id)
      .maybeSingle()
      .then(({ data }) => setBlocked(Boolean(data)));
  }, [id, profile.id, router]);

  async function toggleBlock() {
    const next = !blocked;
    if (next && !window.confirm("Blockieren? Ihr seht dann gegenseitig keine Anfragen mehr.")) return;
    const { error } = await getSupabase().rpc("set_block", { p_user: id, p_blocked: next });
    if (error) {
      toast("Das hat nicht geklappt.");
      return;
    }
    setBlocked(next);
    toast(next ? "Blockiert." : "Blockierung aufgehoben.");
  }

  if (p === undefined) return <Spinner />;
  if (p === null) return <p className="py-16 text-center text-muted">Dieses Profil gibt es nicht.</p>;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => router.back()} className="text-sm font-bold text-muted">
        ← Zurück
      </button>
      <ProfileView p={p} />
      <div className="flex gap-3">
        <button type="button" className={`${btn.ghost} flex-1`} onClick={toggleBlock}>
          {blocked ? "Nicht mehr blockieren" : "Blockieren"}
        </button>
        <button type="button" className={`${btn.danger} flex-1`} onClick={() => setReportOpen(true)}>
          Melden
        </button>
      </div>
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetUserId={p.id}
        requestId={null}
        targetName={p.first_name}
        onDone={(m) => {
          toast(m);
        }}
      />
      {toastNode}
    </div>
  );
}
