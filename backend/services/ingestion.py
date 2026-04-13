"""
Document ingestion pipeline:
  file / URL / plain text  →  parse  →  chunk  →  embed  →  ChromaDB
"""
from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import uuid
from pathlib import Path

import aiofiles
import httpx
from bs4 import BeautifulSoup
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings
from services.vector_store import add_chunks


# ---------------------------------------------------------------------------
# Text extraction helpers
# ---------------------------------------------------------------------------

def _extract_pdf(path: Path) -> str:
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def _extract_docx(path: Path) -> str:
    from docx import Document as DocxDocument
    doc = DocxDocument(str(path))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _extract_url(url: str) -> tuple[str, str]:
    """Returns (title, text)"""
    resp = httpx.get(url, follow_redirects=True, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    # Remove scripts / styles
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    title = soup.title.string.strip() if soup.title else url
    text = soup.get_text(separator="\n", strip=True)
    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=settings.chunk_size,
    chunk_overlap=settings.chunk_overlap,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def _chunk(text: str) -> list[str]:
    return _splitter.split_text(text)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def ingest_file(
    file_bytes: bytes,
    filename: str,
    tags: list[str] | None = None,
) -> dict:
    """Save uploaded file, extract text, chunk, embed. Returns doc metadata."""
    doc_id = str(uuid.uuid4())
    suffix = Path(filename).suffix.lower()

    # Persist raw file
    save_path = settings.uploads_path / f"{doc_id}{suffix}"
    async with aiofiles.open(save_path, "wb") as f:
        await f.write(file_bytes)

    # Extract text
    if suffix == ".pdf":
        raw_text = _extract_pdf(save_path)
        source_type = "pdf"
    elif suffix in (".docx", ".doc"):
        raw_text = _extract_docx(save_path)
        source_type = "docx"
    elif suffix == ".md":
        raw_text = _extract_text(save_path)
        source_type = "markdown"
    else:
        raw_text = _extract_text(save_path)
        source_type = "text"

    chunks = _chunk(raw_text)
    metadatas = [
        {
            "doc_id": doc_id,
            "title": filename,
            "source_type": source_type,
            "source_path": str(save_path),
            "chunk_index": i,
            "tags": ",".join(tags or []),
        }
        for i in range(len(chunks))
    ]
    add_chunks(doc_id, chunks, metadatas)

    return {
        "id": doc_id,
        "title": filename,
        "source_type": source_type,
        "source_path": str(save_path),
        "content_preview": raw_text[:500],
        "tags": tags or [],
        "chunk_count": len(chunks),
    }


async def ingest_url(url: str, tags: list[str] | None = None) -> dict:
    doc_id = str(uuid.uuid4())
    title, raw_text = _extract_url(url)

    chunks = _chunk(raw_text)
    metadatas = [
        {
            "doc_id": doc_id,
            "title": title,
            "source_type": "url",
            "source_path": url,
            "chunk_index": i,
            "tags": ",".join(tags or []),
        }
        for i in range(len(chunks))
    ]
    add_chunks(doc_id, chunks, metadatas)

    return {
        "id": doc_id,
        "title": title,
        "source_type": "url",
        "source_path": url,
        "content_preview": raw_text[:500],
        "tags": tags or [],
        "chunk_count": len(chunks),
    }


async def ingest_note(
    title: str,
    content: str,
    tags: list[str] | None = None,
) -> dict:
    doc_id = str(uuid.uuid4())
    chunks = _chunk(content)
    metadatas = [
        {
            "doc_id": doc_id,
            "title": title,
            "source_type": "note",
            "source_path": "",
            "chunk_index": i,
            "tags": ",".join(tags or []),
        }
        for i in range(len(chunks))
    ]
    add_chunks(doc_id, chunks, metadatas)

    return {
        "id": doc_id,
        "title": title,
        "source_type": "note",
        "source_path": "",
        "content_preview": content[:500],
        "tags": tags or [],
        "chunk_count": len(chunks),
    }
