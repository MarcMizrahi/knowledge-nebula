from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, DateTime, Integer, Text, JSON
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class SourceType(str, Enum):
    PDF = "pdf"
    TEXT = "text"
    MARKDOWN = "markdown"
    DOCX = "docx"
    URL = "url"
    NOTE = "note"


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    source_type = Column(String, nullable=False)
    source_path = Column(String, nullable=True)   # file path or URL
    content_preview = Column(Text, nullable=True) # first 500 chars
    tags = Column(JSON, default=list)
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
