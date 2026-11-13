"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import Chat from "@/components/app/Chat";
import ReportSheet from "@/components/app/ReportSheet";
import { Animal, Avatar, Chip, Sheet, Spinner, StarInput, Stars, btn, card, input, useToast } from "@/components/ui";
import {
  FINAL_MINUTE_OPTIONS,
  GENDER_PREF_LABEL,
  RECURRENCE_LABEL,
  categoryOf,
  errorText,
  formatMinutes,
  pointsFor,
  relativeTime,
  timingLabel,
  type HelperEntry,
  type RequestDetail as Detail,
} from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

export default function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { profile, refreshPending } = useApp();
  const [r, setR] = useState<Detail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [report, setReport] = useState<{ userId: string | null; name: string } | null>(null);
  const { toast, toastNode } = useToast();

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("get_request", { p_request_id: id });
    setR(error ? null : ((data as Detail | null) ?? null));
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden
    void load();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`helpers-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_helpers", filter: `request_id=eq.${id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  async function call(fn: string, args: Record<string, unknown>, success?: string) {
    setBusy(true);
    const { error } = await getSupabase().rpc(fn, args);
    setBusy(false);
    if (error) {
      toast(errorText(error));
      return false;
    }
    if (success) toast(success);
    await load();
    refreshPending();
    return true;
  }

  if (r === undefined) return <Spinner />;
  if (r === null) {
    return (
      <div className={`${card} text-center`}>
        <p className="text-4xl">🤷</p>
        <h1 className="mt-2 text-xl font-extrabold">Diese Anfrage gibt es nicht mehr</h1>
        <p className="mt-1 text-muted">Sie wurde erledigt, abgebrochen oder ist nicht für dich sichtbar.</p>
        <Link href="/app" className={`${btn.primary} mt-4`}>
          Zu den Anfragen
        </Link>
      </div>
    );
  }

  const cat = categoryOf(r.category);
  const isRequester = r.my_role === "requester";
  const accepted = r.helpers.filter((h) => h.status === "accepted");
  const offered = r.helpers.filter((h) => h.status === "offered");
  const isParticipant = isRequester || r.my_status === "accepted";
  const open = r.status === "open";
  const names: Record<string, string> = { [r.requester.id]: r.requester.display_name };
  for (const h of r.helpers) names[h.helper_id] = h.profile.display_name;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => router.back()} className="text-sm font-bold text-muted">
        ← Zurück
      </button>

      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-paper text-3xl">{cat.emoji}</span>
          <StatusChip r={r} />
        </div>
        <h1 className="mt-4 text-2xl leading-tight font-extrabold">{r.title}</h1>
        {r.description && <p className="mt-2 whitespace-pre-wrap text-ink/80">{r.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip>⏱ {timingLabel(r.timing, r.scheduled_at)}</Chip>
          <Chip>{formatMinutes(r.final_minutes ?? r.estimated_minutes)}</Chip>
          <Chip>{r.mode === "remote" ? "📞 Telefon oder Video" : "📍 Vor Ort"}</Chip>
          {r.recurrence !== "once" && <Chip>🔁 {RECURRENCE_LABEL[r.recurrence]}</Chip>}
          {r.helpers_needed > 1 && (
            <Chip>
              👥 {accepted.length} von {r.helpers_needed}
            </Chip>
          )}
          {r.gender_pref !== "any" && <Chip tone="warn">{GENDER_PREF_LABEL[r.gender_pref]}</Chip>}
        </div>
        <p className="mt-3 text-xs text-muted">Erstellt {relativeTime(r.created_at)}</p>

        {isParticipant && r.mode === "in_person" && (
          <div className="mt-4 rounded-2xl bg-lime/50 p-4">
            <p className="text-sm font-bold text-muted">Ort {isRequester ? "(sehen nur Angenommene)" : ""}</p>
            <p className="font-extrabold">{r.address_note || "Kein Adresshinweis, klärt den Treffpunkt im Chat."}</p>
            {r.lat != null && r.lng != null && (
              <a
                className="mt-2 inline-block text-sm font-bold underline"
                href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=17/${r.lat}/${r.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Auf der Karte zeigen
              </a>
            )}
          </div>
        )}
      </section>

      {!isRequester && (
        <section className={`${card} flex items-center gap-3`}>
          <Avatar url={r.requester.avatar_url} name={r.requester.display_name} />
          <div className="min-w-0 flex-1">
            <Link href={`/app/person/${r.requester.id}`} className="font-extrabold underline-offset-4 hover:underline">
              {r.requester.organization_name ?? r.requester.display_name}
            </Link>
            <p className="text-sm text-muted">fragt an · {r.requester.district ?? "Trebbin"}</p>
          </div>
          <Animal stage={r.requester.animal_stage} aura={r.requester.aura_active} size={18} />
        </section>
      )}

      {/* Aktionen je nach Rolle */}
      {isRequester && open && (
        <RequesterPanel
          r={r}
          offered={offered}
          accepted={accepted}
          busy={busy}
          onAccept={(h) => call("accept_helper", { p_request_id: r.id, p_helper_id: h }, "Angenommen. Ihr könnt jetzt chatten.")}
          onDecline={(h) => call("decline_helper", { p_request_id: r.id, p_helper_id: h }, "Abgelehnt.")}
          onComplete={() => setCompleteOpen(true)}
          onCancel={async () => {
            if (!window.confirm("Anfrage wirklich zurückziehen?")) return;
            if (await call("cancel_request", { p_request_id: r.id }, "Anfrage zurückgezogen.")) router.replace("/app/meine");
          }}
        />
      )}

      {r.my_role === "viewer" && open && (
        <button
          type="button"
          className={`${btn.lime} w-full`}
          disabled={busy}
          onClick={() => call("swipe", { p_request_id: r.id, p_direction: "right" }, "Angebot gesendet.")}
        >
          Ich helfe ({pointsFor(r.estimated_minutes)} Karma)
        </button>
      )}

      {r.my_role === "helper" && open && (
        <section className={`${card} space-y-3`}>
          {r.my_status === "offered" && (
            <p className="font-bold">
              ⏳ Dein Angebot ist raus. {r.requester.first_name} entscheidet und meldet sich.
            </p>
          )}
          {r.my_status === "accepted" && !r.helper_done_at && (
            <>
              <p className="font-bold">✓ Du bist dabei. Verabredet euch im Chat.</p>
              <button type="button" className={`${btn.lime} w-full`} onClick={() => setDoneOpen(true)}>
                Hilfe erledigt
              </button>
            </>
          )}
          {r.helper_done_at && (
            <p className="font-bold">
              ✓ Als erledigt gemeldet. {r.requester.first_name} bestätigt noch die Zeit. Spätestens nach 24
              Stunden bekommst du die Punkte automatisch.
            </p>
          )}
          {(r.my_status === "offered" || (r.my_status === "accepted" && !r.helper_done_at)) && (
            <button
              type="button"
              className="w-full text-sm font-bold text-muted underline"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("Möchtest du deine Hilfe wirklich zurückziehen?")) return;
                await call("withdraw_help", { p_request_id: r.id }, "Zurückgezogen.");
              }}
            >
              Ich kann doch nicht
            </button>
          )}
        </section>
      )}

      {r.status === "completed" && (
        <section className="rounded-3xl bg-lime/60 p-5">
          <p className="text-lg font-extrabold">🎉 Erledigt</p>
          <p className="text-sm">
            {formatMinutes(r.final_minutes ?? r.estimated_minutes)} gezählt
            {r.auto_completed ? ", automatisch nach 24 Stunden bestätigt" : ""}.
          </p>
          {r.my_role === "helper" && (
            <p className="mt-1 font-bold">
              +{r.helpers.find((h) => h.helper_id === profile.id)?.points_awarded ?? 0} Karma für dich
            </p>
          )}
        </section>
      )}

      {isParticipant && r.status !== "cancelled" && (
        <Chat requestId={r.id} meId={profile.id} names={names} disabled={r.status !== "open"} />
      )}

      {!isRequester && (
        <button
          type="button"
          className="w-full py-2 text-sm font-bold text-muted underline"
          onClick={() => setReport({ userId: r.requester.id, name: r.requester.first_name })}
        >
          Anfrage oder Person melden
        </button>
      )}

      {isRequester && completeOpen && (
        <CompleteSheet
          r={r}
          accepted={accepted}
          onClose={() => setCompleteOpen(false)}
          onDone={async () => {
            setCompleteOpen(false);
            toast("Danke! Die Punkte sind verteilt.");
            await load();
            refreshPending();
          }}
          onReport={(h) => setReport({ userId: h.helper_id, name: h.profile.first_name })}
        />
      )}

      <DoneSheet
        open={doneOpen}
        onClose={() => setDoneOpen(false)}
        onSubmit={async (note) => {
          setDoneOpen(false);
          await call("helper_mark_done", { p_request_id: r.id, p_note: note }, "Super, danke fürs Helfen!");
        }}
      />

      <ReportSheet
        open={Boolean(report)}
        onClose={() => setReport(null)}
        targetUserId={report?.userId ?? null}
        requestId={r.id}
        targetName={report?.name ?? ""}
        onDone={toast}
      />
      {toastNode}
    </div>
  );
}

function StatusChip({ r }: { r: Detail }) {
  if (r.status === "completed") return <Chip tone="forest">Erledigt</Chip>;
  if (r.status === "cancelled") return <Chip>Zurückgezogen</Chip>;
  if (r.helper_done_at) return <Chip tone="warn">Wartet auf Bestätigung</Chip>;
  return <Chip tone="lime">Offen</Chip>;
}

function HelperRow({ h, children }: { h: HelperEntry; children?: React.ReactNode }) {
  const p = h.profile;
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar url={p.avatar_url} name={p.display_name} />
      <div className="min-w-0 flex-1">
        <Link href={`/app/person/${p.id}`} className="font-extrabold underline-offset-4 hover:underline">
          {p.display_name}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Stars value={p.avg_stars} count={p.ratings_count} />
          <span>{p.helps_count} Hilfen</span>
        </div>
      </div>
      <Animal stage={p.animal_stage} aura={p.aura_active} size={16} />
      {children}
    </div>
  );
}

function RequesterPanel({
  r,
  offered,
  accepted,
  busy,
  onAccept,
  onDecline,
  onComplete,
  onCancel,
}: {
  r: Detail;
  offered: HelperEntry[];
  accepted: HelperEntry[];
  busy: boolean;
  onAccept: (helperId: string) => void;
  onDecline: (helperId: string) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const full = accepted.length >= r.helpers_needed;
  return (
    <section className={`${card} space-y-4`}>
      {r.helper_done_at && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <b>Die Hilfe wurde als erledigt gemeldet.</b> Bitte bestätige die Zeit und bewerte. Ohne
          Bestätigung zählt nach 24 Stunden automatisch die geschätzte Zeit, ohne Sterne.
        </div>
      )}

      <div>
        <h2 className="font-extrabold">
          Dabei {r.helpers_needed > 1 ? `(${accepted.length} von ${r.helpers_needed})` : ""}
        </h2>
        {accepted.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Noch niemand. Sobald jemand nach rechts wischt, siehst du es hier.</p>
        ) : (
          accepted.map((h) => (
            <HelperRow key={h.helper_id} h={h}>
              <button
                type="button"
                className="text-xs font-bold text-muted underline"
                disabled={busy}
                onClick={() => window.confirm(`${h.profile.first_name} wieder ausladen?`) && onDecline(h.helper_id)}
              >
                Ausladen
              </button>
            </HelperRow>
          ))
        )}
      </div>

      {offered.length > 0 && (
        <div>
          <h2 className="font-extrabold">Möchten helfen</h2>
          {offered.map((h) => (
            <HelperRow key={h.helper_id} h={h}>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`${h.profile.first_name} ablehnen`}
                  className="h-10 w-10 rounded-full bg-paper font-bold"
                  disabled={busy}
                  onClick={() => onDecline(h.helper_id)}
                >
                  ✕
                </button>
                <button
                  type="button"
                  aria-label={`${h.profile.first_name} annehmen`}
                  className="h-10 rounded-full bg-lime px-3 font-bold disabled:opacity-40"
                  disabled={busy || full}
                  onClick={() => onAccept(h.helper_id)}
                >
                  Annehmen
                </button>
              </div>
            </HelperRow>
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <button type="button" className={`${btn.lime} w-full`} onClick={onComplete}>
          Hilfe bestätigen und bewerten
        </button>
      )}
      <button type="button" className="w-full text-sm font-bold text-muted underline" disabled={busy} onClick={onCancel}>
        Anfrage zurückziehen
      </button>
    </section>
  );
}

type Feedback = { attended: boolean; stars: number; comment: string };

function CompleteSheet({
  r,
  accepted,
  onClose,
  onDone,
  onReport,
}: {
  r: Detail;
  accepted: HelperEntry[];
  onClose: () => void;
  onDone: () => void;
  onReport: (h: HelperEntry) => void;
}) {
  const [minutes, setMinutes] = useState(r.estimated_minutes);
  const [fb, setFb] = useState<Record<string, Feedback>>(() =>
    Object.fromEntries(accepted.map((h) => [h.helper_id, { attended: true, stars: 0, comment: "" }])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingStars = accepted.some((h) => fb[h.helper_id]?.attended && !fb[h.helper_id]?.stars);

  function update(id: string, patch: Partial<Feedback>) {
    setFb((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const feedback = accepted.map((h) => ({
      helper_id: h.helper_id,
      attended: fb[h.helper_id].attended,
      stars: fb[h.helper_id].attended ? fb[h.helper_id].stars : null,
      comment: fb[h.helper_id].comment,
    }));
    const { error: err } = await getSupabase().rpc("complete_request", {
      p_request_id: r.id,
      p_minutes: minutes,
      p_feedback: feedback,
    });
    setBusy(false);
    if (err) {
      setError(errorText(err));
      return;
    }
    onDone();
  }

  return (
    <Sheet open onClose={onClose} title="Hilfe bestätigen">
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Wie lange hat es tatsächlich gedauert?</span>
          <select className={input} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {FINAL_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatMinutes(m)} · {pointsFor(m)} Karma {m === r.estimated_minutes ? "(geschätzt)" : ""}
              </option>
            ))}
          </select>
        </label>

        {accepted.map((h) => {
          const f = fb[h.helper_id];
          return (
            <div key={h.helper_id} className="rounded-3xl bg-white p-4">
              <div className="flex items-center gap-3">
                <Avatar url={h.profile.avatar_url} name={h.profile.display_name} size={36} />
                <p className="flex-1 font-extrabold">{h.profile.display_name}</p>
              </div>
              {accepted.length > 1 && (
                <label className="mt-3 flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-forest"
                    checked={f.attended}
                    onChange={(e) => update(h.helper_id, { attended: e.target.checked })}
                  />
                  War dabei
                </label>
              )}
              {f.attended && (
                <div className="mt-3 space-y-2">
                  <StarInput value={f.stars} onChange={(v) => update(h.helper_id, { stars: v })} />
                  <textarea
                    className={`${input} min-h-20`}
                    maxLength={500}
                    placeholder="Ein paar nette Worte (sieht jeder im Profil)"
                    value={f.comment}
                    onChange={(e) => update(h.helper_id, { comment: e.target.value })}
                  />
                </div>
              )}
              <button type="button" className="mt-2 text-xs font-bold text-muted underline" onClick={() => onReport(h)}>
                Etwas ist schiefgelaufen? Melden
              </button>
            </div>
          );
        })}

        {error && <p className="text-sm font-bold text-red-800">{error}</p>}
        <button type="button" className={`${btn.primary} w-full`} disabled={busy || missingStars} onClick={submit}>
          {busy ? "Speichert …" : missingStars ? "Bitte Sterne vergeben" : "Bestätigen"}
        </button>
      </div>
    </Sheet>
  );
}

function DoneSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Hilfe erledigt?">
      <div className="space-y-3">
        <p className="text-muted">
          Die anfragende Person bestätigt jetzt die Zeit. Spätestens nach 24 Stunden zählen die
          geschätzten Minuten automatisch.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Wie lief es? (freiwillig, nur für das Karma-Team)</span>
          <textarea
            className={`${input} min-h-20`}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. alles gut, oder: es war anders als beschrieben"
          />
        </label>
        <button type="button" className={`${btn.lime} w-full`} onClick={() => onSubmit(note)}>
          Ja, erledigt
        </button>
      </div>
    </Sheet>
  );
}
