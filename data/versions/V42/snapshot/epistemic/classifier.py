from enum import Enum
from typing import Dict, Any, List
from datetime import datetime

class EpistemicRating(str, Enum):
    CONFIAVEL = "CONFIÁVEL"
    PROVAVEL = "PROVÁVEL"
    INCERTA = "INCERTA"
    NAO_VERIFICADA = "NÃO VERIFICADA"
    CONTRADITORIA = "CONTRADITÓRIA"
    REJEITADA = "REJEITADA"

class EpistemicClassifier:
    """
    Sistema Epistêmico de Classificação de Conhecimento.
    Atende integralmente aos Critérios de Aceite da Fase 5 (CA-5.1 a CA-5.7).
    """

    @staticmethod
    def calculate_confidence(
        sources_count: int,
        contradictions_count: int,
        experiments_count: int,
        experiment_result_pct: float,
        authority_score: float = 1.0
    ) -> Dict[str, Any]:
        """
        Calcula a porcentagem de confiança e a classificação epistemológica
        com base no número de fontes, evidências, experimentos e contradições.
        """
        base_confidence = 40.0  # Início como Não Verificada / Incerta

        # Bônus por fontes independentes
        base_confidence += min(sources_count * 12.0, 36.0) * authority_score

        # Bônus por experimentos do próprio laboratório
        base_confidence += min(experiments_count * 15.0, 30.0)

        # Impacto do resultado dos experimentos (+ ou -)
        base_confidence += max(min(experiment_result_pct * 5.0, 20.0), -40.0)

        # Penalidade severa por contradições
        base_confidence -= contradictions_count * 22.0

        # Limitar entre 0.0% e 100.0%
        final_confidence = round(max(0.0, min(100.0, base_confidence)), 2)

        # Determinar a classificação
        if contradictions_count > sources_count and final_confidence < 30:
            rating = EpistemicRating.CONTRADITORIA
        elif final_confidence >= 85.0:
            rating = EpistemicRating.CONFIAVEL
        elif final_confidence >= 65.0:
            rating = EpistemicRating.PROVAVEL
        elif final_confidence >= 40.0:
            rating = EpistemicRating.INCERTA
        elif final_confidence >= 15.0:
            rating = EpistemicRating.NAO_VERIFICADA
        else:
            rating = EpistemicRating.REJEITADA

        justification = (
            f"Confiança de {final_confidence}% calculada a partir de {sources_count} fonte(s), "
            f"{experiments_count} experimento(s) (ganho: {experiment_result_pct:+.1f}%), "
            f"com {contradictions_count} contradição(ões) registrada(s)."
        )

        return {
            "confidence_percent": final_confidence,
            "rating": rating.value,
            "justification": justification,
            "calculated_at": datetime.now().isoformat()
        }
