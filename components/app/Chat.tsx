"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { btn, input } from "@/components/ui";
import { errorText } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

type Message = { id: number; sender_id: string; body: string; created_at: string };

export default function Chat({
  requestId,
  meId,
  names,
  disabled,
}: {
  requestId: string;
  meId: string;
  /** sender_id → Anzeigename */
  names: Record<string, string>;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let alive = true;
    void supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("request_id", requestId)
      .order("created_at")
      .limit(300)
      .then(({ data }) => {
        if (alive && data) setMessages(data as Message[]);
      });
    const channel = supabase
      .channel(`chat-${requestId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [requestId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setError(null);
    const { data, error: err } = await getSupabase()
      .from("messages")
      .insert({ request_id: requestId, body })
      .select("id, sender_id, body, created_at")
      .single();
    if (err) {
      setError(errorText(err));
      setText(body);
      return;
    }
    const m = data as Message;
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }

  return (
    <section className="rounded-3xl bg-white p-4" aria-label="Chat">
      <h2 className="mb-3 px-1 font-extrabold">Chat</h2>
      <div className="max-h-80 space-y-2 overflow-y-auto px-1" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">Noch keine Nachrichten. Sagt kurz Hallo und verabredet euch.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-brand text-paper" : "bg-paper"}`}>
                {!mine && <p className="text-xs font-bold text-muted">{names[m.sender_id] ?? "Jemand"}</p>}
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${mine ? "text-paper/60" : "text-muted"}`}>
                  {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {!disabled && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            className={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="Nachricht"
            aria-label="Nachricht"
          />
          <button className={`${btn.primary} px-4`} disabled={!text.trim()} aria-label="Senden">
            ➤
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm font-bold text-red-800">{error}</p>}
    </section>
  );
}
