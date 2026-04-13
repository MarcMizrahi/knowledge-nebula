# 🌌 Knowledge Nebula

A self-hosted, AI-powered personal knowledge base. Upload documents, import URLs, write notes — then **search by meaning** and **chat with your knowledge** using RAG (Retrieval Augmented Generation).

## Architecture

```
knowledge-nebula/
├── backend/          # FastAPI · ChromaDB · sentence-transformers · Claude API
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   │   ├── documents.py   # upload / list / delete
│   │   ├── search.py      # semantic search
│   │   └── chat.py        # RAG streaming chat
│   ├── services/
│   │   ├── ingestion.py   # parse → chunk → embed
│   │   ├── vector_store.py # ChromaDB wrapper
│   │   └── rag.py         # Claude-powered Q&A
│   └── models/
│       └── document.py    # SQLAlchemy model
│
├── frontend/         # Next.js 16 · TypeScript · Tailwind v4
│   └── src/
│       ├── app/           # Pages: / /upload /search /chat
│       ├── components/    # KnowledgeList, UploadPanel, SearchPanel, ChatPanel
│       └── lib/
│           ├── api.ts     # Typed API client
│           └── utils.ts
│
└── docker-compose.yml
```

## How it works

```
File / URL / Note
       │
       ▼
  Parse & Clean
  (pypdf, python-docx, BeautifulSoup)
       │
       ▼
  Chunk Text
  (LangChain RecursiveCharacterTextSplitter)
       │
       ▼
  Embed Chunks
  (sentence-transformers all-MiniLM-L6-v2 — runs locally, no API key)
       │
       ▼
  Store in ChromaDB  ←──── persisted to ./storage/chroma
  + SQLite metadata  ←──── persisted to ./storage/nebula.db
       │
   ┌───┴────────────────────┐
   │                        │
   ▼                        ▼
Semantic Search          RAG Chat
(vector similarity)   (retrieve top-k chunks
                       → Claude answers)
```

## Getting started

### Prerequisites
- Python 3.11+
- Node 20+
- (Optional) Anthropic API key for AI chat

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY (optional — search works without it)

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker (full stack)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env

docker compose up --build
```

## Features

| Feature | Description |
|---|---|
| **File upload** | PDF, TXT, Markdown, DOCX |
| **URL import** | Fetches & indexes any public web page |
| **Notes** | Write and save knowledge directly |
| **Semantic search** | Find chunks by meaning, not keywords |
| **AI Chat (RAG)** | Ask questions, get Claude-powered answers grounded in your docs |
| **Tags** | Organize knowledge with custom tags |
| **Local embeddings** | No embedding API key needed — runs on CPU |
| **Self-hosted** | All data stays on your machine |

## Configuration

All config lives in `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for AI chat |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | HuggingFace model name |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude model for chat |
| `CHUNK_SIZE` | `1000` | Characters per chunk |
| `CHUNK_OVERLAP` | `200` | Overlap between chunks |

## Inspired by

- [Quivr](https://github.com/QuivrHQ/quivr) — opinionated RAG framework
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) — local AI knowledge base
- [second-brain-agent](https://github.com/flepied/second-brain-agent) — LangChain + ChromaDB markdown indexer
