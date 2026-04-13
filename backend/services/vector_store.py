"""
ChromaDB vector store wrapper.
Uses local sentence-transformers embeddings — no external API key required.
"""
from __future__ import annotations

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from config import settings


_client: chromadb.PersistentClient | None = None
_collection = None


def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=str(settings.chroma_path))
    return _client


def get_collection():
    global _collection
    if _collection is None:
        ef = SentenceTransformerEmbeddingFunction(
            model_name=settings.embedding_model
        )
        _collection = _get_client().get_or_create_collection(
            name="knowledge_nebula",
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def add_chunks(
    doc_id: str,
    chunks: list[str],
    metadatas: list[dict],
) -> int:
    collection = get_collection()
    ids = [f"{doc_id}__chunk_{i}" for i in range(len(chunks))]
    collection.add(documents=chunks, metadatas=metadatas, ids=ids)
    return len(chunks)


def search(query: str, n_results: int = 5, where: dict | None = None) -> list[dict]:
    collection = get_collection()
    kwargs: dict = {"query_texts": [query], "n_results": min(n_results, collection.count() or 1)}
    if where:
        kwargs["where"] = where
    results = collection.query(**kwargs)
    hits = []
    if results and results["documents"]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            hits.append({
                "text": doc,
                "metadata": meta,
                "score": round(1 - dist, 4),  # cosine similarity
            })
    return hits


def delete_document(doc_id: str):
    collection = get_collection()
    # Get all chunk IDs for this doc
    results = collection.get(where={"doc_id": doc_id})
    if results["ids"]:
        collection.delete(ids=results["ids"])


def count() -> int:
    return get_collection().count()
