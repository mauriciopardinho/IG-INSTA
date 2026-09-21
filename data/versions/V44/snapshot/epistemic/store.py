import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.config import DB_PATH
from backend.epistemic.classifier import EpistemicClassifier, EpistemicRating

logger = logging.getLogger("EpistemicStore")

class EpistemicStore:
    """
    Armazenamento e Gestão Epistêmica de Conhecimento.
    Atende aos critérios CA-5.1 a CA-5.7 e seções 7 e 8 da instrução.
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
            CREATE TABLE IF NOT EXISTS epistemic_knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                statement TEXT NOT NULL,
                category TEXT DEFAULT 'GERAL',
                confidence_percent REAL NOT NULL,
                rating TEXT NOT NULL,
                sources_count INTEGER DEFAULT 1,
                contradictions_count INTEGER DEFAULT 0,
                experiments_count INTEGER DEFAULT 0,
                experiment_result_pct REAL DEFAULT 0.0,
                justification TEXT,
                sources_json TEXT,
                evidence_json TEXT,
                status TEXT DEFAULT 'PROVISORIAMENTE_ACEITO',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """)
            conn.commit()

    def add_claim(
        self,
        statement: str,
        category: str = "GERAL",
        sources: List[str] = None,
        contradictions: List[str] = None,
        experiments_count: int = 0,
        experiment_result_pct: float = 0.0
    ) -> Dict[str, Any]:
        sources = sources or ["Consulta Web / Análise Interna"]
        contradictions = contradictions or []

        calc = EpistemicClassifier.calculate_confidence(
            sources_count=len(sources),
            contradictions_count=len(contradictions),
            experiments_count=experiments_count,
            experiment_result_pct=experiment_result_pct
        )

        now = datetime.now().isoformat()
        status = "CONFIRMADO" if calc["rating"] == "CONFIÁVEL" else ("REJEITADO" if calc["rating"] == "REJEITADA" else "PROVISORIAMENTE_ACEITO")

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO epistemic_knowledge (
                    statement, category, confidence_percent, rating, sources_count,
                    contradictions_count, experiments_count, experiment_result_pct,
                    justification, sources_json, evidence_json, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    statement, category, calc["confidence_percent"], calc["rating"],
                    len(sources), len(contradictions), experiments_count, experiment_result_pct,
                    calc["justification"], json.dumps(sources), json.dumps(contradictions),
                    status, now, now
                )
            )
            claim_id = cursor.lastrowid
            conn.commit()

            return {
                "id": claim_id,
                "statement": statement,
                "confidence_percent": calc["confidence_percent"],
                "rating": calc["rating"],
                "justification": calc["justification"],
                "status": status
            }

    def update_claim_evidence(self, claim_id: int, new_sources: List[str] = None, new_contradictions: List[str] = None, lab_gain: float = None) -> Dict[str, Any]:
        """Atualiza a confiança epistêmica com novas evidências."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM epistemic_knowledge WHERE id = ?", (claim_id,))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Afirmação #{claim_id} não encontrada.")

            sources = json.loads(row["sources_json"] or "[]")
            if new_sources:
                sources.extend(new_sources)

            contradictions = json.loads(row["evidence_json"] or "[]")
            if new_contradictions:
                contradictions.extend(new_contradictions)

            exp_count = row["experiments_count"] + (1 if lab_gain is not None else 0)
            exp_result = (row["experiment_result_pct"] + lab_gain) if lab_gain is not None else row["experiment_result_pct"]

            calc = EpistemicClassifier.calculate_confidence(
                sources_count=len(sources),
                contradictions_count=len(contradictions),
                experiments_count=exp_count,
                experiment_result_pct=exp_result
            )

            now = datetime.now().isoformat()
            status = "CONFIRMADO" if calc["rating"] == "CONFIÁVEL" else ("REJEITADO" if calc["rating"] == "REJEITADA" else "PROVISORIAMENTE_ACEITO")

            cursor.execute(
                """
                UPDATE epistemic_knowledge SET
                    confidence_percent = ?, rating = ?, sources_count = ?,
                    contradictions_count = ?, experiments_count = ?, experiment_result_pct = ?,
                    justification = ?, sources_json = ?, evidence_json = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    calc["confidence_percent"], calc["rating"], len(sources),
                    len(contradictions), exp_count, exp_result,
                    calc["justification"], json.dumps(sources), json.dumps(contradictions),
                    status, now, claim_id
                )
            )
            conn.commit()
            return {"id": claim_id, "rating": calc["rating"], "confidence": calc["confidence_percent"], "justification": calc["justification"]}

    def get_all_claims(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM epistemic_knowledge ORDER BY updated_at DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                item = dict(r)
                item["sources"] = json.loads(item.get("sources_json") or "[]")
                item["contradictions"] = json.loads(item.get("evidence_json") or "[]")
                results.append(item)
            return results

# Instância global da Base Epistêmica
epistemic_store = EpistemicStore()
