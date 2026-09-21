import logging
from typing import Dict, Any
from backend.model.base import BaseModelProvider
from backend.model.local_provider import LocalModelProvider

logger = logging.getLogger("ModelManager")

class ModelManager:
    """
    Gerenciador do Provedor de Modelo de IA.
    Permite trocar o modelo ativador sem reescrever o sistema (CA-1.6).
    """

    def __init__(self):
        self.active_provider: BaseModelProvider = LocalModelProvider()
        self.active_provider.initialize()

    def get_provider(self) -> BaseModelProvider:
        return self.active_provider

    def set_provider(self, new_provider: BaseModelProvider) -> bool:
        """Substitui o provedor ativo por um novo modelo."""
        try:
            new_provider.initialize()
            self.active_provider = new_provider
            logger.info(f"Provedor de modelo alterado para: {new_provider.get_model_info()['model_name']}")
            return True
        except Exception as e:
            logger.error(f"Falha ao trocar provedor de modelo: {e}")
            return False

    def generate(self, prompt: str, system_prompt: str = None, history: list = None) -> str:
        return self.active_provider.generate_response(prompt, system_prompt, history)

    def get_info(self) -> Dict[str, Any]:
        return self.active_provider.get_model_info()

# Instância global do Gerenciador de Modelos
model_manager = ModelManager()
