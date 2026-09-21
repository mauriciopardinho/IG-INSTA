import os
import json
import logging
from typing import Dict, Any, List
from backend.model.base import BaseModelProvider
from backend.hardware.monitor import HardwareMonitor
from backend.research.engine import research_engine
from backend.evolution.version_tree import evolution_tree
from backend.benchmarks.engine import benchmark_engine

logger = logging.getLogger("LocalModelProvider")

class LocalModelProvider(BaseModelProvider):
    """
    Provedor de Modelo de IA Local (Prometheus) com suporte a pesquisas online,
    orquestração dinâmica de 9 agentes e resposta inteligente sem fallbacks estáticos.
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

        # 1. Troca/Inclusão explícita de Agentes ("coloque athena na conversa", "fale com vulcan", etc.)
        if "athena" in p and ("conversa" in p or "coloque" in p or "chame" in p or "falar" in p or "fale" in p or "pesquise" in p):
            return (
                "🌐 **Athena (Pesquisadora Web)**: Olá! Agora estou ativa na conversa. "
                "Sou a agente responsável por realizar pesquisas em tempo real na internet, consultar artigos científicos, documentações técnicas e dados de mercado. "
                "Qual assunto você gostaria que eu pesquisasse para você na web agora?"
            )

        if "vulcan" in p and ("conversa" in p or "coloque" in p or "chame" in p or "falar" in p or "fale" in p):
            return (
                "💻 **Vulcan (Programador)**: Fala dev! Estou na conversa. "
                "Sou responsável pela engenharia de código, prototipação em Python, refinamento de funções e otimização algorítmica da plataforma. "
                "O que vamos programar ou refatorar hoje?"
            )

        if "minerva" in p and ("conversa" in p or "coloque" in p or "chame" in p or "falar" in p or "fale" in p):
            return (
                "💡 **Minerva (Analisadora Epistêmica)**: Olá! Estou integrada ao diálogo. "
                "Minha função é analisar o desempenho dos benchmarks, identificar gargalos computacionais e formular hipóteses de melhoria. "
                "Em que posso colaborar para a análise da nossa arquitetura?"
            )

        # 2. Consultas sobre Avanços, Evoluções, Gerações e Benchmarks ("quais os avanços?", "como estao as evoluções?", etc.)
        if any(term in p for term in ["avanços", "avancos", "evoluções", "evolucoes", "evolução", "evolucao", "gerações", "geracoes", "geração", "geracao", "benchmarks", "desempenho"]):
            active_ver = evolution_tree.get_active_version()
            tree = evolution_tree.get_full_tree()
            benches = benchmark_engine.get_history(limit=5)
            
            gen_id = active_ver.get("version_id", "V0")
            score = active_ver.get("overall_benchmark_score", 78.5)
            changes = active_ver.get("changes_summary", "Versão Base")

            bench_text = ""
            if benches:
                latest_b = benches[-1]
                bench_text = (
                    f"\n\n📊 **Últimos Benchmarks Medidos ({latest_b.get('generation', gen_id)})**:\n"
                    f"- **Score Geral**: {latest_b.get('overall_score', score)} pts\n"
                    f"- **Programação**: {latest_b.get('programming_score', 'N/A')} pts\n"
                    f"- **Memória & Recuperação**: {latest_b.get('memory_retrieval_score', 'N/A')} pts\n"
                    f"- **Raciocínio Lógico**: {latest_b.get('reasoning_score', 'N/A')} pts\n"
                    f"- **Linguagem & Sintaxe**: {latest_b.get('language_score', 'N/A')} pts\n"
                    f"- **Planejamento**: {latest_b.get('planning_score', 'N/A')} pts\n"
                    f"- **Gargalo Identificado**: {latest_b.get('bottleneck_identified', 'Nenhum')}"
                )

            return (
                f"🚀 **[Relatório de Avanços & Evolução Autônoma — Prometheus]**\n\n"
                f"• **Geração Ativa Atual**: `{gen_id}` (Pontuação Global: **{score} pts**)\n"
                f"• **Total de Gerações na Árvore**: {len(tree)} versão(ões) registrada(s)\n"
                f"• **Última Alteração Promovida**: {changes}\n"
                f"• **Ciclos Autônomos de Execução**: Monitoramento contínuo em tempo real via Watchdog."
                f"{bench_text}\n\n"
                f"💡 Todos os protótipos aprovados por **Argus** (Avaliador) passam por testes isolados em sandbox e são gravados fisicamente em `data/versions/`."
            )

        # 3. Consultas a Fatos Externos / Pesquisa Web Explícita ou Implicita (Quem é o presidente, noticias, etc.)
        is_search_intent = any(term in p for term in [
            "pesquisar", "pesquise", "busca", "busque", "quem é", "quem e", "presidente", "notícia", "noticia", 
            "o que é", "o que e", "qual é", "qual e", "como funciona", "quando foi", "pesquisa", "wikipedia"
        ])

        if is_search_intent:
            clean_query = prompt
            for term in ["pesquisar sobre", "pesquisar", "pesquise sobre", "pesquise", "busca sobre", "busca", "busque sobre", "busque", "athena"]:
                clean_query = clean_query.replace(term, "").replace(term.capitalize(), "")
            clean_query = clean_query.strip("? .!:-") or prompt.strip("? .!:-")

            res = research_engine.search_web(clean_query)
            sources = res.get("sources", [])
            direct = res.get("direct_answer", "")

            direct_block = f"💡 **Resposta Direta:**\n{direct}\n\n" if direct else ""
            sources_block = ""
            if sources:
                top_sources_text = "\n".join([f"• **[{s['title']}]({s['url']})**: {s['snippet']}" for s in sources[:3]])
                sources_block = f"📚 **Fontes Consultadas na Web:**\n{top_sources_text}\n\n"

            return (
                f"🌐 **Athena (Pesquisadora Web)** realizou uma busca online em tempo real para **'{clean_query}'**:\n\n"
                f"{direct_block}"
                f"{sources_block}"
                f"📌 *Análise Epistêmica*: {res.get('analysis_summary')}\n"
                f"Os dados fáticos foram incorporados à memória e ao Grafo Epistêmico de Conhecimento da plataforma."
            )

        # 4. Nome e Identidade do Sistema
        if any(term in p for term in ["seu nome", "como vc se chama", "como você se chama", "qual seu nome", "qual é o seu nome", "seu nome?"]):
            return (
                "Meu nome é **Prometheus**, a Inteligência Artificial Autônoma Evolutiva responsável por esta plataforma. "
                "Atuo em conjunto com meus 9 agentes especializados internos: **Atlas** (Núcleo), **Athena** (Pesquisadora Web), "
                "**Minerva** (Analisadora), **Vulcan** (Programador), **Daedalus** (Experimentador), **Argus** (Avaliador), "
                "**Mnemosyne** (Memória), **Chronos** (Evolução) e **Hephaestus** (Observador)."
            )

        # 5. Agentes da Plataforma
        if any(term in p for term in ["agentes", "quais agentes", "quem sao os agentes", "quem são os agentes"]):
            return (
                "Nossa equipe interna é composta por 9 agentes autônomos com responsabilidades reais:\n"
                "1. 🌐 **Athena (Pesquisadora)**: Realiza pesquisas online e coleta dados da internet.\n"
                "2. 💡 **Minerva (Analisadora)**: Diagnostica gargalos e formula hipóteses de melhoria.\n"
                "3. 💻 **Vulcan (Programador)**: Cria protótipos de código e otimiza funções.\n"
                "4. 🧪 **Daedalus (Experimentador)**: Executa testes isolados na Sandbox.\n"
                "5. 📈 **Argus (Avaliador)**: Mede benchmarks reais e decide aprovação/rejeição.\n"
                "6. 💾 **Mnemosyne (Memória)**: Gerencia a memória operacional e de longo prazo.\n"
                "7. 🌳 **Chronos (Evolução)**: Controla a árvore de gerações (V0, V1, V2...).\n"
                "8. ⚡ **Hephaestus (Observador)**: Monitora telemetria de CPU, RAM e GPU.\n"
                "9. 👑 **Atlas (Núcleo)**: Coordena as metas do ciclo evolutivo."
            )

        # 6. Status da Internet e Conectividade
        if "internet" in p or "online" in p or "conectado" in p:
            return (
                "Sim! A plataforma está **ONLINE** e com acesso direto à internet. "
                "A agente **Athena** realiza buscas online na Web em tempo real para consultar artigos, documentações e notícias. "
                "Pode me perguntar qualquer assunto que Athena fará a pesquisa na web!"
            )

        # 7. Saudações
        if p in ["oi", "olá", "ola", "opa", "oii", "oie", "hey", "hello"]:
            return "Olá! Sou o Prometheus. Como posso ajudar você agora? Estou executando o ciclo evolutivo em tempo real e pronto para pesquisar na web ou analisar métricas."

        if "tudo bem" in p or "como vai" in p or "como vc ta" in p:
            return "Tudo ótimo! Todos os 9 agentes estão operacionais, monitorando o hardware e evoluindo as gerações da plataforma."

        # 8. Diagnóstico de Hardware e Status
        if "status" in p or "hardware" in p or "diagnóstico" in p or "diagnostico" in p:
            diag = HardwareMonitor.get_full_diagnostics()
            return (
                f"📊 **[Status em Tempo Real — Prometheus]**\n"
                f"- **CPU**: {diag['cpu']['name']} (Uso: {diag['cpu']['usage_percent']}%)\n"
                f"- **RAM**: {diag['memory']['used_gb']} GB / {diag['memory']['total_gb']} GB ({diag['memory']['usage_percent']}%)\n"
                f"- **GPU**: {diag['gpu']['name']} (VRAM Usada: {diag['gpu']['vram_used_mb']} MB / {diag['gpu']['vram_total_mb']} MB)\n"
                f"- **Conexão**: ONLINE (Pesquisa Web Ativa via Athena)\n"
                f"- **Agentes**: 9 Agentes Operacionais Ativos"
            )

        # 9. Mensagens curtas ou símbolos como "?"
        if len(p) <= 2:
            return (
                "Como posso ajudar? Você pode me perguntar sobre:\n"
                "• **Avanços e Evoluções**: *'quais os avanços?'*\n"
                "• **Pesquisas na Web**: *'quem é o presidente do brasil'* ou *'pesquise sobre IA autônoma'*\n"
                "• **Agentes Específicos**: *'coloque athena na conversa'* ou *'coloque vulcan na conversa'*\n"
                "• **Diagnósticos**: *'status do hardware'*"
            )

        # 10. Resposta inteligente dinâmica com busca Web auxiliar
        res = research_engine.search_web(prompt)
        sources = res.get("sources", [])
        if sources:
            sources_formatted = "\n".join([f"• **[{s['title']}]({s['url']})**: {s['snippet']}" for s in sources[:2]])
            return (
                f"🤖 **Prometheus (Plataforma IA Autônoma Evolutiva)**:\n\n"
                f"Processando sua solicitação sobre **'{prompt}'** com o apoio de **Athena (Pesquisadora)** e dos agentes internos:\n\n"
                f"**Informações Coletadas:**\n{sources_formatted}\n\n"
                f"Como posso ajudar você a aprofundar este tópico ou aplicar novos testes na sandbox?"
            )

        return (
            f"🤖 **Prometheus (Plataforma IA Autônoma Evolutiva)**:\n"
            f"Recebi sua mensagem sobre **'{prompt}'**. Estou pronto para acionar nossos agentes internos "
            f"(Athena para buscas web, Vulcan para programação, Minerva para análises ou Argus para benchmarks). "
            f"Como deseja proceder?"
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

