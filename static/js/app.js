document.addEventListener('DOMContentLoaded', () => {
    let currentTab = 'dashboard';
    let selectedVersionForDiff = null;

    const navButtons = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const tabTitle = document.getElementById('tab-title');
    const tabSubtitle = document.getElementById('tab-subtitle');

    const subTitles = {
        dashboard: "Monitoramento em Tempo Real do Laboratório Autônomo",
        chat: "Interface Conversacional Direta com a IA Autônoma",
        agents: "Barramento Observável de Mensagens entre os 9 Agentes Internos",
        research: "Histórico de Buscas na Web e Avaliação de Fontes",
        epistemic: "Base Epistêmica de Conhecimento e Grafo de Confiança",
        lab: "Sandbox de Isolamento e Execução de Experimentos",
        evolution: "Navegador de Gerações e Árvore Evolutiva de Código",
        code: "Comparador de Alterações de Código Físico entre Versões",
        benchmarks: "Suíte Multidimensional de Métricas e Histórico",
        memory: "Gestão da Memória de Curto e Longo Prazo",
        hardware: "Telemetria Detalhada de CPU, GPU, RAM, VRAM e Disco",
        history: "Log de Eventos Estruturados e Replay Passo a Passo",
        silcarpaty: "Mecanismo Isolado de Controle de Emergência Externo"
    };

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentTab = btn.getAttribute('data-tab');

            navButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(`pane-${currentTab}`);
            if (targetPane) targetPane.classList.add('active');

            if (tabTitle) tabTitle.textContent = btn.innerText.trim();
            if (tabSubtitle) tabSubtitle.textContent = subTitles[currentTab] || "";

            refreshAllData();
        });
    });

    // Chatbot Form Handler
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatHistoryBox = document.getElementById('chat-history-box');

    loadChatHistory();

    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = chatInput.value.trim();
            if (!message) return;

            appendChatMessage('user', 'Você', message);
            chatInput.value = '';

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                const data = await res.json();
                appendChatMessage('assistant', 'Prometheus', data.reply);
                
                if (data.silcarpaty_event) {
                    refreshDashboard();
                }
            } catch (err) {
                appendChatMessage('assistant', 'Erro', 'Falha na comunicação com o servidor backend.');
            }
        });
    }

    async function loadChatHistory() {
        try {
            const res = await fetch('/api/chat/history');
            const msgs = await res.json();
            if (msgs.length > 0) {
                chatHistoryBox.innerHTML = '';
                msgs.forEach(m => {
                    appendChatMessage(
                        m.sender === 'user' ? 'user' : 'assistant',
                        m.sender === 'user' ? 'Você' : 'Prometheus',
                        m.message
                    );
                });
            }
        } catch (e) {}
    }

    function appendChatMessage(role, author, text) {
        if (!chatHistoryBox) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role}`;
        msgDiv.innerHTML = `<div class="msg-author">${author}</div><div class="msg-content">${escapeHtml(text)}</div>`;
        chatHistoryBox.appendChild(msgDiv);
        chatHistoryBox.scrollTop = chatHistoryBox.scrollHeight;
    }

    function escapeHtml(text) {
        return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    const btnSilcarpatyToggle = document.getElementById('btn-silcarpaty-toggle');
    const btnSilLarge = document.getElementById('btn-sil-toggle-large');

    if (btnSilcarpatyToggle) btnSilcarpatyToggle.addEventListener('click', toggleSilcarpaty);
    if (btnSilLarge) btnSilLarge.addEventListener('click', toggleSilcarpaty);

    async function toggleSilcarpaty() {
        try {
            const res = await fetch('/api/dashboard/silcarpaty/toggle', { method: 'POST' });
            const data = await res.json();
            alert(data.message);
            refreshDashboard();
        } catch (err) {
            alert('Falha ao alterar estado SilCarPaty.');
        }
    }

    async function refreshDashboard() {
        try {
            const res = await fetch('/api/dashboard/summary');
            const data = await res.json();

            const isSilActive = data.silcarpaty.active;
            const silVal = document.getElementById('sidebar-silcarpaty-val');
            const statusInd = document.getElementById('system-status-indicator');
            const banner = document.getElementById('banner-interrupted');
            const silLarge = document.getElementById('sil-state-large');

            if (silVal) {
                silVal.textContent = isSilActive ? 'ON' : 'OFF';
                silVal.className = isSilActive ? 'status-value active' : 'status-value inactive';
            }
            if (statusInd) {
                statusInd.className = isSilActive ? 'pulse-indicator' : 'pulse-indicator off';
            }
            if (banner) {
                if (isSilActive) banner.classList.add('hidden');
                else banner.classList.remove('hidden');
            }
            if (silLarge) {
                silLarge.textContent = isSilActive ? 'ON' : 'OFF';
                silLarge.style.color = isSilActive ? 'var(--success)' : 'var(--danger)';
            }

            const activeVer = data.active_version.version_id || "V0";
            const sideVer = document.getElementById('sidebar-active-version');
            const dashGen = document.getElementById('dash-gen');
            if (sideVer) sideVer.textContent = activeVer;
            if (dashGen) dashGen.textContent = activeVer;

            const hw = data.hardware;
            if (hw) {
                const cpuEl = document.getElementById('dash-cpu-use');
                const cpuBar = document.getElementById('bar-cpu');
                if (cpuEl) cpuEl.textContent = `${hw.cpu.usage_percent}%`;
                if (cpuBar) cpuBar.style.width = `${hw.cpu.usage_percent}%`;

                const ramEl = document.getElementById('dash-ram-use');
                const ramBar = document.getElementById('bar-ram');
                if (ramEl) ramEl.textContent = `${hw.memory.used_gb} GB / ${hw.memory.total_gb} GB`;
                if (ramBar) ramBar.style.width = `${hw.memory.usage_percent}%`;

                const vramEl = document.getElementById('dash-vram-use');
                const vramBar = document.getElementById('bar-vram');
                if (vramEl) vramEl.textContent = `${hw.gpu.vram_used_mb} MB / ${hw.gpu.vram_total_mb} MB`;
                if (vramBar) vramBar.style.width = `${hw.gpu.usage_percent}%`;
            }

            renderChecklist(data.checklist);

        } catch (err) {
            console.error('Erro ao atualizar dashboard:', err);
        }
    }

    function renderChecklist(checklist) {
        const container = document.getElementById('checklist-summary');
        if (!container || !checklist) return;

        let html = '';
        for (const [phaseKey, phaseData] of Object.entries(checklist)) {
            const phaseStatus = phaseData.STATUS_FASE || "PENDENTE";
            html += `<div class="phase-group">`;
            html += `<div class="phase-title">${phaseKey} — Status: ${phaseStatus}</div>`;
            
            for (const [caKey, caData] of Object.entries(phaseData)) {
                if (caKey === "STATUS_FASE") continue;
                html += `
                    <div class="ca-item">
                        <span><strong>${caKey}</strong>: ${caData.descricao}</span>
                        <span class="ca-status ${caData.status}">${caData.status}</span>
                    </div>
                `;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    function refreshAllData() {
        refreshDashboard();
        loadAgentConversations();
        loadLabExperiments();
        loadEvolutionTree();
        loadBenchmarks();
        loadResearchHistory();
        loadEpistemicClaims();
        loadMemoryStats();
        loadHardwareDetails();
        loadHistoryLogs();
    }

    async function loadAgentConversations() {
        const container = document.getElementById('agents-conversation-timeline');
        if (!container) return;
        try {
            const res = await fetch('/api/agents/conversations');
            const msgs = await res.json();
            let html = '';
            msgs.forEach(m => {
                html += `
                    <div class="agent-event">
                        <div class="agent-header">
                            <span class="agent-name">${m.agent} ➔ ${m.target}</span>
                            <span class="agent-time">${new Date(m.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div class="agent-msg">${escapeHtml(m.message)}</div>
                        ${m.decision ? `<div style="font-weight:700; color:var(--success); margin-top:4px;">Decisão: ${m.decision}</div>` : ''}
                    </div>
                `;
            });
            container.innerHTML = html || '<p>Aguardando primeira troca de mensagens dos agentes...</p>';
        } catch (e) {}
    }

    async function loadLabExperiments() {
        const tbody = document.getElementById('lab-experiments-table');
        const dashRecent = document.getElementById('dash-recent-experiments');
        if (!tbody) return;
        try {
            const res = await fetch('/api/lab/experiments');
            const exps = await res.json();
            let html = '';
            let recentHtml = '';

            exps.forEach((e, idx) => {
                html += `
                    <tr>
                        <td><strong>#${e.id}</strong></td>
                        <td>${escapeHtml(e.hypothesis)}</td>
                        <td>${e.base_version}</td>
                        <td>${e.metric_gain_percent > 0 ? '+' : ''}${e.metric_gain_percent}%</td>
                        <td>+${e.cost_delta_percent}%</td>
                        <td><span class="badge ${e.decision}">${e.decision}</span></td>
                    </tr>
                `;
                if (idx < 4) {
                    recentHtml += `
                        <div style="padding: 0.5rem 0; border-bottom: 1px dashed rgba(255,255,255,0.08);">
                            <strong>#${e.id}</strong> (${e.base_version})<br>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(e.hypothesis)}</span><br>
                            <span class="badge ${e.decision}">${e.decision} (${e.metric_gain_percent > 0 ? '+' : ''}${e.metric_gain_percent}%)</span>
                        </div>
                    `;
                }
            });
            tbody.innerHTML = html || '<tr><td colspan="6">Nenhum experimento registrado ainda.</td></tr>';
            if (dashRecent) dashRecent.innerHTML = recentHtml || '<p>Nenhum experimento recente.</p>';
        } catch (e) {}
    }

    async function loadEvolutionTree() {
        const container = document.getElementById('evolution-tree-container');
        if (!container) return;
        try {
            const res = await fetch('/api/evolution/tree');
            const tree = await res.json();
            let html = '<div class="tree-nodes" style="display: flex; gap: 1rem; flex-wrap: wrap;">';
            tree.forEach(v => {
                html += `
                    <div class="metric-card glass ver-card" data-ver="${v.version_id}" style="min-width: 220px; cursor: pointer; border-left: 4px solid ${v.is_active ? 'var(--success)' : 'var(--primary)'}">
                        <div class="metric-header">
                            <span>Geração <strong>${v.version_id}</strong></span>
                            ${v.is_active ? '<span class="badge APROVADO">ATIVA</span>' : ''}
                        </div>
                        <p style="font-size: 0.85rem; margin: 0.5rem 0;">${escapeHtml(v.changes_summary)}</p>
                        <span style="font-size: 0.75rem; color: var(--text-muted)">Benchmark: ${v.overall_benchmark_score}</span>
                        <div style="margin-top: 0.5rem;"><button class="btn btn-sm btn-primary btn-inspect-diff" data-ver="${v.version_id}">🔍 Ver Diff de Código</button></div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;

            // Adicionar evento para visualizar o diff de código real ao clicar
            document.querySelectorAll('.btn-inspect-diff').forEach(b => {
                b.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const ver = b.getAttribute('data-ver');
                    loadCodeDiffForVersion(ver);
                });
            });

            // Se nenhuma versão tiver sido selecionada, carregar a mais recente
            if (!selectedVersionForDiff && tree.length > 0) {
                const active = tree.find(t => t.is_active) || tree[tree.length - 1];
                loadCodeDiffForVersion(active.version_id);
            }
        } catch (e) {}
    }

    async function loadCodeDiffForVersion(versionId) {
        selectedVersionForDiff = versionId;
        const diffViewer = document.getElementById('code-diff-viewer');
        if (!diffViewer) return;

        diffViewer.innerHTML = `<div class="loading">Carregando código físico da geração ${versionId} no disco...</div>`;

        try {
            const res = await fetch(`/api/evolution/code-diff/${versionId}`);
            const data = await res.json();
            
            diffViewer.innerHTML = `
                <div style="margin-bottom: 1rem;">
                    <h4>📜 Código Físico Gravado em <code>data/versions/${versionId}/</code></h4>
                    <p style="font-size: 0.85rem; color: var(--text-muted);">Arquivo: <code>data/versions/${versionId}/changes.diff</code></p>
                </div>
                <div style="background: #0f172a; padding: 1rem; border-radius: 8px; font-family: var(--font-code); font-size: 0.85rem; max-height: 450px; overflow-y: auto;">
                    <h5 style="color: #60a5fa; margin-bottom: 0.5rem;">[1] Unified Diff de Alterações vs Versão Anterior:</h5>
                    <pre><code style="color: #4ade80;">${escapeHtml(data.diff || "Nenhuma diferença identificada em relação ao base.")}</code></pre>
                    
                    <h5 style="color: #60a5fa; margin-top: 1.5rem; margin-bottom: 0.5rem;">[2] Código Módulo Python Gerado (${versionId}):</h5>
                    <pre><code style="color: #fca5a5;">${escapeHtml(data.code || "# Nenhum módulo fonte gravado.")}</code></pre>
                </div>
            `;
        } catch (e) {
            diffViewer.innerHTML = `<p>Falha ao carregar diff da versão ${versionId}.</p>`;
        }
    }

    async function loadBenchmarks() {
        const container = document.getElementById('benchmark-scores-view');
        if (!container) return;
        try {
            const res = await fetch('/api/benchmarks/history');
            const benchs = await res.json();
            if (benchs.length === 0) {
                container.innerHTML = '<p>Nenhum benchmark registrado.</p>';
                return;
            }
            const latest = benchs[benchs.length - 1];
            container.innerHTML = `
                <div class="metrics-grid">
                    <div class="metric-card glass"><span>Programação</span><strong>${latest.programming_score}</strong></div>
                    <div class="metric-card glass"><span>Memória</span><strong>${latest.memory_retrieval_score}</strong></div>
                    <div class="metric-card glass"><span>Raciocínio</span><strong>${latest.reasoning_score}</strong></div>
                    <div class="metric-card glass"><span>Linguagem</span><strong>${latest.language_score}</strong></div>
                    <div class="metric-card glass"><span>Planejamento</span><strong>${latest.planning_score}</strong></div>
                    <div class="metric-card glass"><span>Eficiência</span><strong>${latest.efficiency_score}</strong></div>
                </div>
                <p style="margin-top: 1rem; padding: 0.75rem; background: rgba(0,0,0,0.3); border-radius: 6px;">
                    <strong>🔍 Gargalo Identificado:</strong> ${latest.bottleneck_identified}
                </p>
            `;
        } catch (e) {}
    }

    async function loadResearchHistory() {
        const container = document.getElementById('research-history-list');
        if (!container) return;
        try {
            const res = await fetch('/api/research/history');
            const logs = await res.json();
            let html = '';
            logs.forEach(l => {
                html += `
                    <div class="agent-event" style="margin-bottom: 0.75rem;">
                        <strong>Query: '${escapeHtml(l.query)}'</strong> — ${l.sources_count} fontes encontradas.<br>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(l.analysis_summary || '')}</span>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>Nenhuma pesquisa realizada ainda.</p>';
        } catch (e) {}
    }

    async function loadEpistemicClaims() {
        const container = document.getElementById('epistemic-claims-grid');
        if (!container) return;
        try {
            const res = await fetch('/api/epistemic/claims');
            const claims = await res.json();
            let html = '';
            claims.forEach(c => {
                html += `
                    <div class="metric-card glass" style="margin-bottom: 0.75rem;">
                        <div class="metric-header">
                            <span>Confiança: <strong>${c.confidence_percent}%</strong></span>
                            <span class="badge ${c.rating === 'CONFIÁVEL' ? 'APROVADO' : 'PENDENTE'}">${c.rating}</span>
                        </div>
                        <p style="margin: 0.5rem 0;">"${escapeHtml(c.statement)}"</p>
                        <span style="font-size: 0.75rem; color: var(--text-muted)">${escapeHtml(c.justification || '')}</span>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>Nenhum conhecimento armazenado na base epistêmica.</p>';
        } catch (e) {}
    }

    async function loadMemoryStats() {
        const container = document.getElementById('memory-stats-container');
        if (!container) return;
        try {
            const res = await fetch('/api/memory/memories');
            const mems = await res.json();
            container.innerHTML = `
                <div class="metrics-grid">
                    <div class="metric-card glass"><span>Memórias Persistentes Total</span><strong>${mems.length}</strong></div>
                    <div class="metric-card glass"><span>Estado de Armazenamento</span><strong>SINCRONIZADO (SQLite)</strong></div>
                </div>
            `;
        } catch (e) {}
    }

    async function loadHardwareDetails() {
        const container = document.getElementById('hardware-full-details');
        if (!container) return;
        try {
            const res = await fetch('/api/dashboard/summary');
            const data = await res.json();
            container.innerHTML = `<pre style="font-family: var(--font-code); background: rgba(0,0,0,0.4); padding: 1rem; border-radius: 8px; font-size: 0.85rem; color: #a7f3d0;">${JSON.stringify(data.hardware, null, 2)}</pre>`;
        } catch (e) {}
    }

    async function loadHistoryLogs() {
        const container = document.getElementById('history-replay-box');
        if (!container) return;
        try {
            const res = await fetch('/api/memory/audit');
            const logs = await res.json();
            let html = '';
            logs.forEach(l => {
                html += `
                    <div style="font-size: 0.85rem; padding: 0.35rem 0; border-bottom: 1px dashed rgba(255,255,255,0.08);">
                        <span style="color: var(--text-muted)">[${new Date(l.timestamp).toLocaleTimeString()}]</span> Operação: <strong>${l.operation}</strong> — ${escapeHtml(l.details || '')}
                    </div>
                `;
            });
            container.innerHTML = html || '<p>Nenhum registro no histórico de auditoria.</p>';
        } catch (e) {}
    }

    refreshAllData();
    setInterval(refreshAllData, 2500);
});
