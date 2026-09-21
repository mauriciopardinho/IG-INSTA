from abc import ABC, abstractmethod
from typing import Dict, Any
from backend.observability.conversation_bus import conversation_bus

class BaseAgent(ABC):
    """
    Classe Abstrata para os Agentes Internos Especializados com Personas Identificadas.
    """

    def __init__(self, name: str, persona_title: str, role_description: str):
        self.name = name
        self.persona_title = persona_title
        self.role_description = role_description

    def speak(self, message: str, target: str = "TODOS", objective: str = None, hypothesis: str = None, action: str = None, decision: str = None, experiment_id: str = None):
        """Publica mensagem na conversação interna dos agentes."""
        display_author = f"{self.name} ({self.persona_title})"
        return conversation_bus.publish_message(
            agent_name=display_author,
            message=message,
            target_agent=target,
            objective=objective,
            hypothesis=hypothesis,
            action=action,
            decision=decision,
            experiment_id=experiment_id
        )

    @abstractmethod
    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        pass
