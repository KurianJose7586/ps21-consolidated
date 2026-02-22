"""
supabase_storage.py
Handles all Supabase PostgreSQL database operations for the Attributed Knowledge Store (AKS).
This module provides a drop-in replacement for the storage.py with Supabase backend.
"""

from __future__ import annotations

import json
import os
from typing import List, Dict, Optional, Any, TYPE_CHECKING
from datetime import datetime, timezone

from supabase import create_client, Client
from pydantic import BaseModel

from dotenv import load_dotenv
from pathlib import Path
import uuid

if TYPE_CHECKING:
    from brd_module.schema import ClassifiedChunk

# Load .env from the same directory as this script
_HERE = Path(__file__).parent
load_dotenv(_HERE / ".env")

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DB_MODE = os.getenv("DB_MODE", "supabase")  # Can be 'supabase' or 'postgres'

# Lazy-loaded client
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Returns a singleton Supabase client."""
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_KEY environment variables are required. "
                "Set them in your .env file or as system environment variables."
            )
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase_client


def init_db():
    """
    Validates connection to Supabase and ensures tables exist.
    In Supabase, tables should be created via the SQL editor or migrations.
    This function just validates the connection.
    """
    try:
        client = get_supabase_client()
        # Test connection by querying sessions table
        result = client.table("sessions").select("*").limit(1).execute()
        print("✓ Successfully connected to Supabase")
    except Exception as e:
        raise Exception(f"Failed to connect to Supabase: {e}")


def store_chunks(chunks: List[Any]) -> None:
    """Batch inserts chunks into Supabase."""
    if not chunks:
        return

    client = get_supabase_client()
    try:
        records = []
        for chunk in chunks:
            # Handle both Pydantic models and dicts
            if hasattr(chunk, 'model_dump'):
                data_json = chunk.model_dump(mode="json")
            elif hasattr(chunk, '__dict__'):
                data_json = chunk.__dict__
            else:
                data_json = dict(chunk)
            
            # Safely extract chunk attributes
            chunk_id = getattr(chunk, 'chunk_id', None)
            session_id = getattr(chunk, 'session_id', None)
            source_ref = getattr(chunk, 'source_ref', None)
            raw_text = getattr(chunk, 'raw_text', '')
            cleaned_text = getattr(chunk, 'cleaned_text', '')
            label = getattr(chunk, 'label', None)
            confidence = getattr(chunk, 'confidence', 1.0)
            reasoning = getattr(chunk, 'reasoning', '')
            suppressed = getattr(chunk, 'suppressed', False)
            manually_restored = getattr(chunk, 'manually_restored', False)
            flagged_for_review = getattr(chunk, 'flagged_for_review', False)
            created_at = getattr(chunk, 'created_at', None)
            
            # Handle label enum
            if label and hasattr(label, 'value'):
                label = label.value
            elif label:
                label = str(label)
            
            # Handle confidence
            if confidence:
                confidence = float(confidence)
            else:
                confidence = 1.0
            
            # Handle created_at
            if created_at and not isinstance(created_at, str):
                created_at = created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at)
            elif not created_at:
                created_at = datetime.now(timezone.utc).isoformat()
            
            record = {
                "chunk_id": str(chunk_id) if chunk_id else str(uuid.uuid4()),
                "session_id": session_id or "default_session",
                "source_type": getattr(chunk, 'source_type', 'email'),
                "source_ref": source_ref or "",
                "speaker": getattr(chunk, 'speaker', None),
                "raw_text": raw_text,
                "cleaned_text": cleaned_text,
                "label": label or "noise",
                "confidence": confidence,
                "reasoning": reasoning,
                "suppressed": suppressed,
                "manually_restored": manually_restored,
                "flagged_for_review": flagged_for_review,
                "created_at": created_at,
                "data": data_json
            }
            records.append(record)
        
        # Upsert records (insert or update if exists)
        if records:
            client.table("classified_chunks").upsert(records, on_conflict="chunk_id").execute()
    except Exception as e:
        raise Exception(f"Failed to store chunks in Supabase: {e}")


def get_active_signals(session_id: Optional[str] = None) -> List[Any]:
    """Retrieves all active (non-suppressed) chunks from Supabase."""
    client = get_supabase_client()
    try:
        from brd_module.schema import ClassifiedChunk
        
        query = client.table("classified_chunks").select("data").eq("suppressed", False).order("created_at")
        
        if session_id:
            query = query.eq("session_id", session_id)
        
        result = query.execute()
        
        chunks = []
        for row in result.data or []:
            data = row.get("data") if isinstance(row, dict) else None
            if data:
                if isinstance(data, str):
                    data = json.loads(data)
                try:
                    chunks.append(ClassifiedChunk.model_validate(data))
                except Exception:
                    # Skip invalid chunks
                    pass
        return chunks
    except Exception as e:
        raise Exception(f"Failed to get active signals: {e}")


def get_noise_items(session_id: Optional[str] = None) -> List[Any]:
    """Retrieves all noise (suppressed and not manually restored) chunks from Supabase."""
    client = get_supabase_client()
    try:
        from brd_module.schema import ClassifiedChunk
        
        query = client.table("classified_chunks").select("data").eq("suppressed", True).eq("manually_restored", False).order("created_at")
        
        if session_id:
            query = query.eq("session_id", session_id)
        
        result = query.execute()
        
        chunks = []
        for row in result.data or []:
            data = row.get("data") if isinstance(row, dict) else None
            if data:
                if isinstance(data, str):
                    data = json.loads(data)
                try:
                    chunks.append(ClassifiedChunk.model_validate(data))
                except Exception:
                    # Skip invalid chunks
                    pass
        return chunks
    except Exception as e:
        raise Exception(f"Failed to get noise items: {e}")


def restore_noise_item(chunk_id: str) -> None:
    """Manually restores a misclassified noise chunk back to an active signal in Supabase."""
    client = get_supabase_client()
    try:
        # First, fetch the chunk to get its data
        result = client.table("classified_chunks").select("data").eq("chunk_id", chunk_id).execute()
        
        if not result.data:
            raise ValueError(f"Chunk {chunk_id} not found")
        
        row = result.data[0]
        data = row.get("data") if isinstance(row, dict) else None
        
        if not data:
            raise ValueError(f"No data found for chunk {chunk_id}")
        
        if isinstance(data, str):
            data = json.loads(data)
        
        # Update the suppressed and manually_restored flags, and update the data JSONB
        if isinstance(data, dict):
            data['suppressed'] = False
            data['manually_restored'] = True
        
        client.table("classified_chunks").update({
            "suppressed": False,
            "manually_restored": True,
            "data": data
        }).eq("chunk_id", chunk_id).execute()
    except Exception as e:
        raise Exception(f"Failed to restore noise item: {e}")


def create_snapshot(session_id: str) -> str:
    """Creates a frozen snapshot of all active signals for a session."""
    snapshot_id = str(uuid.uuid4())
    client = get_supabase_client()
    
    try:
        active_signals = get_active_signals(session_id=session_id)
        chunk_ids = [str(getattr(c, 'chunk_id', '')) for c in active_signals if getattr(c, 'chunk_id', None)]
        
        client.table("brd_snapshots").insert({
            "snapshot_id": snapshot_id,
            "session_id": session_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "chunk_ids": chunk_ids
        }).execute()
        
        return snapshot_id
    except Exception as e:
        raise Exception(f"Failed to create snapshot: {e}")


def get_signals_for_snapshot(snapshot_id: str, label_filter: Optional[str] = None) -> List[Any]:
    """Retrieves chunks from a specific snapshot, optionally filtered by label."""
    client = get_supabase_client()
    try:
        from brd_module.schema import ClassifiedChunk
        
        # Get snapshot
        snapshot = client.table("brd_snapshots").select("chunk_ids").eq("snapshot_id", snapshot_id).execute()
        
        if not snapshot.data:
            return []
        
        snapshot_row = snapshot.data[0]
        chunk_ids_raw = snapshot_row.get("chunk_ids", []) if isinstance(snapshot_row, dict) else []
        
        # Ensure chunk_ids is a list
        if not isinstance(chunk_ids_raw, list):
            chunk_ids_raw = []
        
        chunk_ids = chunk_ids_raw
        
        if not chunk_ids:
            return []
        
        # Fetch chunks for those IDs
        chunks = []
        for chunk_id in chunk_ids:
            try:
                result = client.table("classified_chunks").select("data").eq("chunk_id", chunk_id).execute()
                for row in result.data or []:
                    data = row.get("data") if isinstance(row, dict) else None
                    if data:
                        if isinstance(data, str):
                            data = json.loads(data)
                        try:
                            chunk = ClassifiedChunk.model_validate(data)
                            
                            if label_filter is None:
                                chunks.append(chunk)
                            elif hasattr(chunk, 'label'):
                                chunk_label = chunk.label.value if hasattr(chunk.label, 'value') else str(chunk.label)
                                if chunk_label == label_filter:
                                    chunks.append(chunk)
                        except Exception:
                            # Skip invalid chunks
                            pass
            except Exception:
                # Skip chunks that can't be fetched
                continue
        
        return chunks
    except Exception as e:
        raise Exception(f"Failed to get signals for snapshot: {e}")


def store_brd_section(session_id: str, snapshot_id: str, section_name: str, content: str, source_chunk_ids: Optional[List[str]] = None, human_edited: bool = False) -> None:
    """Stores a generated BRD section with automatic version incrementing."""
    client = get_supabase_client()
    try:
        if source_chunk_ids is None:
            source_chunk_ids = []
        
        # Get next version number
        result = client.table("brd_sections").select("version_number").eq("session_id", session_id).eq("section_name", section_name).order("version_number", desc=True).limit(1).execute()
        
        version_number = 1
        if result.data:
            row = result.data[0]
            version_num = row.get("version_number") if isinstance(row, dict) else None
            if version_num is not None:
                try:
                    version_number = int(version_num) + 1
                except (ValueError, TypeError):
                    version_number = 1
        
        section_id = str(uuid.uuid4())
        
        client.table("brd_sections").insert({
            "section_id": section_id,
            "session_id": session_id,
            "snapshot_id": snapshot_id,
            "section_name": section_name,
            "version_number": version_number,
            "content": content,
            "source_chunk_ids": source_chunk_ids,
            "human_edited": human_edited,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        raise Exception(f"Failed to store BRD section: {e}")


def get_latest_brd_sections(session_id: str) -> Dict[str, str]:
    """Returns the latest generated content for each section in a session."""
    client = get_supabase_client()
    sections: Dict[str, str] = {}
    try:
        result = client.table("brd_sections").select("section_name, content, version_number").eq("session_id", session_id).order("version_number", desc=True).execute()
        
        # Get the latest version for each section name
        for row in result.data or []:
            if isinstance(row, dict):
                section_name = row.get("section_name")
                content = row.get("content")
                # Ensure both are strings before using as dict key/value
                if section_name is not None and content is not None:
                    section_name_str = str(section_name)
                    content_str = str(content)
                    if section_name_str and content_str and section_name_str not in sections:
                        sections[section_name_str] = content_str
        
        return sections
    except Exception as e:
        raise Exception(f"Failed to get BRD sections: {e}")


def get_current_snapshot_id(session_id: str) -> str:
    """Helper to get the most recent snapshot ID for a session."""
    client = get_supabase_client()
    try:
        result = client.table("brd_sections").select("snapshot_id").eq("session_id", session_id).order("generated_at", desc=True).limit(1).execute()
        
        if result.data:
            row = result.data[0]
            snapshot_id = row.get("snapshot_id") if isinstance(row, dict) else None
            if snapshot_id:
                return str(snapshot_id)
        return "adhoc-snapshot"
    except Exception as e:
        raise Exception(f"Failed to get current snapshot ID: {e}")


def create_session(session_id: str, project_name: Optional[str] = None, description: Optional[str] = None) -> str:
    """Creates a new session."""
    client = get_supabase_client()
    try:
        client.table("sessions").insert({
            "session_id": session_id,
            "project_name": project_name,
            "description": description,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return session_id
    except Exception as e:
        raise Exception(f"Failed to create session: {e}")


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves session metadata."""
    client = get_supabase_client()
    try:
        result = client.table("sessions").select("*").eq("session_id", session_id).execute()
        if result.data:
            return result.data[0] if isinstance(result.data[0], dict) else None
        return None
    except Exception as e:
        raise Exception(f"Failed to get session: {e}")


def log_ingest(session_id: str, source_type: str, source_ref: str, status: str, chunk_count: int = 0, error_message: Optional[str] = None) -> None:
    """Logs an ingestion operation."""
    client = get_supabase_client()
    try:
        client.table("ingest_logs").insert({
            "log_id": str(uuid.uuid4()),
            "session_id": session_id,
            "source_type": source_type,
            "source_ref": source_ref,
            "status": status,
            "chunk_count": chunk_count,
            "error_message": error_message,
            "ingested_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        raise Exception(f"Failed to log ingest: {e}")


def get_validation_flags(session_id: str) -> List[Dict[str, Any]]:
    """Retrieves all validation flags for a session, ordered by severity."""
    client = get_supabase_client()
    try:
        result = client.table("brd_validation_flags").select("section_name, flag_type, severity, description").eq("session_id", session_id).order("severity", desc=True).execute()
        
        flags: List[Dict[str, Any]] = []
        for row in result.data or []:
            if isinstance(row, dict):
                flags.append({
                    "section_name": row.get("section_name"),
                    "flag_type": row.get("flag_type"),
                    "severity": row.get("severity"),
                    "description": row.get("description")
                })
        return flags
    except Exception as e:
        raise Exception(f"Failed to get validation flags: {e}")


def store_validation_flag(session_id: str, section_name: str, flag_type: str, description: str, severity: str) -> None:
    """Stores a validation flag for a BRD section."""
    client = get_supabase_client()
    try:
        client.table("brd_validation_flags").insert({
            "flag_id": str(uuid.uuid4()),
            "session_id": session_id,
            "section_name": section_name,
            "flag_type": flag_type,
            "description": description,
            "severity": severity,
            "auto_resolvable": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        raise Exception(f"Failed to store validation flag: {e}")


# HITL/Versioning support functions
def create_new_version(
    session_id: str,
    section_name: str,
    content: str,
    origin: str,
    snapshot_id: Optional[str] = None
) -> str:
    """Stores a new version of a BRD section with versioning support."""
    client = get_supabase_client()
    try:
        # Get latest version number
        result = client.table("brd_sections").select("version_number").eq("session_id", session_id).eq("section_name", section_name).order("version_number", desc=True).limit(1).execute()
        version_number = 1
        if result.data:
            row = result.data[0]
            version_num = row.get("version_number") if isinstance(row, dict) else None
            if version_num is not None:
                try:
                    version_number = int(version_num) + 1
                except (ValueError, TypeError):
                    version_number = 1
        
        # If snapshot_id is missing, try to inherit from latest section in this session
        if not snapshot_id:
            result = client.table("brd_sections").select("snapshot_id").eq("session_id", session_id).order("version_number", desc=True).limit(1).execute()
            if result.data:
                row = result.data[0]
                snapshot_id_raw = row.get("snapshot_id") if isinstance(row, dict) else None
                if snapshot_id_raw is not None:
                    snapshot_id = str(snapshot_id_raw)
            if not snapshot_id:
                snapshot_id = "adhoc-snapshot"
        
        version_id = str(uuid.uuid4())
        
        # Insert new version
        client.table("brd_sections").insert({
            "section_id": version_id,
            "session_id": session_id,
            "snapshot_id": snapshot_id,
            "section_name": section_name,
            "version_number": version_number,
            "content": content,
            "source_chunk_ids": [],
            "human_edited": origin == "human",
            "generated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        
        return version_id
    except Exception as e:
        raise Exception(f"Failed to create new version: {e}")


def is_section_locked(session_id: str, section_name: str) -> bool:
    """Checks if a BRD section is locked (human edited)."""
    client = get_supabase_client()
    try:
        result = client.table("brd_sections").select("human_edited").eq("session_id", session_id).eq("section_name", section_name).order("version_number", desc=True).limit(1).execute()
        if result.data:
            row = result.data[0]
            human_edited = row.get("human_edited") if isinstance(row, dict) else False
            return bool(human_edited)
        return False
    except Exception as e:
        raise Exception(f"Failed to check section lock: {e}")


def get_section_content(session_id: str, section_name: str) -> str:
    """Retrieves the latest content of a BRD section."""
    client = get_supabase_client()
    try:
        result = client.table("brd_sections").select("content").eq("session_id", session_id).eq("section_name", section_name).order("version_number", desc=True).limit(1).execute()
        if result.data:
            row = result.data[0]
            content = row.get("content") if isinstance(row, dict) else ""
            return str(content) if content else ""
        return ""
    except Exception as e:
        raise Exception(f"Failed to get section content: {e}")
