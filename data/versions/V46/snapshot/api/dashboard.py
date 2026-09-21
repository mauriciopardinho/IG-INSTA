import json
from fastapi import APIRouter
from typing import Dict, Any
from backend.hardware.monitor import HardwareMonitor
from backend.safety.silcarpaty import silcarpaty
from backend.evolution.version_tree import evolution_tree
from backend.lab.experiment_runner import experiment_runner
from backend.memory.manager import memory_manager
from backend.config import CHECKLIST_PATH

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_dashboard_summary() -> Dict[str, Any]:
    """Retorna dados reais consolidando o estado da plataforma (CA-3.1 a CA-3.6)."""
    hardware = HardwareMonitor.get_full_diagnostics()
    safety_status = silcarpaty.get_status()
    active_ver = evolution_tree.get_active_version()
    experiments = experiment_runner.get_experiments(100)
    mem_stats = memory_manager.get_stats()

    # Ler checklist de critérios de aceite
    checklist = {}
    if CHECKLIST_PATH.exists():
        try:
            with open(CHECKLIST_PATH, "r", encoding="utf-8") as f:
                checklist = json.load(f)
        except Exception:
            pass

    return {
        "system_state": "SISTEMA_INTERROMPIDO" if not safety_status["active"] else "ATIVO_E_EVOLUINDO",
        "silcarpaty": safety_status,
        "active_version": active_ver,
        "hardware": hardware,
        "total_experiments": len(experiments),
        "last_improvement": active_ver.get("changes_summary", "Nenhuma alteração registrada"),
        "memory_stats": mem_stats,
        "checklist": checklist
    }

@router.post("/silcarpaty/toggle")
def toggle_silcarpaty() -> Dict[str, Any]:
    """Aciona o botão de emergência SilCarPaty via painel web."""
    res = silcarpaty.process_command("SilCarPaty")
    return res
