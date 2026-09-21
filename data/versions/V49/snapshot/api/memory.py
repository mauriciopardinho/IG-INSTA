from fastapi import APIRouter
from typing import List, Dict, Any
from backend.memory.manager import memory_manager

router = APIRouter(prefix="/api/memory", tags=["Memória"])

@router.get("/memories")
def get_memories() -> List[Dict[str, Any]]:
    """Retorna memórias persistentes de longo prazo (CA-2.1)."""
    return memory_manager.long_term.get_memories()

@router.get("/audit")
def get_memory_audit() -> List[Dict[str, Any]]:
    """Retorna log de auditoria de criações, modificações e recuperações de memória (CA-2.5)."""
    return memory_manager.long_term.get_audit_log(100)
