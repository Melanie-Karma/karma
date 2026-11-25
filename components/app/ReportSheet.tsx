"use client";

import { useState } from "react";
import { Sheet, btn, input } from "@/components/ui";
import { REPORT_REASONS, errorText } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

/** Melden nach DSA Art. 16: Person und/oder Anfrage */
export default function ReportSheet({
  open,
  onClose,
  targetUserId,
  requestId,
  targetName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  targetUserId: string | null;
  requestId: string | null;
  targetName: string;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const { error: err } = await supabase.rpc("report", {
      p_target_user: targetUserId,
      p_request_id: requestId,
      p_reason: reason,
      p_details: details,
    });
    if (!err && block && targetUserId) {
      await supabase.rpc("set_block", { p_user: targetUserId, p_blocked: true });
    }
    setBusy(false);
    if (err) {
      setError(errorText(err));
      return;
    }
    setReason("");
    setDetails("");
    setBlock(false);
    onClose();
    onDone("Danke. Wir schauen uns das an.");
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${targetName} melden`}>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Bei Gefahr ruf sofort 110. Die Meldung geht vertraulich an das Karma-Team, die gemeldete
          Person erfährt nicht, von wem sie kommt.
        </p>
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReason(r.id)}
              className={`w-full rounded-2xl px-4 py-3 text-left font-bold ${reason === r.id ? "bg-brand text-paper" : "bg-white"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          className={`${input} min-h-24`}
          maxLength={1000}
          placeholder="Was ist passiert? (freiwillig)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        {targetUserId && (
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" className="h-5 w-5 accent-brand" checked={block} onChange={(e) => setBlock(e.target.checked)} />
            Außerdem blockieren
          </label>
        )}
        {error && <p className="text-sm font-bold text-red-800">{error}</p>}
        <button type="button" className={`${btn.primary} w-full`} disabled={!reason || busy} onClick={submit}>
          {busy ? "Sendet …" : "Meldung senden"}
        </button>
      </div>
    </Sheet>
  );
}
