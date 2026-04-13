"use client";

import { useEffect, useRef, useState } from "react";
import { streamChat } from "@/lib/api";
import { cn, SOURCE_ICONS } from "@/lib/utils";
import { Send, Loader2, Bot, User, BookOpen } from "lucide-react";

type Source = {
  title: string;
  source_type: string;
  source_path: string;
  score: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  loading?: boolean;
};

const STARTERS = [
  "Summarize the key themes across my documents",
  "What are the most important concepts I've saved?",
  "What did I learn about AI recently?",
  "Find connections between my notes",
];

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(question: string) {
    if (!question.trim() || busy) return;
    const q = question.trim();
    setInput("");
    setBusy(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", loading: true },
    ]);

    let text = "";
    let sources: Source[] = [];

    try {
      for await (const event of streamChat(q)) {
        if (event.type === "sources") {
          sources = event.sources;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, sources };
            }
            return updated;
          });
        } else if (event.type === "text") {
          text += event.text;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: text,
                loading: false,
              };
            }
            return updated;
          });
        } else if (event.type === "error") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: event.text,
                loading: false,
              };
            }
            return updated;
          });
        }
      }
    } finally {
      setBusy(false);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant" && last.loading) {
          updated[updated.length - 1] = { ...last, loading: false };
        }
        return updated;
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <div className="mb-4">
        <h1 className="text-3xl font-bold gradient-text">Chat with Knowledge</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Ask anything — answers are grounded in your documents via RAG
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="text-5xl">🌌</div>
            <div>
              <h2 className="text-xl font-semibold text-slate-200">
                Ask your Knowledge Nebula
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Questions are answered using your uploaded documents
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-lg">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="glass hover:bg-white/5 text-slate-300 text-xs px-3 py-2.5 rounded-xl text-left transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 w-8 h-8 rounded-full bg-violet-600/30 flex items-center justify-center mt-0.5">
                  <Bot size={14} className="text-violet-300" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] space-y-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-violet-600/30 text-slate-100 rounded-tr-sm"
                      : "glass text-slate-200 rounded-tl-sm"
                  )}
                >
                  {msg.loading ? (
                    <Loader2 size={14} className="animate-spin text-violet-400" />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <BookOpen size={11} />
                      Sources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.slice(0, 4).map((src, j) => (
                        <div
                          key={j}
                          className="flex items-center gap-1 text-xs glass px-2 py-1 rounded-lg text-slate-400"
                        >
                          <span>{SOURCE_ICONS[src.source_type] ?? "📄"}</span>
                          <span className="max-w-32 truncate">{src.title}</span>
                          <span className="text-violet-400">
                            {(src.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center mt-0.5">
                  <User size={14} className="text-blue-300" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 glass rounded-2xl p-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your knowledge… (Enter to send)"
          rows={1}
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none resize-none max-h-32"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="shrink-0 w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 flex items-center justify-center transition-colors"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin text-white" />
          ) : (
            <Send size={15} className="text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
