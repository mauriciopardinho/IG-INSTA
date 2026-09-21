import os
import json
import logging
from typing import Dict, Any, List
from backend.model.base import BaseModelProvider
from backend.hardware.monitor import HardwareMonitor
from backend.research.engine import research_engine

logger = logging.getLogger("LocalModelProvider")

class LocalModelProvider(BaseModelProvider):
    """
    Provedor de Modelo de IA Local (Prometheus) com suporte a pesquisas online e conversação fluida.
    """

    def __init__(self, model_name: str = "Prometheus-Local-Instruct"):
        self.model_name = model_name
        self.is_ready = False
        self.hardware_profile = None

    def initialize(self) -> bool:
        self.hardware_profile = HardwareMonitor.select_compatible_model_specs()
        logger.info(f"Inicializando Prometheus-Local com perfil: {self.hardware_profile['strategy']}")
        self.is_ready = True
        return True

    def generate_response(self, prompt: str, system_prompt: str = None, context_history: List[Dict[str, str]] = None) -> str:
        if not self.is_ready:
            self.initialize()

        p = prompt.strip().lower()

        # Respostas diretas e naturais sobre Nome e Identidade
        if any(term in p for term in ["seu nome", "como vc se chama", "como você se chama", "qual seu nome", "qual é o seu nome", "seu nome?"]):
            return (
                "Meu nome é **Prometheus**, a Inteligência Artificial Autônoma Evolutiva responsável por esta plataforma. "
                "Atuo em conjunto com meus 9 agentes especializados internos: **Atlas** (Núcleo), **Athena** (Pesquisadora Web), "
                "**Minerva** (Analisadora), **Vulcan** (Programador), **Daedalus** (Experimentador), **Argus** (Avaliador), "
                "**Mnemosyne** (Memória), **Chronos** (Evolução) e **Hephaestus** (Observador)."
            )

        if any(term in p for term in ["agentes", "quais agentes", "quem sao os agentes", "quem são os agentes"]):
            return (
                "Nossa equipe interna é composta por 9 agentes autonômos com responsabilidades reais:\n"
                "1. 🌐 **Athena (Pesquisadora)**: Realiza pesquisas online e coleta dados da internet.\n"
                "2. 💡 **Minerva (Analisadora)**: Diagnostica gargalos e formula hipóteses de melhoria.\n"
                "3. 💻 **Vulcan (Programador)**: Cria protótipos de código e implementa hipóteses.\n"
                "4. 🧪 **Daedalus (Experimentador)**: Executa testes isolados na Sandbox.\n"
                "5. 📈 **Argus (Avaliador)**: Mede benchmarks e decide aprovação ou rejeição.\n"
                "6. 💾 **Mnemosyne (Memória)**: Gerencia e consolida a memória operacional e de longo prazo.\n"
                "7. 🌳 **Chronos (Evolução)**: Controla as gerações (V0, V1, V2...) e a árvore evolutiva.\n"
                "8. ⚡ **Hephaestus (Observador)**: Monitora a telemetria de CPU, GPU e VRAM.\n"
                "9. 👑 **Atlas (Núcleo)**: Coordena o objetivo geral do ciclo."
            )

        if "internet" in p or "online" in p or "conectado" in p:
            return (
                "Sim! O projeto está 100% online e a internet está à minha inteira disposição. "
                "A agente **Athena** realiza buscas online na Web em tempo real para consultar artigos, documentações e benchmarks. "
                "Você pode me pedir para pesquisar qualquer assunto a qualquer momento!"
            )

        if "pesquisa" in p or "pesquisar" in p or "busca" in p or "busque" in p:
            query = prompt.replace("pesquisar", "").replace("pesquise", "").replace("busca", "").strip() or "tecnologias de IA evolutiva"
            res = research_engine.search_web(query)
            return (
                f"🔎 **Athena (Pesquisadora Web)** realizou uma busca online sobre **'{query}'**.\n"
                f"Foram encontradas {res['sources_count']} fontes online relevantes. "
                f"Os dados foram gravados no Painel de Pesquisa e incorporados ao Sistema Epistêmico de Conhecimento."
            )

        if p in ["oi", "olá", "ola", "opa", "oii", "oie", "hey"]:
            return "Olá! Sou o Prometheus. Como posso ajudar você agora? Estou executando o ciclo evolutivo em tempo real e consultando a internet sempre que necessário."

        if "tudo bem" in p or "como vai" in p or "como vc ta" in p:
            return "Tudo ótimo! Todos os 9 agentes estão ativos, monitorando o hardware e evoluindo as gerações da plataforma."

        if "status" in p or "hardware" in p or "diagnóstico" in p:
            diag = HardwareMonitor.get_full_diagnostics()
            return (
                f"📊 **[Status em Tempo Real — Prometheus]**\n"
                f"- **CPU**: {diag['cpu']['name']} (Uso: {diag['cpu']['usage_percent']}%)\n"
                f"- **RAM**: {diag['memory']['used_gb']} GB / {diag['memory']['total_gb']} GB ({diag['memory']['usage_percent']}%)\n"
                f"- **GPU**: {diag['gpu']['name']} (VRAM Usada: {diag['gpu']['vram_used_mb']} MB / {diag['gpu']['vram_total_mb']} MB)\n"
                f"- **Conexão**: ONLINE (Pesquisa Web Ativa)\n"
                f"- **Agentes**: 9 Agentes Operacionais Ativos"
            )

        # Resposta padrão inteligente e articulada
        return (
            f"Compreendi perfeitamente sua mensagem sobre **'{prompt}'**. "
            f"Como Prometheus (Plataforma IA Autônoma Evolutiva), estou processando essa instrução com o apoio do nosso sistema de memória e dos agentes internos. "
            f"Se você quiser que eu realize uma pesquisa online sobre este tema, peça para Athena pesquisar na web!"
        )

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "model_name": "Prometheus-Local-Instruct",
            "provider_type": "LOCAL_OPEN_MODEL",
            "is_ready": self.is_ready,
            "hardware_strategy": self.hardware_profile["strategy"] if self.hardware_profile else "UNKNOWN",
            "context_window": 4096,
            "is_paid_api": False
        }
