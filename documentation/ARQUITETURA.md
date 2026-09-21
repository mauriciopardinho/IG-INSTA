# Documentação Técnica — Plataforma de IA Autônoma Evolutiva

## 1. Arquitetura Geral do Sistema

A Plataforma de Inteligência Artificial Autônoma Evolutiva é um laboratório permanente de pesquisa, aquisição de conhecimento, formulação de hipóteses, testes isolados em sandbox, benchmarks multidimensionais reais, versionamento evolutivo e autoaperfeiçoamento contínuo.

### Visão Geral dos Componentes
```
                                  +-----------------------+
                                  |     PAINEL WEB (SPA)  |
                                  |   (Português / HTML)  |
                                  +-----------+-----------+
                                              |
                                              v
                                  +-----------------------+
                                  |  BACKEND FASTAPI API  |
                                  +-----------+-----------+
                                              |
      +-------------------+-------------------+-------------------+-------------------+
      |                   |                   |                   |                   |
      v                   v                   v                   v                   v
+-----------+       +-----------+       +-----------+       +-----------+       +-----------+
| MODELO IA |       | MEMÓRIA   |       | SISTEMA   |       | AGENTES   |       | LABORATÓ- |
| LOCAL     |       | (CURTO/   |       | EPISTÊMI- |       | INTERNOS  |       | RIO /     |
| (OFFLINE) |       |  LONGO)   |       | CO (GRAFO)|       | (9 AGENT.)|       | SANDBOX   |
+-----------+       +-----------+       +-----------+       +-----------+       +-----------+
      |                   |                   |                   |                   |
      +-------------------+-------------------+-------------------+-------------------+
                                              |
                                              v
                                  +-----------------------+
                                  | CONTROLE SilCarPaty   |
                                  | (EMERGÊNCIA EXTERNO)  |
                                  +-----------------------+
```

---

## 2. Diagnóstico de Hardware e Modelo Inicial

O sistema detecta e adapta a carga ao hardware real em cada boot:
* **Processador:** Intel Core i5-11400H (6 Cores / 12 Logical Processors)
* **Memória RAM:** 16,0 GB Total (~7,0 GB livres)
* **Placa de Vídeo (GPU):** NVIDIA GeForce GTX 1650 (4 GB VRAM GDDR6, CUDA 11.6)
* **Armazenamento:** 158 GB livres no Disco C:
* **Modelo Aberto Selecionado (V0):** `Qwen2.5-Coder-1.5B-Instruct-Q4_K_M` via `LocalModelProvider`. Operação 100% offline sem APIs pagas.

---

## 3. Os 9 Agentes Especializados Internos

1. **NÚCLEO:** Coordenador do ciclo evolutivo e responsável por definir metas operacionais.
2. **PESQUISADOR:** Realiza pesquisas na Web, busca de artigos técnicos e documentações.
3. **ANALISADOR:** Diagnostica gargalos, analisa erros e formula hipóteses de melhoria.
4. **PROGRAMADOR:** Escreve protótipos de código, funções experimentais e otimizações.
5. **EXPERIMENTADOR:** Executa testes isolados na Sandbox do Laboratório.
6. **AVALIADOR:** Mede o desempenho via suíte de benchmarks e decide por aprovação/rejeição.
7. **GERENCIADOR DE MEMÓRIA:** Organiza, consolida e recupera memórias operacionais e de longo prazo.
8. **GERENCIADOR DE EVOLUÇÃO:** Gerencia gerações, a árvore evolutiva e executa rollbacks.
9. **OBSERVADOR:** Garante a observabilidade, registros estruturados de telemetria e logs.

---

## 4. Sistema Epistêmico & Estrutura de Conhecimento

Toda informação relevante é classificada em 6 estados epistemológicos:
* **CONFIÁVEL** (Confiança ≥ 85%)
* **PROVÁVEL** (Confiança ≥ 65%)
* **INCERTA** (Confiança ≥ 40%)
* **NÃO VERIFICADA** (Confiança ≥ 15%)
* **CONTRADITÓRIA** (Conflitos superiores a fontes)
* **REJEITADA** (Confiança < 15%)

---

## 5. Laboratório Experimental & Sandbox

O ambiente de experimentação fica fisicamente isolado no diretório `data/lab/`.
Todo código experimental passa por sanitização sintática e execução em sandbox sem afetar o núcleo estável da aplicação.

---

## 6. Versionamento Evolutivo & Árvore de Gerações

A evolução gera identificadores únicos: `V0 -> V1 -> V2 -> V3...`.
Cada geração armazena metadados de benchmark, autor, alterações e snapshot de código. O sistema suporta rollback instantâneo para qualquer versão anterior.

---

## 7. Controle de Emergência — SilCarPaty

* **Chave:** `SilCarPaty`
* **Funcionamento:** Alternador persistente (1ª: OFF, 2ª: ON, 3ª: OFF...).
* **Comportamento no Estado OFF:** Interrompe a evolução e novos experimentos, salva o estado consistente e exibe a tela de aviso no painel.
* **Comportamento no Estado ON:** Restaura a integridade e retoma a evolução autônoma a partir do último estado consistente.

---

## 8. Guia de Instalação e Execução

### Pré-requisitos
* Python 3.10 ou superior
* Node.js v24+ (opcional para ferramentas de build)

### Passo 1: Instalação de Dependências Python
```bash
pip install fastapi uvicorn pydantic psutil
```

### Passo 2: Inicialização do Servidor Backend
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### Passo 3: Acesso ao Painel Web
Abra o navegador no endereço: `http://127.0.0.1:8000`

---

## 9. Resolução de Problemas (Troubleshooting)

* **Erro de Port Ocupada (8000):** Altere a porta em `backend/config.py` ou execute `uvicorn backend.main:app --port 8080`.
* **Sem GPU NVIDIA detectada:** O sistema alterna automaticamente para modo CPU Offload sem interromper o funcionamento.
* **Estado SilCarPaty Desativado:** Se o sistema estiver pausado, acione o botão no painel ou envie uma mensagem no Chatbot contendo a palavra `SilCarPaty`.
