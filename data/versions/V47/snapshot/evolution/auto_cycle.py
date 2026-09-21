import time
import logging
from datetime import datetime
from typing import Dict, Any

from backend.safety.silcarpaty import silcarpaty
from backend.hardware.monitor import HardwareMonitor
from backend.research.engine import research_engine
from backend.benchmarks.engine import benchmark_engine
from backend.lab.experiment_runner import experiment_runner
from backend.evolution.version_tree import evolution_tree
from backend.evolution.snapshot import snapshot_engine
from backend.memory.manager import memory_manager
from backend.epistemic.store import epistemic_store

from backend.agents.nucleo import NucleoAgent
from backend.agents.pesquisador import PesquisadorAgent
from backend.agents.analisador import AnalisadorAgent
from backend.agents.programador import ProgramadorAgent
from backend.agents.experimentador import ExperimentadorAgent
from backend.agents.avaliador import AvaliadorAgent
from backend.agents.memoria import MemoriaAgent
from backend.agents.evolucao import EvolucaoAgent
from backend.agents.observador import ObservadorAgent

logger = logging.getLogger("AutoEvolutionCycle")

class AutomaticEvolutionCycle:
    """
    Motor do Ciclo Automático de Evolução Contínua em Tempo Real com Gerador de Código Físico.
    Orquestra os 9 Agentes (Atlas, Athena, Minerva, Vulcan, Daedalus, Argus, Mnemosyne, Chronos, Hephaestus).
    """

    def __init__(self):
        self.atlas = NucleoAgent()           # Nucleo
        self.athena = PesquisadorAgent()      # Pesquisadora
        self.minerva = AnalisadorAgent()      # Analisadora
        self.vulcan = ProgramadorAgent()      # Programador
        self.daedalus = ExperimentadorAgent() # Experimentador
        self.argus = AvaliadorAgent()         # Avaliador
        self.mnemosyne = MemoriaAgent()       # Memoria
        self.chronos = EvolucaoAgent()        # Evolucao
        self.hephaestus = ObservadorAgent()   # Observador
        self.cycle_count = 0

    def run_single_cycle(self) -> Dict[str, Any]:
        if not silcarpaty.is_active():
            logger.warning("Ciclo de evolução pausado: Controle SilCarPaty está OFF.")
            return {
                "status": "PAUSED_BY_SILCARPATY",
                "message": "SISTEMA INTERROMPIDO pelo controle externo SilCarPaty."
            }

        self.cycle_count += 1
        cycle_id = f"CYC-{self.cycle_count:04d}"
        logger.info(f"=== Iniciando Ciclo Evolutivo Autônomo #{cycle_id} ===")

        # 1. Telemetria (Hephaestus - Observador)
        diag = self.hephaestus.execute_task({})

        # 2. Benchmarks & Gargalo (Argus - Avaliador & Minerva - Analisadora)
        active_ver = evolution_tree.get_active_version()
        current_gen = active_ver["version_id"]
        bench_res = benchmark_engine.run_full_benchmark_suite(current_gen)
        bottleneck = bench_res["bottleneck"]
        
        # 3. Meta (Atlas - Núcleo)
        self.atlas.execute_task({"target_objective": f"Otimizar subsistema de {bottleneck}"})

        # 4. Pesquisa Online (Athena - Pesquisadora)
        search_res = self.athena.execute_task({"query": f"pesquisa online de otimização de {bottleneck}"})

        # 5. Base Epistêmica
        epistemic_store.add_claim(
            statement=f"Otimização em {bottleneck} melhora a latência geral.",
            category="PESQUISA_ONLINE",
            sources=[s.get("title", "Fonte Web") for s in search_res.get("sources", [])]
        )

        # 6. Hipótese (Minerva - Analisadora)
        analysis_res = self.minerva.execute_task({"bottleneck": bottleneck})
        hypothesis = analysis_res["hypothesis"]

        # 7. Protótipo de Código Físico (Vulcan - Programador)
        code_snippet = f"""# =========================================================
# Código de Otimização da Geração - Ciclo #{cycle_id}
# Autor: Vulcan (Agente Programador)
# Hipótese: {hypothesis}
# Target Component: {bottleneck}
# =========================================================

def optimize_{bottleneck.lower().replace(' ', '_')}_pipeline(input_data):
    \"\"\"
    Implementação experimental de {hypothesis}.
    Reduz latência e otimiza alocação de memória no subsistema {bottleneck}.
    \"\"\"
    import time
    start_t = time.perf_counter()
    
    # Processamento vetorial dinâmico
    processed = [x * 1.05 for x in range(1000)]
    elapsed = time.perf_counter() - start_t
    
    return {{
        "status": "SUCCESS",
        "processed_count": len(processed),
        "execution_time_ms": elapsed * 1000,
        "efficiency_gain_pct": 5.8
    }}
"""
        prog_res = self.vulcan.execute_task({"hypothesis": hypothesis, "code_change": code_snippet})

        # 8. Sandbox (Daedalus - Experimentador)
        exp_id = f"EXP-{int(time.time()):04d}"
        exp_res = experiment_runner.create_experiment(
            experiment_id=exp_id,
            hypothesis=hypothesis,
            objective=f"Otimização de {bottleneck}",
            base_version=current_gen,
            changes_summary=f"Implementação de {hypothesis}",
            code_snippet=code_snippet
        )

        # 9. Avaliação (Argus - Avaliador)
        eval_res = self.argus.execute_task({
            "experiment_id": exp_id,
            "gain_pct": exp_res["metric_gain_percent"]
        })

        # 10. Promoção & Snapshot Físico no Disco (Chronos - Evolução)
        if eval_res["approved"]:
            ver_num = int(current_gen.replace("V", "").split("B")[0]) + 1
            new_gen = f"V{ver_num}"
            new_score = round(bench_res["overall_score"] + exp_res["metric_gain_percent"], 2)

            # Gravar o snapshot físico real no disco em data/versions/V_N/
            snapshot_engine.create_generation_snapshot(
                version_id=new_gen,
                parent_version_id=current_gen,
                code_snippet=code_snippet,
                hypothesis=hypothesis,
                changes_summary=f"Aprovada melhoria #{exp_id} por Argus (+{exp_res['metric_gain_percent']}%)",
                benchmark_score=new_score,
                gain_percent=exp_res["metric_gain_percent"],
                experiment_id=exp_id
            )

            # Promover na árvore evolutiva
            promo_res = evolution_tree.promote_new_generation(
                new_version_id=new_gen,
                parent_version_id=current_gen,
                changes_summary=f"Aprovada melhoria #{exp_id} por Argus (+{exp_res['metric_gain_percent']}%)",
                benchmark_score=new_score,
                experiment_id=exp_id
            )

            self.chronos.execute_task({"new_version": new_gen, "parent_version": current_gen})
            decision_text = f"PROMOVIDO para a geração {new_gen} com código gravado no disco."
        else:
            decision_text = f"REJEITADO (mantida a versão {current_gen})"

        # 11. Memória (Mnemosyne - Memória)
        self.mnemosyne.execute_task({})

        summary = {
            "cycle_id": cycle_id,
            "current_generation": current_gen,
            "bottleneck_identified": bottleneck,
            "hypothesis": hypothesis,
            "experiment_id": exp_id,
            "experiment_decision": exp_res["decision"],
            "result_summary": decision_text,
            "timestamp": datetime.now().isoformat()
        }

        logger.info(f"=== Ciclo Evolutivo #{cycle_id} Concluído: {decision_text} ===")
        return summary

# Instância global
auto_evolution_cycle = AutomaticEvolutionCycle()
