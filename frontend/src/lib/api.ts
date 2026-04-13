const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type SourceType = "pdf" | "text" | "markdown" | "docx" | "url" | "note";

export interface KnowledgeDoc {
  id: string;
  title: string;
  source_type: SourceType;
  source_path: string | null;
  content_preview: string | null;
  tags: string[];
  chunk_count: number;
  created_at: string;
}

export interface SearchHit {
  text: string;
  metadata: {
    doc_id: string;
    title: string;
    source_type: string;
    source_path: string;
    chunk_index: number;
    tags: string;
  };
  score: number;
}

export interface Stats {
  document_count: number;
  chunk_count: number;
  source_types: string[];
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function listDocuments(): Promise<KnowledgeDoc[]> {
  const res = await fetch(`${BASE_URL}/documents/`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${BASE_URL}/documents/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function uploadFile(
  file: File,
  tags: string[]
): Promise<KnowledgeDoc> {
  const form = new FormData();
  form.append("file", file);
  form.append("tags", JSON.stringify(tags));
  const res = await fetch(`${BASE_URL}/documents/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function ingestURL(
  url: string,
  tags: string[]
): Promise<KnowledgeDoc> {
  const res = await fetch(`${BASE_URL}/documents/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, tags }),
  });
  if (!res.ok) throw new Error("URL ingest failed");
  return res.json();
}

export async function ingestNote(
  title: string,
  content: string,
  tags: string[]
): Promise<KnowledgeDoc> {
  const res = await fetch(`${BASE_URL}/documents/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, tags }),
  });
  if (!res.ok) throw new Error("Note ingest failed");
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/documents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function semanticSearch(
  query: string,
  nResults = 8,
  docId?: string
): Promise<{ query: string; results: SearchHit[] }> {
  const res = await fetch(`${BASE_URL}/search/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, n_results: nResults, doc_id: docId }),
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

// ── Chat (SSE) ────────────────────────────────────────────────────────────────

export type ChatEvent =
  | { type: "sources"; sources: { title: string; source_type: string; source_path: string; score: number }[] }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; text: string };

export async function* streamChat(
  question: string,
  nResults = 6,
  docId?: string
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${BASE_URL}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, n_results: nResults, doc_id: docId }),
  });

  if (!res.ok || !res.body) {
    yield { type: "error", text: "Chat request failed" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          yield JSON.parse(line.slice(6)) as ChatEvent;
        } catch {}
      }
    }
  }
}
