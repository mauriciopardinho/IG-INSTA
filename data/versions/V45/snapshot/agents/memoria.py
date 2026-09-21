from typing import Dict, Any
from backend.agents.base import BaseAgent
from backend.memory.manager import memory_manager

class MemoriaAgent(BaseAgent):
    def __init__(self):
        super().__init__("Mnemosyne", "GERENCIADORA DE MEMÓRIA", "Organização, consolidação e recuperação de memória.")

    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        res = memory_manager.consolidate()
        self.speak(
            message=f"Consolidação de memória concluída ({res['items_consolidated']} itens organizados). Memória de longo prazo atualizada no SQLite.",
            action="CONSOLIDACAO_MEMORIA"
        )
        return res
