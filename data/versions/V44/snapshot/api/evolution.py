from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from backend.evolution.version_tree import evolution_tree
from backend.evolution.snapshot import snapshot_engine
from backend.evolution.auto_cycle import auto_evolution_cycle

router = APIRouter(prefix="/api/evolution", tags=["Evolução"])

class RollbackRequest(BaseModel):
    version_id: str

@router.get("/tree")
def get_evolution_tree() -> List[Dict[str, Any]]:
    """Retorna a árvore evolutiva de gerações (CA-9.5)."""
    return evolution_tree.get_full_tree()

@router.get("/code-diff/{version_id}")
def get_version_code_diff(version_id: str) -> Dict[str, Any]:
    """Retorna o código real e o diff unificado da geração gravada no disco (CA-23)."""
    return snapshot_engine.get_version_diff(version_id)

@router.post("/trigger-cycle")
def trigger_manual_evolution_cycle() -> Dict[str, Any]:
    """Dispara um ciclo evolutivo autônomo imediato (CA-10.1)."""
    return auto_evolution_cycle.run_single_cycle()

@router.post("/rollback")
def rollback_version(req: RollbackRequest) -> Dict[str, Any]:
    """Executa rollback para uma geração anterior (CA-9.4)."""
    try:
        return evolution_tree.rollback_to_version(req.version_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
