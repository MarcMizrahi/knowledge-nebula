from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from services.vector_store import search as vector_search

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    n_results: int = 8
    doc_id: str | None = None


@router.post("/")
async def semantic_search(body: SearchRequest):
    where = {"doc_id": body.doc_id} if body.doc_id else None
    hits = vector_search(body.query, n_results=body.n_results, where=where)
    return {"query": body.query, "results": hits}
