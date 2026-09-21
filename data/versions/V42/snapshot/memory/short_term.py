from typing import List, Dict, Any
from datetime import datetime

class ShortTermMemory:
    """
    Memória Operacional de Curto Prazo (RAM).
    Armazena o contexto de trabalho ativo da sessão atual e conversas recentes.
    """

    def __init__(self, max_items: int = 50):
        self.max_items = max_items
        self.buffer: List[Dict[str, Any]] = []

    def add(self, role: str, content: str, metadata: Dict[str, Any] = None):
        item = {
            "role": role,
            "content": content,
            "metadata": metadata or {},
            "timestamp": datetime.now().isoformat()
        }
        self.buffer.append(item)
        if len(self.buffer) > self.max_items:
            self.buffer.pop(0)

    def get_recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        return self.buffer[-limit:]

    def clear(self):
        self.buffer.clear()

    def get_all(self) -> List[Dict[str, Any]]:
        return list(self.buffer)
