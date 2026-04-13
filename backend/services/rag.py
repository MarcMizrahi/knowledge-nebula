"""
RAG (Retrieval Augmented Generation) service.
Retrieves relevant chunks then calls Claude to answer.
Streams the response.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

import anthropic

from config import settings
from services.vector_store import search as vector_search


_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. Add it to backend/.env to enable AI chat."
            )
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


SYSTEM_PROMPT = """You are a helpful assistant for a personal knowledge base called Knowledge Nebula.
You answer questions based exclusively on the provided context chunks retrieved from the user's documents.
If the context does not contain enough information to answer, say so clearly and suggest the user add more relevant documents.
Always cite which document(s) you used by mentioning the title in your answer.
Be concise but thorough."""


async def chat_stream(
    question: str,
    n_results: int = 6,
    doc_id: str | None = None,
) -> AsyncIterator[str]:
    """Yields SSE-formatted strings for streaming."""
    where = {"doc_id": doc_id} if doc_id else None
    hits = vector_search(question, n_results=n_results, where=where)

    if not hits:
        yield "data: " + json.dumps({"type": "error", "text": "No relevant documents found. Try uploading some content first."}) + "\n\n"
        return

    # Build context block
    context_parts = []
    for i, hit in enumerate(hits, 1):
        title = hit["metadata"].get("title", "Unknown")
        score = hit["score"]
        context_parts.append(f"[{i}] Source: {title} (relevance: {score:.2f})\n{hit['text']}")
    context = "\n\n---\n\n".join(context_parts)

    user_message = f"""Context from my knowledge base:

{context}

---

Question: {question}"""

    client = _get_client()
    async with client.messages.stream(
        model=settings.claude_model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        # First emit the sources
        sources = [
            {
                "title": h["metadata"].get("title", "Unknown"),
                "source_type": h["metadata"].get("source_type", ""),
                "source_path": h["metadata"].get("source_path", ""),
                "score": h["score"],
            }
            for h in hits
        ]
        yield "data: " + json.dumps({"type": "sources", "sources": sources}) + "\n\n"

        async for text in stream.text_stream:
            yield "data: " + json.dumps({"type": "text", "text": text}) + "\n\n"

        yield "data: " + json.dumps({"type": "done"}) + "\n\n"
