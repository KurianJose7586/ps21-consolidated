import os
import sys
from fastapi import APIRouter, HTTPException

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(PROJECT_ROOT)

from brd_module.storage import get_noise_items, get_active_signals, restore_noise_item

router = APIRouter(
    prefix="/sessions/{session_id}/chunks",
    tags=["Review"]
)

@router.get("/")
def get_session_chunks(session_id: str, status: str = "signal"):
    """
    Retrieve chunks for a session with filtering options (?status=noise, signal, or all).
    """
    if status == "noise":
        items = get_noise_items(session_id=session_id)
    elif status == "all":
        items = get_active_signals(session_id=session_id) + get_noise_items(session_id=session_id)
    else:
        items = get_active_signals(session_id=session_id)

    return {
        "session_id": session_id,
        "status_filter": status,
        "count": len(items),
        "chunks": items
    }

@router.post("/{chunk_id}/restore")
def restore_chunk(session_id: str, chunk_id: str):
    """
    Manually restore a suppressed noise chunk back to an active signal in the AKS.
    """
    try:
        restore_noise_item(chunk_id)
        return {"message": f"Chunk {chunk_id} restored to active signals."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
