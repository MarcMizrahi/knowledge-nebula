from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from models.document import Base
from config import settings


engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.sqlite_path}",
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
