"use client";

import { useRef, useState } from "react";
import type { RoadmapDraft } from "@/app/api/portal/roadmap-assist/route";

// "Help me write this" (PR 4): a compact Q&A that drafts the propose form.
// Two or three short questions, then the draft lands in the form fields for
// the client to review and send. Nothing is submitted from here.

type ChatMessage = { role: "user" | "assistant"; content: string };

export function ProposeAssist({ onDraft }: { onDraft: (draft: RoadmapDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    try {
      const res = await fetch("/api/portal/roadmap-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as {
        reply?: string;
        draft?: RoadmapDraft | null;
        messages?: ChatMessage[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "The assistant hit a problem. Please try again.");
        setBusy(false);
        return;
      }
      if (data.draft) {
        onDraft(data.draft);
        setOpen(false);
        setMessages([]);
      } else {
        setMessages([...next, { role: "assistant", content: data.reply ?? "" }]);
        queueMicrotask(() => scrollRef.current?.scrollTo({ top: 999999 }));
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cbp-link"
        style={{ marginBottom: 8 }}
        onClick={() => {
          setOpen(true);
          setMessages([]);
          setError(null);
        }}
      >
        ✨ Help me write this
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid var(--admin-line)", borderRadius: 10, padding: 10, marginBottom: 10, background: "var(--admin-surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <strong style={{ fontSize: 12.5, flex: 1 }}>Draft assistant</strong>
        <button type="button" className="cbp-link" onClick={() => setOpen(false)}>Close</button>
      </div>
      {messages.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--admin-ink-2)", margin: "0 0 8px" }}>
          Tell me the problem or idea in a sentence. I&apos;ll ask a question or two, then fill in the form for you to review.
        </p>
      )}
      {messages.length > 0 && (
        <div ref={scrollRef} style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 6, marginBottom: 8 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                fontSize: 12.5,
                lineHeight: 1.5,
                padding: "6px 9px",
                borderRadius: 8,
                background: m.role === "user" ? "var(--admin-accent-soft)" : "var(--admin-surface)",
                border: m.role === "user" ? "none" : "1px solid var(--admin-line-soft)",
                justifySelf: m.role === "user" ? "end" : "start",
                maxWidth: "90%",
              }}
            >
              {m.content}
            </div>
          ))}
          {busy && <div style={{ fontSize: 12.5, color: "var(--admin-ink-2)" }}>Thinking…</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ flex: 1, fontFamily: "inherit", fontSize: 13, padding: "7px 9px", border: "1px solid var(--admin-line)", borderRadius: 8 }}
          value={input}
          placeholder={messages.length === 0 ? "e.g. our returns process is chaos" : "Your answer…"}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="cbp-btn" disabled={busy || !input.trim()} onClick={() => void send()}>
          Send
        </button>
      </div>
      {error && <div className="cbp-err">{error}</div>}
    </div>
  );
}
