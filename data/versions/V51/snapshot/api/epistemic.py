from fastapi import APIRouter
from typing import List, Dict, Any
from backend.epistemic.store import epistemic_store

router = APIRouter(prefix="/api/epistemic", tags=["Sistema Epistêmico"])

@router.get("/claims")
def get_epistemic_claims() -> List[Dict[str, Any]]:
    """Retorna afirmações e classificações de conhecimento (CA-5.1 a CA-5.7)."""
    return epistemic_store.get_all_claims(100)
