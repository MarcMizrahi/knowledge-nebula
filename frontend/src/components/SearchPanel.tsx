"use client";

import { useState } from "react";
import { semanticSearch, type SearchHit } from "@/lib/api";
import { cn, SOURCE_COLORS, SOURCE_ICONS } from "@/lib/utils";
import { Search, Loader2 } from "lucide-react";

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { results: hits } = await semanticSearch(query.trim(), 8);
      setResults(hits);
      setSearched(query.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Semantic Search</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Find knowledge by meaning, not just keywords
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to find? (e.g. &quot;machine learning architectures&quot;)"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Search
        </button>
      </form>

      {results !== null && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
            <span className="text-slate-200">&ldquo;{searched}&rdquo;</span>
          </p>

          {results.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🔭</div>
              <p className="text-slate-300 font-medium">No matching knowledge found</p>
              <p className="text-slate-400 text-sm mt-1">
                Try different keywords or add more documents
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((hit, i) => (
                <div key={i} className="glass rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">
                        {SOURCE_ICONS[hit.metadata.source_type] ?? "📄"}
                      </span>
                      <span className="text-slate-200 text-sm font-medium truncate">
                        {hit.metadata.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs px-2 py-0.5 rounded-full border",
                          SOURCE_COLORS[hit.metadata.source_type] ??
                            "bg-gray-500/20 text-gray-300 border-gray-500/30"
                        )}
                      >
                        {hit.metadata.source_type}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-slate-400">
                        {(hit.score * 100).toFixed(0)}% match
                      </span>
                      <div
                        className="score-bar mt-1 w-16"
                        style={{ width: `${hit.score * 100}%`, maxWidth: 64 }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed bg-white/3 rounded-lg p-3">
                    {hit.text}
                  </p>
                  {hit.metadata.tags && (
                    <div className="flex flex-wrap gap-1">
                      {hit.metadata.tags.split(",").filter(Boolean).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
