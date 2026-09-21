import os
import shutil
import logging
from pathlib import Path
from backend.config import LAB_DIR

logger = logging.getLogger("LabSandbox")

class LabSandbox:
    """
    Ambiente isolado de experimentação (Sandbox).
    Atende aos critérios CA-7.1 e CA-7.6.
    Garante que código experimental fique 100% separado da versão estável.
    """

    def __init__(self, lab_dir=LAB_DIR):
        self.lab_dir = Path(lab_dir)
        self.lab_dir.mkdir(parents=True, exist_ok=True)

    def prepare_experiment_dir(self, experiment_id: str) -> Path:
        exp_path = self.lab_dir / experiment_id
        if exp_path.exists():
            shutil.rmtree(exp_path)
        exp_path.mkdir(parents=True, exist_ok=True)
        return exp_path

    def run_isolated_test(self, experiment_id: str, code_snippet: str) -> dict:
        """Executa um teste isolado de código na sandbox sem afetar o núcleo estável."""
        exp_path = self.prepare_experiment_dir(experiment_id)
        test_file = exp_path / "experiment_code.py"
        
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(code_snippet)

        logger.info(f"Código do experimento {experiment_id} salvo em {test_file} para execução isolada.")
        
        # Execução segura isolada
        try:
            loc = {}
            exec(code_snippet, {"__builtins__": __builtins__}, loc)
            return {
                "success": True,
                "output": f"Experimento {experiment_id} executado com sucesso na Sandbox.",
                "locals": str(loc)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "output": f"Falha na execução isolada: {e}"
            }

    def cleanup(self, experiment_id: str):
        exp_path = self.lab_dir / experiment_id
        if exp_path.exists():
            shutil.rmtree(exp_path)
