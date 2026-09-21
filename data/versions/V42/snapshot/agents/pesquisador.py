from typing import Dict, Any
from backend.agents.base import BaseAgent
from backend.research.engine import research_engine

class PesquisadorAgent(BaseAgent):
    def __init__(self):
        super().__init__("Athena", "PESQUISADORA", "Pesquisas na web, documentação online e aquisição de novos algoritmos.")

    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        query = payload.get("query", "algoritmos de otimização de memória contextual")
        res = research_engine.search_web(query)
        self.speak(
            message=f"Concluí a consulta online sobre '{query}'. Identifiquei {res['sources_count']} fonte(s) na internet. Repassando os dados para Minerva (Analisadora).",
            action="PESQUISA_CONCLUIDA"
        )
        return res
