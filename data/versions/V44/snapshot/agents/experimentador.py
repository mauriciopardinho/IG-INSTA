from typing import Dict, Any
from backend.agents.base import BaseAgent

class ExperimentadorAgent(BaseAgent):
    def __init__(self):
        super().__init__("Daedalus", "EXPERIMENTADOR", "Execução de experimentos isolados no laboratório Sandbox.")

    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        exp_id = payload.get("experiment_id", "EXP-001")
        self.speak(
            message=f"Iniciei a execução isolada do experimento #{exp_id} na Sandbox do laboratório. Coletando dados de execução para Argus (Avaliador)...",
            experiment_id=exp_id,
            action="EXECUTANDO_EXPERIMENTO"
        )
        return {"experiment_id": exp_id, "status": "EXECUTION_COMPLETE"}
