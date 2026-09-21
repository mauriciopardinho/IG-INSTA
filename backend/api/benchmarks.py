from fastapi import APIRouter
from typing import List, Dict, Any
from backend.benchmarks.engine import benchmark_engine

router = APIRouter(prefix="/api/benchmarks", tags=["Benchmarks"])

@router.get("/history")
def get_benchmark_history() -> List[Dict[str, Any]]:
    """Retorna o histórico de resultados de benchmarks reais (CA-8.2, CA-8.4)."""
    return benchmark_engine.get_history(100)

@router.post("/run")
def run_benchmark() -> Dict[str, Any]:
    """Executa a suíte de benchmarks na geração ativa (CA-8.1)."""
    return benchmark_engine.run_full_benchmark_suite("V_ACTIVE")
