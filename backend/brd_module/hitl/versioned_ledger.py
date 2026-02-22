import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict

from brd_module.supabase_storage import (
    get_latest_brd_sections,
    get_current_snapshot_id as _get_current_snapshot_id,
    create_new_version as _create_new_version,
    is_section_locked as _is_section_locked,
    get_section_content as _get_section_content
)

def create_new_version(
    session_id: str,
    edit_id: Optional[str],
    section_name: str,
    content: str,
    origin: str,
    snapshot_id: Optional[str] = None
) -> str:
    """Stores a new version of a BRD section."""
    return _create_new_version(session_id, section_name, content, origin, snapshot_id)

def is_section_locked(session_id: str, section_name: str) -> bool:
    """Checks if a BRD section is locked (human edited)."""
    return _is_section_locked(session_id, section_name)

def get_section_content(session_id: str, section_name: str) -> str:
    """Retrieves the latest content of a BRD section."""
    return _get_section_content(session_id, section_name)

def get_current_snapshot_id(session_id: str) -> str:
    """Gets the current snapshot ID for a session."""
    return _get_current_snapshot_id(session_id)
