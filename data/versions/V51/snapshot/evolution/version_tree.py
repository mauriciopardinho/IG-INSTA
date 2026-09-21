import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.config import DB_PATH

logger = logging.getLogger("VersionTree")

class EvolutionaryVersionTree:
    """
    Gerenciador da Árvore Evolutiva e Versionamento de Gerações.
    Atende aos critérios da Fase 9 (CA-9.1 a CA-9.6) e Seção 13 da instrução.
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
            CREATE TABLE IF NOT EXISTS evolution_tree (
                version_id TEXT PRIMARY KEY,
                parent_version_id TEXT,
                model_name TEXT NOT NULL,
                changes_summary TEXT NOT NULL,
                overall_benchmark_score REAL NOT NULL,
                experiment_id TEXT,
                is_active INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                metadata_json TEXT
            );
            """)

            # Inserir V0 inicial se a árvore estiver vazia (CA-9.1)
            cursor.execute("SELECT COUNT(*) as count FROM evolution_tree")
            if cursor.fetchone()["count"] == 0:
                now = datetime.now().isoformat()
                cursor.execute(
                    """
                    INSERT INTO evolution_tree (
                        version_id, parent_version_id, model_name, changes_summary,
                        overall_benchmark_score, experiment_id, is_active, created_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "V0", None, "Qwen2.5-Coder-1.5B-Instruct", "Geração Inicial Base da Plataforma IA Autônoma",
                        78.5, "EXP-INIT", 1, now, json.dumps({"description": "Versão Inicial de Inicialização V0"})
                    )
                )
            conn.commit()

    def get_active_version(self) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM evolution_tree WHERE is_active = 1 LIMIT 1")
            row = cursor.fetchone()
            if row:
                res = dict(row)
                res["metadata"] = json.loads(res.get("metadata_json") or "{}")
                return res
            return {"version_id": "V0", "is_active": 1}

    def promote_new_generation(
        self,
        new_version_id: str,
        parent_version_id: str,
        changes_summary: str,
        benchmark_score: float,
        experiment_id: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Promove uma nova geração aprovada na árvore evolutiva (CA-9.1, CA-9.2, CA-9.6)."""
        now = datetime.now().isoformat()
        metadata = metadata or {}

        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Desativar versão anterior
            cursor.execute("UPDATE evolution_tree SET is_active = 0")
            
            # Inserir nova versão como ativa
            cursor.execute(
                """
                INSERT INTO evolution_tree (
                    version_id, parent_version_id, model_name, changes_summary,
                    overall_benchmark_score, experiment_id, is_active, created_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    new_version_id, parent_version_id, "Qwen2.5-Coder-1.5B-Instruct",
                    changes_summary, benchmark_score, experiment_id, now, json.dumps(metadata)
                )
            )
            conn.commit()

        logger.info(f"Nova geração {new_version_id} promovida com sucesso! Pontuação Benchmark: {benchmark_score}")
        return {
            "version_id": new_version_id,
            "parent": parent_version_id,
            "benchmark_score": benchmark_score,
            "status": "PROMOTED",
            "timestamp": now
        }

    def rollback_to_version(self, target_version_id: str) -> Dict[str, Any]:
        """Realiza rollback para uma geração anterior (CA-9.4)."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM evolution_tree WHERE version_id = ?", (target_version_id,))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Versão {target_version_id} não existe na árvore evolutiva.")

            cursor.execute("UPDATE evolution_tree SET is_active = 0")
            cursor.execute("UPDATE evolution_tree SET is_active = 1 WHERE version_id = ?", (target_version_id,))
            conn.commit()

        logger.warning(f"Rollback executado com sucesso para a versão {target_version_id}!")
        return {"status": "ROLLBACK_SUCCESS", "active_version": target_version_id}

    def get_full_tree(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM evolution_tree ORDER BY created_at ASC")
            rows = cursor.fetchall()
            results = []
            for r in rows:
                item = dict(r)
                item["metadata"] = json.loads(item.get("metadata_json") or "{}")
                results.append(item)
            return results

# Instância global da Árvore Evolutiva
evolution_tree = EvolutionaryVersionTree()
