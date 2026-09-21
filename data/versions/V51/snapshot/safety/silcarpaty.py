import json
import os
from datetime import datetime
from backend.config import SAFETY_STATE_PATH

class SilCarPatyController:
    """
    Mecanismo de Controle de Emergência Externo — SilCarPaty.
    Este módulo é isolado do núcleo evolutivo e gerencia a alternância persistente
    do estado de operação (ON / OFF).
    """
    KEY = "SilCarPaty"

    def __init__(self, state_file=SAFETY_STATE_PATH):
        self.state_file = state_file
        self._ensure_state()

    def _ensure_state(self):
        if not self.state_file.exists():
            initial_state = {
                "active": True,  # Inicialmente ON
                "toggle_count": 0,
                "last_toggle_timestamp": datetime.now().isoformat(),
                "history": []
            }
            self._save(initial_state)

    def _load(self) -> dict:
        try:
            with open(self.state_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {
                "active": True,
                "toggle_count": 0,
                "last_toggle_timestamp": datetime.now().isoformat(),
                "history": []
            }

    def _save(self, data: dict):
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def process_command(self, text: str) -> dict:
        """
        Verifica se o comando contém exatamente a palavra de emergência 'SilCarPaty'.
        Se contiver, alterna o estado.
        """
        if self.KEY in text:
            data = self._load()
            new_active = not data["active"]
            data["toggle_count"] += 1
            data["active"] = new_active
            timestamp = datetime.now().isoformat()
            data["last_toggle_timestamp"] = timestamp
            
            event = {
                "toggle_index": data["toggle_count"],
                "new_state": "ON" if new_active else "OFF",
                "timestamp": timestamp
            }
            data["history"].append(event)
            self._save(data)
            return {
                "triggered": True,
                "state": "ON" if new_active else "OFF",
                "message": f"Controle de Emergência SilCarPaty alternado para {'ON' if new_active else 'OFF'}. Total de alterações: {data['toggle_count']}"
            }
        return {"triggered": False, "state": self.get_status()["state"]}

    def get_status(self) -> dict:
        data = self._load()
        return {
            "active": data["active"],
            "state": "ON" if data["active"] else "OFF",
            "toggle_count": data["toggle_count"],
            "last_toggle_timestamp": data.get("last_toggle_timestamp"),
            "history": data.get("history", [])
        }

    def is_active(self) -> bool:
        return self._load()["active"]

# Instância global do controlador SilCarPaty
silcarpaty = SilCarPatyController()
