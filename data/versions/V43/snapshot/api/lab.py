from fastapi import APIRouter
from typing import List, Dict, Any
from backend.lab.experiment_runner import experiment_runner

router = APIRouter(prefix="/api/lab", tags=["Laboratório"])

@router.get("/experiments")
def get_lab_experiments() -> List[Dict[str, Any]]:
    """Retorna os experimentos realizados no laboratório (CA-7.2)."""
    return experiment_runner.get_experiments(100)
