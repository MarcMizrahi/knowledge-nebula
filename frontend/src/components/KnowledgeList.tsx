"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteDocument, getStats, listDocuments, type KnowledgeDoc, type Stats } from "@/lib/api";
import { cn, formatDate, SOURCE_COLORS, SOURCE_ICONS } from "@/lib/utils";
import { Trash2, ExternalLink, Plus, Search, MessageSquare } from "lucide-react";

export default function KnowledgeList() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([listDocuments(), getStats()]);
      setDocs(d);
      setStats(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setStats((s) =>
        s ? { ...s, document_count: s.document_count - 1 } : s
      );
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Your Knowledge</h1>
          <p className="text-slate-400 mt-1 text-sm">
            All the documents, notes, and URLs in your nebula
          </p>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Knowledge
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Documents", value: stats.document_count, icon: "📚" },
            { label: "Chunks indexed", value: stats.chunk_count, icon: "🔍" },
            { label: "Source types", value: stats.source_types.length, icon: "🗂️" },
          ].map((s) => (
            <div key={s.label} className="glass rounded-xl p-4">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold text-violet-300">{s.value}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/search"
          className="flex items-center gap-2 glass hover:bg-white/5 text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <Search size={15} />
          Semantic Search
        </Link>
        <Link
          href="/chat"
          className="flex items-center gap-2 glass hover:bg-white/5 text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <MessageSquare size={15} />
          Chat with Knowledge
        </Link>
      </div>

      {/* Document list */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading your nebula…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <div className="text-6xl mb-4">🌌</div>
          <h2 className="text-xl font-semibold text-slate-200 mb-2">Your nebula is empty</h2>
          <p className="text-slate-400 mb-6 text-sm">
            Start by uploading documents, adding URLs, or writing notes
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add your first knowledge
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="glass rounded-xl p-4 flex items-start gap-4 hover:border-white/10 transition-colors"
            >
              <div className="text-2xl shrink-0 mt-0.5">
                {SOURCE_ICONS[doc.source_type] ?? "📄"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-slate-100 truncate">{doc.title}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.source_path && (doc.source_type === "url") && (
                      <a
                        href={doc.source_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting === doc.id}
                      className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {doc.content_preview && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {doc.content_preview}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center text-xs px-2 py-0.5 rounded-full border",
                      SOURCE_COLORS[doc.source_type] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"
                    )}
                  >
                    {doc.source_type}
                  </span>
                  <span className="text-xs text-slate-500">
                    {doc.chunk_count} chunks
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(doc.created_at)}
                  </span>
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
