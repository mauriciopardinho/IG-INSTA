from fastapi import APIRouter
from typing import List, Dict, Any
from backend.observability.conversation_bus import conversation_bus

router = APIRouter(prefix="/api/agents", tags=["Agentes"])

@router.get("/conversations")
def get_agent_conversations() -> List[Dict[str, Any]]:
    """Retorna as conversas e eventos trocados entre agentes internos (CA-6.3)."""
    return conversation_bus.get_recent_messages(limit=100)
