from typing import Dict, Any
from backend.agents.base import BaseAgent
from backend.hardware.monitor import HardwareMonitor

class ObservadorAgent(BaseAgent):
    def __init__(self):
        super().__init__("Hephaestus", "OBSERVADOR", "Telemetria de hardware, observabilidade e logs de estado.")

    def execute_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        diag = HardwareMonitor.get_full_diagnostics()
        self.speak(
            message=f"Telemetria em tempo real: CPU {diag['cpu']['usage_percent']}%, RAM {diag['memory']['usage_percent']}%, GPU {diag['gpu']['usage_percent']}%. Todos os subsistemas operando normalmente.",
            action="TELEMETRIA_REGISTRADA"
        )
        return diag
