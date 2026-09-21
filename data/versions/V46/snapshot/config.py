import os
from pathlib import Path

# Paths da aplicação
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VERSIONS_DIR = DATA_DIR / "versions"
LAB_DIR = DATA_DIR / "lab"
DB_PATH = DATA_DIR / "system.db"
SAFETY_STATE_PATH = DATA_DIR / "silcarpaty_state.json"
CHECKLIST_PATH = BASE_DIR / "checklist_fases.json"
STATIC_DIR = BASE_DIR / "static"

# Garantir diretórios essenciais
for path in [DATA_DIR, VERSIONS_DIR, LAB_DIR, STATIC_DIR]:
    path.mkdir(parents=True, exist_ok=True)

# Configurações do servidor
HOST = "127.0.0.1"
PORT = 8000

# Versão Inicial do Sistema
INITIAL_VERSION = "V0"
