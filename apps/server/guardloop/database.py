"""SQLAlchemy persistence for users, scan ownership, and evaluation summaries.

Production uses the Neon pooled ``DATABASE_URL``.  The SQLite fallback keeps the
local coursework demo and its test suite usable before a Neon project is added.
Schema changes live in Alembic migrations; ``init_database`` merely applies them.
"""
from __future__ import annotations

import os
import sqlite3
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, create_engine, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from guardloop.logging_util import get_logger

log = get_logger("database")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    neon_subject: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    scans: Mapped[list["Scan"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Scan(Base):
    __tablename__ = "scans"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user: Mapped[User] = relationship(back_populates="scans")
    findings: Mapped[list["StoredFinding"]] = relationship(back_populates="scan", cascade="all, delete-orphan")


class StoredFinding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    scan: Mapped[Scan] = relationship(back_populates="findings")


_engine = None
_session_factory = None
_engine_url: str | None = None
_initialized_url: str | None = None


def _sqlite_path() -> Path:
    return Path(__file__).resolve().parents[1] / "guardloop-auth.db"


def _sqlite_url() -> str:
    return f"sqlite:///{_sqlite_path()}"


def _sqlite_needs_reset(path: Path) -> bool:
    """Detect legacy SQLite files created before Alembic owned the schema."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    conn = sqlite3.connect(path)
    try:
        tables = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}
        if not tables:
            return False
        if "alembic_version" not in tables:
            return True
        return conn.execute("select version_num from alembic_version").fetchone() is None
    except sqlite3.DatabaseError:
        return True
    finally:
        conn.close()


def database_url() -> str:
    configured = os.environ.get("DATABASE_URL", "").strip()
    if configured:
        # Neon gives users a standard postgres URL; SQLAlchemy needs the
        # installed psycopg v3 dialect selected explicitly.
        if configured.startswith("postgres://"):
            return "postgresql+psycopg://" + configured.removeprefix("postgres://")
        if configured.startswith("postgresql://"):
            return "postgresql+psycopg://" + configured.removeprefix("postgresql://")
        return configured
    return _sqlite_url()


def _reset_engine() -> None:
    global _engine, _session_factory, _engine_url
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
    _engine_url = None


def _session() -> Session:
    global _engine, _session_factory, _engine_url
    url = database_url()
    # ``str(URL)`` masks the password, so compare against the cached raw URL
    # instead. Otherwise every request would create a fresh engine/pool.
    if _engine is None or _engine_url != url:
        _reset_engine()
        connect_args = (
            {"check_same_thread": False, "timeout": 30}
            if url.startswith("sqlite")
            else {"connect_timeout": 5}
        )
        _engine = create_engine(url, future=True, pool_pre_ping=True, connect_args=connect_args)
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
        _engine_url = url
    assert _session_factory is not None
    return _session_factory()


def _check_connection() -> None:
    """Retry transient DNS/network failures before falling back to SQLite."""
    last_error: OperationalError | None = None
    for attempt in range(3):
        try:
            with _session() as session:
                session.execute(text("select 1"))
            return
        except OperationalError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    if last_error is not None:
        raise last_error


def _run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    server_dir = Path(__file__).resolve().parents[1]
    migration_config = Config(str(server_dir / "alembic.ini"))
    migration_config.set_main_option("script_location", str(server_dir / "migrations"))
    command.upgrade(migration_config, "head")


def _allow_sqlite_fallback(url: str) -> bool:
    """Allow the local demo to start when a configured Neon host is unreachable."""
    if url.startswith("sqlite"):
        return False
    if os.environ.get("GUARDLOOP_ALLOW_SQLITE_FALLBACK", "").strip().lower() in {"0", "false", "no"}:
        return False
    return os.environ.get("GUARDLOOP_ENV", "").strip().lower() not in {"production", "prod"}


def init_database() -> None:
    """Apply committed Alembic migrations before the API starts serving requests."""
    global _initialized_url
    from guardloop.config import get_config  # noqa: F401 - load .env before resolving the URL

    url = database_url()
    if _initialized_url == url:
        return
    try:
        _check_connection()
        _run_migrations()
    except OperationalError as exc:
        if not _allow_sqlite_fallback(url):
            raise
        fallback_path = _sqlite_path()
        if _sqlite_needs_reset(fallback_path):
            backup = fallback_path.with_name(
                f"{fallback_path.stem}.legacy-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{fallback_path.suffix}"
            )
            fallback_path.replace(backup)
            log.warning("Legacy local database moved to %s; creating a fresh fallback schema.", backup)
        fallback = _sqlite_url()
        log.warning(
            "Configured database is unreachable (%s). Falling back to local SQLite at %s; "
            "restart after Neon DNS/network access is restored.",
            exc.__class__.__name__,
            fallback,
        )
        os.environ["DATABASE_URL"] = fallback
        _reset_engine()
        _run_migrations()
        url = fallback
    _initialized_url = database_url()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def create_user(email: str, password_hash: str) -> User:
    with _session() as session:
        user = User(email=_normalize_email(email), password_hash=password_hash)
        session.add(user)
        session.commit()
        return user


def find_user_by_email(email: str) -> User | None:
    with _session() as session:
        return session.scalar(select(User).where(User.email == _normalize_email(email)))


def find_user(user_id: int) -> User | None:
    with _session() as session:
        return session.get(User, user_id)


def get_or_create_neon_user(subject: str, email: str) -> User:
    """Map a verified Neon Auth subject to this app's relational owner key."""
    normalized = _normalize_email(email)
    with _session() as session:
        user = session.scalar(select(User).where(User.neon_subject == subject))
        if user is None:
            user = session.scalar(select(User).where(User.email == normalized))
            if user is not None:
                if user.neon_subject and user.neon_subject != subject:
                    raise ValueError("email is already linked to a different Neon account")
                user.neon_subject = subject
            else:
                user = User(email=normalized, password_hash=None, neon_subject=subject)
                session.add(user)
        elif user.email != normalized:
            conflict = session.scalar(select(User).where(User.email == normalized, User.id != user.id))
            if conflict is not None:
                raise ValueError("email is already linked to a different Neon account")
            user.email = normalized
        try:
            session.commit()
        except IntegrityError:
            # Two first requests for the same Neon user can race; the unique
            # subject index resolves it, so return the winning row.
            session.rollback()
            user = session.scalar(select(User).where(User.neon_subject == subject))
            if user is None:
                raise
        return user


def create_scan_record(scan_id: str, user_id: int, target_type: str, status: str) -> None:
    with _session() as session:
        session.add(Scan(id=scan_id, user_id=user_id, target_type=target_type, status=status))
        session.commit()


def scan_belongs_to(scan_id: str, user_id: int) -> bool:
    with _session() as session:
        scan = session.get(Scan, scan_id)
        return scan is not None and scan.user_id == user_id


def sync_scan(scan_id: str, state: dict[str, Any]) -> None:
    """Persist safe summaries, never payloads or target response bodies."""
    with _session() as session:
        scan = session.get(Scan, scan_id)
        if scan is None:
            return
        scan.status = str(state.get("status", "Running"))
        if scan.status in {"Completed", "Halted"} and scan.completed_at is None:
            scan.completed_at = datetime.now(timezone.utc)
        for finding in state.get("findings", []):
            finding_id = str(finding.get("id", ""))
            if not finding_id:
                continue
            # Runtime IDs are per-scan (F-001, F-002, ...); prefix them so
            # findings from different scans cannot collide in the shared table.
            storage_id = f"{scan_id}:{finding_id}"
            stored = session.get(StoredFinding, storage_id)
            status = _stored_status(str(finding.get("status", "")))
            if stored is None:
                session.add(StoredFinding(
                    id=storage_id, scan_id=scan_id, title=str(finding.get("title", "Finding"))[:255],
                    severity=str(finding.get("severity", "Medium")), status=status,
                ))
            else:
                stored.title = str(finding.get("title", stored.title))[:255]
                stored.severity = str(finding.get("severity", stored.severity))
                stored.status = status
        session.commit()


def _stored_status(runtime_status: str) -> str:
    if runtime_status == "Rejected":
        return "hallucinated"
    if runtime_status in {"Verified Fixed", "Reported"}:
        return "fixed"
    if runtime_status in {"Fix Failed", "Halted mid-loop"}:
        return "not_fixed"
    return "genuine"


def list_scans_for_user(user_id: int) -> list[dict[str, Any]]:
    with _session() as session:
        scans = session.scalars(select(Scan).where(Scan.user_id == user_id).order_by(Scan.started_at.desc())).all()
        return [{"id": s.id, "target_type": s.target_type, "status": s.status, "started_at": s.started_at.isoformat(), "completed_at": s.completed_at.isoformat() if s.completed_at else None, "finding_count": len(s.findings)} for s in scans]


def evaluation_for_user(user_id: int) -> dict[str, Any]:
    with _session() as session:
        scans = session.scalars(select(Scan).where(Scan.user_id == user_id)).all()
        findings = [finding for scan in scans for finding in scan.findings]
        counts = Counter(f.severity for f in findings)
        genuine = [f for f in findings if f.status != "hallucinated"]
        fixed = [f for f in genuine if f.status == "fixed"]
        completed = [s for s in scans if s.completed_at]
        durations = [(s.completed_at - s.started_at).total_seconds() for s in completed if s.completed_at]
        return {
            "total_scans": len(scans),
            "findings_by_severity": {severity: counts.get(severity, 0) for severity in ("Critical", "High", "Medium", "Low")},
            "verified_remediation_rate": round(len(fixed) / len(genuine), 3) if genuine else 0.0,
            "time_to_mitigation_avg_s": round(sum(durations) / len(durations), 2) if durations else None,
            "time_to_mitigation_trend": [round(value, 2) for value in durations[-10:]],
        }
