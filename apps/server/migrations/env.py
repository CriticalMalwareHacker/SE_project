from __future__ import annotations

from alembic import context
import guardloop.config  # noqa: F401 - load .env and Neon .env.local before migrations
from guardloop.database import Base, database_url

target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    connectable = __import__("sqlalchemy").create_engine(database_url())
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
