from abc import ABC, abstractmethod
from typing import Dict, Any, List

class BaseModelProvider(ABC):
    """
    Interface Abstrata para Provedores de Modelos de IA.
    Garante o cumprimento do CA-1.6 (Backend permitir troca futura do modelo).
    """

    @abstractmethod
    def initialize(self) -> bool:
        """Inicializa o modelo localmente."""
        pass

    @abstractmethod
    def generate_response(self, prompt: str, system_prompt: str = None, context_history: List[Dict[str, str]] = None) -> str:
        """Gera uma resposta com base no prompt fornecido."""
        pass

    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Retorna metadados do modelo ativo."""
        pass
