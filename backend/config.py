from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # API
    api_title: str = "Knowledge Nebula API"
    api_version: str = "0.1.0"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Storage
    storage_path: Path = Path("./storage")
    chroma_path: Path = Path("./storage/chroma")
    sqlite_path: str = "./storage/nebula.db"
    uploads_path: Path = Path("./storage/uploads")

    # Embeddings — uses local sentence-transformers by default (no API key needed)
    embedding_model: str = "all-MiniLM-L6-v2"

    # LLM
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # Chunking
    chunk_size: int = 1000
    chunk_overlap: int = 200

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure dirs exist
settings.storage_path.mkdir(parents=True, exist_ok=True)
settings.chroma_path.mkdir(parents=True, exist_ok=True)
settings.uploads_path.mkdir(parents=True, exist_ok=True)
