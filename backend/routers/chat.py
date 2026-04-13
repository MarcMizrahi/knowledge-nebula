from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.rag import chat_stream

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    question: str
    n_results: int = 6
    doc_id: str | None = None


@router.post("/")
async def chat(body: ChatRequest):
    return StreamingResponse(
        chat_stream(body.question, n_results=body.n_results, doc_id=body.doc_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
