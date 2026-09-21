import sys
from pathlib import Path

# Garantir que a raiz do projeto esteja no sys.path para o Render encontrar 'backend'
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import threading
import time
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.config import STATIC_DIR, HOST, PORT
from backend.safety.silcarpaty import silcarpaty
from backend.evolution.auto_cycle import auto_evolution_cycle
from backend.observability.logger import setup_logging

# Routers API
from backend.api.chat import router as chat_router
from backend.api.dashboard import router as dashboard_router
from backend.api.agents import router as agents_router
from backend.api.lab import router as lab_router
from backend.api.evolution import router as evolution_router
from backend.api.benchmarks import router as benchmarks_router
from backend.api.research import router as research_router
from backend.api.epistemic import router as epistemic_router
from backend.api.memory import router as memory_router

logger = setup_logging()

keep_running = True

def background_evolution_watchdog():
    """
    Watchdog de Execução Autônoma Contínua em Tempo Real.
    Executa ciclos evolutivos de forma 100% autônoma a cada ~12 segundos.
    Atende aos requisitos de Autonomia Operacional e Autonomia Contínua.
    """
    logger.info("Watchdog de Execução Contínua em Tempo Real iniciado.")
    # Executar um ciclo imediato ao iniciar
    time.sleep(2)
    while keep_running:
        try:
            if silcarpaty.is_active():
                auto_evolution_cycle.run_single_cycle()
            else:
                logger.info("Watchdog em pausa: Controle SilCarPaty está OFF.")
        except Exception as e:
            logger.error(f"Erro capturado pelo Watchdog (recuperado com sucesso): {e}")
        
        # Intervalo rápido de 12 segundos para dinamismo e evolução contínua em tempo real
        time.sleep(12)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando Plataforma de IA Autônoma Evolutiva...")
    watchdog_thread = threading.Thread(target=background_evolution_watchdog, daemon=True)
    watchdog_thread.start()
    yield
    global keep_running
    keep_running = False
    logger.info("Plataforma de IA Autônoma Evolutiva encerrada com sucesso.")

app = FastAPI(
    title="Plataforma de Inteligência Artificial Autônoma Evolutiva",
    description="Plataforma de Pesquisa, Experimentação, Benchmarks e Evolução Autônoma Contínua",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(dashboard_router)
app.include_router(agents_router)
app.include_router(lab_router)
app.include_router(evolution_router)
app.include_router(benchmarks_router)
app.include_router(research_router)
app.include_router(epistemic_router)
app.include_router(memory_router)

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
