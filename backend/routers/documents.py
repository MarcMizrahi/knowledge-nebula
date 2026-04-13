from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.document import Document
from services.database import get_db
from services.ingestion import ingest_file, ingest_note, ingest_url
from services.vector_store import delete_document, count as vector_count

router = APIRouter(prefix="/documents", tags=["documents"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    title: str
    source_type: str
    source_path: str | None
    content_preview: str | None
    tags: list[str]
    chunk_count: int
    created_at: str

    class Config:
        from_attributes = True


class URLIngest(BaseModel):
    url: str
    tags: list[str] = []


class NoteIngest(BaseModel):
    title: str
    content: str
    tags: list[str] = []


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _save_doc(meta: dict, db: AsyncSession) -> Document:
    from datetime import datetime
    doc = Document(
        id=meta["id"],
        title=meta["title"],
        source_type=meta["source_type"],
        source_path=meta.get("source_path"),
        content_preview=meta.get("content_preview"),
        tags=meta.get("tags", []),
        chunk_count=meta.get("chunk_count", 0),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


def _doc_out(doc: Document) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "source_type": doc.source_type,
        "source_path": doc.source_path,
        "content_preview": doc.content_preview,
        "tags": doc.tags or [],
        "chunk_count": doc.chunk_count,
        "created_at": doc.created_at.isoformat() if doc.created_at else "",
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
async def list_documents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).order_by(Document.created_at.desc()))
    docs = result.scalars().all()
    return [_doc_out(d) for d in docs]


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document))
    docs = result.scalars().all()
    return {
        "document_count": len(docs),
        "chunk_count": vector_count(),
        "source_types": list({d.source_type for d in docs}),
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    tags: str = Form(default="[]"),
    db: AsyncSession = Depends(get_db),
):
    tag_list: list[str] = json.loads(tags)
    file_bytes = await file.read()
    meta = await ingest_file(file_bytes, file.filename or "upload", tag_list)
    doc = await _save_doc(meta, db)
    return _doc_out(doc)


@router.post("/url")
async def ingest_url_endpoint(body: URLIngest, db: AsyncSession = Depends(get_db)):
    try:
        meta = await ingest_url(body.url, body.tags)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    doc = await _save_doc(meta, db)
    return _doc_out(doc)


@router.post("/note")
async def ingest_note_endpoint(body: NoteIngest, db: AsyncSession = Depends(get_db)):
    meta = await ingest_note(body.title, body.content, body.tags)
    doc = await _save_doc(meta, db)
    return _doc_out(doc)


@router.delete("/{doc_id}")
async def delete_doc(doc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    delete_document(doc_id)
    await db.execute(delete(Document).where(Document.id == doc_id))
    await db.commit()
    return {"ok": True}
