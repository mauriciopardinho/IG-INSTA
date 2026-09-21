from fastapi import APIRouter
from typing import List, Dict, Any
from backend.research.engine import research_engine

router = APIRouter(prefix="/api/research", tags=["Pesquisa"])

@router.get("/history")
def get_research_logs() -> List[Dict[str, Any]]:
    """Retorna pesquisas web realizadas (CA-4.2)."""
    return research_engine.get_research_history(100)
