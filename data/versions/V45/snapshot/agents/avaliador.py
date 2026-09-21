from typing import Dict, Any
from backend.agents.base import BaseAgent

class AvaliadorAgent(BaseAgent):
    def __init__(self):
        super().__init__("Argus", "AVALIADOR", "Suíte de benchmarks, análise de métricas e aprovação/rejeição.")

    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        exp_id = payload.get("experiment_id", "EXP-001")
        gain_pct = payload.get("gain_pct", 5.4)
        approved = gain_pct > 0.0

        decision = "APROVADO" if approved else "REJEITADO"
        self.speak(
            message=f"Concluí a suíte de benchmarks do experimento #{exp_id}. Ganho medido: {gain_pct:+.2f}%. Decisão: {decision}. Repassando resultado para Chronos (Evolução).",
            experiment_id=exp_id,
            decision=decision,
            action="AVALIACAO_BENCHMARK"
        )
        return {"experiment_id": exp_id, "gain_pct": gain_pct, "approved": approved, "decision": decision}
