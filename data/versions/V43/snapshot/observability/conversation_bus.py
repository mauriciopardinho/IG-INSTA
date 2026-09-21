import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Any
from backend.config import DB_PATH

logger = logging.getLogger("ConversationBus")

class ConversationBus:
    """
    Barramento de Comunicação Interna Observável entre os Agentes.
    Atende aos critérios CA-6.2, CA-6.3, CA-6.4 e seção 18 da instrução.
    """

    def __init__(self, db_path=DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_name TEXT NOT NULL,
                target_agent TEXT DEFAULT 'TODOS',
                objective TEXT,
                hypothesis TEXT,
                action TEXT,
                message TEXT NOT NULL,
                decision TEXT,
                experiment_id TEXT,
                timestamp TEXT NOT NULL
            );
            """)
            conn.commit()

    def publish_message(
        self,
        agent_name: str,
        message: str,
        target_agent: str = "TODOS",
        objective: str = None,
        hypothesis: str = None,
        action: str = None,
        decision: str = None,
        experiment_id: str = None
    ) -> Dict[str, Any]:
        """Publica uma mensagem de agente no barramento interno de conversação observável."""
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO agent_conversations (
                    agent_name, target_agent, objective, hypothesis, action, message, decision, experiment_id, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (agent_name, target_agent, objective, hypothesis, action, message, decision, experiment_id, now)
            )
            msg_id = cursor.lastrowid
            conn.commit()

            msg_obj = {
                "id": msg_id,
                "agent": agent_name,
                "target": target_agent,
                "objective": objective,
                "hypothesis": hypothesis,
                "action": action,
                "message": message,
                "decision": decision,
                "experiment_id": experiment_id,
                "timestamp": now
            }
            logger.info(f"[{agent_name} -> {target_agent}]: {message}")
            return msg_obj

    def get_recent_messages(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM agent_conversations ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in cursor.fetchall()]

# Instância global do Barramento de Conversação
conversation_bus = ConversationBus()
