"""Database management CLI commands."""

import asyncio
import logging
from typing import Optional

import click

from system_trading.data.database import db_manager
from system_trading.data.migrations import (
    cleanup_old_data,
    create_indexes,
    create_tables,
    create_views,
    drop_tables,
    get_database_stats,
    initialize_database,
)

logger = logging.getLogger(__name__)


@click.group()
def database() -> None:
    """Database management commands."""
    pass


@database.command()
def init() -> None:
    """Initialize database with tables, indexes, and views."""

    async def _init() -> None:
        try:
            await db_manager.initialize()
            await initialize_database(db_manager.engine)
            click.echo("✅ Database initialized successfully")
        except Exception as e:
            click.echo(f"❌ Database initialization failed: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_init())


@database.command()
@click.option("--force", is_flag=True, help="Force drop without confirmation")
def drop(force: bool) -> None:
    """Drop all database tables."""
    if not force:
        if not click.confirm("This will drop all tables. Are you sure?"):
            click.echo("Aborted.")
            return

    async def _drop() -> None:
        try:
            await db_manager.initialize()
            await drop_tables(db_manager.engine)
            click.echo("✅ Database tables dropped successfully")
        except Exception as e:
            click.echo(f"❌ Failed to drop tables: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_drop())


@database.command()
def create_tables_cmd() -> None:
    """Create database tables."""

    async def _create() -> None:
        try:
            await db_manager.initialize()
            await create_tables(db_manager.engine)
            click.echo("✅ Database tables created successfully")
        except Exception as e:
            click.echo(f"❌ Failed to create tables: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_create())


@database.command()
def create_indexes_cmd() -> None:
    """Create additional database indexes."""

    async def _create_indexes() -> None:
        try:
            await db_manager.initialize()
            await create_indexes(db_manager.engine)
            click.echo("✅ Database indexes created successfully")
        except Exception as e:
            click.echo(f"❌ Failed to create indexes: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_create_indexes())


@database.command()
def create_views_cmd() -> None:
    """Create database views."""

    async def _create_views() -> None:
        try:
            await db_manager.initialize()
            await create_views(db_manager.engine)
            click.echo("✅ Database views created successfully")
        except Exception as e:
            click.echo(f"❌ Failed to create views: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_create_views())


@database.command()
@click.option("--days", default=90, help="Days of data to keep (default: 90)")
@click.option("--force", is_flag=True, help="Force cleanup without confirmation")
def cleanup(days: int, force: bool) -> None:
    """Clean up old data from database."""
    if not force:
        if not click.confirm(f"This will delete data older than {days} days. Continue?"):
            click.echo("Aborted.")
            return

    async def _cleanup() -> None:
        try:
            await db_manager.initialize()
            await cleanup_old_data(db_manager.engine, days)
            click.echo(f"✅ Cleaned up data older than {days} days")
        except Exception as e:
            click.echo(f"❌ Failed to cleanup data: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_cleanup())


@database.command()
def stats() -> None:
    """Show database statistics."""

    async def _stats() -> None:
        try:
            await db_manager.initialize()
            stats = await get_database_stats(db_manager.engine)

            click.echo("\n📊 Database Statistics:")
            click.echo("-" * 30)
            for key, value in stats.items():
                formatted_key = key.replace("_", " ").title()
                click.echo(f"{formatted_key:20}: {value}")

        except Exception as e:
            click.echo(f"❌ Failed to get database stats: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_stats())


@database.command()
def reset() -> None:
    """Reset database (drop and recreate all tables)."""
    if not click.confirm("This will drop and recreate all tables. All data will be lost. Continue?"):
        click.echo("Aborted.")
        return

    async def _reset() -> None:
        try:
            await db_manager.initialize()

            # Drop existing tables
            await drop_tables(db_manager.engine)
            click.echo("✅ Dropped existing tables")

            # Recreate everything
            await initialize_database(db_manager.engine)
            click.echo("✅ Database reset completed successfully")

        except Exception as e:
            click.echo(f"❌ Failed to reset database: {e}")
            raise
        finally:
            await db_manager.close()

    asyncio.run(_reset())


if __name__ == "__main__":
    database()