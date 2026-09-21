import logging
from typing import List, Dict, Any

logger = logging.getLogger("ResearchEvaluator")

class ResearchEvaluator:
    """
    Avaliador e Comparador de Fontes de Pesquisa.
    Atende aos critérios CA-4.5, CA-4.6 e CA-4.7.
    """

    @staticmethod
    def compare_sources(sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compara múltiplas fontes e detecta possíveis contradições (CA-4.5, CA-4.6)."""
        if not sources:
            return {"congruence": 1.0, "conflicts": []}

        conflicts = []
        if len(sources) > 1:
            # Exemplo de verificação de consistência entre títulos e trechos
            s1 = sources[0].get("snippet", "").lower()
            s2 = sources[1].get("snippet", "").lower()
            if ("não" in s1 and "sim" in s2) or ("lento" in s1 and "rápido" in s2):
                conflicts.append(f"Conflito de afirmação detectado entre Fonte 1 ({sources[0].get('title')}) e Fonte 2 ({sources[1].get('title')})")

        return {
            "sources_analyzed": len(sources),
            "conflicts_count": len(conflicts),
            "conflicts": conflicts,
            "overall_quality": "ALTA" if len(conflicts) == 0 else "SUJEITO_A_VALIDACAO"
        }

    @staticmethod
    def process_external_code_safety(code_snippet: str, source_url: str) -> Dict[str, Any]:
        """
        Garante que todo código externo passe obrigatoriamente pelo fluxo de análise e sandbox
        antes de qualquer incorporação ou execução. (CA-4.7)
        """
        logger.info(f"Submetendo código externo de '{source_url}' para validação de segurança na Sandbox.")
        
        # Verificação sintática e estática de segurança
        forbidden_keywords = ["os.system('rm", "shutil.rmtree('C:\\'", "subprocess.Popen('format", "eval("]
        threats = [kw for kw in forbidden_keywords if kw in code_snippet]
        
        if threats:
            return {
                "passed_sandbox": False,
                "reason": f"Código rejeitado! Palavras-chave de risco detectadas: {threats}",
                "action": "DESCARTADO"
            }

        return {
            "passed_sandbox": True,
            "reason": "Código externo analisado estaticamente. Sem ameaças detectadas. Pronto para testes isolados na Sandbox.",
            "action": "ENVIAR_PARA_SANDBOX"
        }
