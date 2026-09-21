import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.config import DB_PATH

logger = logging.getLogger("LongTermMemory")

class LongTermMemory:
    """
    Memória Persistente de Longo Prazo baseada em SQLite.
    Garante sobrevivência a reinicializações (CA-2.1, CA-2.2, CA-2.3, CA-2.4).
    """

    def __init__(self, db_path=DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Cria as tabelas necessárias se não existirem."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Tabela de Histórico do Chatbot (CA-1.5)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            """)

            # Tabela de Memórias de Longo Prazo (CA-2.1)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS long_term_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                confidence_percent REAL DEFAULT 100.0,
                status TEXT DEFAULT 'ACTIVE',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """)

            # Tabela de Log de Operações de Memória (CA-2.5)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS memory_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation TEXT NOT NULL,
                memory_id INTEGER,
                details TEXT,
                timestamp TEXT NOT NULL
            );
            """)
            
            conn.commit()

    # --- Operações do Chatbot ---
    def save_chat_message(self, sender: str, message: str) -> Dict[str, Any]:
        timestamp = datetime.now().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO chat_history (sender, message, timestamp) VALUES (?, ?, ?)",
                (sender, message, timestamp)
            )
            msg_id = cursor.lastrowid
            conn.commit()
            return {"id": msg_id, "sender": sender, "message": message, "timestamp": timestamp}

    def get_chat_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, sender, message, timestamp FROM chat_history ORDER BY id ASC LIMIT ?",
                (limit,)
            )
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    # --- Operações da Memória de Longo Prazo ---
    def store_memory(self, category: str, key: str, value: str, confidence: float = 100.0) -> Dict[str, Any]:
        now = datetime.now().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Verificar se já existe
            cursor.execute("SELECT id FROM long_term_memories WHERE category = ? AND key = ?", (category, key))
            row = cursor.fetchone()
            
            if row:
                mem_id = row["id"]
                cursor.execute(
                    "UPDATE long_term_memories SET value = ?, confidence_percent = ?, updated_at = ? WHERE id = ?",
                    (value, confidence, now, mem_id)
                )
                op = "UPDATE"
            else:
                cursor.execute(
                    "INSERT INTO long_term_memories (category, key, value, confidence_percent, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)",
                    (category, key, value, confidence, now, now)
                )
                mem_id = cursor.lastrowid
                op = "CREATE"

            # Audit log
            cursor.execute(
                "INSERT INTO memory_audit_log (operation, memory_id, details, timestamp) VALUES (?, ?, ?, ?)",
                (op, mem_id, f"Categoria: {category}, Chave: {key}", now)
            )
            conn.commit()
            return {"id": mem_id, "category": category, "key": key, "value": value, "confidence": confidence, "operation": op}

    def get_memories(self, category: Optional[str] = None, status: str = "ACTIVE") -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if category:
                cursor.execute(
                    "SELECT * FROM long_term_memories WHERE category = ? AND status = ? ORDER BY updated_at DESC",
                    (category, status)
                )
            else:
                cursor.execute(
                    "SELECT * FROM long_term_memories WHERE status = ? ORDER BY updated_at DESC",
                    (status,)
                )
            return [dict(r) for r in cursor.fetchall()]

    def search_memories(self, query: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            pattern = f"%{query}%"
            cursor.execute(
                "SELECT * FROM long_term_memories WHERE key LIKE ? OR value LIKE ? OR category LIKE ? ORDER BY updated_at DESC",
                (pattern, pattern, pattern)
            )
            rows = cursor.fetchall()
            
            # Registrar auditoria de busca (CA-2.5)
            now = datetime.now().isoformat()
            cursor.execute(
                "INSERT INTO memory_audit_log (operation, memory_id, details, timestamp) VALUES (?, ?, ?, ?)",
                ("RETRIEVE", None, f"Busca: '{query}' -> {len(rows)} resultados", now)
            )
            conn.commit()
            return [dict(r) for r in rows]

    def get_audit_log(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM memory_audit_log ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in cursor.fetchall()]
