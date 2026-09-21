import logging
from typing import Dict, Any, List
from backend.memory.short_term import ShortTermMemory
from backend.memory.long_term import LongTermMemory

logger = logging.getLogger("MemoryManager")

class MemoryManager:
    """
    Gerenciador Unificado de Memória (Curto e Longo Prazo).
    Atende integralmente aos Critérios de Aceite da Fase 2 (CA-2.1 a CA-2.6).
    """

    def __init__(self):
        self.short_term = ShortTermMemory()
        self.long_term = LongTermMemory()

    def record_interaction(self, user_msg: str, bot_msg: str):
        """Registra a interação na memória operacional e de longo prazo."""
        self.short_term.add("user", user_msg)
        self.short_term.add("assistant", bot_msg)
        
        self.long_term.save_chat_message("user", user_msg)
        self.long_term.save_chat_message("assistant", bot_msg)

    def store_fact(self, category: str, key: str, value: str, confidence: float = 100.0) -> Dict[str, Any]:
        """Armazena um fato organizado na memória de longo prazo."""
        return self.long_term.store_memory(category, key, value, confidence)

    def retrieve_relevant(self, query: str) -> List[Dict[str, Any]]:
        """Recupera informações relevantes baseadas em busca."""
        return self.long_term.search_memories(query)

    def get_context_for_prompt(self, query: str) -> str:
        """Gera string de contexto para inclusão em prompts do modelo."""
        recent_short = self.short_term.get_recent(6)
        relevant_long = self.retrieve_relevant(query)

        context_lines = ["--- MEMÓRIA OPERACIONAL E CONTEXTO ---"]
        if relevant_long:
            context_lines.append("[Fatos Persistentes Relevantes]:")
            for item in relevant_long[:5]:
                context_lines.append(f"- {item['category']} | {item['key']}: {item['value']} (Confiança: {item['confidence_percent']}%)")
        
        if recent_short:
            context_lines.append("\n[Conversa Recente]:")
            for msg in recent_short:
                context_lines.append(f"{msg['role'].upper()}: {msg['content']}")

        return "\n".join(context_lines)

    def consolidate(self) -> Dict[str, Any]:
        """
        Consolida a memória operacional para a memória de longo prazo.
        CA-2.6 (Possuir consolidação e organização).
        """
        items = self.short_term.get_all()
        count = 0
        for item in items:
            if len(item["content"]) > 20:
                self.long_term.store_memory(
                    category="CONSOLIDATED_CONVERSATION",
                    key=f"item_{item['timestamp']}",
                    value=f"{item['role']}: {item['content']}",
                    confidence=95.0
                )
                count += 1
        return {"status": "SUCCESS", "items_consolidated": count}

    def get_stats(self) -> Dict[str, Any]:
        memories = self.long_term.get_memories()
        categories = {}
        for m in memories:
            cat = m["category"]
            categories[cat] = categories.get(cat, 0) + 1

        return {
            "short_term_count": len(self.short_term.get_all()),
            "long_term_total": len(memories),
            "categories": categories,
            "audit_logs_count": len(self.long_term.get_audit_log(100))
        }

# Instância global do Gerenciador de Memória
memory_manager = MemoryManager()
