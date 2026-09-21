from typing import Dict, Any
from backend.agents.base import BaseAgent

class NucleoAgent(BaseAgent):
    def __init__(self):
        super().__init__("Atlas", "NÚCLEO", "Coordenação geral do ciclo autônomo e definição de metas evolutivas.")

    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        target = payload.get("target_objective", "Otimizar recuperação de memória contextual e eficiência sintática")
        self.speak(
            message=f"Definido novo objetivo evolutivo prioritário: '{target}'. Acionando Minerva (Analisadora) e Athena (Pesquisadora).",
            objective=target,
            action="SELECAO_OBJETIVO"
        )
        return {"status": "OBJECTIVE_SET", "target": target}
